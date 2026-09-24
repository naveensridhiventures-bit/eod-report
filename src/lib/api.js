import { DEFAULT_EMPLOYEES, RECORD_TYPES } from '../config/team';
import { toISO, addDays } from './date';
import { classifyCall, classifyHiring } from './parse';

// Live Google Apps Script web app. A VITE_SHEETS_API_URL in .env overrides it.
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxL0pNs5zmPk9kcWH5Y3n4IGXsbmBqa8tRT4LkKtvNXPRlsZXZipcxXbuateOpfTZFdBQ/exec';
const API_URL = import.meta.env.VITE_DEMO === '1' ? '' : (import.meta.env.VITE_SHEETS_API_URL || DEFAULT_API_URL).trim();
export const IS_DEMO = !API_URL;

const LS_REPORTS = 'pulse_demo_reports_v2';
const LS_RECORDS = 'pulse_demo_records_v2';
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

// ── Speed: instant-from-cache, refresh in the background ──────
// Show the last result straight away, then quietly fetch the fresh one and hand it to onUpdate.
// Cache is dropped after any save/delete and on sign-out.
const CACHE_PREFIX = 'pulse_cache_v1:';
const mem = new Map();
const inflight = new Map();
let gen = 0;

function readCache(key) {
  if (mem.has(key)) return mem.get(key);
  try {
    const s = localStorage.getItem(CACHE_PREFIX + key);
    if (s) { const v = JSON.parse(s); mem.set(key, v); return v; }
  } catch { /* ignore */ }
  return undefined;
}

function dropStored() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

function writeCache(key, value) {
  mem.set(key, value);
  try {
    const s = JSON.stringify(value);
    if (s.length < 1000000) localStorage.setItem(CACHE_PREFIX + key, s);
  } catch { dropStored(); }
}

export function clearCache() {
  gen++;
  mem.clear();
  inflight.clear();
  dropStored();
}

function swr(key, loader, onUpdate) {
  const cached = readCache(key);
  const myGen = gen;
  if (!inflight.has(key)) inflight.set(key, loader().finally(() => { if (gen === myGen) inflight.delete(key); }));
  const request = inflight.get(key);
  if (cached === undefined) {
    return request.then((fresh) => { if (gen === myGen) writeCache(key, fresh); return fresh; });
  }
  request.then((fresh) => {
    if (gen !== myGen) return;
    const changed = JSON.stringify(fresh) !== JSON.stringify(cached);
    writeCache(key, fresh);
    if (changed && onUpdate) onUpdate(fresh);
  }).catch(() => { /* keep showing the cached copy */ });
  return Promise.resolve(cached);
}

const sortReports = (list) => [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
const sortRecords = (out) => {
  Object.values(out).forEach((list) => list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  return out;
};

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
        records.push({ ...base(d, 'customers'), type_: 'customers', name: `${pick(SHOPS)} ${rnd(1, 99)}`, phone: phone(), area: pick(AREAS), type: Math.random() < 0.6 ? 'existing' : 'new' });
      }
    }
    for (let i = 1; i <= 30; i++) {
      const d = addDays(today, -i);
      if (d.getDay() === 0 || Math.random() < 0.08) continue;
      if (emp.roles.includes('telecaller')) {
        for (let c = 0; c < rnd(12, 30); c++) {
          const remarks = pick(CALL_REMARKS);
          records.push({ ...base(d, 'calls'), type_: 'calls', name: pick(SHOPS), phone: phone(), remarks, status: classifyCall(remarks) });
        }
        for (let o = 0; o < rnd(1, 5); o++) {
          const [product, unit, price] = pick(PRODUCTS);
          const qty = unit === 'L' ? pick([5, 10, 15, 30]) : pick([10, 25, 50, 100]);
          records.push({ ...base(d, 'orders'), type_: 'orders', name: pick(SHOPS), phone: phone(), product, qty, unit, amount: qty * price });
        }
        if (Math.random() < 0.35) {
          const [product, unit, price] = pick(PRODUCTS);
          const qty = pick([5, 10, 25]);
          records.push({ ...base(d, 'cancellations'), type_: 'cancellations', name: pick(SHOPS), phone: phone(), product, qty, unit, amount: qty * price, reason: pick(['Price too high', 'Delivery delay', 'Bought elsewhere']) });
        }
      }
      if (emp.roles.includes('hiring')) {
        for (let c = 0; c < rnd(6, 16); c++) {
          const remarks = pick(HR_REMARKS);
          records.push({ ...base(d, 'hiring'), type_: 'hiring', name: pick(PEOPLE), phone: phone(), position: pick(['Driver', 'Telecaller', 'Delivery boy', 'Helper']), remarks, status: classifyHiring(remarks) });
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
  return { reports, records };
}

const inRange = (r, from, to, employeeId) =>
  (!from || r.date >= from) && (!to || r.date <= to) && (!employeeId || r.employeeId === employeeId);

// ── Public API ─────────────────────────────────────────────────
export function peekEmployees() {
  if (IS_DEMO) return null;
  const c = readCache('employees');
  return c ? c.map(normaliseEmployee) : null;
}

export async function fetchEmployees(onUpdate) {
  if (IS_DEMO) return DEFAULT_EMPLOYEES.map(({ pin, ...e }) => e);
  const list = await swr('employees', () => get({ action: 'employees' }), onUpdate && ((l) => onUpdate(l.map(normaliseEmployee))));
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

export async function fetchReports({ from, to, employeeId } = {}, onUpdate) {
  if (IS_DEMO) return sortReports(demoData().reports.filter((r) => inRange(r, from, to, employeeId)));
  const params = { action: 'reports' };
  if (from) params.from = from;
  if (to) params.to = to;
  if (employeeId) params.employeeId = employeeId;
  return swr(`reports|${from || ''}|${to || ''}|${employeeId || ''}`, () => get(params).then(sortReports), onUpdate);
}

/** Reports + records in a single request. Returns { reports, records }. */
export async function fetchBundle({ types = TYPE_KEYS, from, to, employeeId } = {}, onUpdate) {
  if (IS_DEMO) {
    const [reports, records] = await Promise.all([fetchReports({ from, to, employeeId }), fetchRecords({ types, from, to, employeeId })]);
    return { reports, records };
  }
  const params = { action: 'bundle', types: types.join(',') };
  if (from) params.from = from;
  if (to) params.to = to;
  if (employeeId) params.employeeId = employeeId;
  const load = () => get(params).then((d) => ({ reports: sortReports(d.reports || []), records: sortRecords({ ...Object.fromEntries(types.map((t) => [t, []])), ...(d.records || {}) }) }));
  return swr(`bundle|${types.join(',')}|${from || ''}|${to || ''}|${employeeId || ''}`, load, onUpdate);
}

export async function saveReport(report) {
  const full = { ...report, id: `${report.employeeId}_${report.date}`, submittedAt: new Date().toISOString() };
  if (IS_DEMO) {
    const { reports } = demoData();
    lsSet(LS_REPORTS, [...reports.filter((r) => r.id !== full.id), full]);
    return full;
  }
  const saved = await post({ action: 'saveReport', report: full });
  clearCache();
  return saved;
}

/**
 * Returns { calls: [], orders: [], customers: [], cancellations: [], hiring: [] }.
 * Customers are always returned in full (not limited by date) so totals are all-time.
 */
export async function fetchRecords({ types = TYPE_KEYS, from, to, employeeId } = {}, onUpdate) {
  const empty = () => { const out = {}; types.forEach((t) => { out[t] = []; }); return out; };
  if (IS_DEMO) {
    const out = empty();
    demoData().records.forEach((r) => {
      if (!out[r.type_]) return;
      const ok = r.type_ === 'customers' ? (!employeeId || r.employeeId === employeeId) : inRange(r, from, to, employeeId);
      if (ok) out[r.type_].push(r);
    });
    return sortRecords(out);
  }
  const params = { action: 'records', types: types.join(',') };
  if (from) params.from = from;
  if (to) params.to = to;
  if (employeeId) params.employeeId = employeeId;
  const load = () => get(params).then((d) => sortRecords({ ...empty(), ...d }));
  return swr(`records|${types.join(',')}|${from || ''}|${to || ''}|${employeeId || ''}`, load, onUpdate);
}

export async function saveRecords(type, rows, { date, employeeId, employee }) {
  const stamp = Date.now();
  const createdAt = new Date().toISOString();
  const records = rows.map((r, i) => ({ ...r, id: `${type}_${employeeId}_${stamp}_${i}`, date, employeeId, employee, createdAt }));
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
  const saved = await post({ action: 'saveRecords', type, records });
  clearCache();
  return saved;
}

export async function deleteRecord(type, id) {
  if (IS_DEMO) {
    const { records } = demoData();
    lsSet(LS_RECORDS, records.filter((r) => r.id !== id));
    return true;
  }
  const res = await post({ action: 'deleteRecord', type, id });
  clearCache();
  return res;
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
