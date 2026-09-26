import { useMemo, useState } from 'react';
import { Phone, BellRing, ChevronDown } from 'lucide-react';
import { RECORD_TYPES } from '../config/team';
import { saveRecords } from '../lib/api';
import { fmtDay } from '../lib/date';

// Outcomes offered for a follow-up (kept short so they fit on one row on a phone)
const QUICK = {
  calls: ['interested', 'callback', 'not_interested', 'no_answer'],
  hiring: ['joined', 'scheduled', 'not_interested', 'no_answer']
};
// Which earlier results come back as follow-ups today
const DUE = { calls: ['callback'], hiring: ['scheduled'] };

/** Every "call back" and "interview scheduled" from the last 7 days that hasn't been followed up yet. */
export function dueFollowUps(records, date, types) {
  const out = [];
  types.filter((t) => DUE[t]).forEach((type) => {
    const list = records[type] || [];
    const latest = new Map(); // phone → most recent record for that number
    list.forEach((r) => {
      if (!r.phone || r.pending) return;
      const cur = latest.get(r.phone);
      if (!cur || r.date > cur.date || (r.date === cur.date && r.createdAt > cur.createdAt)) latest.set(r.phone, r);
    });
    latest.forEach((r) => {
      if (r.date < date && DUE[type].includes(r.status)) out.push({ ...r, type_: type });
    });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export default function FollowUps({ items, date, user, onAdded, notify }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(null);
  const shown = useMemo(() => items.slice(0, 40), [items]);
  if (!items.length) return null;

  const mark = async (r, status) => {
    const type = r.type_;
    const label = RECORD_TYPES[type].statuses.find((s) => s.value === status)?.label || status;
    setBusy(r.id);
    try {
      const saved = await saveRecords(type, [{
        title: r.title, name: r.name, phone: r.phone, status,
        remarks: `Follow-up (${fmtDay(r.date)}): ${label}`
      }], { date, employeeId: user.id, employee: user.name });
      onAdded(type, saved);
    } catch (e) {
      notify(`Not saved: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="section followups">
      <button className="section-head fu-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="section-icon" style={{ background: 'var(--marigold)', color: 'var(--ever)' }}><BellRing size={18} /></span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <h3>Follow-ups due <span className="fu-count">{items.length}</span></h3>
          <p className="hint" style={{ margin: 0 }}>Call backs and interviews from the last 7 days. Call, then tap the result — it's logged for today.</p>
        </div>
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="fu-list">
          {shown.map((r) => (
            <div key={r.id} className="fu-item">
              <div className="fu-main">
                <div className="fu-name">{r.name || r.phone} {r.title && <span className="title-tag">{r.title}</span>}</div>
                <div className="fu-meta">{fmtDay(r.date)}{r.remarks ? ` · ${r.remarks}` : ''}</div>
              </div>
              {r.phone && <a className="btn btn-ghost btn-sm fu-call" href={`tel:${r.phone}`} aria-label={`Call ${r.name || r.phone}`}><Phone size={15} /> Call</a>}
              <div className="fu-actions">
                {QUICK[r.type_].map((s) => {
                  const st = RECORD_TYPES[r.type_].statuses.find((x) => x.value === s);
                  return <button key={s} className={`ql-btn sm tone-${st.tone}`} disabled={busy === r.id} onClick={() => mark(r, s)}>{st.label}</button>;
                })}
              </div>
            </div>
          ))}
          {items.length > shown.length && <p className="hint" style={{ padding: '8px 20px' }}>Showing the oldest {shown.length} of {items.length}.</p>}
        </div>
      )}
    </section>
  );
}
