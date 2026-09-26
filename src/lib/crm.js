// ─────────────────────────────────────────────────────────────
//  CRM: turns calls, orders, customers, cancellations and HR calls
//  into one contact per phone number, with a full history.
// ─────────────────────────────────────────────────────────────
import { followUpOf } from './followup';

const newer = (a, b) => a.date > b.date || (a.date === b.date && String(a.createdAt) > String(b.createdAt));

export function buildContacts(records) {
  const map = new Map();
  Object.entries(records || {}).forEach(([type, list]) => {
    (list || []).forEach((r) => {
      if (r.pending) return;
      const key = r.phone || (r.name ? `n:${String(r.name).trim().toLowerCase()}` : null);
      if (!key) return;
      let c = map.get(key);
      if (!c) {
        c = { key, phone: r.phone || '', name: '', nameAt: null, titles: new Set(), owners: new Set(), history: [],
          calls: 0, orders: 0, orderValue: 0, cancelled: 0, hr: 0, area: '', custType: '', last: null, lastTouch: null };
        map.set(key, c);
      }
      const rec = { ...r, type_: type };
      c.history.push(rec);
      if (r.name && (!c.nameAt || newer(r, c.nameAt))) { c.name = r.name; c.nameAt = r; }
      if (r.title) c.titles.add(r.title);
      if (r.employee) c.owners.add(r.employee);
      if (type === 'calls') c.calls++;
      if (type === 'orders') { c.orders++; c.orderValue += Number(r.amount) || 0; }
      if (type === 'cancellations') c.cancelled++;
      if (type === 'hiring') c.hr++;
      if (type === 'customers') { if (r.area) c.area = r.area; c.custType = r.type; }
      if (!c.last || newer(r, c.last)) c.last = rec;
      if ((type === 'calls' || type === 'hiring') && (!c.lastTouch || newer(r, c.lastTouch))) c.lastTouch = rec;
    });
  });

  return [...map.values()].map((c) => {
    c.history.sort((a, b) => (newer(a, b) ? -1 : 1));
    c.fu = c.lastTouch ? followUpOf(c.lastTouch) : null;
    c.status = c.lastTouch?.status || '';
    c.kind = c.hr ? 'candidate' : c.orders || c.custType ? 'customer' : 'lead';
    c.logType = c.hr ? 'hiring' : 'calls';
    c.title = c.lastTouch?.title || c.last?.title || [...c.titles][0] || '';
    c.lastDate = c.last?.date || '';
    return c;
  });
}

export function sortContacts(list) {
  return [...list].sort((a, b) => {
    if (a.fu && b.fu) return a.fu < b.fu ? -1 : 1;
    if (a.fu) return -1;
    if (b.fu) return 1;
    return a.lastDate < b.lastDate ? 1 : -1;
  });
}
