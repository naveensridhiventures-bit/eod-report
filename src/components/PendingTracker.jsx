import { useMemo } from 'react';
import { BellRing, Copy, MessageCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Avatar } from './ui';
import { REMINDER_HOUR } from '../config/team';

const digits = (v) => String(v || '').replace(/\D/g, '');
const waNumber = (v) => { const d = digits(v); return d.length === 10 ? `91${d}` : d.length >= 11 ? d : ''; };

/** Who has and hasn't submitted today, with one-tap WhatsApp reminders. */
export default function PendingTracker({ staff, todays, notify, onRefresh, refreshing }) {
  const now = new Date();
  const sunday = now.getDay() === 0;
  const late = now.getHours() >= REMINDER_HOUR;
  const doneBy = useMemo(() => new Map(todays.map((r) => [r.employeeId, r])), [todays]);
  const pending = staff.filter((e) => !doneBy.has(e.id));
  const done = staff.filter((e) => doneBy.has(e.id));
  const link = typeof window !== 'undefined' ? window.location.origin : '';

  const groupText = `Reminder: please submit today's EOD report on Team Pulse before you leave.\nPending: ${pending.map((e) => e.name).join(', ')}\n${link}`;
  const personText = (e) => `Hi ${e.name.split(' ')[0]}, please submit today's EOD report on Team Pulse before you leave. ${link}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(groupText); notify('Reminder copied'); }
    catch { notify('Copy isn’t available here.', 'error'); }
  };

  const tone = sunday ? 'off' : pending.length === 0 ? 'done' : late ? 'late' : 'wait';
  const headline = sunday ? 'Sunday: no reports due'
    : pending.length === 0 ? 'Everyone has submitted today'
    : `${pending.length} pending${late ? ' — past the reminder time' : ''}`;

  return (
    <div className={`panel pending-panel pt-${tone}`} style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h3>
          {tone === 'done' ? <CheckCircle2 size={18} style={{ color: 'var(--good)' }} /> : <BellRing size={18} />} Today’s check-in
          <span className={`chip ${tone === 'done' ? 'chip-good' : tone === 'late' ? 'chip-bad' : 'chip-gold'}`}>{done.length} of {staff.length} submitted</span>
        </h3>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={refreshing} aria-label="Refresh">
          <RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <p className="pt-headline">{headline}{!sunday && !late && pending.length > 0 ? ` (reminders start at ${REMINDER_HOUR % 12 || 12} ${REMINDER_HOUR >= 12 ? 'PM' : 'AM'})` : ''}</p>

      {!sunday && pending.length > 0 && (
        <div className="pt-list">
          {pending.map((e) => {
            const num = waNumber(e.phone);
            return (
              <div className="pt-row" key={e.id}>
                <span className="cell-person"><Avatar person={e} />{e.name}<span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>{e.title}</span></span>
                {num
                  ? <a className="btn btn-wa btn-sm" href={`https://wa.me/${num}?text=${encodeURIComponent(personText(e))}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Remind</a>
                  : <span className="muted" style={{ fontSize: 12 }}>no number on file</span>}
              </div>
            );
          })}
          <div className="pt-actions">
            <a className="btn btn-wa btn-sm" href={`https://wa.me/?text=${encodeURIComponent(groupText)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Remind all on WhatsApp</a>
            <button className="btn btn-ghost btn-sm" onClick={copy}><Copy size={15} /> Copy message</button>
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div className="who" style={{ marginTop: pending.length ? 14 : 4 }}>
          {done.map((e) => {
            const r = doneBy.get(e.id);
            const t = r.submittedAt ? new Date(r.submittedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
            return (
              <span key={e.id} className="who-item"><Avatar person={e} /> {e.name} <span className="chip chip-good" style={{ height: 22 }}>{t || 'Done'}</span></span>
            );
          })}
        </div>
      )}
    </div>
  );
}
