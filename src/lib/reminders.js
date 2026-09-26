// ─────────────────────────────────────────────────────────────
//  Phone notifications for follow-ups while the app is open or
//  in the background. For reminders when the app is fully closed,
//  people use "Add to calendar" and the daily reminder email.
// ─────────────────────────────────────────────────────────────
import { fuDate, fuTime, whenLabel } from './followup';
import { todayISO } from './date';

const timers = new Map();
const SUMMARY_KEY = 'pulse_reminder_summary';

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notifyOn = () => notifySupported() && Notification.permission === 'granted';

export async function enableNotifications() {
  if (!notifySupported()) throw new Error('This browser can’t show notifications. On iPhone, add the app to your Home Screen first.');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser’s site settings.');
  return true;
}

async function show(title, body, tag) {
  if (!notifyOn()) return;
  const opts = { body, tag, icon: '/pwa-192.png', badge: '/pwa-192.png', renotify: true };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* fall back */ }
  try { new Notification(title, opts); } catch { /* ignore */ }
}

/** Keeps one timer per timed follow-up for today, plus one summary a day. Call again whenever the list changes. */
export function scheduleReminders(items) {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  if (!notifyOn()) return;
  const today = todayISO();
  const due = items.filter((r) => fuDate(r.fu) <= today);

  try {
    if (due.length && localStorage.getItem(SUMMARY_KEY) !== today) {
      localStorage.setItem(SUMMARY_KEY, today);
      const late = due.filter((r) => fuDate(r.fu) < today).length;
      show(`${due.length} follow-up${due.length > 1 ? 's' : ''} today`, late ? `${late} overdue. Open Team Pulse to call them.` : 'Open Team Pulse to call them.', 'pulse-summary');
    }
  } catch { /* ignore */ }

  const now = Date.now();
  items.forEach((r) => {
    if (fuDate(r.fu) !== today || !fuTime(r.fu)) return;
    const [h, m] = fuTime(r.fu).split(':').map(Number);
    const at = new Date();
    at.setHours(h, m, 0, 0);
    const wait = at.getTime() - now - 5 * 60 * 1000; // 5 minutes early
    if (wait < 0 || wait > 24 * 3600 * 1000) return;
    timers.set(r.id, setTimeout(() => show(`Call ${r.name || r.phone} · ${whenLabel(r.fu)}`, r.remarks || r.phone || '', r.id), wait));
  });
}
