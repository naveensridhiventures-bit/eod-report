import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { toISO, fromISO, addDays, todayISO } from '../lib/date';
import { fuDate, fuTime } from '../lib/followup';

const TIMES = [['', 'Any time'], ['10:00', '10 AM'], ['11:00', '11 AM'], ['12:00', '12 PM'], ['14:00', '2 PM'], ['15:00', '3 PM'], ['16:00', '4 PM'], ['17:00', '5 PM'], ['18:00', '6 PM'], ['19:00', '7 PM']];
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Our own date + time picker — works the same on every phone and computer. */
export default function DateTimeSheet({ value, onPick, onClose, title = 'Pick a date & time', min = todayISO() }) {
  const [day, setDay] = useState(value ? fuDate(value) : toISO(addDays(new Date(), 1)));
  const [time, setTime] = useState(value ? fuTime(value) : '');
  const [month, setMonth] = useState(() => { const d = fromISO(day); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toISO(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  }, [month]);
  const quick = [0, 1, 2, 3, 7].map((n) => toISO(addDays(new Date(), n)));
  const label = (iso) => {
    const n = Math.round((fromISO(iso) - fromISO(todayISO())) / 86400000);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    return fromISO(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
  };

  return (
    <div className="overlay dt-overlay" onClick={onClose}>
      <div className="sheet dt-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top"><h2 style={{ fontSize: 18 }}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="dt-quick">
          {quick.map((q) => <button key={q} className={`chip chip-btn ${day === q ? 'on' : ''}`} onClick={() => { setDay(q); setMonth(new Date(fromISO(q).getFullYear(), fromISO(q).getMonth(), 1)); }}>{label(q)}</button>)}
        </div>
        <div className="dt-month">
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <b>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
        <div className="dt-grid">
          {WEEK.map((w, i) => <span key={i} className="dt-w">{w}</span>)}
          {cells.map((iso, i) => iso ? (
            <button key={iso} className={`dt-day ${iso === day ? 'on' : ''} ${iso === todayISO() ? 'today' : ''}`} disabled={iso < min} onClick={() => setDay(iso)}>
              {fromISO(iso).getDate()}
            </button>
          ) : <span key={`e${i}`} />)}
        </div>
        <span className="label" style={{ marginTop: 12 }}>Time</span>
        <div className="dt-times">
          {TIMES.map(([v, l]) => <button key={l} className={`chip chip-btn ${time === v ? 'on' : ''}`} onClick={() => setTime(v)}>{l}</button>)}
          <input className="input dt-time-input" type="time" value={TIMES.some(([v]) => v === time) ? '' : time} onChange={(e) => setTime(e.target.value)} aria-label="Other time" />
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => onPick(time ? `${day} ${time}` : day)}>
          <Check size={17} /> {label(day)}{time ? `, ${TIMES.find(([v]) => v === time)?.[1] || time}` : ''}
        </button>
      </div>
    </div>
  );
}
