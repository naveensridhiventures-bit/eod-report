// Tiny event bus so a call logged from anywhere (the call-result sheet) shows up on every open page.
export const RECORDS_SAVED = 'pulse:records-saved';
export const LEAD_CHANGED = 'pulse:lead-changed';

export function emitSaved(type, records) {
  window.dispatchEvent(new CustomEvent(RECORDS_SAVED, { detail: { type, records } }));
}
export function emitLead(id, fields) {
  window.dispatchEvent(new CustomEvent(LEAD_CHANGED, { detail: { id, fields } }));
}
export function onEvent(name, fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener(name, h);
  return () => window.removeEventListener(name, h);
}
