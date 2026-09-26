// ─────────────────────────────────────────────────────────────
//  Turns pasted text (WhatsApp, Excel, notes) or uploaded sheets
//  into clean records. Works with or without a header row.
// ─────────────────────────────────────────────────────────────
import { RECORD_TYPES } from '../config/team';
import { followUpFor } from './followup';

const PHONE_RE = /(?:\+?91[\s-]?)?(?:0)?[6-9]\d{2}[\s-]?\d{2}[\s-]?\d{5}\b|(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\b\d{10}\b/;
const QTY_RE = /(\d+(?:\.\d+)?)\s*(kgs?|kilo(?:gram)?s?|kilograms?|gms?|grams?|g|ltrs?|litres?|liters?|lit|lts?|l|ml|pcs|nos|bags?|box(?:es)?|tins?|packets?|pkts?|cans?|bottles?)\b/i;
const MONEY_RE = /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:rs\b|rupees|\/-)/i;
const SEP_RE = /\s*(?:\t|\||;|,(?!\d{3})|\s-\s)\s*/;

const HEADER_ALIASES = {
  title: ['title', 'category', 'campaign', 'list', 'position', 'role', 'job', 'post', 'designation', 'segment'],
  name: ['name', 'customer', 'customer name', 'candidate', 'candidate name', 'shop', 'party', 'client'],
  phone: ['number', 'phone', 'mobile', 'contact', 'phone number', 'mobile number', 'no', 'ph', 'cell'],
  remarks: ['remarks', 'remark', 'comment', 'comments', 'notes', 'note', 'feedback', 'response'],
  status: ['status', 'result', 'outcome', 'stage'],
  product: ['product', 'item', 'items', 'product name'],
  qty: ['qty', 'quantity', 'weight', 'volume'],
  unit: ['unit', 'uom', 'units'],
  amount: ['amount', 'value', 'price', 'total', 'rs', 'rupees', 'bill'],
  area: ['area', 'location', 'city', 'place', 'address'],
  type: ['type', 'customer type', 'category'],
  reason: ['reason', 'cancel reason', 'cancellation reason', 'why']
};

export function normalisePhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

export function normaliseUnit(u) {
  const x = String(u || '').toLowerCase().trim();
  if (!x) return '';
  if (/^(kgs?|kilo(gram)?s?|kilograms?)$/.test(x)) return 'kg';
  if (/^(g|gms?|grams?)$/.test(x)) return 'g';
  if (/^(l|lt|lts|ltrs?|litres?|liters?|lit)$/.test(x)) return 'L';
  if (x === 'ml') return 'ml';
  return x.replace(/s$/, '');
}

// Converts g→kg and ml→L so totals add up
export function toBase(qty, unit) {
  const q = Number(qty) || 0;
  if (unit === 'g') return { qty: q / 1000, unit: 'kg' };
  if (unit === 'ml') return { qty: q / 1000, unit: 'L' };
  return { qty: q, unit };
}

function money(s) {
  const n = Number(String(s || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function classifyCall(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return 'other';
  if (/(not|no|n'?t|dont|don't)\s*(interest|need|required|want|intrest)|wrong number|don'?t call|declin|reject|already (have|buying|using)/.test(t)) return 'not_interested';
  // Thanglish: "interest illa", "venam", "thevai illa"
  if (/\b(venam|venaam|vendam|vendaam)\b|(interest|intrest|thevai|theva)\s*illa/.test(t)) return 'not_interested';
  if (/edukala|edukkala|eduthala|edukalai|reach aagala|reach agala/.test(t)) return 'no_answer';
  if (/yosi|pakalam|paakalam|aprom|apram|apparam/.test(t)) return 'callback';
  if (/\bvenum\b|order pod|order poduv|anupunga|anuppunga|ok nu|rate kett|sample venum/.test(t)) return 'interested';
  if (/naalaiku|nalaiku|naalaikku|nalaikku|nalaki|saayangalam|sayangalam|call pannunga|kupdunga|koopdunga/.test(t)) return 'callback';
  if (/no answer|not answer|didn'?t pick|not pick|no response|not reachable|unreachable|switch(ed)?\s?off|\bbusy\b|\brnr\b|ringing|not lifting|out of coverage|not connected/.test(t)) return 'no_answer';
  if (/will (think|confirm|let|decide|check|discuss)|call after|call later/.test(t)) return 'callback';
  if (/interest|intrest|positive|order|confirm|\bok\b|okay|agreed|price list|quotation|sample|catalog|will buy|ready to|want|\bhot\b|need/.test(t)) return 'interested';
  if (/call ?back|callback|later|tomorrow|next week|follow ?up|evening|morning/.test(t)) return 'callback';
  return 'other';
}

export function classifyHiring(text) {
  const t = String(text || '').toLowerCase();
  if (/reliev|resign|left (the )?job|quit|terminat|abscond/.test(t)) return 'relieved';
  if (/join (pannitaru|pannitanga|panitaru|panitanga|aagitaru|agitaru)/.test(t)) return 'joined';
  if (/\b(venam|venaam|vendam|varala|varla)\b|interest\s*illa/.test(t)) return 'not_interested';
  if (/edukala|edukkala|eduthala|reach aagala/.test(t)) return 'no_answer';
  if (/varuvanga|varuvaanga|varuvaru|varuvaar|interview ku/.test(t)) return 'scheduled';
  if (/driver.*arrang|arrang.*driver/.test(t)) return 'driver_arranged';
  if (/(not|no|n'?t)\s*(interest|intrest|willing|ok|okay|coming)|reject|declin|salary (issue|not ok)/.test(t)) return 'not_interested';
  if (/\bjoin(ed|ing)?\b|reported/.test(t)) return 'joined';
  if (/no answer|didn'?t pick|not pick|no response|not reachable|switch(ed)?\s?off|\bbusy\b|\brnr\b|ringing|not lifting/.test(t)) return 'no_answer';
  if (/schedul|interview|will come|coming|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|\d\s?(am|pm)\b|slot|walk-?in/.test(t)) return 'scheduled';
  if (/arranged/.test(t)) return 'driver_arranged';
  return 'called';
}

function classifyCustomerType(text) {
  const t = String(text || '').toLowerCase();
  if (/exist|old|regular|repeat|current/.test(t)) return 'existing';
  return 'new';
}

function mapStatus(type, raw, remarks) {
  const src = raw || remarks;
  if (type === 'calls') {
    const t = String(raw || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (RECORD_TYPES.calls.statuses.some((s) => s.value === t)) return t;
    return classifyCall(src);
  }
  if (type === 'hiring') {
    const t = String(raw || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (RECORD_TYPES.hiring.statuses.some((s) => s.value === t)) return t;
    return classifyHiring(src);
  }
  if (type === 'customers') return classifyCustomerType(raw);
  return '';
}

// ── Header detection for Excel/CSV style input ─────────────────
function headerMap(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const key = String(c || '').toLowerCase().trim().replace(/[:.]/g, '');
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && !(field in map)) { map[field] = i; break; }
    }
  });
  return Object.keys(map).length >= 2 ? map : null;
}

function fromMapped(type, cells, map) {
  const get = (f) => (map[f] !== undefined ? String(cells[map[f]] ?? '').trim() : '');
  const r = { name: get('name'), phone: normalisePhone(get('phone')) };
  if (get('title')) r.title = get('title');
  const remarks = get('remarks');
  if (type === 'calls' || type === 'hiring') {
    r.remarks = remarks;
    r.status = mapStatus(type, get('status'), remarks);
  }
  if (type === 'orders' || type === 'cancellations') {
    r.product = get('product');
    const qCell = get('qty');
    const m = qCell.match(QTY_RE);
    r.qty = m ? Number(m[1]) : money(qCell);
    r.unit = normaliseUnit(get('unit') || (m ? m[2] : ''));
    r.amount = money(get('amount'));
    if (type === 'cancellations') r.reason = get('reason') || remarks;
  }
  if (type === 'customers') {
    r.area = get('area');
    r.type = mapStatus('customers', get('type') || remarks);
  }
  return r;
}

// ── Free-text line parsing ─────────────────────────────────────
function fromLine(type, line) {
  let text = line.replace(/^\s*(\d+[.)]|[-*•])\s+/, '').trim(); // drop "1." or bullets
  let name = '';
  let phone = '';
  let rest = '';
  const pm = text.match(PHONE_RE);
  if (pm) {
    phone = normalisePhone(pm[0]);
    name = text.slice(0, pm.index);
    rest = text.slice(pm.index + pm[0].length);
  } else {
    const parts = text.split(SEP_RE);
    name = parts.shift() || '';
    rest = parts.join(', ');
  }
  name = name.replace(/[\s,|:;\-\t]+$/g, '').replace(/^[\s,|:;\-\t]+/g, '').trim();
  rest = rest.replace(/^[\s,|:;\-\t]+/, '').trim();

  const r = { name, phone };
  if (type === 'calls') {
    r.remarks = rest;
    r.status = classifyCall(rest);
  } else if (type === 'hiring') {
    r.remarks = rest;
    r.status = classifyHiring(rest);
  } else if (type === 'orders' || type === 'cancellations') {
    let s = rest;
    const q = s.match(QTY_RE);
    r.qty = q ? Number(q[1]) : 0;
    r.unit = q ? normaliseUnit(q[2]) : '';
    if (q) s = s.replace(q[0], ' ');
    const mm = s.match(MONEY_RE);
    if (mm) {
      r.amount = money(mm[1] || mm[2]);
      s = s.replace(mm[0], ' ');
    } else {
      const nums = s.match(/\b\d[\d,]*(?:\.\d+)?\b/g);
      r.amount = nums ? money(nums[nums.length - 1]) : 0;
      if (nums) s = s.replace(nums[nums.length - 1], ' ');
    }
    const texts = s.split(SEP_RE).map((x) => x.trim()).filter((x) => /[a-z]/i.test(x));
    r.product = texts.shift() || '';
    if (type === 'cancellations') r.reason = texts.join(', ');
    else if (texts.length) r.product = [r.product, ...texts].join(' ');
  } else if (type === 'customers') {
    const segs = rest.split(SEP_RE).map((x) => x.trim()).filter(Boolean);
    const typeIdx = segs.findIndex((x) => /^(new|existing|exist|old|regular|repeat|current)\b/i.test(x));
    r.type = typeIdx >= 0 ? classifyCustomerType(segs.splice(typeIdx, 1)[0]) : 'new';
    r.area = segs.join(', ');
  }
  return r;
}

/**
 * @param {string} type  calls | orders | customers | cancellations | hiring
 * @param {string|any[][]} input  pasted text, or rows from an uploaded sheet
 */
export function parseBulk(type, input) {
  let rows;
  if (Array.isArray(input)) {
    rows = input.map((r) => r.map((c) => (c == null ? '' : String(c))));
  } else {
    rows = String(input || '').split(/\r?\n/).map((l) => (l.includes('\t') ? l.split('\t') : [l]));
  }
  rows = rows.filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];

  const map = headerMap(rows[0]);
  const out = map
    ? rows.slice(1).map((cells) => fromMapped(type, cells, map))
    : rows.map((cells) => fromLine(type, cells.join('\t')));

  return out.filter((r) => r.name || r.phone);
}

/** Adds a follow-up date to imported calls / HR calls (from the remarks, or the default gap). */
export function withFollowUps(type, rows, baseISO) {
  if (type !== 'calls' && type !== 'hiring') return rows;
  return rows.map((r) => ({ ...r, followUp: r.followUp || followUpFor(r.status, r.remarks, baseISO) }));
}

export async function readSheetFile(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
}
