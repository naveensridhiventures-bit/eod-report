import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Save, Loader2, Check, Copy, Send, CheckCircle2, Clock, Upload } from 'lucide-react';
import { ROLES, MOODS, RECORD_TYPES, SNAPSHOT } from '../config/team';
import { ROLE_ICONS, Loading, Segmented } from '../components/ui';
import { BulkImport, RecordTable } from '../components/Records';
import { fetchReports, saveReport, fetchRecords, deleteRecord } from '../lib/api';
import { eodText } from '../lib/reports';
import { statsFor, recordsOnDate, fmtQty } from '../lib/stats';
import { toISO, todayISO, fromISO, addDays } from '../lib/date';
import { inr } from '../lib/format';

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

function RoleRecords({ roleKey, dayRecs, onImport, onDelete }) {
  const types = ROLES[roleKey].imports;
  const [tab, setTab] = useState(types[0]);
  const rows = dayRecs[tab] || [];
  return (
    <>
      <div className="import-row">
        {types.map((t) => (
          <button key={t} className="btn btn-gold btn-sm" onClick={() => onImport(t)}><Upload size={16} /> {RECORD_TYPES[t].verb}</button>
        ))}
      </div>
      {types.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <Segmented value={tab} onChange={setTab} label="Saved today"
            options={types.map((t) => ({ value: t, label: `${RECORD_TYPES[t].short} (${(dayRecs[t] || []).length})` }))} />
        </div>
      )}
      <div className="saved-box">
        {rows.length
          ? <RecordTable type={tab} rows={rows} onDelete={(r) => onDelete(tab, r)} />
          : <p className="muted" style={{ padding: 16, fontSize: 14 }}>No {RECORD_TYPES[tab].label.toLowerCase()} saved for this day yet. Use “{RECORD_TYPES[tab].verb}” to paste your list.</p>}
      </div>
    </>
  );
}

export default function DailyEntry({ user, notify }) {
  const [date, setDate] = useState(todayISO());
  const [history, setHistory] = useState(null);
  const [records, setRecords] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [importing, setImporting] = useState(null);

  const hasImports = user.roles.some((r) => ROLES[r]?.imports.length);

  useEffect(() => {
    fetchReports({ employeeId: user.id, from: toISO(addDays(new Date(), -120)) })
      .then(setHistory)
      .catch((e) => { setHistory([]); notify(`Couldn’t load your past reports: ${e.message}`, 'error'); });
  }, [user.id, notify]);

  const loadRecords = useCallback(() => {
    if (!hasImports) { setRecords({}); return; }
    fetchRecords({ employeeId: user.id, from: date, to: date })
      .then(setRecords)
      .catch((e) => { setRecords({}); notify(`Couldn’t load today’s lists: ${e.message}`, 'error'); });
  }, [user.id, date, hasImports, notify]);

  useEffect(() => { setRecords(null); loadRecords(); }, [loadRecords]);

  const existing = useMemo(() => history?.find((r) => r.date === date), [history, date]);
  useEffect(() => {
    if (!history) return;
    setForm(existing
      ? { notes: { ...existing.notes }, positives: existing.positives || '', challenges: existing.challenges || '', tomorrow: existing.tomorrow || '', mood: Number(existing.mood) || 0 }
      : blankForm());
  }, [existing, history]);

  const streak = useMemo(() => calcStreak((history || []).map((r) => r.date)), [history]);
  const dayRecs = useMemo(() => (records ? recordsOnDate(records, date) : {}), [records, date]);
  const stats = useMemo(() => statsFor(dayRecs, { from: date, to: date }), [dayRecs, date]);

  const setNote = (k, v) => setForm((f) => ({ ...f, notes: { ...f.notes, [k]: v } }));

  const removeRecord = async (type, r) => {
    if (!window.confirm(`Delete ${r.name || 'this entry'}?`)) return;
    try { await deleteRecord(type, r.id); notify('Deleted'); loadRecords(); }
    catch (e) { notify(`Couldn’t delete: ${e.message}`, 'error'); }
  };

  const submit = async () => {
    for (const rk of user.roles) {
      const f = ROLES[rk]?.text.find((x) => x.required && user.roles[0] === rk && !form.notes[x.key]?.trim());
      if (f) { notify(`Fill in “${f.label}” before submitting.`, 'error'); document.getElementById(f.key)?.focus(); return; }
    }
    const anyRecords = Object.values(dayRecs).some((l) => l.length);
    const anyText = form.positives.trim() || Object.values(form.notes).some((v) => String(v).trim());
    if (!anyRecords && !anyText) { notify('Import your calls or write an update before submitting.', 'error'); return; }

    setSaving(true);
    try {
      const metrics = {};
      SNAPSHOT.filter((s) => user.roles.includes(s.role)).forEach((s) => { metrics[s.key] = stats[s.key] || 0; });
      const saved = await saveReport({ date, employeeId: user.id, name: user.name, roles: user.roles, ...form, metrics });
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
          <p className="sub">{hasImports ? 'Paste your call lists, add your update, then submit.' : 'Write what you worked on today, then submit.'}</p>
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
                <RoleRecords roleKey={roleKey} dayRecs={dayRecs} onImport={setImporting} onDelete={removeRecord} />
              )}
              {role.text.map((f) => (
                <div key={f.key} style={{ marginTop: role.imports.length ? 16 : 0, marginBottom: 12 }}>
                  <label className="label" htmlFor={f.key}>{f.label}</label>
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
          <h3>Your day in words</h3>
        </div>
        <div className="section-body stack">
          <div>
            <label className="label" htmlFor="positives">Wins today</label>
            <textarea id="positives" className="textarea" placeholder="What went well? A big order, a candidate confirmed, a feature shipped…" value={form.positives} onChange={(e) => setForm({ ...form, positives: e.target.value })} />
          </div>
          <div className="grid-2">
            <div>
              <label className="label" htmlFor="challenges">Challenges</label>
              <textarea id="challenges" className="textarea" placeholder="What slowed you down?" value={form.challenges} onChange={(e) => setForm({ ...form, challenges: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="tomorrow">Plan for tomorrow</label>
              <textarea id="tomorrow" className="textarea" placeholder="Top priorities for tomorrow" value={form.tomorrow} onChange={(e) => setForm({ ...form, tomorrow: e.target.value })} />
            </div>
          </div>
          <div>
            <span className="label">How was your day?</span>
            <div className="moods" role="radiogroup" aria-label="Day rating">
              {MOODS.map((m) => (
                <button key={m.value} type="button" role="radio" aria-checked={form.mood === m.value} className={`mood ${form.mood === m.value ? 'on' : ''}`} onClick={() => setForm({ ...form, mood: m.value })}>{m.label}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="savebar">
        <button className="btn btn-primary" onClick={submit} disabled={saving} style={{ minWidth: 220 }}>
          {saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
          {existing ? 'Update report' : 'Submit report'}
        </button>
      </div>

      {importing && <BulkImport type={importing} date={date} user={user} notify={notify} onClose={() => setImporting(null)} onSaved={loadRecords} />}
      {done && <SubmittedSheet report={done} dayRecs={dayRecs} onClose={() => setDone(null)} notify={notify} />}
    </div>
  );
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
