import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SNAPSHOT } from '../config/team';
import { fromISO } from '../lib/date';
import { inr } from '../lib/format';
import { fmtQty } from '../lib/stats';
import { moodLabel, TEXT_FIELDS } from '../lib/reports';
import { Avatar } from './ui';

export default function DayCard({ report, showPerson }) {
  const [open, setOpen] = useState(false);
  const d = fromISO(report.date);
  const m = report.metrics || {};
  const nums = SNAPSHOT.filter((s) => report.roles?.includes(s.role) && Number(m[s.key]));
  const summary = nums.filter((s) => ['calls_made', 'interested_calls', 'orders', 'hr_calls', 'joined'].includes(s.key))
    .map((s) => `${s.label}: ${fmtQty(m[s.key])}`).join('  ·  ');
  const firstText = TEXT_FIELDS.map((f) => report.notes?.[f.key]).find(Boolean);
  return (
    <div className="day-card">
      <button className="day-card-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {showPerson ? <Avatar person={{ id: report.employeeId, name: report.name }} /> : (
          <div className="day-card-date">
            <div className="d">{d.getDate()}</div>
            <div className="m">{d.toLocaleDateString('en-IN', { month: 'short' })}</div>
          </div>
        )}
        <div className="day-card-sum">
          <div className="t">{showPerson ? `${report.name}, ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : d.toLocaleDateString('en-IN', { weekday: 'long' })}</div>
          <div className="s">{summary || firstText || report.positives || 'Report submitted'}</div>
        </div>
        {report.mood ? <span className="chip">{moodLabel(report.mood)}</span> : null}
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div className="day-card-body">
          {nums.length > 0 && (
            <div className="kv">
              {nums.map((s) => <div key={s.key}><span>{s.label}</span><b>{s.money ? inr(m[s.key]) : fmtQty(m[s.key])}</b></div>)}
            </div>
          )}
          {TEXT_FIELDS.map((f) => report.notes?.[f.key] && <p className="note-block" key={f.key}><b>{f.short}</b>{report.notes[f.key]}</p>)}
          {report.positives && <p className="note-block"><b>Wins today</b>{report.positives}</p>}
          {report.challenges && <p className="note-block"><b>Challenges</b>{report.challenges}</p>}
          {report.tomorrow && <p className="note-block"><b>Plan for tomorrow</b>{report.tomorrow}</p>}
        </div>
      )}
    </div>
  );
}
