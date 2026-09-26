import { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, Users, Wand2, Loader2, Send, ArrowRightLeft, Ban, Trash2, Plus } from 'lucide-react';
import { fetchRecords, saveRecords, updateRecords, deleteRecord } from '../lib/api';
import { parseLeads } from '../lib/leads';
import { readSheetFile, normalisePhone } from '../lib/parse';
import { buildIndex } from '../lib/teamIndex';
import { toISO, addDays, todayISO } from '../lib/date';
import { Loading, Segmented } from '../components/ui';
import { RECORD_TYPES } from '../config/team';

const RESULT_LABEL = (kind, v) => (v === 'dnc' ? 'Do not call' : RECORD_TYPES[kind === 'hiring' ? 'hiring' : 'calls'].statuses.find((s) => s.value === v)?.label || v);

export default function LeadsPage({ user, employees, notify }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    setData(null);
    fetchRecords({ types: ['leads', 'dnc', 'calls', 'hiring', 'customers'], from: toISO(addDays(new Date(), -45)) })
      .then(setData).catch((e) => { notify(`Couldn’t load: ${e.message}`, 'error'); setData({ leads: [], dnc: [], calls: [], hiring: [], customers: [] }); });
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  // Upload form
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('sales');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [skipRecent, setSkipRecent] = useState(true);
  const [skipCustomers, setSkipCustomers] = useState(true);
  const [who, setWho] = useState([]);
  const [saving, setSaving] = useState(false);

  const team = employees.filter((e) => !e.viewOnly && e.roles.includes(kind === 'hiring' ? 'hiring' : 'telecaller'));
  const idx = useMemo(() => (data ? buildIndex(data) : new Map()), [data]);
  const openPhones = useMemo(() => new Set((data?.leads || []).filter((l) => l.state === 'open').map((l) => l.phone)), [data]);

  const check = useMemo(() => {
    if (!parsed) return null;
    const seen = new Set();
    const out = { keep: [], dupInList: 0, inQueue: 0, dnc: 0, recent: 0, customers: 0 };
    parsed.forEach((l) => {
      if (seen.has(l.phone)) { out.dupInList++; return; }
      seen.add(l.phone);
      const e = idx.get(l.phone);
      if (e?.dnc) { out.dnc++; return; }
      if (openPhones.has(l.phone)) { out.inQueue++; return; }
      if (skipCustomers && kind === 'sales' && e?.customerOf.length) { out.customers++; return; }
      if (skipRecent && e?.last && e.last.date >= toISO(addDays(new Date(), -30))) { out.recent++; return; }
      out.keep.push(l);
    });
    return out;
  }, [parsed, idx, openPhones, skipRecent, skipCustomers, kind]);

  const read = (src = text) => {
    const rows = parseLeads(src);
    if (!rows.length) { notify('No mobile numbers found. Put one lead per line: name, number, area, notes.', 'error'); return; }
    setParsed(rows);
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { read(await readSheetFile(f)); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); }
    catch (err) { notify(err.message, 'error'); }
    e.target.value = '';
  };

  const split = useMemo(() => {
    if (!check || !who.length) return [];
    return who.map((id, i) => ({ id, rows: check.keep.filter((_, j) => j % who.length === i) }));
  }, [check, who]);

  const assign = async () => {
    if (!title.trim()) { notify('Give the list a name, e.g. “Ambattur shops”.', 'error'); return; }
    if (!who.length) { notify('Pick who should call this list.', 'error'); return; }
    if (!check.keep.length) { notify('Nothing new to assign.', 'error'); return; }
    setSaving(true);
    try {
      const rows = split.flatMap(({ id, rows: rs }) => {
        const emp = employees.find((e) => e.id === id);
        return rs.map((l) => ({ ...l, title: title.trim(), kind, state: 'open', result: '', doneAt: '', assignedBy: user.name, employeeId: id, employee: emp.name }));
      });
      for (let i = 0; i < rows.length; i += 200) {
        await saveRecords('leads', rows.slice(i, i + 200), { date: todayISO(), employeeId: user.id, employee: user.name });
      }
      notify(`${rows.length} leads assigned to ${split.map((s) => employees.find((e) => e.id === s.id)?.name).join(', ')}`);
      setText(''); setParsed(null); setTitle(''); setWho([]);
      load();
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };

  // Progress
  const lists = useMemo(() => {
    const m = new Map();
    (data?.leads || []).forEach((l) => {
      const k = l.title || 'Leads';
      if (!m.has(k)) m.set(k, { title: k, kind: l.kind, people: new Map(), total: 0, open: 0, removed: 0, results: {} });
      const g = m.get(k);
      g.total++;
      if (l.state === 'open') g.open++;
      else if (l.state === 'removed') g.removed++;
      else if (l.state !== 'removed') g.results[l.result] = (g.results[l.result] || 0) + 1;
      if (!g.people.has(l.employeeId)) g.people.set(l.employeeId, { name: l.employee, open: 0, done: 0 });
      const p = g.people.get(l.employeeId);
      if (l.state === 'open') p.open++; else if (l.state !== 'removed') p.done++;
    });
    return [...m.values()].filter((g) => g.open > 0 || g.total - g.open > 0);
  }, [data]);

  const [move, setMove] = useState(null); // { title, from, to }
  const doMove = async () => {
    const to = employees.find((e) => e.id === move.to);
    const ids = data.leads.filter((l) => l.title === move.title && l.employeeId === move.from && l.state === 'open').map((l) => l.id);
    if (!to || !ids.length) return;
    try {
      await updateRecords('leads', ids.map((id) => ({ id, fields: { employeeId: to.id, employee: to.name } })));
      notify(`${ids.length} leads moved to ${to.name}`);
      setMove(null); load();
    } catch (e) { notify(e.message, 'error'); }
  };
  const removeOpen = async (t) => {
    const ids = data.leads.filter((l) => l.title === t && l.state === 'open').map((l) => l.id);
    if (!ids.length || !window.confirm(`Remove the ${ids.length} uncalled leads in “${t}” from everyone’s queue?`)) return;
    try { await updateRecords('leads', ids.map((id) => ({ id, fields: { state: 'removed' } }))); notify('Removed'); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  // Do-not-call list
  const [dncPhone, setDncPhone] = useState('');
  const [dncReason, setDncReason] = useState('');
  const addDnc = async () => {
    const p = normalisePhone(dncPhone);
    if (p.length !== 10) { notify('Enter a 10-digit number.', 'error'); return; }
    try { await saveRecords('dnc', [{ name: '', phone: p, reason: dncReason.trim() }], { date: todayISO(), employeeId: user.id, employee: user.name }); setDncPhone(''); setDncReason(''); load(); }
    catch (e) { notify(e.message, 'error'); }
  };

  if (!data) return <div className="page"><Loading text="Loading call queues…" /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Call queue</h1>
          <p>Upload a list of numbers, split it across the team, and watch it get called. Duplicates and do-not-call numbers are removed for you.</p>
        </div>
      </div>

      <div className="panel stack">
        <h3><Upload size={17} style={{ verticalAlign: -3 }} /> New list</h3>
        <div className="grid-2">
          <div>
            <label className="label" htmlFor="ld-title">List name</label>
            <input id="ld-title" className="input" placeholder="e.g. Ambattur shops, Indeed drivers" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          </div>
          <div>
            <span className="label">Type of calls</span>
            <Segmented value={kind} onChange={(k) => { setKind(k); setWho([]); }} options={[{ value: 'sales', label: 'Sales' }, { value: 'hiring', label: 'Hiring' }]} label="Type of calls" />
          </div>
        </div>
        {!parsed ? (
          <>
            <textarea className="textarea mono" rows={6} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={'One per line: name, number, area, notes\nSri Murugan Stores, 9876543210, Ambattur, big grocery\nKPN Foods 9123456780 Padi'}
              onPaste={(e) => { const t = e.clipboardData.getData('text'); if (!text.trim() && t.trim()) { e.preventDefault(); setText(t); read(t); } }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => read()} disabled={!text.trim()}><Wand2 size={17} /> Read list</button>
              <label className="btn btn-ghost"><Upload size={17} /> Upload Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} /></label>
            </div>
          </>
        ) : (
          <>
            <div className="ld-check">
              <div className="ld-keep"><b>{check.keep.length}</b> new numbers ready to call</div>
              <div className="ld-skips">
                {check.dupInList > 0 && <span>{check.dupInList} repeated in the list</span>}
                {check.inQueue > 0 && <span>{check.inQueue} already in someone’s queue</span>}
                {check.dnc > 0 && <span className="bad">{check.dnc} on do-not-call</span>}
                {check.customers > 0 && <span>{check.customers} existing customers</span>}
                {check.recent > 0 && <span>{check.recent} called in the last 30 days</span>}
              </div>
              <label className="check"><input type="checkbox" checked={skipRecent} onChange={(e) => setSkipRecent(e.target.checked)} /> Skip numbers called in the last 30 days</label>
              {kind === 'sales' && <label className="check"><input type="checkbox" checked={skipCustomers} onChange={(e) => setSkipCustomers(e.target.checked)} /> Skip existing customers</label>}
            </div>
            <div>
              <span className="label"><Users size={15} style={{ verticalAlign: -2 }} /> Who calls this list? (split evenly)</span>
              <div className="moods">
                {team.map((e) => (
                  <button key={e.id} type="button" className={`mood ${who.includes(e.id) ? 'on' : ''}`} onClick={() => setWho((w) => (w.includes(e.id) ? w.filter((x) => x !== e.id) : [...w, e.id]))}>{e.name}</button>
                ))}
                {team.length > 1 && <button type="button" className="mood" onClick={() => setWho(team.map((e) => e.id))}>Everyone</button>}
              </div>
              {split.length > 0 && <p className="hint">{split.map((s) => `${employees.find((e) => e.id === s.id)?.name}: ${s.rows.length}`).join(' · ')}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={assign} disabled={saving}>{saving ? <Loader2 size={17} className="spin" /> : <Send size={17} />} Assign {check.keep.length} leads</button>
              <button className="btn btn-ghost" onClick={() => setParsed(null)}>Back</button>
            </div>
          </>
        )}
      </div>

      <h2 className="ld-h2">Lists in progress</h2>
      {!lists.length ? <p className="muted">No lists yet. Upload one above.</p> : lists.map((g) => {
        const done = g.total - g.open - g.removed;
        return (
          <div key={g.title} className="panel ld-list">
            <div className="ld-list-head">
              <div>
                <h3>{g.title} <span className="chip">{g.kind === 'hiring' ? 'Hiring' : 'Sales'}</span></h3>
                <p className="muted" style={{ fontSize: 13 }}>{done} called · {g.open} left</p>
              </div>
              {g.open > 0 && <button className="btn btn-ghost btn-sm" onClick={() => removeOpen(g.title)}><Trash2 size={15} /> Remove uncalled</button>}
            </div>
            <div className="q-progress"><span style={{ width: `${g.total - g.removed ? (done / (g.total - g.removed)) * 100 : 0}%` }} /></div>
            {Object.keys(g.results).length > 0 && (
              <div className="ld-results">
                {Object.entries(g.results).filter(([k]) => k).map(([k, v]) => <span key={k} className="chip">{RESULT_LABEL(g.kind, k)} · {v}</span>)}
              </div>
            )}
            <div className="ld-people">
              {[...g.people.entries()].map(([id, p]) => (
                <div key={id} className="ld-person">
                  <b>{p.name}</b><span className="muted">{p.done} called · {p.open} left</span>
                  {p.open > 0 && <button className="icon-btn" title="Move their uncalled leads to someone else" onClick={() => setMove({ title: g.title, from: id, to: '' })}><ArrowRightLeft size={16} /></button>}
                </div>
              ))}
            </div>
            {move?.title === g.title && (
              <div className="ld-move">
                <span>Move {g.people.get(move.from)?.open} uncalled leads from <b>{g.people.get(move.from)?.name}</b> to</span>
                <select className="input" style={{ width: 'auto' }} value={move.to} onChange={(e) => setMove({ ...move, to: e.target.value })}>
                  <option value="">Choose…</option>
                  {employees.filter((e) => !e.viewOnly && e.id !== move.from && e.roles.includes(g.kind === 'hiring' ? 'hiring' : 'telecaller')).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" disabled={!move.to} onClick={doMove}>Move</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setMove(null)}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}

      <h2 className="ld-h2"><Ban size={18} style={{ verticalAlign: -3 }} /> Do-not-call list <span className="chip">{data.dnc.length}</span></h2>
      <div className="panel">
        <div className="reminder-row">
          <input className="input" style={{ flex: '1 1 160px' }} inputMode="tel" placeholder="Mobile number" value={dncPhone} onChange={(e) => setDncPhone(e.target.value)} />
          <input className="input" style={{ flex: '2 1 200px' }} placeholder="Reason (optional)" value={dncReason} onChange={(e) => setDncReason(e.target.value)} />
          <button className="btn btn-primary" onClick={addDnc}><Plus size={16} /> Add</button>
        </div>
        {data.dnc.length > 0 && (
          <div className="dnc-list">
            {data.dnc.map((d) => (
              <div key={d.id} className="dnc-item">
                <b>{d.phone}</b><span className="muted">{[d.name, d.reason, `by ${d.employee}`].filter(Boolean).join(' · ')}</span>
                <button className="icon-btn" aria-label="Remove from do-not-call" onClick={async () => { await deleteRecord('dnc', d.id); load(); }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
