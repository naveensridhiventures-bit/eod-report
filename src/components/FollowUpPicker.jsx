import { useState } from 'react';
import { CalendarClock, CalendarDays } from 'lucide-react';
import DateTimeSheet from './DateTimeSheet';
import { quickDates, whenLabel } from '../lib/followup';
import { todayISO } from '../lib/date';

/**
 * Follow-up chips: [Auto: Tomorrow 5 PM] [Tomorrow] [In 3 days] [Next Monday] [📅]
 * value '' = automatic (read from the remarks, else the default gap).
 */
export default function FollowUpPicker({ value, onChange, auto, base = todayISO(), label = 'Follow up' }) {
  const quick = quickDates(base);
  const custom = value && !quick.some((q) => q.value === value);
  const [open, setOpen] = useState(false);
  return (
    <div className="fu-picker">
      <span className="fu-picker-label"><CalendarClock size={14} /> {label}</span>
      <div className="fu-picker-chips">
        {auto !== undefined && (
          <button type="button" className={`chip chip-btn ${!value ? 'on' : ''}`} onClick={() => onChange('')}>
            {auto ? `Auto · ${whenLabel(auto, base)}` : 'Auto'}
          </button>
        )}
        {quick.map((q) => (
          <button key={q.key} type="button" className={`chip chip-btn ${value === q.value ? 'on' : ''}`} onClick={() => onChange(q.value)}>{q.label}</button>
        ))}
        <button type="button" className={`chip chip-btn ${custom ? 'on' : ''}`} onClick={() => setOpen(true)}>
          <CalendarDays size={13} style={{ verticalAlign: -2 }} /> {custom ? whenLabel(value, base) : 'Pick date'}
        </button>
      </div>
      {open && <DateTimeSheet value={value} min={base} onClose={() => setOpen(false)} onPick={(v) => { onChange(v); setOpen(false); }} />}
    </div>
  );
}
