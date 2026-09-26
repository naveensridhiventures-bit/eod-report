import { ROLES, SNAPSHOT, MOODS, RECORD_TYPES, COL_LABELS, statusInfo } from '../config/team';
import { fmtDate } from './date';
import { inr } from './format';
import { perPerson, statsFor, fmtQty, groupByTitle } from './stats';

export const moodLabel = (v) => MOODS.find((m) => m.value === Number(v))?.label || '';
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const byDateAsc = (a, b) => (a.date === b.date ? (a.createdAt > b.createdAt ? 1 : -1) : a.date > b.date ? 1 : -1);

export const TEXT_FIELDS = Object.values(ROLES).flatMap((r) => r.text);

// ── WhatsApp / plain-text EOD ──────────────────────────────────
export function eodText(report, dayRecords) {
  const lines = [
    `*EOD Report — ${report.name}*`,
    fmtDate(report.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    ''
  ];
  const m = report.metrics || {};
  const nums = SNAPSHOT.filter((s) => report.roles.includes(s.role) && Number(m[s.key]))
    .map((s) => `• ${s.label}: ${s.money ? inr(m[s.key]) : fmtQty(m[s.key])}`);
  if (nums.length) lines.push('*Numbers*', ...nums, '');

  const interested = (dayRecords?.calls || []).filter((c) => c.status === 'interested');
  if (interested.length) {
    lines.push(`*Interested customers (${interested.length})*`);
    groupByTitle(interested).forEach((g) => {
      lines.push(`_${g.title}_`);
      g.rows.slice(0, 20).forEach((c) => lines.push(`• ${c.name}${c.phone ? ` (${c.phone})` : ''}${c.remarks ? ` — ${c.remarks}` : ''}`));
    });
    lines.push('');
  }
  const scheduled = (dayRecords?.hiring || []).filter((c) => c.status === 'scheduled');
  if (scheduled.length) {
    lines.push(`*Interviews scheduled (${scheduled.length})*`);
    groupByTitle(scheduled).forEach((g) => {
      lines.push(`_${g.title}_`);
      g.rows.slice(0, 20).forEach((c) => lines.push(`• ${c.name}${c.phone ? ` (${c.phone})` : ''}${c.remarks ? ` — ${c.remarks}` : ''}`));
    });
    lines.push('');
  }
  TEXT_FIELDS.forEach((f) => { if (report.notes?.[f.key]) lines.push(`*${f.short}:* ${report.notes[f.key]}`); });
  if (report.positives) lines.push(`*Wins today:* ${report.positives}`);
  if (report.challenges) lines.push(`*Challenges:* ${report.challenges}`);
  if (report.tomorrow) lines.push(`*Plan for tomorrow:* ${report.tomorrow}`);
  if (report.mood) lines.push(`*Day rating:* ${moodLabel(report.mood)}`);
  return lines.join('\n');
}

// Rows for one record type, ready for a table/sheet
export function recordRows(type, list) {
  const cols = RECORD_TYPES[type].cols;
  return [...list].sort(byDateAsc).map((r) => {
    const row = { Date: r.date, 'Entered by': r.employee };
    cols.forEach((c) => {
      let v = r[c] ?? '';
      if (c === 'status' || c === 'type') v = statusInfo(type, v).label;
      if (c === 'amount' || c === 'qty') v = Number(v) || 0;
      if (c === 'followUp' && v === 'done') v = 'Closed';
      row[COL_LABELS[c]] = v;
    });
    return row;
  });
}

function summaryRows(records, employees, range) {
  return perPerson(records, employees, range).map(({ employee: e, s }) => ({
    Employee: e.name,
    Role: e.title,
    'Calls made': s.calls_made,
    Interested: s.interested_calls,
    'Call backs': s.callbacks,
    Orders: s.orders,
    'Sales (₹)': s.sales_value,
    'Sales (kg)': s.sales_kg,
    'Sales (L)': s.sales_l,
    'Cancelled orders': s.orders_cancelled,
    'Cancelled (₹)': s.cancelled_value,
    'Customers (total)': s.customers_total,
    'Customers new': s.customers_new,
    'Customers existing': s.customers_existing,
    'HR calls': s.hr_calls,
    Scheduled: s.scheduled,
    Joined: s.joined,
    'Drivers arranged': s.drivers_arranged,
    Relieved: s.relieved
  }));
}

function updateRows(reports) {
  return [...reports].sort(byDateAsc).map((r) => {
    const row = { Date: r.date, Employee: r.name };
    TEXT_FIELDS.forEach((f) => { row[f.short] = r.notes?.[f.key] || ''; });
    Object.assign(row, { 'Wins today': r.positives || '', Challenges: r.challenges || '', 'Plan for tomorrow': r.tomorrow || '', 'Day rating': moodLabel(r.mood) });
    return row;
  });
}

// ── Excel ───────────────────────────────────────────────────────
export async function exportExcel({ records, reports, employees, from, to, title }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const add = (name, rows, width = 16) => {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(width, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  const summary = summaryRows(records, employees, { from, to });
  const ws = XLSX.utils.aoa_to_sheet([[`${title}: ${fmtDate(from)} to ${fmtDate(to)}`], []]);
  XLSX.utils.sheet_add_json(ws, summary, { origin: 'A3' });
  ws['!cols'] = Object.keys(summary[0] || { a: 1 }).map((k) => ({ wch: Math.max(12, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');

  const byTitle = [
    ...groupByTitle(records.calls).map((g) => ({ Kind: 'Customer calls', Title: g.title, Calls: g.rows.length, Interested: g.rows.filter((r) => r.status === 'interested').length, 'Call backs': g.rows.filter((r) => r.status === 'callback').length, Scheduled: '', Joined: '', Relieved: '' })),
    ...groupByTitle(records.hiring).map((g) => ({ Kind: 'HR calls', Title: g.title, Calls: g.rows.length, Interested: '', 'Call backs': '', Scheduled: g.rows.filter((r) => r.status === 'scheduled').length, Joined: g.rows.filter((r) => r.status === 'joined' || r.status === 'driver_arranged').length, Relieved: g.rows.filter((r) => r.status === 'relieved').length }))
  ];
  add('By title', byTitle);
  add('Interested calls', recordRows('calls', records.calls.filter((c) => c.status === 'interested')));
  add('Scheduled interviews', recordRows('hiring', records.hiring.filter((c) => c.status === 'scheduled')));
  add('All calls', recordRows('calls', records.calls));
  add('Orders', recordRows('orders', records.orders));
  add('Cancelled', recordRows('cancellations', records.cancellations));
  add('Customers', recordRows('customers', records.customers));
  add('HR calls', recordRows('hiring', records.hiring));
  add('Daily updates', updateRows(reports), 22);

  XLSX.writeFile(wb, `${slug(title)}_${from}_to_${to}.xlsx`);
}

// ── PDF ─────────────────────────────────────────────────────────
export async function exportPDF({ records, reports, employees, from, to, title }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const green = [14, 59, 58];
  const gold = [244, 169, 59];
  const rs = (v) => 'Rs ' + Math.round(v || 0).toLocaleString('en-IN');
  const clean = (s) => String(s ?? '').replace(/₹/g, 'Rs ').replace(/[^\x20-\x7E\n]/g, '');

  doc.setFillColor(...green); doc.rect(0, 0, W, 74, 'F');
  doc.setFillColor(...gold); doc.rect(0, 74, W, 4, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(clean(title), 36, 38);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(`${fmtDate(from)} to ${fmtDate(to)}`, 36, 58);

  const t = statsFor(records, { from, to });
  const kpis = [
    ['Calls made', t.calls_made], ['Interested', t.interested_calls], ['Orders', t.orders], ['Sales', rs(t.sales_value)],
    ['Sales kg', fmtQty(t.sales_kg)], ['Sales L', fmtQty(t.sales_l)], ['Cancelled', t.orders_cancelled],
    ['HR calls', t.hr_calls], ['Scheduled', t.scheduled], ['Joined', t.joined], ['Relieved', t.relieved]
  ];
  autoTable(doc, {
    startY: 96, head: [kpis.map((k) => k[0])], body: [kpis.map((k) => String(k[1]))], theme: 'grid',
    headStyles: { fillColor: green, fontSize: 8, halign: 'center' }, bodyStyles: { fontSize: 12, fontStyle: 'bold', halign: 'center' },
    margin: { left: 36, right: 36 }
  });

  const section = (label, head, body, opts = {}) => {
    if (!body.length) return;
    let y = doc.lastAutoTable.finalY + 30;
    if (y > H - 110) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...green);
    doc.text(label, 36, y);
    autoTable(doc, {
      startY: y + 8, head: [head], body: body.map((row) => row.map(clean)), theme: 'striped',
      headStyles: { fillColor: green, fontSize: 8 }, bodyStyles: { fontSize: 8.5, valign: 'top' },
      margin: { left: 36, right: 36 }, ...opts
    });
  };

  const people = perPerson(records, employees, { from, to });
  section('Telecallers',
    ['Employee', 'Calls', 'Interested', 'Call backs', 'Orders', 'Sales', 'kg', 'L', 'Cancelled', 'Cancel Rs', 'Customers', 'New', 'Existing'],
    people.filter((p) => p.employee.roles.includes('telecaller')).map(({ employee: e, s }) => [
      e.name, s.calls_made, s.interested_calls, s.callbacks, s.orders, rs(s.sales_value), fmtQty(s.sales_kg), fmtQty(s.sales_l),
      s.orders_cancelled, rs(s.cancelled_value), s.customers_total, s.customers_new, s.customers_existing
    ]));
  section('HR & hiring',
    ['Employee', 'Calls', 'Scheduled', 'Joined', 'Drivers arranged', 'Relieved', 'Not interested'],
    people.filter((p) => p.employee.roles.includes('hiring')).map(({ employee: e, s }) => [
      e.name, s.hr_calls, s.scheduled, s.joined, s.drivers_arranged, s.relieved, s.hr_not_interested
    ]));

  const interested = [...records.calls].filter((c) => c.status === 'interested').sort(byDateAsc);
  section(`Interested & positive calls (${interested.length})`, ['Date', 'Telecaller', 'Title', 'Customer', 'Number', 'Remarks'],
    interested.map((c) => [c.date, c.employee, c.title, c.name, c.phone, c.remarks]), { columnStyles: { 5: { cellWidth: 280 } } });

  const hrGood = [...records.hiring].filter((c) => ['scheduled', 'joined', 'driver_arranged'].includes(c.status)).sort(byDateAsc);
  section('Hiring highlights', ['Date', 'HR', 'Title', 'Candidate', 'Number', 'Status', 'Remarks'],
    hrGood.map((c) => [c.date, c.employee, c.title, c.name, c.phone, statusInfo('hiring', c.status).label, c.remarks]));

  section('Cancelled orders', ['Date', 'Telecaller', 'Customer', 'Product', 'Qty', 'Amount', 'Reason'],
    [...records.cancellations].sort(byDateAsc).map((c) => [c.date, c.employee, c.name, c.product, `${fmtQty(c.qty)} ${c.unit || ''}`, rs(c.amount), c.reason]));

  const updates = [...reports].sort(byDateAsc).filter((r) => TEXT_FIELDS.some((f) => r.notes?.[f.key]) || r.positives || r.challenges);
  section('Daily updates', ['Date', 'Employee', 'Work / update', 'Wins', 'Challenges'],
    updates.map((r) => [r.date, r.name, TEXT_FIELDS.map((f) => r.notes?.[f.key]).filter(Boolean).join('\n'), r.positives, r.challenges]),
    { columnStyles: { 2: { cellWidth: 260 } } });

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Team Pulse  |  Generated ${new Date().toLocaleString('en-IN')}  |  Page ${i} of ${pages}`, 36, H - 18);
  }
  doc.save(`${slug(title)}_${from}_to_${to}.pdf`);
}
