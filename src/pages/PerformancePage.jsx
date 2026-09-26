import { useEffect, useMemo, useState } from 'react';
import { Trophy, FileDown, Loader2, Target, Timer, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fetchRecords, fetchSettings, targetsFor } from '../lib/api';
import { weekRange, monthRange, daysBetween, toISO, addDays, fromISO, todayISO, fmtDate } from '../lib/date';
import { inr } from '../lib/format';
import { hiringFunnel } from '../lib/followup';
import { fmtDuration } from '../lib/callLog';
import { Loading, Segmented, Avatar } from '../components/ui';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const tooltipStyle = { borderRadius: 10, border: '1px solid #d9e2de', fontSize: 13 };

function lastMonth() {
  const d = new Date();
  return monthRange(new Date(d.getFullYear(), d.getMonth() - 1, 15));
}

/** Of the follow-ups that fell due in the period, how many were called by the next day? */
function discipline(list, from, to) {
  const until = [to, toISO(addDays(new Date(), -1))].sort()[0];
  const byPhone = new Map();
  list.forEach((r) => { if (r.phone) { if (!byPhone.has(r.phone)) byPhone.set(r.phone, []); byPhone.get(r.phone).push(r); } });
  let due = 0, onTime = 0;
  list.forEach((r) => {
    const f = String(r.followUp || '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(f)) return;
    const d = f.slice(0, 10);
    if (d < from || d > until) return;
    due++;
    const limit = toISO(addDays(fromISO(d), 1));
    if ((byPhone.get(r.phone) || []).some((x) => x !== r && x.date > r.date && x.date <= limit)) onTime++;
  });
  return { due, onTime, rate: due ? pct(onTime, due) : null };
}

function personStats(recs, from, to, targets, roles) {
  const inP = (r) => r.date >= from && r.date <= to;
  const calls = recs.calls.filter(inP), orders = recs.orders.filter(inP), hiring = recs.hiring.filter(inP);
  const days = new Set([...calls, ...orders, ...hiring].map((r) => r.date));
  const perDay = (list, key) => {
    const m = {};
    list.forEach((r) => { m[r.date] = (m[r.date] || 0) + 1; });
    return [...days].filter((d) => (m[d] || 0) >= key).length;
  };
  const tCalls = Number(targets.calls_made) || 0, tHr = Number(targets.hr_calls) || 0;
  const disc = discipline([...recs.calls, ...recs.hiring], from, to);
  return {
    calls: calls.length,
    interested: calls.filter((r) => r.status === 'interested').length,
    orders: orders.length,
    sales: orders.reduce((a, r) => a + (Number(r.amount) || 0), 0),
    hr: hiring.length,
    ...(({ scheduled, attended, noShow, joined }) => ({ scheduled, attended, noShow, joined }))(hiringFunnel(hiring)),
    talk: [...calls, ...hiring].reduce((a, r) => a + (Number(r.duration) || 0), 0),
    days: days.size,
    targetDays: roles.includes('telecaller') && tCalls ? perDay(calls, tCalls) : roles.includes('hiring') && tHr ? perDay(hiring, tHr) : null,
    disc
  };
}

export default function PerformancePage({ user, employees, notify }) {
  const [kind, setKind] = useState('month');
  const range = kind === 'week' ? weekRange() : kind === 'last' ? lastMonth() : monthRange();
  const { from, to } = range;
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [focus, setFocus] = useState(user.isAdmin ? 'all' : user.id);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    setData(null);
    fetchRecords({ types: ['calls', 'orders', 'hiring'], from: toISO(addDays(fromISO(from), -45)), to: [to, todayISO()].sort()[0] })
      .then(setData).catch((e) => { notify(`Couldn’t load: ${e.message}`, 'error'); setData({ calls: [], orders: [], hiring: [] }); });
  }, [from, to, notify]);
  useEffect(() => { fetchSettings().then(setSettings).catch(() => setSettings({})); }, []);

  const staff = useMemo(() => employees.filter((e) => !e.viewOnly && e.roles.some((r) => r === 'telecaller' || r === 'hiring')), [employees]);

  const rows = useMemo(() => {
    if (!data) return [];
    return staff.map((e) => {
      const mine = { calls: data.calls.filter((r) => r.employeeId === e.id), orders: data.orders.filter((r) => r.employeeId === e.id), hiring: data.hiring.filter((r) => r.employeeId === e.id) };
      return { emp: e, ...personStats(mine, from, to, targetsFor(settings, e.id), e.roles) };
    });
  }, [data, staff, from, to, settings]);

  const focusRows = focus === 'all' ? rows : rows.filter((r) => r.emp.id === focus);
  const total = focusRows.reduce((a, r) => {
    ['calls', 'interested', 'orders', 'sales', 'hr', 'scheduled', 'attended', 'noShow', 'joined', 'talk'].forEach((k) => { a[k] = (a[k] || 0) + r[k]; });
    a.discDue = (a.discDue || 0) + r.disc.due; a.discOn = (a.discOn || 0) + r.disc.onTime;
    return a;
  }, {});

  const trend = useMemo(() => {
    if (!data) return [];
    const ids = focus === 'all' ? null : new Set([focus]);
    const end = [to, todayISO()].sort()[0];
    return daysBetween(from, end).filter((d) => fromISO(d).getDay() !== 0).map((d) => {
      const f = (r) => r.date === d && (!ids || ids.has(r.employeeId));
      return {
        day: fmtDate(d, { day: 'numeric', month: 'short' }),
        Calls: data.calls.filter(f).length,
        Interested: data.calls.filter((r) => f(r) && r.status === 'interested').length,
        'HR calls': data.hiring.filter(f).length
      };
    });
  }, [data, focus, from, to]);

  const leaders = useMemo(() => {
    const top = (key, fmt, filter = () => true) => {
      const best = rows.filter(filter).filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key])[0];
      return best ? { name: best.emp.name, emp: best.emp, value: fmt(best[key]) } : null;
    };
    const disc = rows.filter((r) => r.disc.due >= 3).sort((a, b) => b.disc.rate - a.disc.rate)[0];
    return [
      { label: 'Top sales', ...top('sales', inr) },
      { label: 'Most calls', ...top('calls', (v) => `${v} calls`) },
      { label: 'Most joined', ...top('joined', (v) => `${v} joined`) },
      { label: 'Best follow-up', ...(disc ? { name: disc.emp.name, emp: disc.emp, value: `${disc.disc.rate}% on time` } : {}) }
    ].filter((l) => l.name);
  }, [rows]);

  const pdf = async () => {
    setPdfBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const who = focus === 'all' ? 'Team' : rows.find((r) => r.emp.id === focus)?.emp.name;
      doc.setFillColor(14, 59, 58); doc.rect(0, 0, 842, 70, 'F');
      doc.setTextColor(244, 169, 59); doc.setFontSize(11); doc.text('PERFORMANCE REPORT', 36, 28);
      doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text(`${who} · ${fmtDate(from, { day: 'numeric', month: 'short' })} – ${fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`, 36, 54);
      doc.setTextColor(26, 43, 42); doc.setFontSize(11);
      const lines = [
        `Sales: ${total.calls} calls → ${total.interested} interested (${pct(total.interested, total.calls)}%) → ${total.orders} orders, ${inr(total.sales)}`,
        `Hiring: ${total.hr} HR calls → ${total.scheduled} scheduled → ${total.attended} attended (${total.noShow} no-shows) → ${total.joined} joined`,
        `Talk time: ${fmtDuration(total.talk)} · Follow-ups called on time: ${total.discDue ? `${pct(total.discOn, total.discDue)}% of ${total.discDue}` : '—'}`
      ];
      lines.forEach((l, i) => doc.text(l.replace('₹', 'Rs '), 36, 96 + i * 16));
      autoTable(doc, {
        startY: 150,
        head: [['Name', 'Days', 'Calls', 'Interested', 'Conv.', 'Orders', 'Sales (Rs)', 'HR calls', 'Scheduled', 'Attended', 'No-shows', 'Joined', 'Talk time', 'Target days', 'Follow-ups on time']],
        body: focusRows.map((r) => [r.emp.name, r.days, r.calls, r.interested, r.calls ? `${pct(r.interested, r.calls)}%` : '—', r.orders, Math.round(r.sales).toLocaleString('en-IN'),
          r.hr, r.scheduled, r.attended, r.noShow, r.joined, fmtDuration(r.talk), r.targetDays === null ? '—' : `${r.targetDays}/${r.days}`, r.disc.rate === null ? '—' : `${r.disc.rate}%`]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [14, 59, 58], textColor: 255 },
        alternateRowStyles: { fillColor: [242, 245, 243] }
      });
      doc.save(`performance-${who.toLowerCase().replace(/\s+/g, '-')}-${from}.pdf`);
    } catch (e) { notify(`Couldn’t make the PDF: ${e.message}`, 'error'); }
    finally { setPdfBusy(false); }
  };

  if (!data || !settings) return <div className="page"><Loading text="Crunching the numbers…" /></div>;
  const discRate = total.discDue ? pct(total.discOn, total.discDue) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Performance</h1>
          <p>Conversion, targets, talk time and follow-up discipline — for the team and each person.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Segmented value={kind} onChange={setKind} label="Period" options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }]} />
          <button className="btn btn-ghost" onClick={pdf} disabled={pdfBusy}>{pdfBusy ? <Loader2 size={17} className="spin" /> : <FileDown size={17} />} PDF</button>
        </div>
      </div>

      <div className="ct-filters">
        {user.isAdmin && <button className={`chip chip-btn ${focus === 'all' ? 'on' : ''}`} onClick={() => setFocus('all')}>Whole team</button>}
        {(user.isAdmin ? rows : rows.filter((r) => r.emp.id === user.id)).map((r) => (
          <button key={r.emp.id} className={`chip chip-btn ${focus === r.emp.id ? 'on' : ''}`} onClick={() => setFocus(r.emp.id)}>{r.emp.name}</button>
        ))}
      </div>

      <div className="pf-kpis">
        <div className="pf-kpi"><span>Calls → interested</span><b>{pct(total.interested, total.calls)}%</b><small>{total.interested} of {total.calls}</small></div>
        <div className="pf-kpi"><span>Sales</span><b>{inr(total.sales)}</b><small>{total.orders} orders</small></div>
        <div className="pf-kpi"><span>Interview show-up</span><b>{total.attended + total.noShow ? `${pct(total.attended, total.attended + total.noShow)}%` : '—'}</b><small>{total.noShow} no-shows</small></div>
        <div className="pf-kpi"><span><Timer size={13} /> Talk time</span><b>{fmtDuration(total.talk)}</b><small>from calls made in the app</small></div>
        <div className={`pf-kpi ${discRate !== null && discRate < 60 ? 'bad' : ''}`}><span>Follow-ups on time</span><b>{discRate === null ? '—' : `${discRate}%`}</b><small>{total.discOn} of {total.discDue} called by the next day</small></div>
      </div>

      <div className="pf-two">
        <div className="panel">
          <h3><TrendingUp size={17} style={{ verticalAlign: -3 }} /> Sales funnel</h3>
          <div className="funnel">
            {[['Calls', total.calls], ['Interested', total.interested], ['Orders', total.orders]].map(([l, v], i, arr) => (
              <div key={l} className="funnel-row">
                <span className="funnel-label">{l}</span>
                <div className="funnel-bar"><span style={{ width: `${Math.max(4, (v / Math.max(1, arr[0][1])) * 100)}%` }}><b>{v}</b></span></div>
                <span className="funnel-rate">{i ? `${pct(v, arr[i - 1][1])}%` : ''}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3><TrendingUp size={17} style={{ verticalAlign: -3 }} /> Hiring funnel</h3>
          <div className="funnel">
            {[['HR calls', total.hr], ['Scheduled', total.scheduled], ['Attended', total.attended], ['Joined', total.joined]].map(([l, v], i, arr) => (
              <div key={l} className="funnel-row">
                <span className="funnel-label">{l}</span>
                <div className="funnel-bar blue"><span style={{ width: `${Math.max(4, (v / Math.max(1, arr[0][1])) * 100)}%` }}><b>{v}</b></span></div>
                <span className="funnel-rate">{i ? `${pct(v, arr[i - 1][1])}%` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {leaders.length > 0 && user.isAdmin && focus === 'all' && (
        <div className="pf-leaders">
          {leaders.map((l, i) => (
            <div key={l.label} className="pf-leader">
              <span className="pf-medal">{['🥇', '🏆', '⭐', '🎯'][i]}</span>
              <Avatar person={l.emp} size={34} />
              <div><span className="muted" style={{ fontSize: 12 }}>{l.label}</span><b>{l.name}</b><small>{l.value}</small></div>
            </div>
          ))}
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Day by day</h3>
        <div style={{ height: 240, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ece8" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#5e706e' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#5e706e' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Calls" stroke="#0E3B3A" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Interested" stroke="#2E9E6A" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="HR calls" stroke="#3D7DD8" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 8px' }}><h3><Target size={17} style={{ verticalAlign: -3 }} /> By person</h3></div>
        <div className="table-wrap" style={{ margin: 0 }}>
          <table className="table pf-table">
            <thead><tr><th>Name</th><th>Calls</th><th>Interested</th><th>Orders</th><th>Sales</th><th>HR calls</th><th>Joined</th><th>Talk time</th><th>Target days</th><th>Follow-ups on time</th></tr></thead>
            <tbody>
              {focusRows.map((r) => (
                <tr key={r.emp.id}>
                  <td><b>{r.emp.name}</b></td>
                  <td>{r.calls}</td>
                  <td>{r.interested} <span className="muted">{r.calls ? `(${pct(r.interested, r.calls)}%)` : ''}</span></td>
                  <td>{r.orders}</td>
                  <td>{inr(r.sales)}</td>
                  <td>{r.hr}</td>
                  <td>{r.joined}</td>
                  <td>{fmtDuration(r.talk)}</td>
                  <td>{r.targetDays === null ? '—' : `${r.targetDays} of ${r.days}`}</td>
                  <td className={r.disc.rate !== null && r.disc.rate < 60 ? 'fu-late' : ''}>{r.disc.rate === null ? '—' : `${r.disc.rate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 10 }}><Trophy size={13} style={{ verticalAlign: -2 }} /> Target days = days the calls target was reached, out of days worked. Talk time counts calls made with the app’s Call button.</p>
    </div>
  );
}
