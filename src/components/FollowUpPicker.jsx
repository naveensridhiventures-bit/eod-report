import { CalendarClock } from 'lucide-react';
import { quickDates, whenLabel, fuDate, fuTime } from '../lib/followup';
import { todayISO } from '../lib/date';

/**
 * Follow-up chips: [Auto: Tomorrow 5 PM] [Tomorrow] [In 3 days] [Next Monday] [📅]
 * value '' = automatic (read from the remarks, else the default gap).
 */
export default function FollowUpPicker({ value, onChange, auto, base = todayISO(), label = 'Follow up' }) {
  const quick = quickDates(base);
  const custom = value && !quick.some((q) => q.value === value);
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
        <label className={`chip chip-btn fu-date ${custom ? 'on' : ''}`}>
          {custom ? whenLabel(value, base) : 'Pick date'}
          <input type="datetime-local" min={`${base}T00:00`} value={custom ? `${fuDate(value)}T${fuTime(value) || '10:00'}` : ''}
            onChange={(e) => e.target.value && onChange(e.target.value.replace('T', ' ').slice(0, 16))} aria-label="Pick a follow-up date and time" />
        </label>
      </div>
    </div>
  );
}
