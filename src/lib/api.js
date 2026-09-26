import { DEFAULT_EMPLOYEES, RECORD_TYPES } from '../config/team';
import { toISO, addDays } from './date';
import { classifyCall, classifyHiring } from './parse';
import { DEFAULT_TARGETS } from '../config/team';
import { basicPolish } from './thanglish';
import { followUpFor } from './followup';

// Live Google Apps Script web app. A VITE_SHEETS_API_URL in .env overrides it.
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzFU8FkIdSKzKjjI0TBgfikNEj0QjAW4iTAlsu3EKrZ5jpvZPwO-SwEslLXEBvlcBpLxA/exec';
const API_URL = import.meta.env.VITE_DEMO === '1' ? '' : (import.meta.env.VITE_SHEETS_API_URL || DEFAULT_API_URL).trim();
export const IS_DEMO = !API_URL;

const LS_REPORTS = 'pulse_demo_reports_v6';
const LS_RECORDS = 'pulse_demo_records_v6';
const LS_SETTINGS = 'pulse_demo_settings_v1';
export const TYPE_KEYS = Object.keys(RECORD_TYPES);

// ── Google Apps Script transport ───────────────────────────────
// POST uses text/plain so the browser skips the CORS preflight.
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
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };

function demoData() {
  let reports = lsGet(LS_REPORTS);
  let records = lsGet(LS_RECORDS);
  if (!reports || !records) {
    const seeded = seedDemo();
    reports = seeded.reports;
    records = seeded.records;
    lsSet(LS_REPORTS, reports);
    lsSet(LS_RECORDS, records);
  }
  return { reports, records };
}

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[rnd(0, arr.length - 1)];
const SHOPS = ['Ramesh Traders', 'Kumar Stores', 'Sri Balaji Mart', 'Lakshmi Provisions', 'Anand Supermarket', 'Selvi Stores', 'Murugan Agencies', 'Green Mart', 'Vel Traders', 'Annai Stores', 'KPN Foods', 'City Mart'];
const AREAS = ['Tambaram', 'Velachery', 'Porur', 'Anna Nagar', 'T Nagar', 'Guindy', 'Adyar', 'Chromepet'];
const PRODUCTS = [['Groundnut oil', 'L', 230], ['Sunflower oil', 'L', 160], ['Rice', 'kg', 56], ['Toor dal', 'kg', 140], ['Sugar', 'kg', 44], ['Gingelly oil', 'L', 390]];
const CALL_REMARKS = ['Interested, send price list', 'Positive, will order next week', 'Call back tomorrow', 'Not interested', 'Switched off', 'Busy, call later', 'Interested in 15 L oil', 'Already buying from others', 'No response', 'Asked for sample'];
const HR_REMARKS = ['Interview scheduled tomorrow 11am', 'Joined today', 'Not interested, salary issue', 'No response', 'Driver arranged for Porur route', 'Called, will think', 'Relieved from work', 'Interview scheduled Monday'];
const HR_BY_STATUS = {
  called: 'Called, will think', scheduled: 'Interview scheduled tomorrow 11am', attended: 'Came for interview, good driving', selected: 'Selected, joining Monday',
  joined: 'Joined today', no_show: 'Did not come for interview', not_interested: 'Not interested, salary issue', no_answer: 'No response',
  driver_arranged: 'Driver arranged for Porur route', rejected: 'No licence'
};
const PEOPLE = ['Suresh', 'Priya', 'Arun', 'Karthik', 'Vijay', 'Divya', 'Manoj', 'Revathi', 'Prakash', 'Sathish', 'Keerthi'];
const phone = () => String(rnd(6, 9)) + String(rnd(100000000, 999999999));

function seedDemo() {
  const reports = [];
  const records = [];
  let n = 0;
  const today = new Date();
  DEFAULT_EMPLOYEES.filter((e) => !e.viewOnly).forEach((emp) => {
    const base = (d, type) => ({ id: `${type}_${emp.id}_${n++}`, date: toISO(d), employeeId: emp.id, employee: emp.name, createdAt: d.toISOString() });
    if (emp.roles.includes('telecaller')) {
      for (let i = 0; i < rnd(18, 30); i++) {
        const d = addDays(today, -rnd(1, 60));
        records.push({ ...base(d, 'customers'), type_: 'customers', title: pick(['Retail', 'Distributor']), name: `${pick(SHOPS)} ${rnd(1, 99)}`, phone: phone(), area: pick(AREAS), type: Math.random() < 0.6 ? 'existing' : 'new' });
      }
    }
    for (let i = 1; i <= 30; i++) {
      const d = addDays(today, -i);
      if (d.getDay() === 0 || Math.random() < 0.08) continue;
      if (emp.roles.includes('telecaller')) {
        for (let c = 0; c < rnd(12, 30); c++) {
          const remarks = pick(CALL_REMARKS);
          const st = classifyCall(remarks);
          records.push({ ...base(d, 'calls'), type_: 'calls', title: pick(['Sales', 'Sales', 'Distributor hiring']), name: pick(SHOPS), phone: phone(), remarks, status: st, followUp: i <= 5 ? followUpFor(st, remarks, toISO(d)) : 'done', duration: st === 'no_answer' ? 0 : rnd(25, 320) });
        }
        for (let o = 0; o < rnd(1, 5); o++) {
          const [product, unit, price] = pick(PRODUCTS);
          const qty = unit === 'L' ? pick([5, 10, 15, 30]) : pick([10, 25, 50, 100]);
          records.push({ ...base(d, 'orders'), type_: 'orders', title: pick(['Retail', 'Distributor']), name: pick(SHOPS), phone: phone(), product, qty, unit, amount: qty * price });
        }
        if (Math.random() < 0.35) {
          const [product, unit, price] = pick(PRODUCTS);
          const qty = pick([5, 10, 25]);
          records.push({ ...base(d, 'cancellations'), type_: 'cancellations', title: 'Retail', name: pick(SHOPS), phone: phone(), product, qty, unit, amount: qty * price, reason: pick(['Price too high', 'Delivery delay', 'Bought elsewhere']) });
        }
      }
      if (emp.roles.includes('hiring')) {
        for (let c = 0; c < rnd(6, 16); c++) {
          const st = pick(['called', 'scheduled', 'scheduled', 'attended', 'selected', 'joined', 'no_show', 'not_interested', 'no_answer', 'driver_arranged', 'rejected']);
          const remarks = HR_BY_STATUS[st];
          records.push({ ...base(d, 'hiring'), type_: 'hiring', title: pick(['Driver', 'Call driver', 'Telecaller', 'Delivery boy']), name: pick(PEOPLE), phone: phone(), remarks, status: st, followUp: i <= 5 ? followUpFor(st, remarks, toISO(d)) : 'done', duration: st === 'no_answer' ? 0 : rnd(40, 400) });
        }
      }
      reports.push({
        id: `${emp.id}_${toISO(d)}`, date: toISO(d), employeeId: emp.id, name: emp.name, roles: emp.roles, metrics: {},
        notes: emp.roles.includes('developer') ? { work_done: pick(['Built the order tracking screen and fixed 3 checkout bugs.', 'Deployed v1.3 to production and set up daily backups.', 'Worked on the customer search API and pagination.']) } : {},
        positives: pick(['Closed a repeat customer who had gone quiet.', 'Cleared all pending callbacks.', 'Two drivers confirmed joining Monday.', '']),
        challenges: Math.random() < 0.4 ? 'Many customers asked to call after salary day.' : '',
        tomorrow: 'Follow up on interested leads.', mood: rnd(3, 5),
        submittedAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, rnd(0, 59)).toISOString()
      });
    }
  });
  // Call queue: open leads for each telecaller, a few numbers on do-not-call, and job openings
  const AREAS2 = ['Tambaram', 'Velachery', 'Porur', 'Anna Nagar', 'Ambattur', 'T Nagar', 'Adyar'];
  DEFAULT_EMPLOYEES.filter((e) => e.roles.includes('telecaller')).forEach((emp) => {
    for (let k = 0; k < 18; k++) {
      records.push({ id: `leads_${emp.id}_${n++}`, type_: 'leads', date: toISO(today), employeeId: emp.id, employee: emp.name, createdAt: new Date(Date.now() - k * 1000).toISOString(),
        title: 'Ambattur shops', kind: 'sales', name: `${pick(SHOPS)} ${rnd(1, 99)}`, phone: phone(), area: pick(AREAS2), notes: k % 4 === 0 ? 'Big grocery, owner available after 4 PM' : '', state: 'open', result: '', doneAt: '', assignedBy: 'Naveen' });
    }
  });
  DEFAULT_EMPLOYEES.filter((e) => e.roles.includes('hiring')).forEach((emp) => {
    for (let k = 0; k < 6; k++) {
      records.push({ id: `leads_${emp.id}_${n++}`, type_: 'leads', date: toISO(today), employeeId: emp.id, employee: emp.name, createdAt: new Date(Date.now() - k * 1000).toISOString(),
        title: 'Driver applicants', kind: 'hiring', name: pick(PEOPLE), phone: phone(), area: pick(AREAS2), notes: 'Applied on Indeed', state: 'open', result: '', doneAt: '', assignedBy: 'Naveen' });
    }
  });
  records.push({ id: `dnc_${n++}`, type_: 'dnc', date: toISO(today), employeeId: 'naveen', employee: 'Naveen', createdAt: today.toISOString(), name: 'Wrong number', phone: '9000000001', reason: 'Asked not to call' });
  [['Driver', 30], ['Call driver', 40], ['Telecaller', 20], ['Delivery boy', 45]].forEach(([title, needed]) => {
    records.push({ id: `openings_${n++}`, type_: 'openings', date: toISO(addDays(today, -20)), employeeId: 'naveen', employee: 'Naveen', createdAt: today.toISOString(), title, needed, active: 'yes' });
  });
  return { reports, records };
}

const inRange = (r, from, to, employeeId) =>
  (!from || r.date >= from) && (!to || r.date <= to) && (!employeeId || r.employeeId === employeeId);

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
  let list;
  if (IS_DEMO) list = demoData().reports.filter((r) => inRange(r, from, to, employeeId));
  else {
    const params = { action: 'reports' };
    if (from) params.from = from;
    if (to) params.to = to;
    if (employeeId) params.employeeId = employeeId;
    list = await get(params);
  }
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function saveReport(report) {
  const full = { ...report, id: `${report.employeeId}_${report.date}`, submittedAt: new Date().toISOString() };
  if (IS_DEMO) {
    const { reports } = demoData();
    lsSet(LS_REPORTS, [...reports.filter((r) => r.id !== full.id), full]);
    return full;
  }
  return post({ action: 'saveReport', report: full });
}

/**
 * Returns { calls: [], orders: [], customers: [], cancellations: [], hiring: [] }.
 * Customers are always returned in full (not limited by date) so totals are all-time.
 */
export async function fetchRecords({ types = TYPE_KEYS, from, to, employeeId } = {}) {
  const out = {};
  types.forEach((t) => { out[t] = []; });
  if (IS_DEMO) {
    demoData().records.forEach((r) => {
      if (!out[r.type_]) return;
      const ok = r.type_ === 'dnc' || r.type_ === 'openings' ? true
        : r.type_ === 'customers' || r.type_ === 'leads' ? (!employeeId || r.employeeId === employeeId)
          : inRange(r, from, to, employeeId);
      if (ok) out[r.type_].push(r);
    });
  } else {
    const params = { action: 'records', types: types.join(',') };
    if (from) params.from = from;
    if (to) params.to = to;
    if (employeeId) params.employeeId = employeeId;
    Object.assign(out, await get(params));
  }
  Object.values(out).forEach((list) => list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  return out;
}

export async function saveRecords(type, rows, { date, employeeId, employee }) {
  const stamp = Date.now();
  const createdAt = new Date().toISOString();
  // A row can carry its own employeeId/employee (e.g. leads assigned to someone else)
  const records = rows.map((r, i) => ({ ...r, id: `${type}_${employeeId}_${stamp}_${i}`, date, employeeId: r.employeeId || employeeId, employee: r.employee || employee, createdAt }));
  if (IS_DEMO) {
    const { records: all } = demoData();
    let next = all;
    if (type === 'customers') {
      const phones = new Set(records.map((r) => r.phone).filter(Boolean));
      next = all.filter((r) => !(r.type_ === 'customers' && r.employeeId === employeeId && phones.has(r.phone)));
    }
    lsSet(LS_RECORDS, [...next, ...records.map((r) => ({ ...r, type_: type }))]);
    return records;
  }
  await post({ action: 'saveRecords', type, records });
  return records;
}

export async function deleteRecord(type, id) {
  if (IS_DEMO) {
    const { records } = demoData();
    lsSet(LS_RECORDS, records.filter((r) => r.id !== id));
    return true;
  }
  return post({ action: 'deleteRecord', type, id });
}

/** Change a saved entry — used to reschedule or close a follow-up. Only followUp, status and remarks can change. */
export async function updateRecord(type, id, fields) {
  if (IS_DEMO) {
    const { records } = demoData();
    lsSet(LS_RECORDS, records.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    return true;
  }
  return post({ action: 'updateRecord', type, id, fields });
}

/** Several changes in one go: [{ id, fields }] — used for reassigning leads. */
export async function updateRecords(type, updates) {
  if (!updates.length) return true;
  if (IS_DEMO) {
    const map = new Map(updates.map((u) => [u.id, u.fields]));
    const { records } = demoData();
    lsSet(LS_RECORDS, records.map((r) => (map.has(r.id) ? { ...r, ...map.get(r.id) } : r)));
    return true;
  }
  return post({ action: 'updateRecords', type, updates });
}

/**
 * Thanglish / rough notes → clear English. Returns { texts, engine }.
 * engine: 'claude' | 'gemini' (AI on the server), 'basic' (word list only), 'cache'.
 */
export async function polishTexts(texts) {
  if (IS_DEMO) return { texts: texts.map(basicPolish), engine: 'basic' };
  return post({ action: 'polish', texts });
}

/** Admin turns AI English on/off. provider: 'gemini' | 'claude' | 'off'. Returns the engine now in use. */
export async function saveAiKey(employeeId, pin, provider, key) {
  if (IS_DEMO) throw new Error('Connect Google Sheets first — the key is stored safely on your server.');
  return post({ action: 'saveAiKey', employeeId, pin, provider, key });
}

/** Lets someone set the email their follow-up reminders go to (PIN checked on the server). */
export async function saveMyEmail(employeeId, pin, email) {
  if (IS_DEMO) throw new Error('Connect Google Sheets to use email reminders.');
  return post({ action: 'saveMyEmail', employeeId, pin, email });
}

export async function emailMyFollowUps(employeeId) {
  if (IS_DEMO) throw new Error('Connect Google Sheets to send reminder emails.');
  return post({ action: 'sendMyFollowUps', employeeId });
}

export const DEFAULT_SETTINGS = {
  MANAGEMENT_EMAILS: 'hiring.sridhiventures@gmail.com',
  NOTIFY_ON_SUBMIT: 'yes',
  COMPANY_NAME: 'Sridhi Ventures',
  APP_LINK: '',
  FOLLOWUP_EMAILS: 'yes',
  FOLLOWUP_DIGEST: 'no',
  TARGETS: JSON.stringify(DEFAULT_TARGETS)
};

/** Daily targets for one person: their own numbers, else the team default. */
export function targetsFor(settings, employeeId) {
  let t = DEFAULT_TARGETS;
  try { t = { ...DEFAULT_TARGETS, ...JSON.parse(settings?.TARGETS || '{}') }; } catch { /* keep defaults */ }
  return { ...DEFAULT_TARGETS._default, ...(t._default || {}), ...(t[employeeId] || {}) };
}

export async function fetchSettings() {
  if (IS_DEMO) return { ...DEFAULT_SETTINGS, ...(lsGet(LS_SETTINGS) || {}) };
  return { ...DEFAULT_SETTINGS, ...(await get({ action: 'settings' })) };
}

/** Admins only — the PIN is checked again on the server. */
export async function saveSettings(settings, employeeId, pin) {
  if (IS_DEMO) {
    const emp = DEFAULT_EMPLOYEES.find((e) => e.id === employeeId);
    if (!emp || !emp.isAdmin || String(emp.pin) !== String(pin)) throw new Error('That PIN doesn’t match an admin account.');
    lsSet(LS_SETTINGS, settings);
    return settings;
  }
  return post({ action: 'saveSettings', employeeId, pin, settings });
}

export async function emailEODNow(date) {
  if (IS_DEMO) throw new Error('Connect Google Sheets to send emails. In demo mode, use Share on WhatsApp.');
  return post({ action: 'sendEOD', date });
}

function normaliseEmployee(e) {
  const roles = Array.isArray(e.roles)
    ? e.roles
    : String(e.roles || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const truthy = (v) => v === true || ['true', 'yes'].includes(String(v).toLowerCase());
  return { ...e, id: String(e.id), roles, isAdmin: truthy(e.isAdmin), viewOnly: truthy(e.viewOnly) };
}
