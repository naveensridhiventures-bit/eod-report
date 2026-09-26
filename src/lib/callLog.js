// ─────────────────────────────────────────────────────────────
//  AUTO CALL LOG
//  Tap Call → the phone dialer opens → when you come back to the app,
//  it asks how the call went, with the talk time already measured
//  (time away from the app, so it's approximate).
// ─────────────────────────────────────────────────────────────
const KEY = 'pulse_active_call';
const listeners = new Set();

export function startCall(call) {
  const active = { ...call, startedAt: Date.now() };
  try { sessionStorage.setItem(KEY, JSON.stringify(active)); } catch { /* ignore */ }
  window.location.href = `tel:${call.phone}`;
}

export function activeCall() {
  try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
}

export function clearCall() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Calls fn(call, seconds) when the person returns to the app after at least 4 seconds on a call. */
export function watchCallReturn(fn) {
  const check = () => {
    if (document.visibilityState !== 'visible') return;
    const c = activeCall();
    if (!c) return;
    const secs = Math.round((Date.now() - c.startedAt) / 1000);
    if (secs < 4) return;
    if (secs > 3 * 3600) { clearCall(); return; } // stale
    fn(c, secs);
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  listeners.add(check);
  check();
  return () => {
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
    listeners.delete(check);
  };
}

export function fmtDuration(secs) {
  const s = Number(secs) || 0;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
