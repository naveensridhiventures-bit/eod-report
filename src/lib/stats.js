import { toBase } from './parse';

const count = (list, status) => list.filter((r) => r.status === status).length;
const sum = (list, key) => list.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const sumUnit = (list, unit) => list.reduce((s, r) => {
  const b = toBase(r.qty, r.unit);
  return b.unit === unit ? s + b.qty : s;
}, 0);
const round = (n) => Math.round(n * 100) / 100;

const blank = { calls: [], orders: [], customers: [], cancellations: [], hiring: [] };

/** Numbers for one set of records (one person or the whole team). */
export function statsFor(records = blank, range = {}) {
  const r = { ...blank, ...records };
  const inPeriod = (x) => (!range.from || x.date >= range.from) && (!range.to || x.date <= range.to);
  return {
    calls_made: r.calls.length,
    interested_calls: count(r.calls, 'interested'),
    callbacks: count(r.calls, 'callback'),
    not_interested: count(r.calls, 'not_interested'),
    no_answer: count(r.calls, 'no_answer'),
    orders: r.orders.length,
    sales_value: sum(r.orders, 'amount'),
    sales_kg: round(sumUnit(r.orders, 'kg')),
    sales_l: round(sumUnit(r.orders, 'L')),
    orders_cancelled: r.cancellations.length,
    cancelled_value: sum(r.cancellations, 'amount'),
    cancelled_kg: round(sumUnit(r.cancellations, 'kg')),
    cancelled_l: round(sumUnit(r.cancellations, 'L')),
    customers_total: r.customers.length,
    customers_new: r.customers.filter((c) => c.type !== 'existing').length,
    customers_existing: r.customers.filter((c) => c.type === 'existing').length,
    customers_added: r.customers.filter(inPeriod).length,
    hr_calls: r.hiring.length,
    scheduled: count(r.hiring, 'scheduled'),
    joined: count(r.hiring, 'joined'),
    drivers_arranged: count(r.hiring, 'driver_arranged'),
    relieved: count(r.hiring, 'relieved'),
    hr_not_interested: count(r.hiring, 'not_interested')
  };
}

export function recordsOf(records, employeeId) {
  const out = {};
  Object.entries({ ...blank, ...records }).forEach(([t, list]) => { out[t] = list.filter((r) => r.employeeId === employeeId); });
  return out;
}

export function recordsOnDate(records, date) {
  const out = {};
  Object.entries({ ...blank, ...records }).forEach(([t, list]) => { out[t] = list.filter((r) => r.date === date); });
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
