// ─────────────────────────────────────────────────────────────
//  DUPLICATE CHECK
//  One lookup of every number the team has called (last 45 days),
//  every customer and the do-not-call list, so the app can warn
//  "Thulasi called this shop 2 days ago — Interested".
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { fetchRecords } from './api';
import { toISO, addDays, todayISO, fromISO } from './date';
import { RECORDS_SAVED, onEvent } from './events';
import { RECORD_TYPES } from '../config/team';

export function buildIndex(records) {
  const idx = new Map();
  const touch = (phone) => { if (!idx.has(phone)) idx.set(phone, { last: null, customerOf: [], dnc: null }); return idx.get(phone); };
  ['calls', 'hiring'].forEach((type) => (records[type] || []).forEach((r) => {
    if (!r.phone) return;
    const e = touch(r.phone);
    if (!e.last || r.date > e.last.date || (r.date === e.last.date && String(r.createdAt) > String(e.last.createdAt))) e.last = { ...r, type_: type };
  }));
  (records.customers || []).forEach((r) => { if (r.phone) touch(r.phone).customerOf.push(r.employee); });
  (records.dnc || []).forEach((r) => { if (r.phone) touch(r.phone).dnc = r; });
  return idx;
}

/** Loads the team-wide index once; new calls logged in the app are added as they happen. */
export function useTeamIndex(enabled) {
  const [idx, setIdx] = useState(null);
  const load = useCallback(() => {
    if (!enabled) return;
    fetchRecords({ types: ['calls', 'hiring', 'customers', 'dnc'], from: toISO(addDays(new Date(), -45)) })
      .then((rec) => setIdx(buildIndex(rec)))
      .catch(() => setIdx(new Map()));
  }, [enabled]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => onEvent(RECORDS_SAVED, ({ type, records }) => {
    if (type !== 'calls' && type !== 'hiring' && type !== 'dnc') return;
    setIdx((cur) => {
      if (!cur) return cur;
      const next = new Map(cur);
      records.forEach((r) => {
        if (!r.phone) return;
        const e = { ...(next.get(r.phone) || { last: null, customerOf: [], dnc: null }) };
        if (type === 'dnc') e.dnc = r; else e.last = { ...r, type_: type };
        next.set(r.phone, e);
      });
      return next;
    });
  }), []);
  return idx;
}

const ago = (date) => {
  const d = Math.round((fromISO(todayISO()) - fromISO(date)) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/** What to warn about for a number: { tone: 'bad'|'warn'|'info', text } or null. */
export function dupeInfo(idx, phone, me) {
  if (!idx || !phone || String(phone).length !== 10) return null;
  const e = idx.get(phone);
  if (!e) return null;
  if (e.dnc) return { tone: 'bad', text: `On the do-not-call list${e.dnc.reason ? ` — ${e.dnc.reason}` : ''}. Please don’t call.` };
  if (e.last) {
    const who = e.last.employeeId === me ? 'You' : e.last.employee;
    const label = RECORD_TYPES[e.last.type_]?.statuses?.find((s) => s.value === e.last.status)?.label || '';
    return {
      tone: e.last.employeeId === me ? 'info' : 'warn',
      text: `${who} called ${e.last.name || 'this number'} ${ago(e.last.date)}${label ? ` · ${label}` : ''}${e.last.remarks ? ` — “${e.last.remarks}”` : ''}`
    };
  }
  if (e.customerOf.length) return { tone: 'info', text: `Already a customer of ${[...new Set(e.customerOf)].join(', ')}.` };
  return null;
}
