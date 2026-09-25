import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { fetchReports, fetchRecords } from '../lib/api';
import { exportExcel, exportPDF } from '../lib/reports';
import { perPerson, fmtQty } from '../lib/stats';
import { weekRange, monthRange, addDays, fmtDate } from '../lib/date';
import { inr, num } from '../lib/format';
import { Avatar, Segmented, Loading, Empty } from '../components/ui';

const PERIODS = [
  { value: 'week', label: 'This week' },
  { value: 'lastweek', label: 'Last week' },
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
  { value: 'custom', label: 'Custom dates' }
];

function periodRange(kind, custom) {
  const now = new Date();
  if (kind === 'week') return weekRange(now);
  if (kind === 'lastweek') return weekRange(addDays(now, -7));
  if (kind === 'month') return monthRange(now);
  if (kind === 'lastmonth') return monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return custom;
}

export default function ReportsCenter({ user, employees, notify }) {
  const canSeeAll = user.isAdmin;
  const [kind, setKind] = useState('month');
  const [custom, setCustom] = useState(monthRange());
  const [who, setWho] = useState(canSeeAll ? 'all' : user.id);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const { from, to } = periodRange(kind, custom);

  useEffect(() => {
    setData(null);
    const employeeId = who === 'all' ? undefined : who;
    Promise.all([fetchRecords({ from, to, employeeId }), fetchReports({ from, to, employeeId })])
      .then(([records, reports]) => setData({ records, reports }))
      .catch((e) => { setData({ records: { calls: [], orders: [], customers: [], cancellations: [], hiring: [] }, reports: [] }); notify(e.message, 'error'); });
  }, [from, to, who, notify]);

  const staff = useMemo(() => employees.filter((e) => !e.viewOnly && (who === 'all' || e.id === who)), [employees, who]);
  const people = useMemo(() => (data ? perPerson(data.records, staff, { from, to }) : []), [data, staff, from, to]);
  const person = employees.find((e) => e.id === who);
  const title = who === 'all' ? 'Team performance report' : `${person?.name || user.name} performance report`;
  const total = data ? data.reports.length + Object.values(data.records).reduce((s, l) => s + l.length, 0) : 0;

  const run = async (type, fn) => {
    if (!total) { notify('There’s nothing in this period to download.', 'error'); return; }
    setBusy(type);
    try { await fn({ ...data, employees: staff, from, to, title }); notify(`${type} downloaded`); }
    catch (e) { notify(`Download failed: ${e.message}`, 'error'); }
    finally { setBusy(''); }
  };

  const downloads = [
    { type: 'Excel', desc: 'Summary plus every call, order, customer and update', icon: FileSpreadsheet, color: '#1D7049', fn: exportExcel },
    { type: 'PDF', desc: 'Simple report with interested calls highlighted', icon: FileText, color: '#D6453D', fn: exportPDF }
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Download reports</h1>
          <p>Weekly, monthly or any date range — as Excel or PDF.</p>
        </div>
      </div>

      <div className="panel stack" style={{ marginBottom: 16 }}>
        <Segmented value={kind} onChange={setKind} options={PERIODS} label="Report period" />
        <div className="filters">
          {kind === 'custom' && (
            <>
              <div className="field"><label className="label" htmlFor="r-from">From</label><input id="r-from" type="date" className="input" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="r-to">To</label><input id="r-to" type="date" className="input" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></div>
            </>
          )}
          {canSeeAll && (
            <div className="field" style={{ minWidth: 220 }}>
              <label className="label" htmlFor="r-who">Employee</label>
              <select id="r-who" className="select" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="all">Whole team</option>
                {employees.filter((e) => !e.viewOnly).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          {fmtDate(from)} to {fmtDate(to)} — {data ? `${data.reports.length} daily reports, ${data.records.calls.length} calls, ${data.records.hiring.length} HR calls` : 'loading…'}
        </p>
      </div>

      <div className="download-row" style={{ marginBottom: 16 }}>
        {downloads.map((d) => (
          <button key={d.type} className="dl-card" onClick={() => run(d.type, d.fn)} disabled={!!busy || !data}>
            <span className="ic" style={{ background: d.color }}>{busy === d.type ? <Loader2 size={20} className="spin" /> : <d.icon size={20} />}</span>
            <span><span className="t">Download {d.type}</span><br /><span className="s">{d.desc}</span></span>
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Preview</h3></div>
        {!data ? <Loading /> : !total ? <Empty title="Nothing to show for these dates">Try a different period or person.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th><th className="r">Calls</th><th className="r">Interested</th><th className="r">Orders</th><th className="r">Sales</th>
                  <th className="r">kg</th><th className="r">L</th><th className="r">Cancelled</th><th className="r">Customers</th>
                  <th className="r">HR calls</th><th className="r">Scheduled</th><th className="r">Joined</th><th className="r">Relieved</th>
                </tr>
              </thead>
              <tbody>
                {people.map(({ employee: e, s }) => (
                  <tr key={e.id}>
                    <td><span className="cell-person"><Avatar person={e} />{e.name}</span></td>
                    <td className="r">{num(s.calls_made)}</td>
                    <td className="r" style={{ color: 'var(--good)', fontWeight: 700 }}>{num(s.interested_calls)}</td>
                    <td className="r">{num(s.orders)}</td>
                    <td className="r">{inr(s.sales_value)}</td>
                    <td className="r">{fmtQty(s.sales_kg)}</td>
                    <td className="r">{fmtQty(s.sales_l)}</td>
                    <td className="r">{num(s.orders_cancelled)}</td>
                    <td className="r">{num(s.customers_total)}</td>
                    <td className="r">{num(s.hr_calls)}</td>
                    <td className="r">{num(s.scheduled)}</td>
                    <td className="r">{num(s.joined)}</td>
                    <td className="r">{num(s.relieved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
