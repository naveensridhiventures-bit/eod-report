import { useEffect, useMemo, useState } from 'react';
import { Phone, BellRing, Bell, BellOff, CalendarPlus, Mail, MessageCircle, Clock3, Check, Loader2, ChevronDown } from 'lucide-react';
import { RECORD_TYPES } from '../config/team';
import { saveRecords, updateRecord, emailMyFollowUps, IS_DEMO } from '../lib/api';
import { bucketOf, whenLabel, quickDates, calendarLink, downloadIcs, waLink, followUpFor, fuDate, nextSteps, followUpPrompt } from '../lib/followup';
import CallButton from './CallButton';
import DateTimeSheet from './DateTimeSheet';
import Persona from './Persona';
import { enableNotifications, notifyOn, notifySupported, scheduleReminders } from '../lib/reminders';
import { todayISO, toISO, addDays } from '../lib/date';


export function FollowUpItem({ r, date, user, onAdded, onUpdated, notify }) {
  const [busy, setBusy] = useState(false);
  const [snooze, setSnooze] = useState(false);
  const [picking, setPicking] = useState(false);
  const late = bucketOf(r.fu) === 'overdue';
  const statuses = RECORD_TYPES[r.type_].statuses;

  const logResult = async (status) => {
    const label = statuses.find((s) => s.value === status)?.label || status;
    setBusy(true);
    try {
      const saved = await saveRecords(r.type_, [{
        title: r.title, name: r.name, phone: r.phone, status, remarks: `Follow-up: ${label}`,
        followUp: followUpFor(status, '', date)
      }], { date, employeeId: user.id, employee: user.name });
      onAdded(r.type_, saved);
      notify(`${r.name || r.phone}: ${label}`);
    } catch (e) { notify(`Not saved: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  const move = async (value) => {
    setBusy(true);
    try {
      await updateRecord(r.type_, r.id, { followUp: value });
      onUpdated(r.type_, r.id, { followUp: value });
      setSnooze(false);
      notify(value === 'done' ? 'Follow-up closed' : `Moved to ${whenLabel(value)}`);
    } catch (e) { notify(`Couldn’t change it: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`fu-item ${busy ? 'busy' : ''}`}>
      <div className="fu-main fu-with-face">
        <Persona name={r.name} phone={r.phone} size={42} ring={late ? 'late' : r.type_ === 'hiring' ? 'hiring' : 'sales'} />
        <div style={{ minWidth: 0 }}>
        <div className="fu-name">
          {r.name || r.phone}
          {r.title && <span className="title-tag">{r.title}</span>}
          <span className={`fu-when ${late ? 'late' : ''}`}><Clock3 size={12} /> {whenLabel(r.fu)}</span>
        </div>
        {followUpPrompt(r.type_, r.status) && <div className="fu-prompt">{followUpPrompt(r.type_, r.status)}</div>}
        {r.remarks && <div className="fu-meta">{r.remarks}</div>}
        </div>
      </div>
      <div className="fu-contact">
        {r.phone && <CallButton className="btn btn-ghost btn-sm" call={{ type: r.type_, name: r.name, phone: r.phone, title: r.title, options: nextSteps(r.type_, r.status), prev: r.status }} />}
        {r.phone && <a className="icon-btn" href={waLink(r.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={17} /></a>}
      </div>
      <div className="fu-actions">
        {nextSteps(r.type_, r.status).map((s) => {
          const st = statuses.find((x) => x.value === s);
          return <button key={s} className={`ql-btn sm tone-${st.tone}`} disabled={busy} onClick={() => logResult(s)}>{st.label}</button>;
        })}
        <button className="ql-btn sm" disabled={busy} onClick={() => setSnooze((x) => !x)} aria-expanded={snooze}>Later ▾</button>
      </div>
      {snooze && (
        <div className="fu-actions fu-snooze">
          {quickDates(date).map((q) => <button key={q.key} className="chip chip-btn" onClick={() => move(q.value)}>{q.label}</button>)}
          <button className="chip chip-btn" onClick={() => setPicking(true)}>Pick date</button>
          <a className="chip chip-btn" href={calendarLink(r, r.fu)} target="_blank" rel="noreferrer"><CalendarPlus size={13} /> Calendar</a>
          <button className="chip chip-btn" onClick={() => move('done')}><Check size={13} /> Close</button>
        </div>
      )}
      {picking && <DateTimeSheet value={r.fu} title={`Call ${r.name || r.phone} on…`} onClose={() => setPicking(false)} onPick={(v) => { setPicking(false); move(v); }} />}
    </div>
  );
}

export function groupFollowUps(items, today = todayISO()) {
  const horizon = toISO(addDays(new Date(), 14));
  const g = { overdue: [], today: [], upcoming: [] };
  items.forEach((r) => g[bucketOf(r.fu, today)].push(r));
  g.upcoming = g.upcoming.filter((r) => fuDate(r.fu) <= horizon);
  return g;
}

export default function FollowUps({ items, date, user, onAdded, onUpdated, notify }) {
  const groups = useMemo(() => groupFollowUps(items), [items]);
  const [tab, setTab] = useState(null);
  const [open, setOpen] = useState(true);
  const [bell, setBell] = useState(notifyOn());
  const [mailing, setMailing] = useState(false);
  const active = tab || (groups.overdue.length ? 'overdue' : groups.today.length ? 'today' : 'upcoming');
  const list = groups[active];

  useEffect(() => { scheduleReminders(items); }, [items, bell]);

  if (!items.length) return null;
  const dueCount = groups.overdue.length + groups.today.length;

  const turnOnBell = async () => {
    try { await enableNotifications(); setBell(true); notify('Reminders on — you’ll get a notification 5 minutes before each timed follow-up.'); }
    catch (e) { notify(e.message, 'error'); }
  };
  const mailMe = async () => {
    setMailing(true);
    try { await emailMyFollowUps(user.id); notify('Your follow-up list is on its way to your email.'); }
    catch (e) { notify(e.message, 'error'); }
    finally { setMailing(false); }
  };

  const TABS = [
    { key: 'overdue', label: 'Overdue', tone: 'bad' },
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' }
  ];

  return (
    <section className="section followups">
      <button className="section-head fu-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="section-icon" style={{ background: 'var(--marigold)', color: 'var(--ever)' }}><BellRing size={18} /></span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <h3>Follow-ups {dueCount > 0 && <span className="fu-count">{dueCount} due</span>}</h3>
          <p className="hint" style={{ margin: 0 }}>Call, then tap the result — it’s logged for today. “Later” moves it to another day.</p>
        </div>
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <>
          <div className="fu-bar">
            <div className="fu-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.key} role="tab" aria-selected={active === t.key} className={`fu-tab ${active === t.key ? 'on' : ''} ${t.tone || ''}`} onClick={() => setTab(t.key)}>
                  {t.label} <b>{groups[t.key].length}</b>
                </button>
              ))}
            </div>
            <div className="fu-tools">
              {notifySupported() && (bell
                ? <span className="chip chip-good"><Bell size={13} /> Reminders on</span>
                : <button className="chip chip-btn" onClick={turnOnBell}><BellOff size={13} /> Turn on reminders</button>)}
              <button className="chip chip-btn" onClick={() => downloadIcs([...groups.overdue, ...groups.today, ...groups.upcoming])} title="Adds every follow-up to your phone calendar with an alarm">
                <CalendarPlus size={13} /> Add all to calendar
              </button>
              {!IS_DEMO && <button className="chip chip-btn" onClick={mailMe} disabled={mailing}>{mailing ? <Loader2 size={13} className="spin" /> : <Mail size={13} />} Email me the list</button>}
            </div>
          </div>
          <div className="fu-list">
            {list.length
              ? list.slice(0, 60).map((r) => <FollowUpItem key={r.id} r={r} date={date} user={user} onAdded={onAdded} onUpdated={onUpdated} notify={notify} />)
              : <p className="muted" style={{ padding: '14px 20px', fontSize: 14 }}>{active === 'overdue' ? 'Nothing overdue.' : active === 'today' ? 'Nothing else due today.' : 'Nothing planned for the next two weeks.'}</p>}
            {list.length > 60 && <p className="hint" style={{ padding: '8px 20px' }}>Showing 60 of {list.length}. See all in Contacts.</p>}
          </div>
        </>
      )}
    </section>
  );
}
