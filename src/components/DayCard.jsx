import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ROLES } from '../config/team';
import { fromISO } from '../lib/date';
import { fmtMetric } from '../lib/format';
import { moodLabel } from '../lib/reports';
import { Avatar } from './ui';

export default function DayCard({ report, showPerson }) {
  const [open, setOpen] = useState(false);
  const d = fromISO(report.date);
  const headline = [];
  report.roles.forEach((r) => ROLES[r]?.metrics.filter((m) => m.highlight === 'good').forEach((m) => {
    const v = Number(report.metrics?.[m.key]) || 0;
    if (v) headline.push(`${m.label.replace(' (₹)', '')}: ${fmtMetric(m, v)}`);
  }));
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
          <div className="s">{headline.slice(0, 3).join('  ·  ') || report.positives || 'No numbers entered'}</div>
        </div>
        {report.mood ? <span className="chip">{moodLabel(report.mood)}</span> : null}
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div className="day-card-body">
          {report.roles.map((r) => ROLES[r] && (
            <div key={r} style={{ marginBottom: 10 }}>
              <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="role-dot" style={{ background: ROLES[r].color }} /> {ROLES[r].label}
              </div>
              <div className="kv">
                {ROLES[r].metrics.map((m) => (
                  <div key={m.key}><span>{m.label}</span><b>{fmtMetric(m, report.metrics?.[m.key])}</b></div>
                ))}
              </div>
              {ROLES[r].notes?.map((n) => report.notes?.[n.key] && (
                <p className="note-block" key={n.key}><b>{n.label}</b>{report.notes[n.key]}</p>
              ))}
            </div>
          ))}
          {report.positives && <p className="note-block"><b>Wins today</b>{report.positives}</p>}
          {report.challenges && <p className="note-block"><b>Challenges</b>{report.challenges}</p>}
          {report.tomorrow && <p className="note-block"><b>Plan for tomorrow</b>{report.tomorrow}</p>}
        </div>
      )}
    </div>
  );
}
