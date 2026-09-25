import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Mail, Loader2, PhoneCall, UserPlus, Star, MessageSquareText, Phone, Tags } from 'lucide-react';

import { fetchReports, fetchRecords, emailEODNow, IS_DEMO } from '../lib/api';
import { statsFor, perPerson, fmtQty, groupByTitle } from '../lib/stats';
import { TEXT_FIELDS } from '../lib/reports';
import { todayISO, weekRange, monthRange, fmtDate, fromISO, daysBetween } from '../lib/date';
import { inr, num, pct, compactInr } from '../lib/format';
import { Avatar, Segmented, Loading, Empty } from '../components/ui';
import { StatusChip } from '../components/Records';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' }
];

export function rangeFor(kind, custom) {
  if (kind === 'today') return { from: todayISO(), to: todayISO() };
  if (kind === 'week') return weekRange();
  if (kind === 'month') return monthRange();
  return custom;
}

const tooltipStyle = { borderRadius: 10, border: '1px solid #d9e2de', fontSize: 13, fontFamily: 'Figtree, sans-serif' };
const axis = { tick: { fontSize: 12, fill: '#5e706e' }, tickLine: false, axisLine: false };

export default function TeamDashboard({ employees, notify, goTo }) {
  const [kind, setKind] = useState('month');
  const [custom, setCustom] = useState(monthRange());
  const [records, setRecords] = useState(null);
  const [reports, setReports] = useState([]);
  const [todays, setTodays] = useState([]);
  const [sending, setSending] = useState(false);
  const { from, to } = rangeFor(kind, custom);

  useEffect(() => {
    setRecords(null);
    Promise.all([fetchRecords({ from, to }), fetchReports({ from, to })])
      .then(([rec, rep]) => { setRecords(rec); setReports(rep); })
      .catch((e) => { setRecords({ calls: [], orders: [], customers: [], cancellations: [], hiring: [] }); notify(e.message, 'error'); });
  }, [from, to, notify]);

  useEffect(() => { fetchReports({ from: todayISO(), to: todayISO() }).then(setTodays).catch(() => {}); }, []);

  const staff = useMemo(() => employees.filter((e) => !e.viewOnly), [employees]);
  const t = useMemo(() => (records ? statsFor(records, { from, to }) : null), [records, from, to]);
  const people = useMemo(() => (records ? perPerson(records, staff, { from, to }) : []), [records, staff, from, to]);
  const singleDay = from === to;

  const chartData = useMemo(() => {
    if (!records) return [];
    if (singleDay) return people.map(({ employee: e, s }) => ({ label: e.name.split(' ')[0], ...s }));
    const end = to > todayISO() ? todayISO() : to;
    return daysBetween(from, end).map((date) => {
      const day = {};
      Object.entries(records).forEach(([k, list]) => { day[k] = list.filter((r) => r.date === date); });
      return { label: fromISO(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), ...statsFor(day) };
    });
  }, [records, people, singleDay, from, to]);

  const interested = useMemo(() => (records?.calls || []).filter((c) => c.status === 'interested'), [records]);
  const hrHighlights = useMemo(() => (records?.hiring || []).filter((c) => ['scheduled', 'joined', 'driver_arranged'].includes(c.status)), [records]);
  const updates = useMemo(() => reports.filter((r) => TEXT_FIELDS.some((f) => r.notes?.[f.key])).slice(0, 8), [reports]);
  const submittedIds = new Set(todays.map((r) => r.employeeId));

  const sendNow = async () => {
    setSending(true);
    try { await emailEODNow(todayISO()); notify('Today’s summary emailed to management'); }
    catch (e) { notify(e.message, 'error'); }
    finally { setSending(false); }
  };

  const sales = people.filter((p) => p.employee.roles.includes('telecaller'));
  const hiring = people.filter((p) => p.employee.roles.includes('hiring'));

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
              <span key={e.id} className={`who-item ${r ? '' : 'pending'}`}>
                <Avatar person={e} /> {e.name} {r ? <span className="chip chip-good" style={{ height: 22 }}>Done</span> : <span style={{ fontWeight: 500 }}>pending</span>}
              </span>
            );
          })}
        </div>
      </div>

      {!records ? <Loading /> : (
        <>
          <div className="kpis">
            <div className="kpi lead"><div className="kpi-label">Sales value</div><div className="kpi-value">{inr(t.sales_value)}</div><div className="kpi-note">{num(t.orders)} orders</div></div>
            <div className="kpi"><div className="kpi-label">Quantity sold</div><div className="kpi-value">{fmtQty(t.sales_kg)} <small>kg</small></div><div className="kpi-note">{fmtQty(t.sales_l)} litres</div></div>
            <div className="kpi"><div className="kpi-label">Calls made</div><div className="kpi-value">{num(t.calls_made)}</div><div className="kpi-note">{num(t.callbacks)} call backs pending</div></div>
            <div className="kpi"><div className="kpi-label">Interested calls</div><div className="kpi-value" style={{ color: 'var(--good)' }}>{num(t.interested_calls)}</div><div className="kpi-note">{pct(t.interested_calls, t.calls_made)}% of calls</div></div>
            <div className="kpi"><div className="kpi-label">Orders cancelled</div><div className="kpi-value" style={{ color: 'var(--bad)' }}>{num(t.orders_cancelled)}</div><div className="kpi-note">{compactInr(t.cancelled_value)} lost</div></div>
            <div className="kpi"><div className="kpi-label">Customers (all time)</div><div className="kpi-value">{num(t.customers_total)}</div><div className="kpi-note">{num(t.customers_existing)} existing, {num(t.customers_new)} new</div></div>
            <div className="kpi"><div className="kpi-label">HR calls</div><div className="kpi-value">{num(t.hr_calls)}</div><div className="kpi-note">{num(t.scheduled)} interviews scheduled</div></div>
            <div className="kpi"><div className="kpi-label">Joined</div><div className="kpi-value">{num(t.joined)}</div><div className="kpi-note">{num(t.relieved)} relieved, {num(t.drivers_arranged)} drivers arranged</div></div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head">
              <h3><Star size={18} style={{ color: 'var(--good)' }} /> Interested & positive calls <span className="chip chip-good">{interested.length}</span></h3>
              {interested.length > 10 && <button className="btn btn-ghost btn-sm" onClick={() => goTo('records')}>See all</button>}
            </div>
            {interested.length === 0 ? <p className="muted">No interested calls in this period yet.</p> : (
              <div className="highlight-list">
                {interested.slice(0, 10).map((c) => (
                  <div className="hl-item" key={c.id}>
                    <span className="hl-dot" />
                    <div>
                      <div className="hl-name">{c.name} {c.title && <span className="title-tag">{c.title}</span>}</div>
                      {c.remarks && <div className="hl-remark">{c.remarks}</div>}
                      <div className="hl-meta">{c.employee}, {fmtDate(c.date, { day: 'numeric', month: 'short' })}</div>
                    </div>
                    {c.phone && <a className="btn btn-ghost btn-sm" href={`tel:${c.phone}`}><Phone size={15} /> {c.phone}</a>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3><Tags size={18} /> By list title</h3></div>
            <div className="grid-2">
              <div className="table-wrap flat">
                <table className="table compact">
                  <thead><tr><th>Calls list</th><th className="r">Calls</th><th className="r">Interested</th><th className="r">Call backs</th></tr></thead>
                  <tbody>
                    {groupByTitle(records.calls).map((g) => (
                      <tr key={g.title}><td><span className="title-tag">{g.title}</span></td><td className="r">{num(g.rows.length)}</td>
                        <td className="r" style={{ color: 'var(--good)', fontWeight: 700 }}>{num(g.rows.filter((r) => r.status === 'interested').length)}</td>
                        <td className="r">{num(g.rows.filter((r) => r.status === 'callback').length)}</td></tr>
                    ))}
                    {!records.calls.length && <tr><td colSpan={4} className="muted">No calls yet</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap flat">
                <table className="table compact">
                  <thead><tr><th>Hiring for</th><th className="r">Calls</th><th className="r">Scheduled</th><th className="r">Joined</th><th className="r">Relieved</th></tr></thead>
                  <tbody>
                    {groupByTitle(records.hiring).map((g) => (
                      <tr key={g.title}><td><span className="title-tag">{g.title}</span></td><td className="r">{num(g.rows.length)}</td>
                        <td className="r" style={{ color: 'var(--blue)', fontWeight: 700 }}>{num(g.rows.filter((r) => r.status === 'scheduled').length)}</td>
                        <td className="r" style={{ color: 'var(--good)', fontWeight: 700 }}>{num(g.rows.filter((r) => r.status === 'joined' || r.status === 'driver_arranged').length)}</td>
                        <td className="r" style={{ color: 'var(--bad)' }}>{num(g.rows.filter((r) => r.status === 'relieved').length)}</td></tr>
                    ))}
                    {!records.hiring.length && <tr><td colSpan={5} className="muted">No HR calls yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3><PhoneCall size={18} /> Telecallers</h3></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Person</th><th className="r">Calls</th><th className="r">Interested</th><th className="r">Call backs</th><th className="r">Orders</th><th className="r">Sales</th><th className="r">kg</th><th className="r">Litres</th><th className="r">Cancelled</th><th className="r">Customers</th></tr></thead>
                <tbody>
                  {sales.map(({ employee: e, s }) => (
                    <tr key={e.id}>
                      <td><span className="cell-person"><Avatar person={e} />{e.name}</span></td>
                      <td className="r">{num(s.calls_made)}</td>
                      <td className="r" style={{ color: 'var(--good)', fontWeight: 700 }}>{num(s.interested_calls)}</td>
                      <td className="r">{num(s.callbacks)}</td>
                      <td className="r" style={{ fontWeight: 700 }}>{num(s.orders)}</td>
                      <td className="r"><b>{inr(s.sales_value)}</b></td>
                      <td className="r">{fmtQty(s.sales_kg)}</td>
                      <td className="r">{fmtQty(s.sales_l)}</td>
                      <td className="r" style={{ color: 'var(--bad)', fontWeight: 700 }}>{num(s.orders_cancelled)}</td>
                      <td className="r"><b>{num(s.customers_total)}</b><div className="muted" style={{ fontSize: 12 }}>{s.customers_existing} existing, {s.customers_new} new</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="panel">
              <div className="panel-head"><h3><PhoneCall size={18} /> Calls and interested</h3></div>
              <div className="chart-box">
                <ResponsiveContainer>
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid vertical={false} stroke="#e6ece9" />
                    <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} {...axis} width={34} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(14,59,58,.05)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="calls_made" name="Calls" fill="#C9D6D2" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="interested_calls" name="Interested" fill="#2E9E6A" radius={[4, 4, 0, 0]} isAnimationActive={false} />
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
                    <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} {...axis} width={34} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(14,59,58,.05)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="scheduled" name="Scheduled" fill="#3D7DD8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="joined" name="Joined" fill="#0E3B3A" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="relieved" name="Relieved" fill="#D6453D" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="panel">
              <div className="panel-head"><h3><UserPlus size={18} /> HR & hiring</h3></div>
              <div className="table-wrap">
                <table className="table compact">
                  <thead><tr><th>Person</th><th className="r">Calls</th><th className="r">Scheduled</th><th className="r">Joined</th><th className="r">Drivers</th><th className="r">Relieved</th></tr></thead>
                  <tbody>
                    {hiring.map(({ employee: e, s }) => (
                      <tr key={e.id}>
                        <td><span className="cell-person"><Avatar person={e} />{e.name}</span></td>
                        <td className="r">{num(s.hr_calls)}</td>
                        <td className="r" style={{ fontWeight: 700 }}>{num(s.scheduled)}</td>
                        <td className="r" style={{ fontWeight: 700, color: 'var(--good)' }}>{num(s.joined)}</td>
                        <td className="r">{num(s.drivers_arranged)}</td>
                        <td className="r" style={{ color: 'var(--bad)' }}>{num(s.relieved)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3><Star size={18} style={{ color: 'var(--blue)' }} /> Hiring highlights <span className="chip chip-blue">{hrHighlights.length}</span></h3></div>
              {hrHighlights.length === 0 ? <p className="muted">No interviews or joinings in this period yet.</p> : (
                <div className="highlight-list">
                  {hrHighlights.slice(0, 6).map((c) => (
                    <div className="hl-item" key={c.id}>
                      <span className="hl-dot" style={{ background: 'var(--blue)' }} />
                      <div>
                        <div className="hl-name">{c.name} {c.title && <span className="title-tag">{c.title}</span>}</div>
                        <div className="hl-meta">{c.employee}, {fmtDate(c.date, { day: 'numeric', month: 'short' })}{c.phone ? `, ${c.phone}` : ''}</div>
                      </div>
                      <StatusChip type="hiring" value={c.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3><MessageSquareText size={18} /> Developer & sales head updates</h3></div>
            {updates.length === 0 ? <Empty title="No written updates yet">Updates appear here once the team submits their day.</Empty> : updates.map((r) => (
              <div className="update-item" key={r.id}>
                <div className="cell-person"><Avatar person={{ id: r.employeeId, name: r.name }} />{r.name}<span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>{fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
                {TEXT_FIELDS.filter((f) => r.notes?.[f.key]).map((f) => (
                  <p key={f.key}><b style={{ color: 'var(--muted)', fontSize: 13 }}>{f.short}: </b>{r.notes[f.key]}</p>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
