import { DEFAULT_EMPLOYEES, ROLES } from '../config/team';
import { toISO, addDays } from './date';

// Live Google Apps Script web app. A VITE_SHEETS_API_URL in .env overrides it.
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxa3giOBVn9C6lxgw7tOMa3V-cJ7LiUMQa1AdZBrpUljeucKa4qfKr6wkA36fAndu7rvQ/exec';
const API_URL = (import.meta.env.VITE_SHEETS_API_URL || DEFAULT_API_URL).trim();
export const IS_DEMO = !API_URL;

const LS_REPORTS = 'pulse_demo_reports_v1';

// ── Google Apps Script transport ───────────────────────────────
// POST uses text/plain so the browser skips the CORS preflight
// (Apps Script web apps can't answer OPTIONS requests).
async function get(params) {
  const url = `${API_URL}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function post(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

// ── Demo storage (browser only) ────────────────────────────────
function readDemo() {
  try {
    const raw = localStorage.getItem(LS_REPORTS);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const seeded = seedDemo();
  writeDemo(seeded);
  return seeded;
}
function writeDemo(list) {
  try { localStorage.setItem(LS_REPORTS, JSON.stringify(list)); } catch { /* ignore */ }
}

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function sampleMetrics(role) {
  switch (role) {
    case 'telecaller': {
      const calls = rnd(40, 95), conn = rnd(Math.floor(calls * 0.4), Math.floor(calls * 0.7));
      const conv = rnd(1, 7), canc = rnd(0, 2);
      return { calls_made: calls, calls_connected: conn, leads_generated: rnd(3, 14), followups_done: rnd(5, 20),
        orders_converted: conv, sales_value: conv * rnd(1800, 4200), orders_cancelled: canc,
        cancelled_value: canc * rnd(1500, 3500), callbacks_pending: rnd(2, 12) };
    }
    case 'hiring': {
      const sched = rnd(1, 6);
      return { candidates_sourced: rnd(8, 30), candidate_calls: rnd(15, 45), interviews_scheduled: sched,
        interviews_attended: rnd(0, sched), candidates_selected: rnd(0, 2), hired: rnd(0, 1),
        drivers_arranged: rnd(0, 4), no_shows: rnd(0, 2) };
    }
    case 'developer':
      return { tasks_completed: rnd(2, 7), tasks_in_progress: rnd(1, 4), bugs_fixed: rnd(0, 6),
        features_shipped: rnd(0, 2), deployments: rnd(0, 2), hours_worked: rnd(7, 10) };
    case 'saleshead':
      return { team_revenue: rnd(12000, 42000), client_meetings: rnd(1, 5), new_clients: rnd(0, 3),
        pipeline_value: rnd(80000, 260000), escalations_resolved: rnd(0, 3), team_reviews: rnd(1, 4) };
    default: return {};
  }
}

const POSITIVES = [
  'Closed a repeat customer who had gone quiet for a month.',
  'Cleared every pending callback from yesterday.',
  'Two drivers confirmed joining on Monday.',
  'Shipped the order-tracking fix before lunch.',
  'Got strong feedback from a client on response time.',
  'Scheduled interviews for the full week.',
  'Converted a lead from last week’s campaign.'
];

function seedDemo() {
  const out = [];
  const today = new Date();
  DEFAULT_EMPLOYEES.filter((e) => !e.viewOnly).forEach((emp) => {
    for (let i = 1; i <= 40; i++) {
      const d = addDays(today, -i);
      if (d.getDay() === 0) continue; // Sundays off
      if (Math.random() < 0.08) continue; // occasional missed day
      const metrics = {};
      emp.roles.forEach((r) => Object.assign(metrics, sampleMetrics(r)));
      out.push({
        id: `${emp.id}_${toISO(d)}`,
        date: toISO(d),
        employeeId: emp.id,
        name: emp.name,
        roles: emp.roles,
        metrics,
        notes: {},
        positives: POSITIVES[rnd(0, POSITIVES.length - 1)],
        challenges: Math.random() < 0.5 ? 'Several customers asked to call back after salary day.' : '',
        tomorrow: 'Follow up on pending leads and callbacks.',
        mood: rnd(3, 5),
        submittedAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, rnd(0, 59)).toISOString()
      });
    }
  });
  return out;
}

// ── Public API ─────────────────────────────────────────────────
export async function fetchEmployees() {
  if (IS_DEMO) return DEFAULT_EMPLOYEES.map(({ pin, ...e }) => e);
  const list = await get({ action: 'employees' });
  return list.map(normaliseEmployee);
}

export async function login(employeeId, pin) {
  if (IS_DEMO) {
    const emp = DEFAULT_EMPLOYEES.find((e) => e.id === employeeId);
    if (!emp || String(emp.pin) !== String(pin)) throw new Error('That PIN doesn’t match. Try again.');
    const { pin: _p, ...safe } = emp;
    return safe;
  }
  return normaliseEmployee(await post({ action: 'login', employeeId, pin }));
}

export async function fetchReports({ from, to, employeeId } = {}) {
  if (IS_DEMO) {
    return readDemo()
      .filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (!employeeId || r.employeeId === employeeId))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  const params = { action: 'reports' };
  if (from) params.from = from;
  if (to) params.to = to;
  if (employeeId) params.employeeId = employeeId;
  const list = await get(params);
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function saveReport(report) {
  const full = { ...report, id: `${report.employeeId}_${report.date}`, submittedAt: new Date().toISOString() };
  if (IS_DEMO) {
    const list = readDemo().filter((r) => r.id !== full.id);
    list.push(full);
    writeDemo(list);
    return full;
  }
  return post({ action: 'saveReport', report: full });
}

export async function emailEODNow(date) {
  if (IS_DEMO) throw new Error('Connect Google Sheets to send emails. In demo mode, use Share on WhatsApp.');
  return post({ action: 'sendEOD', date });
}

export function resetDemo() {
  localStorage.removeItem(LS_REPORTS);
}

function normaliseEmployee(e) {
  const roles = Array.isArray(e.roles)
    ? e.roles
    : String(e.roles || '').split(',').map((s) => s.trim().toLowerCase()).filter((r) => ROLES[r]);
  const truthy = (v) => v === true || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes';
  return { ...e, id: String(e.id), roles, isAdmin: truthy(e.isAdmin), viewOnly: truthy(e.viewOnly) };
}
