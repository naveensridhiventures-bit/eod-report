import { toBase } from './parse';
import { entriesIn, lastIn, isFollowup } from './history';

const sum = (list, key) => list.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const sumUnit = (list, unit) => list.reduce((s, r) => {
  const b = toBase(r.qty, r.unit);
  return b.unit === unit ? s + b.qty : s;
}, 0);
const round = (n) => Math.round(n * 100) / 100;

const blank = { calls: [], orders: [], customers: [], cancellations: [], hiring: [] };

/** Current status of each call as of the end of the range (only calls touched in the range) */
function statusCounts(list, range) {
  const counts = {};
  let attempts = 0;
  list.forEach((r) => {
    const inRange = r.history ? entriesIn(r, range.from, range.to) : [r];
    if (!inRange.length) return;
    attempts += inRange.length;
    const last = r.history ? lastIn(r, range.from, range.to) : r;
    counts[last.status] = (counts[last.status] || 0) + 1;
  });
  return { counts, attempts };
}

/** Numbers for one set of records (one person or the whole team). */
export function statsFor(records = blank, range = {}) {
  const r = { ...blank, ...records };
  const inPeriod = (x) => (!range.from || x.date >= range.from) && (!range.to || x.date <= range.to);
  const calls = statusCounts(r.calls, range);
  const hr = statusCounts(r.hiring, range);
  const orders = r.orders.filter(inPeriod);
  const cancels = r.cancellations.filter(inPeriod);
  const cc = (k) => calls.counts[k] || 0;
  const hc = (k) => hr.counts[k] || 0;
  return {
    calls_made: calls.attempts,
    interested_calls: cc('interested'),
    callbacks: cc('callback'),
    not_interested: cc('not_interested'),
    no_answer: cc('no_answer'),
    orders: orders.length,
    sales_value: sum(orders, 'amount'),
    sales_kg: round(sumUnit(orders, 'kg')),
    sales_l: round(sumUnit(orders, 'L')),
    orders_cancelled: cancels.length,
    cancelled_value: sum(cancels, 'amount'),
    cancelled_kg: round(sumUnit(cancels, 'kg')),
    cancelled_l: round(sumUnit(cancels, 'L')),
    customers_total: r.customers.length,
    customers_new: r.customers.filter((c) => c.type !== 'existing').length,
    customers_existing: r.customers.filter((c) => c.type === 'existing').length,
    customers_added: r.customers.filter(inPeriod).length,
    hr_calls: hr.attempts,
    scheduled: hc('scheduled'),
    joined: hc('joined'),
    drivers_arranged: hc('driver_arranged'),
    relieved: hc('relieved'),
    hr_not_interested: hc('not_interested')
  };
}

/** Calls whose latest status inside the range matches */
export function withStatusIn(list = [], status, range = {}) {
  return list.filter((r) => {
    const last = r.history ? lastIn(r, range.from, range.to) : r;
    return last && (Array.isArray(status) ? status.includes(last.status) : last.status === status);
  });
}

export function recordsOf(records, employeeId) {
  const out = {};
  Object.entries({ ...blank, ...records }).forEach(([t, list]) => { out[t] = list.filter((r) => r.employeeId === employeeId); });
  return out;
}

/** Records with activity on a day: calls touched that day, other data added that day */
export function recordsOnDate(records, date) {
  const out = {};
  Object.entries({ ...blank, ...records }).forEach(([t, list]) => {
    out[t] = isFollowup(t) ? list.filter((r) => entriesIn(r, date, date).length) : list.filter((r) => r.date === date);
  });
  return out;
}

export function perPerson(records, employees, range) {
  return employees.filter((e) => !e.viewOnly).map((e) => ({ employee: e, s: statsFor(recordsOf(records, e.id), range) }));
}

export const fmtQty = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** Groups a list by its title: [{ title, rows }] sorted by size */
export function groupByTitle(list = []) {
  const map = new Map();
  list.forEach((r) => {
    const t = (r.title || 'Untitled').trim() || 'Untitled';
    const key = t.toLowerCase();
    if (!map.has(key)) map.set(key, { title: t, rows: [] });
    map.get(key).rows.push(r);
  });
  return [...map.values()].sort((a, b) => b.rows.length - a.rows.length);
}
