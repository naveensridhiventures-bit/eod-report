// Reading a pasted or uploaded lead list: name, number, area, notes.
import { normalisePhone } from './parse';

const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/;
const HEAD = {
  name: /^(name|shop|shop name|customer|company|candidate|business)/i,
  phone: /^(phone|mobile|number|contact|mob|ph|whatsapp)/i,
  area: /^(area|location|place|city|locality|address|route)/i,
  notes: /^(notes?|remarks?|comments?|details?|source|info)/i
};

export function parseLeads(input) {
  let rows = Array.isArray(input)
    ? input.map((r) => r.map((c) => (c == null ? '' : String(c))))
    : String(input || '').split(/\r?\n/).map((l) => (l.includes('\t') ? l.split('\t') : [l]));
  rows = rows.filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];

  // Header row?
  const map = {};
  rows[0].forEach((c, i) => Object.entries(HEAD).forEach(([k, re]) => { if (map[k] === undefined && re.test(c.trim())) map[k] = i; }));
  if (map.phone !== undefined) {
    return rows.slice(1).map((r) => ({
      name: (r[map.name] || '').trim(), phone: normalisePhone(r[map.phone] || ''),
      area: (r[map.area] || '').trim(), notes: (r[map.notes] || '').trim()
    })).filter((l) => l.phone.length === 10);
  }

  return rows.map((cells) => {
    const line = cells.join(', ').replace(/^\s*(\d+[.)]|[-*•])\s+/, '');
    const m = line.match(PHONE);
    if (!m) return null;
    const name = line.slice(0, m.index).replace(/[\s,|:;\-]+$/, '').trim();
    const rest = line.slice(m.index + m[0].length).replace(/^[\s,|:;\-]+/, '').split(/\s*[,|;]\s*/).filter(Boolean);
    const area = rest.length && rest[0].length <= 25 ? rest.shift() : '';
    return { name, phone: normalisePhone(m[0]), area, notes: rest.join(', ') };
  }).filter((l) => l && l.phone.length === 10);
}
