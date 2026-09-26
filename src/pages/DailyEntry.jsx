import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Save, Loader2, Check, Copy, Send, CheckCircle2, Clock, ClipboardList, ChevronDown, Trash2 } from 'lucide-react';
import { ROLES, MOODS, RECORD_TYPES, SNAPSHOT } from '../config/team';
import { ROLE_ICONS, Loading, Segmented } from '../components/ui';
import { BulkImport, RecordTable } from '../components/Records';
import QuickLog from '../components/QuickLog';
import FollowUps from '../components/FollowUps';
import PolishButton from '../components/PolishButton';
import { openFollowUps, bucketOf } from '../lib/followup';
import VoiceButton from '../components/VoiceButton';
import { fetchReports, saveReport, fetchRecords, deleteRecord, fetchSettings, targetsFor, TYPE_KEYS } from '../lib/api';
import CallQueue from '../components/CallQueue';
import { useTeamIndex } from '../lib/teamIndex';
import { RECORDS_SAVED, LEAD_CHANGED, onEvent } from '../lib/events';
import { TARGET_METRICS } from '../config/team';
import { fmtDuration } from '../lib/callLog';
import { eodText } from '../lib/reports';
import { statsFor, recordsOnDate, fmtQty } from '../lib/stats';
import { toISO, todayISO, fromISO, addDays } from '../lib/date';
import { inr } from '../lib/format';

// ── Draft autosave: nothing typed is lost if the app closes or the network drops ──
const draftKey = (uid, date) => `pulse_draft_${uid}_${date}`;
const readDraft = (uid, date) => { try { return JSON.parse(localStorage.getItem(draftKey(uid, date))); } catch { return null; } };
const writeDraft = (uid, date, form) => { try { localStorage.setItem(draftKey(uid, date), JSON.stringify({ form, savedAt: new Date().toISOString() })); } catch { /* ignore */ } };
const clearDraft = (uid, date) => { try { localStorage.removeItem(draftKey(uid, date)); } catch { /* ignore */ } };
const hasText = (f) => !!(f.positives.trim() || f.challenges.trim() || f.tomorrow.trim() || f.mood || Object.values(f.notes).some((v) => String(v).trim()));

const blankForm = () => ({ notes: {}, positives: '', challenges: '', tomorrow: '', mood: 0 });

function calcStreak(dates) {
  const set = new Set(dates);
  let d = new Date();
  if (!set.has(toISO(d))) d = addDays(d, -1);
  let streak = 0;
  for (let i = 0; i < 120; i++) {
    if (d.getDay() === 0) { d = addDays(d, -1); continue; }
    if (!set.has(toISO(d))) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

const TILES = {
  telecaller: [
    { key: 'calls_made', label: 'Calls made' },
    { key: 'interested_calls', label: 'Interested', tone: 'good' },
    { key: 'callbacks', label: 'Call backs' },
    { key: 'orders', label: 'Orders', tone: 'good' },
    { key: 'sales_value', label: 'Sales', money: true, tone: 'good' },
    { key: 'sales_kg', label: 'Sold (kg)' },
    { key: 'sales_l', label: 'Sold (L)' },
    { key: 'orders_cancelled', label: 'Cancelled', tone: 'bad' },
    { key: 'customers_added', label: 'Customers added' }
  ],
  hiring: [
    { key: 'hr_calls', label: 'Calls made' },
    { key: 'scheduled', label: 'Scheduled', tone: 'good' },
    { key: 'joined', label: 'Joined', tone: 'good' },
    { key: 'drivers_arranged', label: 'Drivers arranged', tone: 'good' },
    { key: 'relieved', label: 'Relieved', tone: 'bad' }
  ]
};

export function Tiles({ items, stats }) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <div key={t.key} className={`tile ${t.tone || ''}`}>
          <div className="tile-v">{t.money ? inr(stats[t.key]) : fmtQty(stats[t.key])}</div>
          <div className="tile-l">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

function RoleRecords({ roleKey, dayRecs, date, user, onImport, onDelete, onAdded, onRemoved, notify, teamIdx }) {
  const types = ROLES[roleKey].imports;
  const [tab, setTab] = useState(types[0]);
  const [showList, setShowList] = useState(false);
  const rows = dayRecs[tab] || [];
  return (
    <>
      {types.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Segmented value={tab} onChange={setTab} label="What are you logging?"
            options={types.map((t) => ({ value: t, label: `${RECORD_TYPES[t].short}${(dayRecs[t] || []).length ? ` · ${dayRecs[t].length}` : ''}` }))} />
        </div>
      )}
      <QuickLog type={tab} date={date} user={user} dayRows={rows} onAdded={onAdded} onRemoved={onRemoved} notify={notify} teamIdx={teamIdx} />

      <div className="ql-foot">
        <button className="btn btn-ghost btn-sm" onClick={() => onImport(tab)}><ClipboardList size={16} /> Paste a whole list</button>
        {rows.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowList((x) => !x)} aria-expanded={showList}>
            {showList ? 'Hide' : 'Show'} today’s {RECORD_TYPES[tab].short.toLowerCase()} ({rows.length})
            <ChevronDown size={15} style={{ transform: showList ? 'rotate(180deg)' : 'none' }} />
          </button>
        )}
      </div>

      {rows.length > 0 && !showList && (
        <div className="recent-strip" aria-label="Last few entries">
          {rows.slice(0, 3).map((r) => (
            <div key={r.id} className={`recent-item ${r.pending ? 'pending' : ''}`}>
              <span className="recent-name">{r.name || r.phone}</span>
              <span className="muted">{r.status ? RECORD_TYPES[tab].statuses?.find((x) => x.value === r.status)?.label : r.amount ? inr(r.amount) : r.area || ''}</span>
              {r.pending ? <Loader2 size={14} className="spin muted" /> : <button className="icon-btn" onClick={() => onDelete(tab, r)} aria-label={`Undo ${r.name || r.phone}`}><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      )}
      {showList && (
        <div className="saved-box">
          <RecordTable type={tab} rows={rows} onDelete={(r) => onDelete(tab, r)} />
        </div>
      )}
    </>
  );
}

export default function DailyEntry({ user, notify, onDue }) {
  const [date, setDate] = useState(todayISO());
  const [history, setHistory] = useState(null);
  const [records, setRecords] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [importing, setImporting] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [draftAt, setDraftAt] = useState(null);
  const hydrated = useRef(false);

  const hasImports = user.roles.some((r) => ROLES[r]?.imports.length);

  useEffect(() => {
    fetchReports({ employeeId: user.id, from: toISO(addDays(new Date(), -120)) })
      .then(setHistory)
      .catch((e) => { setHistory([]); notify(`Couldn’t load your past reports: ${e.message}`, 'error'); });
  }, [user.id, notify]);

  const loadRecords = useCallback(() => {
    if (!hasImports) { setRecords({}); return; }
    // The last 45 days are loaded too, so open follow-ups show up (reports only use this day's entries)
    fetchRecords({ types: [...TYPE_KEYS, 'leads'], employeeId: user.id, from: toISO(addDays(fromISO(date), -45)), to: date })
      .then(setRecords)
      .catch((e) => { setRecords({}); notify(`Couldn’t load today’s lists: ${e.message}`, 'error'); });
  }, [user.id, date, hasImports, notify]);

  useEffect(() => { setRecords(null); loadRecords(); }, [loadRecords]);

  const existing = useMemo(() => history?.find((r) => r.date === date), [history, date]);
  useEffect(() => {
    if (!history) return;
    hydrated.current = false;
    const saved = existing
      ? { notes: { ...existing.notes }, positives: existing.positives || '', challenges: existing.challenges || '', tomorrow: existing.tomorrow || '', mood: Number(existing.mood) || 0 }
      : blankForm();
    const draft = readDraft(user.id, date);
    const useDraft = draft && (!existing || draft.savedAt > existing.submittedAt);
    const next = useDraft ? { ...blankForm(), ...draft.form } : saved;
    setForm(next);
    setDraftAt(useDraft ? draft.savedAt : null);
    setNotesOpen(!!(next.positives || next.challenges || next.tomorrow));
  }, [existing, history, user.id, date]);

  // Save a draft a moment after each change
  useEffect(() => {
    if (!history) return;
    if (!hydrated.current) { hydrated.current = true; return; }
    const t = setTimeout(() => {
      if (hasText(form)) { writeDraft(user.id, date, form); setDraftAt(new Date().toISOString()); }
    }, 600);
    return () => clearTimeout(t);
  }, [form, history, user.id, date]);

  // What you planned yesterday, shown as a reminder while writing today's wins
  const lastPlan = useMemo(() => (history || []).find((r) => r.date < date && r.tomorrow?.trim())?.tomorrow, [history, date]);
  const followUps = useMemo(() => (records && date === todayISO() ? openFollowUps(records) : []), [records, date]);
  useEffect(() => {
    if (records && date === todayISO()) onDue?.(followUps.filter((r) => bucketOf(r.fu) !== 'upcoming').length);
  }, [followUps, records, date, onDue]);

  const addLocal = useCallback((type, recs) => setRecords((all) => {
    let list = all?.[type] || [];
    if (type === 'customers') { const phones = new Set(recs.map((r) => r.phone).filter(Boolean)); list = list.filter((r) => !phones.has(r.phone)); }
    return { ...all, [type]: [...recs, ...list] };
  }), []);
  const updateLocal = useCallback((type, id, fields) => setRecords((all) => ({ ...all, [type]: (all?.[type] || []).map((r) => (r.id === id ? { ...r, ...fields } : r)) })), []);
  const removeLocal = useCallback((type, id) => setRecords((all) => ({ ...all, [type]: (all?.[type] || []).filter((r) => r.id !== id) })), []);

  const streak = useMemo(() => calcStreak((history || []).map((r) => r.date)), [history]);
  const dayRecs = useMemo(() => (records ? recordsOnDate(records, date) : {}), [records, date]);
  const callRoles = user.roles.some((r) => r === 'telecaller' || r === 'hiring');
  const teamIdx = useTeamIndex(callRoles);
  const [settings, setSettings] = useState(null);
  useEffect(() => { if (callRoles) fetchSettings().then(setSettings).catch(() => setSettings({})); }, [callRoles]);
  const targets = useMemo(() => targetsFor(settings, user.id), [settings, user.id]);

  // Calls logged from the call-result sheet, and leads finished there, appear here straight away
  useEffect(() => onEvent(RECORDS_SAVED, ({ type, records: recs }) => { if (type !== 'dnc') addLocal(type, recs); }), [addLocal]);
  useEffect(() => onEvent(LEAD_CHANGED, ({ id, fields }) => updateLocal('leads', id, fields)), [updateLocal]);
  const stats = useMemo(() => statsFor(dayRecs, { from: date, to: date }), [dayRecs, date]);

  const setNote = (k, v) => setForm((f) => ({ ...f, notes: { ...f.notes, [k]: v } }));

  const removeRecord = async (type, r) => {
    if (!window.confirm(`Delete ${r.name || 'this entry'}?`)) return;
    try { await deleteRecord(type, r.id); removeLocal(type, r.id); notify('Deleted'); }
    catch (e) { notify(`Couldn’t delete: ${e.message}`, 'error'); }
  };

  const submit = async () => {
    for (const rk of user.roles) {
      const f = ROLES[rk]?.text.find((x) => x.required && user.roles[0] === rk && !form.notes[x.key]?.trim());
      if (f) { notify(`Fill in “${f.label}” before submitting.`, 'error'); document.getElementById(f.key)?.focus(); return; }
    }
    const anyRecords = Object.values(dayRecs).some((l) => l.length);
    const anyText = form.positives.trim() || Object.values(form.notes).some((v) => String(v).trim());
    if (!anyRecords && !anyText) { notify('Log at least one entry or write a line about your day before submitting.', 'error'); return; }

    setSaving(true);
    try {
      const metrics = {};
      SNAPSHOT.filter((s) => user.roles.includes(s.role)).forEach((s) => { metrics[s.key] = stats[s.key] || 0; });
      const saved = await saveReport({ date, employeeId: user.id, name: user.name, roles: user.roles, ...form, metrics });
      clearDraft(user.id, date);
      setDraftAt(null);
      setHistory((h) => [saved, ...(h || []).filter((r) => r.date !== date)]);
      setDone(saved);
    } catch (e) {
      notify(`Report not saved: ${e.message}. Check your connection and try again.`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const d = fromISO(date);
  const isToday = date === todayISO();
  if (!history || !records) return <div className="page"><Loading text="Getting your day ready…" /></div>;

  return (
    <div className="page">
      <section className="dayhero">
        <div className="tearoff" aria-hidden="true">
          <div className="tearoff-top">{d.toLocaleDateString('en-IN', { month: 'short' })} {d.getFullYear()}</div>
          <div className="tearoff-num">{d.getDate()}</div>
          <div className="tearoff-day">{d.toLocaleDateString('en-IN', { weekday: 'long' })}</div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>{isToday ? `How did today go, ${user.name.split(' ')[0]}?` : `Report for ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`}</h1>
          <p className="sub">{hasImports ? 'Log each call as you make it — your report fills itself in. Tap Submit at the end of the day.' : 'Write what you worked on today, then submit.'}</p>
          {existing
            ? <span className="status-pill done"><CheckCircle2 size={15} /> Submitted at {new Date(existing.submittedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} — you can still update</span>
            : <span className="status-pill"><Clock size={15} /> Not submitted yet</span>}
          <div className="date-switch">
            <label htmlFor="report-date" style={{ fontSize: 13, color: '#b9ccc7' }}>Report date</label>
            <input id="report-date" type="date" value={date} max={todayISO()} min={toISO(addDays(new Date(), -14))} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        </div>
        <div className="streak">
          <div className="streak-num">{streak}</div>
          <div className="streak-label">day streak</div>
        </div>
      </section>

      {callRoles && date === todayISO() && <Targets user={user} stats={stats} targets={targets} />}

      <FollowUps items={followUps} date={date} user={user} onAdded={addLocal} onUpdated={updateLocal} notify={notify} />

      {date === todayISO() && records?.leads?.length > 0 && (
        <CallQueue user={user} leads={records.leads} teamIdx={teamIdx} notify={notify} onLeadChanged={(id, fields) => updateLocal('leads', id, fields)} />
      )}

      {user.roles.map((roleKey) => {
        const role = ROLES[roleKey];
        if (!role) return null;
        const Icon = ROLE_ICONS[roleKey];
        return (
          <section className="section" key={roleKey}>
            <div className="section-head">
              <span className="section-icon" style={{ background: role.color }}><Icon size={18} /></span>
              <h3>{role.label}</h3>
              {roleKey === 'telecaller' && records.customers && (
                <span className="chip" style={{ marginLeft: 'auto' }}>{records.customers.length} customers in your list</span>
              )}
            </div>
            <div className="section-body">
              {TILES[roleKey] && <Tiles items={TILES[roleKey]} stats={stats} />}
              {role.imports.length > 0 && (
                <RoleRecords roleKey={roleKey} dayRecs={dayRecs} date={date} user={user} notify={notify} teamIdx={teamIdx}
                  onImport={setImporting} onDelete={removeRecord} onAdded={addLocal} onRemoved={removeLocal} />
              )}
              {role.text.map((f) => (
                <div key={f.key} style={{ marginTop: role.imports.length ? 16 : 0, marginBottom: 12 }}>
                  <div className="label-row">
                    <label className="label" htmlFor={f.key}>{f.label}</label>
                    <span className="label-tools">
                      <VoiceButton onText={(t) => setNote(f.key, `${form.notes[f.key] ? `${form.notes[f.key]} ` : ''}${t}`)} />
                      <PolishButton value={form.notes[f.key] || ''} onChange={(t) => setNote(f.key, t)} notify={notify} />
                    </span>
                  </div>
                  <textarea id={f.key} className="textarea" rows={f.rows || 3} placeholder={f.placeholder} value={form.notes[f.key] || ''} onChange={(e) => setNote(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section className="section">
        <div className="section-head">
          <span className="section-icon" style={{ background: 'var(--marigold)', color: 'var(--ever)' }}><Sparkles size={18} /></span>
          <h3>How was your day?</h3>
          <span className="chip" style={{ marginLeft: 'auto' }}>Optional</span>
        </div>
        <div className="section-body stack">
          <div className="moods" role="radiogroup" aria-label="Day rating">
            {MOODS.map((m) => (
              <button key={m.value} type="button" role="radio" aria-checked={form.mood === m.value} className={`mood ${form.mood === m.value ? 'on' : ''}`} onClick={() => setForm({ ...form, mood: form.mood === m.value ? 0 : m.value })}>{m.label}</button>
            ))}
          </div>

          {!notesOpen ? (
            <button className="btn btn-ghost" onClick={() => setNotesOpen(true)} style={{ alignSelf: 'flex-start' }}>+ Add wins, challenges or tomorrow’s plan</button>
          ) : (
            <>
              {lastPlan && <div className="last-plan"><b>Yesterday you planned:</b> {lastPlan}</div>}
              {[
                { key: 'positives', label: 'Wins today', ph: 'A big order, a candidate confirmed, a feature shipped…' },
                { key: 'challenges', label: 'Challenges', ph: 'What slowed you down?' },
                { key: 'tomorrow', label: 'Plan for tomorrow', ph: 'Top priorities for tomorrow' }
              ].map((f) => (
                <div key={f.key}>
                  <div className="label-row">
                    <label className="label" htmlFor={f.key}>{f.label}</label>
                    <span className="label-tools">
                      <VoiceButton onText={(t) => setForm((x) => ({ ...x, [f.key]: `${x[f.key] ? `${x[f.key]} ` : ''}${t}` }))} />
                      <PolishButton value={form[f.key]} onChange={(t) => setForm((x) => ({ ...x, [f.key]: t }))} notify={notify} />
                    </span>
                  </div>
                  <textarea id={f.key} className="textarea" rows={2} placeholder={f.ph} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <div className="savebar">
        <div className="savebar-sum">
          <SubmitSummary user={user} stats={stats} />
          {draftAt && <span className="draft-note"><Check size={13} /> Draft saved</span>}
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={saving} style={{ minWidth: 200 }}>
          {saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
          {existing ? 'Update report' : 'Submit report'}
        </button>
      </div>

      {importing && <BulkImport type={importing} date={date} user={user} notify={notify} onClose={() => setImporting(null)} onSaved={loadRecords} />}
      {done && <SubmittedSheet report={done} dayRecs={dayRecs} onClose={() => setDone(null)} notify={notify} />}
    </div>
  );
}

/** Today's targets as progress bars, plus talk time */
function Targets({ user, stats, targets }) {
  const metrics = TARGET_METRICS.filter((m) => user.roles.includes(m.role) && Number(targets[m.key]) > 0);
  if (!metrics.length) return null;
  const hit = metrics.filter((m) => (stats[m.key] || 0) >= Number(targets[m.key])).length;
  return (
    <div className="targets">
      <div className="targets-head">
        <b>Today’s targets</b>
        <span className="muted">{hit === metrics.length ? 'All targets hit — superb!' : `${hit} of ${metrics.length} hit`}{stats.talk_mins ? ` · talk time ${fmtDuration(stats.talk_mins * 60)}` : ''}</span>
      </div>
      <div className="targets-grid">
        {metrics.map((m) => {
          const v = stats[m.key] || 0, t = Number(targets[m.key]);
          const pct = Math.min(100, Math.round((v / t) * 100));
          return (
            <div key={m.key} className={`target ${v >= t ? 'done' : ''}`}>
              <div className="target-top"><span>{m.label}</span><b>{v}<small>/{t}</small></b></div>
              <div className="target-bar"><span style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// One-line recap of what the report will contain, shown right next to the Submit button
function SubmitSummary({ user, stats }) {
  const bits = [];
  if (user.roles.includes('telecaller')) {
    bits.push(n(stats.calls_made, 'call'));
    if (stats.interested_calls) bits.push(`${stats.interested_calls} interested`);
    if (stats.orders) bits.push(`${n(stats.orders, 'order')} · ${inr(stats.sales_value)}`);
  }
  if (user.roles.includes('hiring')) {
    bits.push(n(stats.hr_calls, 'HR call'));
    if (stats.scheduled) bits.push(`${stats.scheduled} scheduled`);
    if (stats.joined) bits.push(`${stats.joined} joined`);
  }
  if (!bits.length) return <span className="muted">Ready when you are</span>;
  return <span className="savebar-stats">{bits.join(' · ')}</span>;
}

function SubmittedSheet({ report, dayRecs, onClose, notify }) {
  const text = eodText(report, dayRecs);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify('Report copied'); }
    catch { notify('Copy isn’t available here. Select the text and copy it manually.', 'error'); }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-check"><Check size={28} /></div>
        <h2 id="sheet-title">Report submitted</h2>
        <p className="muted" style={{ marginTop: 4 }}>Saved to the team sheet. Send a copy to management on WhatsApp if needed.</p>
        <pre>{text}</pre>
        <div className="sheet-actions">
          <a className="btn btn-wa" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><Send size={18} /> Share on WhatsApp</a>
          <button className="btn btn-ghost" onClick={copy}><Copy size={18} /> Copy report</button>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
