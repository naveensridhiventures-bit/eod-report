import { useEffect, useMemo, useState } from 'react';
import { Search, FileSpreadsheet, Loader2 } from 'lucide-react';
import { RECORD_TYPES } from '../config/team';
import { fetchRecords, deleteRecord } from '../lib/api';
import { recordRows } from '../lib/reports';
import { fmtDate, monthRange } from '../lib/date';
import { Segmented, Loading, Empty } from '../components/ui';
import { RecordTable } from '../components/Records';
import { rangeFor } from './TeamDashboard';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' }
];

export default function RecordsPage({ user, employees, notify }) {
  const canSeeAll = user.isAdmin;
  const myTypes = useMemo(() => {
    if (canSeeAll) return Object.keys(RECORD_TYPES);
    const t = [];
    if (user.roles.includes('telecaller')) t.push('calls', 'orders', 'customers', 'cancellations');
    if (user.roles.includes('hiring')) t.push('hiring');
    return t;
  }, [canSeeAll, user.roles]);

  const [type, setType] = useState(myTypes[0] || 'calls');
  const [kind, setKind] = useState('month');
  const [custom, setCustom] = useState(monthRange());
  const [who, setWho] = useState(canSeeAll ? 'all' : user.id);
  const [status, setStatus] = useState('all');
  const [title, setTitle] = useState('all');
  const [q, setQ] = useState('');
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState(false);
  const { from, to } = rangeFor(kind, custom);

  const load = () => {
    setRecords(null);
    fetchRecords({ types: myTypes, from, to, employeeId: who === 'all' ? undefined : who })
      .then(setRecords)
      .catch((e) => { setRecords({}); notify(e.message, 'error'); });
  };
  useEffect(load, [from, to, who, myTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setStatus('all'); setTitle('all'); }, [type]);

  const def = RECORD_TYPES[type];
  const titleOptions = useMemo(() => [...new Map((records?.[type] || []).filter((r) => r.title).map((r) => [r.title.toLowerCase(), r.title])).entries()], [records, type]);
  const rows = useMemo(() => {
    let list = records?.[type] || [];
    if (status !== 'all') list = list.filter((r) => (type === 'customers' ? r.type : r.status) === status);
    if (title !== 'all') list = list.filter((r) => (r.title || '').toLowerCase() === title);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(s)));
    return list;
  }, [records, type, status, title, q]);

  const download = async () => {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const data = recordRows(type, rows);
      const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Note: 'No rows' }]);
      ws['!cols'] = Object.keys(data[0] || { a: 1 }).map((k) => ({ wch: Math.max(14, k.length + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, def.short);
      XLSX.writeFile(wb, `${def.short.toLowerCase().replace(/\s+/g, '_')}_${from}_to_${to}.xlsx`);
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete ${r.name || 'this entry'}?`)) return;
    try { await deleteRecord(type, r.id); notify('Deleted'); load(); }
    catch (e) { notify(`Couldn’t delete: ${e.message}`, 'error'); }
  };

  if (!myTypes.length) {
    return <div className="page"><div className="panel"><Empty title="No call data for your role">Developers submit a written update instead.</Empty></div></div>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Call data</h1>
          <p>Every call, order, customer and cancellation the team has imported.</p>
        </div>
        <button className="btn btn-ghost" onClick={download} disabled={busy || !rows.length}>
          {busy ? <Loader2 size={17} className="spin" /> : <FileSpreadsheet size={17} />} Download this list
        </button>
      </div>

      <div className="panel stack" style={{ marginBottom: 16 }}>
        <Segmented value={type} onChange={setType} label="Data type"
          options={myTypes.map((t) => ({ value: t, label: `${RECORD_TYPES[t].short}${records ? ` (${(records[t] || []).length})` : ''}` }))} />
        <div className="filters">
          <div className="field">
            <span className="label">Period</span>
            <Segmented value={kind} onChange={setKind} options={PERIODS} label="Period" />
          </div>
          {kind === 'custom' && (
            <>
              <div className="field"><label className="label" htmlFor="rc-from">From</label><input id="rc-from" type="date" className="input" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="rc-to">To</label><input id="rc-to" type="date" className="input" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></div>
            </>
          )}
          {canSeeAll && (
            <div className="field">
              <label className="label" htmlFor="rc-who">Employee</label>
              <select id="rc-who" className="select" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="all">Whole team</option>
                {employees.filter((e) => !e.viewOnly && e.roles.some((r) => r === 'telecaller' || r === 'hiring')).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          {def.statuses && (
            <div className="field">
              <label className="label" htmlFor="rc-status">{type === 'customers' ? 'Type' : 'Status'}</label>
              <select id="rc-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All</option>
                {def.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}
          {titleOptions.length > 0 && (
            <div className="field">
              <label className="label" htmlFor="rc-title">Title</label>
              <select id="rc-title" className="select" value={title} onChange={(e) => setTitle(e.target.value)}>
                <option value="all">All titles</option>
                {titleOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label className="label" htmlFor="rc-q">Search</label>
            <div className="search"><Search size={16} /><input id="rc-q" className="input" placeholder="Name, number, remark…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          {type === 'customers' ? 'Customer list (all time)' : `${fmtDate(from)} to ${fmtDate(to)}`} — {records ? `${rows.length} rows` : 'loading…'}
        </p>
      </div>

      <div className="panel flush">
        {!records ? <Loading /> : rows.length === 0
          ? <Empty title="Nothing here yet">Try a different period, person or filter.</Empty>
          : <RecordTable type={type} rows={rows} showDate showWho={canSeeAll} limit={500} onDelete={(r) => (canSeeAll || r.employeeId === user.id) && remove(r)} />}
      </div>
    </div>
  );
}
