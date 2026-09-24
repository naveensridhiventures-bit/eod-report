import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, FileType2, Loader2 } from 'lucide-react';
import { fetchReports } from '../lib/api';
import { perEmployee, exportExcel, exportPDF, exportCSV } from '../lib/reports';
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
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState('');
  const { from, to } = periodRange(kind, custom);

  useEffect(() => {
    setReports(null);
    fetchReports({ from, to, employeeId: who === 'all' ? undefined : who })
      .then(setReports)
      .catch((e) => { setReports([]); notify(e.message, 'error'); });
  }, [from, to, who, notify]);

  const staff = useMemo(() => employees.filter((e) => !e.viewOnly && (who === 'all' || e.id === who)), [employees, who]);
  const people = useMemo(() => perEmployee(reports || [], staff), [reports, staff]);
  const person = employees.find((e) => e.id === who);
  const title = who === 'all' ? 'Team performance report' : `${person?.name || user.name} performance report`;

  const run = async (type, fn) => {
    if (!reports?.length) { notify('There are no reports in this period to download.', 'error'); return; }
    setBusy(type);
    try {
      await fn({ reports, employees: staff, from, to, title });
      notify(`${type} downloaded`);
    } catch (e) {
      notify(`Download failed: ${e.message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const downloads = [
    { type: 'Excel', desc: 'Summary, a sheet per role, daily notes', icon: FileSpreadsheet, color: '#1D7049', fn: exportExcel },
    { type: 'PDF', desc: 'Formatted report to print or forward', icon: FileText, color: '#D6453D', fn: exportPDF },
    { type: 'CSV', desc: 'Raw data for any spreadsheet tool', icon: FileType2, color: '#5E706E', fn: exportCSV }
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Download reports</h1>
          <p>Weekly, monthly or any date range — as Excel, PDF or CSV.</p>
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
          {fmtDate(from)} to {fmtDate(to)} — {reports ? `${reports.length} daily reports found` : 'loading…'}
        </p>
      </div>

      <div className="download-row" style={{ marginBottom: 16 }}>
        {downloads.map((d) => (
          <button key={d.type} className="dl-card" onClick={() => run(d.type, d.fn)} disabled={!!busy}>
            <span className="ic" style={{ background: d.color }}>{busy === d.type ? <Loader2 size={20} className="spin" /> : <d.icon size={20} />}</span>
            <span><span className="t">Download {d.type}</span><br /><span className="s">{d.desc}</span></span>
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Preview</h3></div>
        {!reports ? <Loading /> : reports.length === 0 ? (
          <Empty title="Nothing to show for these dates">Try a different period or person.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th><th className="r">Days</th><th className="r">Converted</th><th className="r">Sales value</th>
                  <th className="r">Cancelled</th><th className="r">Scheduled</th><th className="r">Hired</th><th className="r">Drivers</th><th className="r">Dev tasks</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.employee.id}>
                    <td><span className="cell-person"><Avatar person={p.employee} />{p.employee.name}</span></td>
                    <td className="r">{p.days}</td>
                    <td className="r">{num(p.totals.orders_converted)}</td>
                    <td className="r">{inr(p.totals.sales_value)}</td>
                    <td className="r">{num(p.totals.orders_cancelled)}</td>
                    <td className="r">{num(p.totals.interviews_scheduled)}</td>
                    <td className="r">{num(p.totals.hired)}</td>
                    <td className="r">{num(p.totals.drivers_arranged)}</td>
                    <td className="r">{num(p.totals.tasks_completed)}</td>
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
