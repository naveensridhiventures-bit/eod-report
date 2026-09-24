export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const todayISO = () => toISO(new Date());

export const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  fromISO(iso).toLocaleDateString('en-IN', opts);
export const fmtDay = (iso) => fromISO(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function weekRange(ref = new Date()) {
  const d = new Date(ref);
  const diff = (d.getDay() + 6) % 7; // Monday start
  const start = addDays(d, -diff);
  return { from: toISO(start), to: toISO(addDays(start, 6)) };
}
export function monthRange(ref = new Date()) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { from: toISO(start), to: toISO(end) };
}
export function daysBetween(from, to) {
  const out = [];
  for (let d = fromISO(from); toISO(d) <= to; d = addDays(d, 1)) out.push(toISO(d));
  return out;
}
