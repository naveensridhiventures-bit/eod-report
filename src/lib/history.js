// ─────────────────────────────────────────────────────────────
//  Remark history for calls (telecaller + HR).
//  Each call keeps a timeline: [{ at, d, t, by, byId, status, remark }]
//  The newest entry decides the call's current status and remark.
// ─────────────────────────────────────────────────────────────
import { todayISO, pad } from './date';
import { statusInfo } from '../config/team';

export const FOLLOWUP_TYPES = ['calls', 'hiring'];
export const isFollowup = (type) => FOLLOWUP_TYPES.includes(type);

export function nowEntry(user, status, remark, date) {
  const now = new Date();
  return {
    at: now.toISOString(),
    d: date || todayISO(),
    t: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    by: user.name,
    byId: user.id,
    status,
    remark: remark || ''
  };
}

/** Always returns a copy with a usable history array */
export function withHistory(r) {
  let h = r.history;
  if (typeof h === 'string') {
    try { h = JSON.parse(h); } catch { h = null; }
  }
  if (!Array.isArray(h) || !h.length) {
    h = [{ at: r.createdAt || r.date, d: r.date, t: '', by: r.employee, byId: r.employeeId, status: r.status, remark: r.remarks || '' }];
  }
  return recompute({ ...r, history: h });
}

export function recompute(r) {
  const history = [...r.history].sort((a, b) => (String(a.at) < String(b.at) ? -1 : 1));
  const last = history[history.length - 1] || {};
  return {
    ...r,
    history,
    status: last.status ?? r.status,
    remarks: last.remark ?? r.remarks,
    lastAt: last.at || r.createdAt,
    lastDate: last.d || r.date,
    attempts: history.length
  };
}

export function entriesIn(r, from, to) {
  return (r.history || []).filter((e) => (!from || e.d >= from) && (!to || e.d <= to));
}

export function lastIn(r, from, to) {
  const list = entriesIn(r, from, to);
  return list[list.length - 1];
}

export function addEntry(r, entry) {
  return recompute({ ...r, history: [...(r.history || []), entry] });
}

export function editEntry(r, index, patch) {
  return recompute({ ...r, history: r.history.map((e, i) => (i === index ? { ...e, ...patch, edited: true } : e)) });
}

export function removeEntry(r, index) {
  return recompute({ ...r, history: r.history.filter((_, i) => i !== index) });
}

export function fmtWhen(e) {
  if (!e) return '';
  const [y, m, d] = String(e.d || '').split('-').map(Number);
  const day = y ? new Date(y, m - 1, d) : null;
  const today = todayISO();
  let label = day ? day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
  if (e.d === today) label = 'Today';
  if (e.t) {
    const [hh, mm] = e.t.split(':').map(Number);
    const ampm = hh >= 12 ? 'pm' : 'am';
    label += `, ${((hh + 11) % 12) + 1}:${pad(mm)} ${ampm}`;
  }
  return label;
}

export function historyText(r, type) {
  return (r.history || []).map((e) => `${fmtWhen(e)} — ${statusInfo(type, e.status).label}${e.remark ? `: ${e.remark}` : ''}${e.by ? ` (${e.by})` : ''}`).join('  |  ');
}
