import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, Loader2, Clock3, MessageCircle, Check, X } from 'lucide-react';
import { HIRING_STAGES, RECORD_TYPES } from '../config/team';
import { fetchRecords, saveRecords, updateRecord } from '../lib/api';
import { nextSteps, followUpFor, whenLabel, bucketOf, followUpOf, waLink, hiringFunnel } from '../lib/followup';
import { RECORDS_SAVED, onEvent } from '../lib/events';
import { toISO, addDays, todayISO, fromISO, monthRange } from '../lib/date';
import { Loading, Segmented } from '../components/ui';
import CallButton from '../components/CallButton';
import Persona from '../components/Persona';

const STATUS = RECORD_TYPES.hiring.statuses;
const label = (v) => STATUS.find((s) => s.value === v)?.label || v;
const tone = (v) => STATUS.find((s) => s.value === v)?.tone || 'muted';
const stageOf = (status) => HIRING_STAGES.find((st) => st.statuses.includes(status))?.key || 'contacted';
const newer = (a, b) => a.date > b.date || (a.date === b.date && String(a.createdAt) > String(b.createdAt));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function candidatesFrom(list) {
  const map = new Map();
  list.forEach((r) => {
    const key = r.phone || `n:${String(r.name || '').toLowerCase()}`;
    if (!key || key === 'n:') return;
    const c = map.get(key) || { key, history: [] };
    c.history.push(r);
    if (!c.last || newer(r, c.last)) c.last = r;
    map.set(key, c);
  });
  return [...map.values()].map((c) => {
    // When did they enter the current stage?
    const st = stageOf(c.last.status);
    const since = c.history.filter((r) => stageOf(r.status) === st).reduce((m, r) => (r.date < m ? r.date : m), c.last.date);
    return { ...c, name: c.last.name, phone: c.last.phone, title: c.last.title, status: c.last.status, stage: st, since, fu: followUpOf(c.last) };
  });
}

function CandidateCard({ c, user, notify, onAdded }) {
  const [busy, setBusy] = useState(false);
  const days = Math.round((fromISO(todayISO()) - fromISO(c.since)) / 86400000);
  const move = async (status) => {
    setBusy(true);
    try {
      const saved = await saveRecords('hiring', [{ title: c.title, name: c.name, phone: c.phone, status, remarks: `Moved to ${label(status)}`, followUp: followUpFor(status, '', todayISO()) }],
        { date: todayISO(), employeeId: user.id, employee: user.name });
      onAdded(saved);
      notify(`${c.name || c.phone}: ${label(status)}`);
    } catch (e) { notify(`Not saved: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <div className={`hp-card ${busy ? 'busy' : ''}`}>
      <div className="hp-card-top">
        <Persona name={c.name} phone={c.phone} size={40} ring={c.stage === 'dropped' ? 'late' : 'hiring'} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hp-name">{c.name || c.phone}</div>
          <div className="hp-meta">{c.title && <span className="title-tag">{c.title}</span>}<span className={`chip tone-${tone(c.status)}`}>{label(c.status)}</span></div>
        </div>
        <span className="muted hp-days" title="Days in this stage">{days <= 0 ? 'today' : `${days}d`}</span>
      </div>
      {c.last.remarks && <div className="hp-remark">{c.last.remarks}</div>}
      {c.fu && <div className={`fu-when ${bucketOf(c.fu) === 'overdue' ? 'late' : ''}`} style={{ marginTop: 6 }}><Clock3 size={12} /> {whenLabel(c.fu)}</div>}
      {c.stage !== 'dropped' && (
        <div className="hp-actions">
          {c.phone && <CallButton className="btn btn-ghost btn-sm" call={{ type: 'hiring', name: c.name, phone: c.phone, title: c.title, options: nextSteps('hiring', c.status), prev: c.status }} />}
          {c.phone && <a className="icon-btn" href={waLink(c.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={16} /></a>}
          {nextSteps('hiring', c.status).slice(0, 2).map((s) => (
            <button key={s} className={`ql-btn sm tone-${tone(s)}`} disabled={busy} onClick={() => move(s)}>{label(s)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HiringPage({ user, employees, notify }) {
  const [who, setWho] = useState(user.isAdmin ? 'all' : user.id);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');
  const [stage, setStage] = useState('scheduled');
  const [role, setRole] = useState('all');

  const load = useCallback(() => {
    setData(null);
    Promise.all([
      fetchRecords({ types: ['hiring'], from: toISO(addDays(new Date(), -120)), employeeId: who === 'all' ? undefined : who }),
      fetchRecords({ types: ['openings', 'hiring'], from: toISO(addDays(new Date(), -120)) })
    ]).then(([mine, all]) => setData({ hiring: mine.hiring, openings: all.openings, allHiring: all.hiring }))
      .catch((e) => { notify(`Couldn’t load: ${e.message}`, 'error'); setData({ hiring: [], openings: [], allHiring: [] }); });
  }, [who, notify]);
  useEffect(() => { load(); }, [load]);

  const onAdded = useCallback((recs) => setData((d) => ({ ...d, hiring: [...recs, ...d.hiring], allHiring: [...recs, ...d.allHiring] })), []);
  useEffect(() => onEvent(RECORDS_SAVED, ({ type, records }) => { if (type === 'hiring') onAdded(records); }), [onAdded]);

  const range = period === 'month' ? monthRange() : { from: toISO(addDays(new Date(), -6)), to: todayISO() };
  const cands = useMemo(() => (data ? candidatesFrom(data.hiring) : []), [data]);
  const roles = useMemo(() => [...new Set(cands.map((c) => c.title).filter(Boolean))], [cands]);
  const shownCands = cands.filter((c) => role === 'all' || c.title === role);

  // Funnel for the period: how many candidates reached each step
  const funnel = useMemo(() => {
    if (!data) return null;
    const inP = data.hiring.filter((r) => r.date >= range.from && r.date <= range.to && (role === 'all' || r.title === role));
    const f = hiringFunnel(inP);
    f.relieved = new Set(inP.filter((r) => r.status === 'relieved').map((r) => r.phone || r.name)).size;
    return f;
  }, [data, range.from, range.to, role]);

  const byStage = useMemo(() => {
    const g = Object.fromEntries(HIRING_STAGES.map((s) => [s.key, []]));
    shownCands.forEach((c) => g[c.stage].push(c));
    Object.values(g).forEach((l) => l.sort((a, b) => (a.since < b.since ? -1 : 1)));
    return g;
  }, [shownCands]);

  // Openings
  const [newRole, setNewRole] = useState('');
  const [newNeed, setNewNeed] = useState('');
  const openings = (data?.openings || []).filter((o) => o.active !== 'no');
  const filledFor = (o) => new Set((data?.allHiring || []).filter((r) => r.title === o.title && r.date >= o.date && (r.status === 'joined' || r.status === 'driver_arranged')).map((r) => r.phone || r.name)).size;
  const addOpening = async () => {
    if (!newRole.trim() || !Number(newNeed)) { notify('Enter the role and how many people you need.', 'error'); return; }
    try {
      const saved = await saveRecords('openings', [{ title: newRole.trim(), needed: Number(newNeed), active: 'yes' }], { date: todayISO(), employeeId: user.id, employee: user.name });
      setData((d) => ({ ...d, openings: [...saved, ...d.openings] }));
      setNewRole(''); setNewNeed('');
    } catch (e) { notify(e.message, 'error'); }
  };
  const closeOpening = async (o) => {
    try {
      await updateRecord('openings', o.id, { active: 'no' });
      setData((d) => ({ ...d, openings: d.openings.map((x) => (x.id === o.id ? { ...x, active: 'no' } : x)) }));
    } catch (e) { notify(e.message, 'error'); }
  };

  if (!data) return <div className="page"><Loading text="Loading hiring pipeline…" /></div>;

  const steps = [
    { k: 'calls', l: 'HR calls', v: funnel.calls },
    { k: 'scheduled', l: 'Scheduled', v: funnel.scheduled, rate: pct(funnel.scheduled, funnel.calls) },
    { k: 'attended', l: 'Attended', v: funnel.attended, rate: pct(funnel.attended, funnel.scheduled) },
    { k: 'selected', l: 'Selected', v: funnel.selected, rate: pct(funnel.selected, funnel.attended) },
    { k: 'joined', l: 'Joined', v: funnel.joined, rate: pct(funnel.joined, funnel.selected) }
  ];
  const maxV = Math.max(1, ...steps.map((s) => s.v));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Hiring pipeline</h1>
          <p>Where every candidate stands, who didn’t turn up, and how many seats are still open.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user.isAdmin && (
            <select className="input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose candidates">
              <option value="all">Whole team</option>
              {employees.filter((e) => e.roles.includes('hiring') && !e.viewOnly).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <Segmented value={period} onChange={setPeriod} label="Period" options={[{ value: 'week', label: '7 days' }, { value: 'month', label: 'This month' }]} />
        </div>
      </div>

      {openings.length > 0 || user.isAdmin ? (
        <div className="panel hp-openings">
          <h3><Briefcase size={17} style={{ verticalAlign: -3 }} /> Open positions</h3>
          <div className="hp-open-grid">
            {openings.map((o) => {
              const filled = filledFor(o);
              const need = Number(o.needed) || 0;
              return (
                <div key={o.id} className={`hp-open ${filled >= need ? 'done' : ''}`}>
                  <div className="hp-open-top"><b>{o.title}</b><span>{filled}/{need}</span>
                    {user.isAdmin && <button className="icon-btn" title="Close this opening" onClick={() => closeOpening(o)}>{filled >= need ? <Check size={15} /> : <X size={15} />}</button>}
                  </div>
                  <div className="target-bar"><span style={{ width: `${need ? Math.min(100, (filled / need) * 100) : 0}%` }} /></div>
                  <span className="muted" style={{ fontSize: 12 }}>{filled > need ? `Filled · ${filled - need} extra` : filled === need ? 'Filled' : `${need - filled} more needed`}</span>
                </div>
              );
            })}
          </div>
          {user.isAdmin && (
            <div className="reminder-row" style={{ marginTop: 12 }}>
              <input className="input" style={{ flex: '2 1 160px' }} placeholder="Role, e.g. Driver" value={newRole} onChange={(e) => setNewRole(e.target.value)} list="hp-roles" />
              <datalist id="hp-roles">{RECORD_TYPES.hiring.titles.map((t) => <option key={t} value={t} />)}</datalist>
              <input className="input" style={{ flex: '1 1 80px' }} inputMode="numeric" placeholder="How many" value={newNeed} onChange={(e) => setNewNeed(e.target.value.replace(/\D/g, ''))} />
              <button className="btn btn-primary" onClick={addOpening}><Plus size={16} /> Add opening</button>
            </div>
          )}
        </div>
      ) : null}

      <div className="panel hp-funnel">
        <div className="hp-funnel-head">
          <h3>Funnel</h3>
          {funnel.showUp !== null && (
            <span className={`chip ${funnel.showUp < 60 ? 'tone-bad' : 'tone-good'}`}>Show-up rate {funnel.showUp}% · {funnel.noShow} no-show{funnel.noShow === 1 ? '' : 's'}</span>
          )}
        </div>
        <div className="funnel">
          {steps.map((s) => (
            <div key={s.k} className="funnel-row">
              <span className="funnel-label">{s.l}</span>
              <div className="funnel-bar"><span style={{ width: `${Math.max(4, (s.v / maxV) * 100)}%` }}><b>{s.v}</b></span></div>
              <span className="funnel-rate">{s.rate || ''}</span>
            </div>
          ))}
        </div>
        {funnel.relieved > 0 && <p className="hint">{funnel.relieved} relieved in this period.</p>}
      </div>

      {roles.length > 1 && (
        <div className="ct-filters">
          <button className={`chip chip-btn ${role === 'all' ? 'on' : ''}`} onClick={() => setRole('all')}>All roles</button>
          {roles.map((r) => <button key={r} className={`chip chip-btn ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>{r}</button>)}
        </div>
      )}

      <div className="hp-stage-tabs" role="tablist">
        {HIRING_STAGES.map((s) => (
          <button key={s.key} role="tab" aria-selected={stage === s.key} className={`fu-tab ${stage === s.key ? 'on' : ''}`} onClick={() => setStage(s.key)}>
            {s.label} <b>{byStage[s.key].length}</b>
          </button>
        ))}
      </div>
      <div className="hp-board">
        {HIRING_STAGES.map((s) => (
          <div key={s.key} className={`hp-col ${stage === s.key ? 'active' : ''}`}>
            <div className="hp-col-head">{s.label} <b>{byStage[s.key].length}</b></div>
            {byStage[s.key].slice(0, 40).map((c) => <CandidateCard key={c.key} c={c} user={user} notify={notify} onAdded={onAdded} />)}
            {byStage[s.key].length > 40 && <p className="hint">+{byStage[s.key].length - 40} more — see Contacts</p>}
            {!byStage[s.key].length && <p className="muted" style={{ fontSize: 13, padding: 8 }}>Nobody here.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
