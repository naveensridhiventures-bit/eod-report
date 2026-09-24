import { ROLES, ALL_METRICS, MOODS } from '../config/team';
import { fmtDate, daysBetween } from './date';
import { fmtMetric } from './format';

export function sumMetrics(reports) {
  const t = {};
  reports.forEach((r) => {
    Object.entries(r.metrics || {}).forEach(([k, v]) => { t[k] = (t[k] || 0) + (Number(v) || 0); });
  });
  return t;
}

export function perEmployee(reports, employees) {
  return employees
    .filter((e) => !e.viewOnly)
    .map((e) => {
      const mine = reports.filter((r) => r.employeeId === e.id);
      const moods = mine.map((r) => Number(r.mood)).filter(Boolean);
      return {
        employee: e,
        reports: mine,
        days: mine.length,
        totals: sumMetrics(mine),
        mood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : 0
      };
    });
}

export function byDay(reports, from, to, keys) {
  return daysBetween(from, to).map((date) => {
    const row = { date };
    const dayReports = reports.filter((r) => r.date === date);
    keys.forEach((k) => {
      row[k] = dayReports.reduce((s, r) => s + (Number(r.metrics?.[k]) || 0), 0);
    });
    row.submitted = dayReports.length;
    return row;
  });
}

export const moodLabel = (v) => MOODS.find((m) => m.value === Number(v))?.label || '';
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const byDateAsc = (a, b) => (a.date > b.date ? 1 : -1);

// ── WhatsApp / plain-text EOD ──────────────────────────────────
export function eodText(report) {
  const lines = [
    `*EOD Report — ${report.name}*`,
    fmtDate(report.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    ''
  ];
  report.roles.forEach((role) => {
    const def = ROLES[role];
    if (!def) return;
    const items = [];
    def.metrics.forEach((m) => {
      const v = report.metrics?.[m.key];
      if (v !== undefined && v !== '' && Number(v) !== 0) items.push(`• ${m.label}: ${fmtMetric(m, v)}`);
    });
    def.notes?.forEach((n) => { if (report.notes?.[n.key]) items.push(`• ${n.label}: ${report.notes[n.key]}`); });
    if (items.length) lines.push(`*${def.label}*`, ...items, '');
  });
  if (report.positives) lines.push(`*Wins today:* ${report.positives}`);
  if (report.challenges) lines.push(`*Challenges:* ${report.challenges}`);
  if (report.tomorrow) lines.push(`*Plan for tomorrow:* ${report.tomorrow}`);
  if (report.mood) lines.push(`*Day rating:* ${moodLabel(report.mood)}`);
  return lines.join('\n');
}

// ── Excel ───────────────────────────────────────────────────────
export async function exportExcel({ reports, employees, from, to, title }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const summary = perEmployee(reports, employees);
  const usedMetrics = ALL_METRICS.filter((m) => reports.some((r) => r.metrics?.[m.key] !== undefined));

  const sumRows = summary.map((s) => {
    const row = { Employee: s.employee.name, Role: s.employee.title, 'Days reported': s.days, 'Avg day rating': s.mood ? Number(s.mood.toFixed(1)) : '' };
    usedMetrics.forEach((m) => { row[m.label] = s.totals[m.key] || 0; });
    return row;
  });
  const team = sumMetrics(reports);
  const totalRow = { Employee: 'TEAM TOTAL', Role: '', 'Days reported': reports.length, 'Avg day rating': '' };
  usedMetrics.forEach((m) => { totalRow[m.label] = team[m.key] || 0; });
  sumRows.push(totalRow);

  const ws = XLSX.utils.aoa_to_sheet([[`${title}: ${fmtDate(from)} to ${fmtDate(to)}`], []]);
  XLSX.utils.sheet_add_json(ws, sumRows, { origin: 'A3' });
  ws['!cols'] = Object.keys(sumRows[0]).map((k) => ({ wch: Math.max(12, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');

  Object.values(ROLES).forEach((role) => {
    const roleKey = Object.keys(ROLES).find((k) => ROLES[k] === role);
    const rows = reports.filter((r) => r.roles?.includes(roleKey)).sort(byDateAsc).map((r) => {
      const row = { Date: r.date, Employee: r.name };
      role.metrics.forEach((m) => { row[m.label] = Number(r.metrics?.[m.key]) || 0; });
      role.notes?.forEach((n) => { row[n.label] = r.notes?.[n.key] || ''; });
      return row;
    });
    if (!rows.length) return;
    const s = XLSX.utils.json_to_sheet(rows);
    s['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(12, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, s, role.short);
  });

  const notes = [...reports].sort(byDateAsc).map((r) => ({
    Date: r.date,
    Employee: r.name,
    'Wins today': r.positives || '',
    Challenges: r.challenges || '',
    'Plan for tomorrow': r.tomorrow || '',
    'Day rating': moodLabel(r.mood),
    'Submitted at': r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : ''
  }));
  if (notes.length) {
    const s = XLSX.utils.json_to_sheet(notes);
    s['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 50 }, { wch: 40 }, { wch: 40 }, { wch: 12 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, s, 'Daily notes');
  }

  XLSX.writeFile(wb, `${slug(title)}_${from}_to_${to}.xlsx`);
}

// ── PDF ─────────────────────────────────────────────────────────
export async function exportPDF({ reports, employees, from, to, title }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const green = [14, 59, 58];
  const gold = [244, 169, 59];
  const money = (v) => 'Rs ' + Math.round(v || 0).toLocaleString('en-IN');

  doc.setFillColor(...green);
  doc.rect(0, 0, W, 74, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 74, W, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(title, 36, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${fmtDate(from)} to ${fmtDate(to)}   |   ${reports.length} daily reports`, 36, 58);

  const t = sumMetrics(reports);
  const headline = [
    ['Orders converted', t.orders_converted || 0],
    ['Sales value', money(t.sales_value)],
    ['Orders cancelled', t.orders_cancelled || 0],
    ['Interviews scheduled', t.interviews_scheduled || 0],
    ['Hired / joined', t.hired || 0],
    ['Drivers arranged', t.drivers_arranged || 0],
    ['Dev tasks done', t.tasks_completed || 0],
    ['Bugs fixed', t.bugs_fixed || 0]
  ];
  autoTable(doc, {
    startY: 96,
    head: [headline.map((h) => h[0])],
    body: [headline.map((h) => String(h[1]))],
    theme: 'grid',
    headStyles: { fillColor: green, fontSize: 9 },
    bodyStyles: { fontSize: 13, fontStyle: 'bold', halign: 'center' },
    margin: { left: 36, right: 36 }
  });

  const summary = perEmployee(reports, employees);
  Object.entries(ROLES).forEach(([roleKey, role]) => {
    const people = summary.filter((s) => s.employee.roles.includes(roleKey));
    if (!people.length) return;
    let y = doc.lastAutoTable.finalY + 30;
    if (y > H - 110) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...green);
    doc.text(role.label, 36, y);
    autoTable(doc, {
      startY: y + 8,
      head: [['Employee', 'Days', ...role.metrics.map((m) => m.label.replace('₹', 'Rs'))]],
      body: people.map((p) => [
        p.employee.name,
        p.days,
        ...role.metrics.map((m) => (m.type === 'money' ? money(p.totals[m.key]) : p.totals[m.key] || 0))
      ]),
      theme: 'striped',
      headStyles: { fillColor: green, fontSize: 8 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 36, right: 36 }
    });
  });

  const notes = [...reports].sort(byDateAsc).filter((r) => r.positives || r.challenges);
  if (notes.length) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...green);
    doc.text('Daily wins and challenges', 36, 44);
    autoTable(doc, {
      startY: 58,
      head: [['Date', 'Employee', 'Wins today', 'Challenges', 'Plan for tomorrow']],
      body: notes.map((r) => [r.date, r.name, r.positives || '', r.challenges || '', r.tomorrow || '']),
      theme: 'striped',
      headStyles: { fillColor: green, fontSize: 9 },
      bodyStyles: { fontSize: 8, valign: 'top' },
      columnStyles: { 0: { cellWidth: 64 }, 1: { cellWidth: 80 } },
      margin: { left: 36, right: 36 }
    });
  }

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Team Pulse  |  Generated ${new Date().toLocaleString('en-IN')}  |  Page ${i} of ${pages}`, 36, H - 18);
  }
  doc.save(`${slug(title)}_${from}_to_${to}.pdf`);
}

// ── CSV ─────────────────────────────────────────────────────────
export function exportCSV({ reports, from, to, title }) {
  const head = ['Date', 'Employee', ...ALL_METRICS.map((m) => m.label), 'Wins today', 'Challenges', 'Plan for tomorrow', 'Day rating'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.map(esc).join(',')];
  [...reports].sort(byDateAsc).forEach((r) => {
    lines.push([
      r.date, r.name, ...ALL_METRICS.map((m) => r.metrics?.[m.key] ?? ''),
      r.positives, r.challenges, r.tomorrow, moodLabel(r.mood)
    ].map(esc).join(','));
  });
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(title)}_${from}_to_${to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
