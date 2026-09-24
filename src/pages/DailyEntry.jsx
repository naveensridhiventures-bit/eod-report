import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Sparkles, Save, Loader2, Check, Copy, Send, CheckCircle2, Clock } from 'lucide-react';
import { ROLES, MOODS } from '../config/team';
import { ROLE_ICONS, Loading } from '../components/ui';
import { fetchReports, saveReport } from '../lib/api';
import { eodText } from '../lib/reports';
import { toISO, todayISO, fromISO, addDays } from '../lib/date';

const blankForm = () => ({ metrics: {}, notes: {}, positives: '', challenges: '', tomorrow: '', mood: 0 });

function Stepper({ metric, value, onChange }) {
  const v = value === undefined || value === '' ? '' : value;
  if (metric.type === 'money') {
    return (
      <div className="money-input">
        <span>₹</span>
        <input inputMode="numeric" placeholder="0" value={v} aria-label={metric.label}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))} />
      </div>
    );
  }
  const n = Number(v) || 0;
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(0, n - 1))} aria-label={`Decrease ${metric.label}`}><Minus size={16} /></button>
      <input inputMode="numeric" placeholder="0" value={v} aria-label={metric.label}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))} />
      <button type="button" onClick={() => onChange(n + 1)} aria-label={`Increase ${metric.label}`}><Plus size={16} /></button>
    </div>
  );
}

function calcStreak(dates) {
  const set = new Set(dates);
  let d = new Date();
  if (!set.has(toISO(d))) d = addDays(d, -1);
  let streak = 0;
  for (let i = 0; i < 120; i++) {
    if (d.getDay() === 0) { d = addDays(d, -1); continue; } // Sundays don't break a streak
    if (!set.has(toISO(d))) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export default function DailyEntry({ user, notify }) {
  const [date, setDate] = useState(todayISO());
  const [history, setHistory] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetchReports({ employeeId: user.id, from: toISO(addDays(new Date(), -120)) })
      .then(setHistory)
      .catch((e) => { setHistory([]); notify(`Couldn’t load your past reports: ${e.message}`, 'error'); });
  }, [user.id, notify]);

  const existing = useMemo(() => history?.find((r) => r.date === date), [history, date]);

  useEffect(() => {
    if (!history) return;
    setForm(existing
      ? { metrics: { ...existing.metrics }, notes: { ...existing.notes }, positives: existing.positives || '', challenges: existing.challenges || '', tomorrow: existing.tomorrow || '', mood: Number(existing.mood) || 0 }
      : blankForm());
  }, [existing, history]);

  const streak = useMemo(() => calcStreak((history || []).map((r) => r.date)), [history]);

  const setMetric = (k, v) => setForm((f) => ({ ...f, metrics: { ...f.metrics, [k]: v } }));
  const setNote = (k, v) => setForm((f) => ({ ...f, notes: { ...f.notes, [k]: v } }));

  const submit = async () => {
    if (!form.positives.trim()) {
      notify('Add at least one win for today before saving.', 'error');
      document.getElementById('positives')?.focus();
      return;
    }
    setSaving(true);
    try {
      const metrics = {};
      user.roles.forEach((r) => ROLES[r].metrics.forEach((m) => { metrics[m.key] = Number(form.metrics[m.key]) || 0; }));
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

  if (!history) return <div className="page"><Loading text="Getting your day ready…" /></div>;

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
          <p className="sub">Fill in your numbers, note your wins, and send it to management.</p>
          {existing
            ? <span className="status-pill done"><CheckCircle2 size={15} /> Submitted at {new Date(existing.submittedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} — you can still edit</span>
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
        const Icon = ROLE_ICONS[roleKey];
        return (
          <section className="section" key={roleKey}>
            <div className="section-head">
              <span className="section-icon" style={{ background: role.color }}><Icon size={18} /></span>
              <h3>{role.label}</h3>
            </div>
            <div className="section-body">
              <div className="metric-grid">
                {role.metrics.map((m) => (
                  <div key={m.key} className={`metric ${m.highlight || ''}`}>
                    <span className="metric-label">{m.label}</span>
                    <Stepper metric={m} value={form.metrics[m.key]} onChange={(v) => setMetric(m.key, v)} />
                  </div>
                ))}
              </div>
              {role.notes?.length > 0 && (
                <div className="notes-grid">
                  {role.notes.map((n) => (
                    <div key={n.key}>
                      <label className="label" htmlFor={n.key}>{n.label}</label>
                      <input id={n.key} className="input" placeholder={n.placeholder} value={form.notes[n.key] || ''} onChange={(e) => setNote(n.key, e.target.value)} />
                    </div>
                  ))}
                </div>
              )}
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
            <textarea id="positives" className="textarea" placeholder="What went well? A deal closed, a candidate confirmed, a feature shipped…" value={form.positives} onChange={(e) => setForm({ ...form, positives: e.target.value })} />
          </div>
          <div className="grid-2">
            <div>
              <label className="label" htmlFor="challenges">Challenges</label>
              <textarea id="challenges" className="textarea" placeholder="What slowed you down? Anything management should know?" value={form.challenges} onChange={(e) => setForm({ ...form, challenges: e.target.value })} />
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
                <button key={m.value} type="button" role="radio" aria-checked={form.mood === m.value} className={`mood ${form.mood === m.value ? 'on' : ''}`} onClick={() => setForm({ ...form, mood: m.value })}>
                  {m.label}
                </button>
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

      {done && <SubmittedSheet report={done} onClose={() => setDone(null)} notify={notify} />}
    </div>
  );
}

function SubmittedSheet({ report, onClose, notify }) {
  const text = eodText(report);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify('Report copied'); }
    catch { notify('Copy isn’t available here. Select the text and copy it manually.', 'error'); }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-check"><Check size={28} /></div>
        <h2 id="sheet-title">Report submitted</h2>
        <p className="muted" style={{ marginTop: 4 }}>Saved to the team sheet. Send a copy to management if they want it on WhatsApp.</p>
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
