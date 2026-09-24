export const inr = (n) =>
  '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const num = (n) => (Number(n) || 0).toLocaleString('en-IN');
export const compactInr = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e7) return '₹' + (v / 1e7).toFixed(1) + 'Cr';
  if (v >= 1e5) return '₹' + (v / 1e5).toFixed(1) + 'L';
  if (v >= 1e3) return '₹' + (v / 1e3).toFixed(1) + 'k';
  return '₹' + v;
};
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const fmtMetric = (m, v) => (m.type === 'money' ? inr(v) : num(v));
export const initials = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
