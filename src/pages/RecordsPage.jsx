import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, FileSpreadsheet, Loader2, Trash2, X, CheckSquare } from 'lucide-react';
import { RECORD_TYPES, FOLLOWUP_STATUSES, statusInfo } from '../config/team';
import { fetchRecords, deleteRecords, updateRecords } from '../lib/api';
import { recordRows } from '../lib/reports';
import { fmtDate, monthRange, todayISO, toISO, addDays } from '../lib/date';
import { isFollowup, addEntry, nowEntry } from '../lib/history';
import { Segmented, Loading, Empty } from '../components/ui';
import { RecordTable } from '../components/Records';
import CallDrawer from '../components/CallDrawer';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' }
];

function periodRange(kind, custom) {
  if (kind === 'today') return { from: todayISO(), to: todayISO() };
  if (kind === 'week') return { from: toISO(addDays(new Date(), -6)), to: todayISO() };
  if (kind === 'month') return monthRange();
  if (kind === 'all') return { from: '', to: '' };
  return custom;
}

export default function RecordsPage({ user, employees, notify, params }) {
  const canSeeAll = user.isAdmin;
  const myTypes = useMemo(() => {
    if (canSeeAll) return Object.keys(RECORD_TYPES);
    const t = [];
    if (user.roles.includes('telecaller')) t.push('calls', 'orders', 'customers', 'cancellations');
    if (user.roles.includes('hiring')) t.push('hiring');
    return t;
  }, [canSeeAll, user.roles]);

  const [type, setType] = useState(params?.type && myTypes.includes(params.type) ? params.type : myTypes[0] || 'calls');
  const [kind, setKind] = useState(params?.period || 'month');
  const [custom, setCustom] = useState(monthRange());
  const [who, setWho] = useState(canSeeAll ? 'all' : user.id);
  const [status, setStatus] = useState(params?.status || 'all');
  const [title, setTitle] = useState('all');
  const [q, setQ] = useState('');
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [open, setOpen] = useState(null);
  const [bulkStatus, setBulkStatus] = useState('');
  const { from, to } = periodRange(kind, custom);
  const def = RECORD_TYPES[type];
  const followup = isFollowup(type);

  const load = useCallback(() => {
    setRecords(null);
    fetchRecords({ types: myTypes, from: from || undefined, to: to || undefined, employeeId: who === 'all' ? undefined : who })
      .then(setRecords)
      .catch((e) => { setRecords({}); notify(e.message, 'error'); });
  }, [from, to, who, myTypes, notify]);
  useEffect(load, [load]);
  useEffect(() => { setTitle('all'); setSelected(new Set()); setBulkStatus(''); }, [type]);
  useEffect(() => { if (!params?.status) setStatus('all'); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = records?.[type] || [];
  const statusOf = (r) => (type === 'customers' ? r.type : r.status);
  const matchStatus = (r) => status === 'all' || (status === 'followup' ? FOLLOWUP_STATUSES.includes(r.status) : statusOf(r) === status);

  const titleOptions = useMemo(() => [...new Map(base.filter((r) => r.title).map((r) => [r.title.toLowerCase(), r.title])).entries()], [base]);

  const rows = useMemo(() => {
    let list = base.filter(matchStatus);
    if (title !== 'all') list = list.filter((r) => (r.title || '').toLowerCase() === title);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((r) => [r.name, r.phone, r.remarks, r.title, r.employee, r.product, r.area, r.reason, ...(r.history || []).map((e) => e.remark)].some((v) => String(v || '').toLowerCase().includes(s)));
    return list;
  }, [base, status, title, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const chipCounts = useMemo(() => {
    const c = { all: base.length, followup: base.filter((r) => FOLLOWUP_STATUSES.includes(r.status)).length };
    (def.statuses || []).forEach((st) => { c[st.value] = base.filter((r) => statusOf(r) === st.value).length; });
    return c;
  }, [base, def]); // eslint-disable-line react-hooks/exhaustive-deps

  const canEditRow = (r) => !user.viewOnly && (user.isAdmin || r.employeeId === user.id);

  const replace = (saved) => setRecords((all) => ({ ...all, [type]: all[type].map((r) => (r.id === saved.id ? saved : r)) }));
  const dropIds = (ids) => { const set = new Set(ids); setRecords((all) => ({ ...all, [type]: all[type].filter((r) => !set.has(r.id)) })); };

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (list, on) => setSelected((s) => { const n = new Set(s); list.forEach((r) => (on && canEditRow(r) ? n.add(r.id) : n.delete(r.id))); return n; });

  const deleteOne = async (r) => {
    try { await deleteRecords(type, [r.id]); dropIds([r.id]); notify('Deleted'); }
    catch (e) { notify(`Couldn’t delete: ${e.message}`, 'error'); }
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!window.confirm(`Delete ${ids.length} ${def.noun}? This can’t be undone.`)) return;
    setBusy(true);
    try { await deleteRecords(type, ids); dropIds(ids); setSelected(new Set()); notify(`${ids.length} deleted`); }
    catch (e) { notify(`Couldn’t delete: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  const bulkUpdate = async () => {
    if (!bulkStatus) return;
    const picked = base.filter((r) => selected.has(r.id));
    const label = statusInfo(type, bulkStatus).label;
    const next = picked.map((r) => (followup ? addEntry(r, nowEntry(user, bulkStatus, `Marked as ${label}`)) : { ...r, [type === 'customers' ? 'type' : 'status']: bulkStatus }));
    setBusy(true);
    try {
      const saved = await updateRecords(type, next);
      const map = new Map(saved.map((r) => [r.id, r]));
      setRecords((all) => ({ ...all, [type]: all[type].map((r) => map.get(r.id) || r) }));
      setSelected(new Set());
      setBulkStatus('');
      notify(`${saved.length} marked as ${label}`);
    } catch (e) { notify(`Not saved: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const data = recordRows(type, rows);
      const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Note: 'No rows' }]);
      ws['!cols'] = Object.keys(data[0] || { a: 1 }).map((k) => ({ wch: k === 'Remark history' ? 80 : Math.max(14, k.length + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, def.short);
      XLSX.writeFile(wb, `${def.short.toLowerCase().replace(/\s+/g, '_')}_${from || 'all'}_to_${to || todayISO()}.xlsx`);
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  if (!myTypes.length) {
    return <div className="page"><div className="panel"><Empty title="No calls for your role">Developers submit a written update instead.</Empty></div></div>;
  }

  const selectable = !user.viewOnly;
  const statusChips = def.statuses ? [
    { value: 'all', label: 'All' },
    ...(followup ? [{ value: 'followup', label: 'Needs follow-up' }] : []),
    ...def.statuses.map((st) => ({ value: st.value, label: st.label }))
  ] : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Calls & follow-ups</h1>
          <p>Tap any call to see its full remark history, add a new remark, edit or delete it.</p>
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
            <span className="label">{followup ? 'Last activity' : 'Period'}</span>
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
            <div className="search"><Search size={16} /><input id="rc-q" className="input" placeholder="Name, number, any remark…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
        </div>
        {statusChips.length > 0 && (
          <div className="status-chips" role="tablist" aria-label="Status">
            {statusChips.map((c) => (
              <button key={c.value} role="tab" aria-selected={status === c.value} className={`chip chip-btn ${status === c.value ? 'on' : ''}`} onClick={() => setStatus(c.value)}>
                {c.label}<b>{chipCounts[c.value] ?? 0}</b>
              </button>
            ))}
          </div>
        )}
        <p className="muted" style={{ fontSize: 14 }}>
          {type === 'customers' ? 'Customer list (all time)' : from ? `${fmtDate(from)} to ${fmtDate(to)}` : 'All time'} — {records ? `${rows.length} shown` : 'loading…'}
        </p>
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <CheckSquare size={18} /> <b>{selected.size} selected</b>
          {def.statuses && (
            <>
              <select className="select" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} aria-label="New status">
                <option value="">Change status to…</option>
                {def.statuses.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
              </select>
              <button className="btn btn-gold btn-sm" onClick={bulkUpdate} disabled={!bulkStatus || busy}>Apply</button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={bulkDelete} disabled={busy}><Trash2 size={15} /> Delete</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}><X size={15} /> Clear</button>
        </div>
      )}

      <div className="panel flush">
        {!records ? <Loading /> : rows.length === 0
          ? <Empty title="Nothing here">Try a different period, status or search.</Empty>
          : <RecordTable type={type} rows={rows} showDate showWho={canSeeAll} limit={500}
              onOpen={setOpen}
              selected={selectable ? selected : null} onToggle={toggle} onToggleAll={toggleAll} />}
      </div>

      {open && (
        <CallDrawer type={type} record={open} user={user} canEdit={canEditRow(open)} notify={notify}
          onClose={() => setOpen(null)} onChange={replace} onDelete={deleteOne} />
      )}
    </div>
  );
}
