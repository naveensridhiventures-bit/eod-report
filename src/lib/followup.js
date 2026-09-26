// ─────────────────────────────────────────────────────────────
//  FOLLOW-UPS
//  A call or HR call can carry a follow-up: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM".
//  "done" means it was closed without a new call.
//  Only the latest entry for a number counts — calling someone again
//  (and logging it) replaces their old follow-up automatically.
// ─────────────────────────────────────────────────────────────
import { toISO, fromISO, addDays, todayISO } from './date';

// Results that get a follow-up, and how many days later by default
export const FOLLOWUP_DEFAULT_DAYS = { callback: 1, interested: 2, scheduled: 1 };
export const needsFollowUp = (status) => status in FOLLOWUP_DEFAULT_DAYS;

const DAY_WORDS = [
  [/\b(day after tomorrow|naalanniku|nalanniku|naalannikku|nalannikku|naalaniku)\b/, 2],
  [/\b(tomorrow|tmrw|tmr|tommorow|tomorow|naalaiku|nalaiku|naalaikku|nalaikku|naliku|nalaki|naalaki|nalaikki)\b/, 1],
  [/\b(today|indru|inniku|innaiku|innikku|inaiku)\b/, 0],
  [/\b(next week|adutha (vaaram|varam|week)|next wk)\b/, 7]
];
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const WEEKDAY_RE = /\b(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday)\b/;

/** Reads a follow-up date/time out of remarks like "call back tomorrow 5pm" or "naalaiku saayangalam call pannunga". */
export function parseWhen(text, baseISO = todayISO()) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const base = fromISO(baseISO);
  let date = null;

  for (const [re, days] of DAY_WORDS) if (re.test(t)) { date = addDays(base, days); break; }

  if (!date) {
    const m = t.match(/\b(?:after|in)\s+(\d{1,2})\s*(?:days?|naal)\b|\b(\d{1,2})\s*(?:days?|naal)\s*(?:la|kalichu|kazhichu|later|after)\b/);
    if (m) date = addDays(base, Number(m[1] || m[2]));
  }
  if (!date) {
    const m = t.match(WEEKDAY_RE);
    if (m) {
      const want = WEEKDAYS[m[1].slice(0, 3)];
      let diff = (want - base.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      date = addDays(base, diff);
    }
  }
  if (!date) {
    const m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/) || null;
    const d2 = t.match(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : base.getFullYear();
      date = new Date(y, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && date < base) date.setFullYear(date.getFullYear() + 1);
    } else if (d2 && Number(d2[1]) >= 1 && Number(d2[1]) <= 31) {
      date = new Date(base.getFullYear(), base.getMonth(), Number(d2[1]));
      if (date < base) date = new Date(base.getFullYear(), base.getMonth() + 1, Number(d2[1]));
    }
  }

  // Time of day
  let time = '';
  const tm = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|mani|o'?clock)\b/);
  if (tm) {
    let h = Number(tm[1]);
    const min = tm[2] || '00';
    const ap = tm[3];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if ((ap === 'mani' || ap.startsWith('o')) && h >= 1 && h <= 7) h += 12; // "5 mani" → 5 PM
    if (h <= 23) time = `${String(h).padStart(2, '0')}:${min}`;
  } else if (/\b(evening|saayangalam|sayangalam|saayanthiram|sayanthram|eve)\b/.test(t)) time = '17:00';
  else if (/\b(morning|kaalaila|kalaila|kaalaiyila|kaalai|kalai)\b/.test(t)) time = '10:00';
  else if (/\b(afternoon|madhiyam|mathiyam|lunch)\b/.test(t)) time = '14:00';
  else if (/\b(night|raathiri|rathiri|nite)\b/.test(t)) time = '19:00';

  if (!date && !time) return null;
  if (!date) date = base; // "call at 5pm" → today
  return `${toISO(date)}${time ? ` ${time}` : ''}`;
}

/** The follow-up to use for a new entry: what the person picked, else what the remarks say, else the default gap. */
export function followUpFor(status, remarks, baseISO, picked) {
  if (!needsFollowUp(status)) return '';
  if (picked) return picked;
  return parseWhen(remarks, baseISO) || toISO(addDays(fromISO(baseISO), FOLLOWUP_DEFAULT_DAYS[status]));
}

/** The follow-up an existing record carries (older rows without one: recent call backs/interviews → next day). */
export function followUpOf(r) {
  const f = String(r.followUp || '').trim();
  if (f === 'done') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(f)) return f;
  // Older rows saved before follow-up dates existed: only recent call backs / interviews count
  if ((r.status === 'callback' || r.status === 'scheduled') && r.date >= toISO(addDays(new Date(), -7))) return toISO(addDays(fromISO(r.date), 1));
  return null;
}

export const fuDate = (f) => String(f).slice(0, 10);
export const fuTime = (f) => (String(f).length > 10 ? String(f).slice(11, 16) : '');

export function timeLabel(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: m ? '2-digit' : undefined });
}

/** "Today 5 PM", "Tomorrow", "2 days late", "Mon 29 Sep" */
export function whenLabel(f, today = todayISO()) {
  const d = fuDate(f);
  const time = timeLabel(fuTime(f));
  const diff = Math.round((fromISO(d) - fromISO(today)) / 86400000);
  let day;
  if (diff < 0) day = diff === -1 ? '1 day late' : `${-diff} days late`;
  else if (diff === 0) day = 'Today';
  else if (diff === 1) day = 'Tomorrow';
  else day = fromISO(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day} ${time}` : day;
}

export function bucketOf(f, today = todayISO()) {
  const d = fuDate(f);
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'upcoming';
}

/**
 * Open follow-ups from a set of records: the latest call/HR call per number (per person),
 * when it still carries a follow-up.
 */
export function openFollowUps(records, types = ['calls', 'hiring']) {
  const out = [];
  types.forEach((type) => {
    const latest = new Map();
    (records[type] || []).forEach((r) => {
      if (r.pending) return;
      const key = `${r.employeeId}|${r.phone || `n:${String(r.name || '').toLowerCase()}`}`;
      const cur = latest.get(key);
      if (!cur || r.date > cur.date || (r.date === cur.date && String(r.createdAt) > String(cur.createdAt))) latest.set(key, r);
    });
    latest.forEach((r) => {
      const f = followUpOf(r);
      if (f) out.push({ ...r, type_: type, fu: f });
    });
  });
  return out.sort((a, b) => (a.fu < b.fu ? -1 : a.fu > b.fu ? 1 : 0));
}

// ── Quick picks for rescheduling ──────────────────────────────
export function quickDates(baseISO = todayISO()) {
  const b = fromISO(baseISO);
  const nextMon = addDays(b, ((8 - b.getDay()) % 7) || 7);
  return [
    { key: 'today5', label: 'Today 5 PM', value: `${toISO(b)} 17:00` },
    { key: 'tom', label: 'Tomorrow', value: toISO(addDays(b, 1)) },
    { key: 'd3', label: 'In 3 days', value: toISO(addDays(b, 3)) },
    { key: 'nw', label: 'Next Monday', value: toISO(nextMon) }
  ];
}

// ── Calendar ──────────────────────────────────────────────────
const stamp = (f) => {
  const d = fuDate(f).replace(/-/g, '');
  const t = fuTime(f);
  return t ? `${d}T${t.replace(':', '')}00` : d;
};
const endStamp = (f) => {
  const t = fuTime(f);
  if (!t) return toISO(addDays(fromISO(fuDate(f)), 1)).replace(/-/g, '');
  const [h, m] = t.split(':').map(Number);
  const end = new Date(2000, 0, 1, h, m + 15);
  return `${fuDate(f).replace(/-/g, '')}T${String(end.getHours()).padStart(2, '0')}${String(end.getMinutes()).padStart(2, '0')}00`;
};
const eventTitle = (r) => `Follow up: ${r.name || r.phone}${r.title ? ` (${r.title})` : ''}`;
const eventDetails = (r) => [r.phone && `Call ${r.phone}`, r.remarks && `Last note: ${r.remarks}`].filter(Boolean).join('\n');

/** Opens Google Calendar with the event filled in — the phone then reminds you even when the app is closed. */
export function calendarLink(r, f) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: eventTitle(r), dates: `${stamp(f)}/${endStamp(f)}`, details: eventDetails(r) });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** One .ics file with every follow-up (with an alarm) — opens in any phone calendar. */
export function downloadIcs(items) {
  const esc = (s) => String(s || '').replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Team Pulse//Follow-ups//EN', 'CALSCALE:GREGORIAN'];
  items.forEach((r) => {
    const timed = !!fuTime(r.fu);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@teampulse`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
      timed ? `DTSTART:${stamp(r.fu)}` : `DTSTART;VALUE=DATE:${stamp(r.fu)}`,
      timed ? `DTEND:${endStamp(r.fu)}` : `DTEND;VALUE=DATE:${endStamp(r.fu)}`,
      `SUMMARY:${esc(eventTitle(r))}`,
      `DESCRIPTION:${esc(eventDetails(r))}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(eventTitle(r))}`, timed ? 'TRIGGER:-PT10M' : 'TRIGGER:PT9H30M', 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `follow-ups-${todayISO()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const waLink = (phone, text = '') => `https://wa.me/91${String(phone).slice(-10)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
