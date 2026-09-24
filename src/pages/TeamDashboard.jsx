import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Mail, Loader2, TrendingUp, PhoneCall, UserPlus, Code2, Sparkles } from 'lucide-react';
import { ROLES } from '../config/team';
import { fetchReports, emailEODNow, IS_DEMO } from '../lib/api';
import { sumMetrics, perEmployee, byDay } from '../lib/reports';
import { todayISO, weekRange, monthRange, fmtDate, fromISO } from '../lib/date';
import { inr, num, pct, compactInr } from '../lib/format';
import { Avatar, Segmented, Loading, Empty } from '../components/ui';
import DayCard from '../components/DayCard';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' }
];

function rangeFor(kind, custom) {
  if (kind === 'today') return { from: todayISO(), to: todayISO() };
  if (kind === 'week') return weekRange();
  if (kind === 'month') return monthRange();
  return custom;
}

const tooltipStyle = { borderRadius: 10, border: '1px solid #d9e2de', fontSize: 13, fontFamily: 'Figtree, sans-serif' };

export default function TeamDashboard({ employees, notify }) {
  const [kind, setKind] = useState('month');
  const [custom, setCustom] = useState(monthRange());
  const [reports, setReports] = useState(null);
  const [todays, setTodays] = useState([]);
  const [sending, setSending] = useState(false);
  const { from, to } = rangeFor(kind, custom);

  useEffect(() => {
    setReports(null);
    fetchReports({ from, to }).then(setReports).catch((e) => { setReports([]); notify(e.message, 'error'); });
  }, [from, to, notify]);

  useEffect(() => {
    fetchReports({ from: todayISO(), to: todayISO() }).then(setTodays).catch(() => {});
  }, []);

  const staff = useMemo(() => employees.filter((e) => !e.viewOnly), [employees]);
  const t = useMemo(() => sumMetrics(reports || []), [reports]);
  const people = useMemo(() => perEmployee(reports || [], staff), [reports, staff]);
  const singleDay = from === to;

  const chartData = useMemo(() => {
    if (!reports) return [];
    if (singleDay) {
      return people.map((p) => ({ label: p.employee.name.split(' ')[0], ...p.totals }));
    }
    const end = to > todayISO() ? todayISO() : to;
    return byDay(reports, from, end, ['orders_converted', 'orders_cancelled', 'interviews_scheduled', 'hired', 'drivers_arranged'])
      .filter((d) => fromISO(d.date).getDay() !== 0 || d.submitted)
      .map((d) => ({ ...d, label: fromISO(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }));
  }, [reports, people, singleDay, from, to]);

  const submittedIds = new Set(todays.map((r) => r.employeeId));

  const sendNow = async () => {
    setSending(true);
    try { await emailEODNow(todayISO()); notify('Today’s summary emailed to management'); }
    catch (e) { notify(e.message, 'error'); }
    finally { setSending(false); }
  };

  const kpis = [
    { label: 'Sales value', value: inr(t.sales_value), note: `${num(t.orders_converted)} orders converted`, lead: true },
    { label: 'Orders converted', value: num(t.orders_converted), note: `${pct(t.orders_converted, t.calls_connected)}% of connected calls` },
    { label: 'Orders cancelled', value: num(t.orders_cancelled), note: `${pct(t.orders_cancelled, (t.orders_converted || 0) + (t.orders_cancelled || 0))}% cancel rate · ${compactInr(t.cancelled_value)}`, bad: true },
    { label: 'Calls made', value: num(t.calls_made), note: `${pct(t.calls_connected, t.calls_made)}% connected` },
    { label: 'Interviews scheduled', value: num(t.interviews_scheduled), note: `${num(t.interviews_attended)} attended` },
    { label: 'Hired / joined', value: num(t.hired), note: `${num(t.candidates_selected)} selected` },
    { label: 'Call drivers arranged', value: num(t.drivers_arranged), note: `${num(t.no_shows)} no-shows` },
    { label: 'Dev tasks completed', value: num(t.tasks_completed), note: `${num(t.bugs_fixed)} bugs fixed · ${num(t.features_shipped)} features` }
  ];

  const sales = people.filter((p) => p.employee.roles.includes('telecaller'));
  const hiring = people.filter((p) => p.employee.roles.includes('hiring'));
  const devs = people.filter((p) => p.employee.roles.includes('developer'));
  const maxValue = Math.max(1, ...sales.map((p) => p.totals.sales_value || 0));
  const wins = (reports || []).filter((r) => r.positives).slice(0, 6);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Team dashboard</h1>
          <p>{singleDay ? fmtDate(from, { weekday: 'long', day: 'numeric', month: 'long' }) : `${fmtDate(from)} to ${fmtDate(to)}`}</p>
        </div>
        <Segmented value={kind} onChange={setKind} options={RANGES} label="Date range" />
      </div>

      {kind === 'custom' && (
        <div className="panel filters" style={{ marginBottom: 16 }}>
          <div className="field"><label className="label" htmlFor="c-from">From</label><input id="c-from" type="date" className="input" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></div>
          <div className="field"><label className="label" htmlFor="c-to">To</label><input id="c-to" type="date" className="input" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h3>Today’s check-in <span className="chip chip-gold">{submittedIds.size} of {staff.length} submitted</span></h3>
          {!IS_DEMO && (
            <button className="btn btn-ghost btn-sm" onClick={sendNow} disabled={sending}>
              {sending ? <Loader2 size={16} className="spin" /> : <Mail size={16} />} Email today’s summary
            </button>
          )}
        </div>
        <div className="who">
          {staff.map((e) => {
            const r = todays.find((x) => x.employeeId === e.id);
            return (
              <span key={e.id} className={`who-item ${r ? '' : 'pending'}`} title={r ? `Submitted ${new Date(r.submittedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : 'Not submitted yet'}>
                <Avatar person={e} /> {e.name} {r ? <span className="chip chip-good" style={{ height: 22 }}>Done</span> : <span style={{ fontWeight: 500 }}>pending</span>}
              </span>
            );
          })}
        </div>
      </div>

      {!reports ? <Loading /> : reports.length === 0 ? (
        <div className="panel"><Empty title="No reports in this period">Pick a longer range, or check back once the team submits their day.</Empty></div>
      ) : (
        <>
          <div className="kpis">
            {kpis.map((k) => (
              <div key={k.label} className={`kpi ${k.lead ? 'lead' : ''}`}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={k.bad ? { color: 'var(--bad)' } : undefined}>{k.value}</div>
                <div className="kpi-note">{k.note}</div>
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="panel">
              <div className="panel-head"><h3><TrendingUp size={18} /> Orders: converted vs cancelled</h3></div>
              <div className="chart-box">
                <ResponsiveContainer>
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid vertical={false} stroke="#e6ece9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#5e706e' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#5e706e' }} tickLine={false} axisLine={false} width={32} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(14,59,58,.05)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="orders_converted" name="Converted" fill="#2E9E6A" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="orders_cancelled" name="Cancelled" fill="#D6453D" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3><UserPlus size={18} /> Hiring activity</h3></div>
              <div className="chart-box">
                <ResponsiveContainer>
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid vertical={false} stroke="#e6ece9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#5e706e' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#5e706e' }} tickLine={false} axisLine={false} width={32} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(14,59,58,.05)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="interviews_scheduled" name="Scheduled" fill="#3D7DD8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="hired" name="Hired" fill="#0E3B3A" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="drivers_arranged" name="Drivers" fill="#F4A93B" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3><PhoneCall size={18} /> Sales & telecalling</h3></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Person</th><th className="r">Days</th><th className="r">Calls</th><th className="r">Connected</th><th className="r">Converted</th><th className="r">Sales value</th><th className="r">Cancelled</th><th className="r">Cancel value</th></tr></thead>
                <tbody>
                  {sales.map((p) => (
                    <tr key={p.employee.id}>
                      <td><span className="cell-person"><Avatar person={p.employee} />{p.employee.name}</span></td>
                      <td className="r">{p.days}</td>
                      <td className="r">{num(p.totals.calls_made)}</td>
                      <td className="r">{num(p.totals.calls_connected)}</td>
                      <td className="r" style={{ color: 'var(--good)', fontWeight: 700 }}>{num(p.totals.orders_converted)}</td>
                      <td className="r"><b>{inr(p.totals.sales_value)}</b><span className="bar-mini"><span style={{ width: `${((p.totals.sales_value || 0) / maxValue) * 100}%` }} /></span></td>
                      <td className="r" style={{ color: 'var(--bad)', fontWeight: 700 }}>{num(p.totals.orders_cancelled)}</td>
                      <td className="r">{inr(p.totals.cancelled_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="panel">
              <div className="panel-head"><h3><UserPlus size={18} /> Hiring</h3></div>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 460 }}>
                  <thead><tr><th>Person</th><th className="r">Sourced</th><th className="r">Scheduled</th><th className="r">Hired</th><th className="r">Drivers</th></tr></thead>
                  <tbody>
                    {hiring.map((p) => (
                      <tr key={p.employee.id}>
                        <td><span className="cell-person"><Avatar person={p.employee} />{p.employee.name}</span></td>
                        <td className="r">{num(p.totals.candidates_sourced)}</td>
                        <td className="r">{num(p.totals.interviews_scheduled)}</td>
                        <td className="r" style={{ fontWeight: 700 }}>{num(p.totals.hired)}</td>
                        <td className="r" style={{ fontWeight: 700 }}>{num(p.totals.drivers_arranged)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3><Code2 size={18} /> Development</h3></div>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 460 }}>
                  <thead><tr><th>Person</th><th className="r">Tasks</th><th className="r">Bugs</th><th className="r">Features</th><th className="r">Hours</th></tr></thead>
                  <tbody>
                    {devs.map((p) => (
                      <tr key={p.employee.id}>
                        <td><span className="cell-person"><Avatar person={p.employee} />{p.employee.name}</span></td>
                        <td className="r" style={{ fontWeight: 700 }}>{num(p.totals.tasks_completed)}</td>
                        <td className="r">{num(p.totals.bugs_fixed)}</td>
                        <td className="r">{num(p.totals.features_shipped)}</td>
                        <td className="r">{num(p.totals.hours_worked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {people.some((p) => p.employee.roles.includes('saleshead') && p.days) && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-head"><h3>{ROLES.saleshead.label}</h3></div>
              {people.filter((p) => p.employee.roles.includes('saleshead')).map((p) => (
                <div className="kv" key={p.employee.id} style={{ marginBottom: 0 }}>
                  {ROLES.saleshead.metrics.map((m) => (
                    <div key={m.key}><span>{m.label}</span><b>{m.type === 'money' ? inr(p.totals[m.key]) : num(p.totals[m.key])}</b></div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h3><Sparkles size={18} /> Latest reports</h3></div>
            {wins.map((r) => <DayCard key={r.id} report={r} showPerson />)}
          </div>
        </>
      )}
    </div>
  );
}
