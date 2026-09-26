import { useMemo, useState } from 'react';
import { ListChecks, MessageCircle, SkipForward, Ban, MapPin, StickyNote, Loader2 } from 'lucide-react';
import { RECORD_TYPES } from '../config/team';
import { saveRecords, updateRecord } from '../lib/api';
import { followUpFor, waLink } from '../lib/followup';
import { dupeInfo } from '../lib/teamIndex';
import { emitSaved } from '../lib/events';
import { todayISO } from '../lib/date';
import CallButton from './CallButton';

const SKIP_KEY = 'pulse_queue_skipped';
const readSkips = () => { try { return JSON.parse(sessionStorage.getItem(SKIP_KEY)) || []; } catch { return []; } };

/**
 * The call queue: leads the admin assigned to you, one at a time.
 * Call → come back → result sheet logs it and moves to the next lead.
 */
export default function CallQueue({ user, leads, teamIdx, notify, onLeadChanged }) {
  const today = todayISO();
  const lists = useMemo(() => [...new Set(leads.map((l) => l.title || 'Leads'))], [leads]);
  const [list, setList] = useState(null);
  const [skips, setSkips] = useState(readSkips);
  const [busy, setBusy] = useState(false);
  const activeList = list && lists.includes(list) ? list : lists[0];

  const mine = leads.filter((l) => (l.title || 'Leads') === activeList);
  const open = mine.filter((l) => l.state === 'open' || !l.state)
    .sort((a, b) => {
      const sa = skips.indexOf(a.id), sb = skips.indexOf(b.id);
      if (sa !== sb) return sa - sb; // skipped ones go to the back, in the order skipped
      return String(a.createdAt) < String(b.createdAt) ? -1 : 1;
    });
  const doneToday = leads.filter((l) => l.state !== 'open' && String(l.doneAt || '').slice(0, 10) === today).length;
  const lead = open[0];

  if (!leads.some((l) => l.state === 'open' || !l.state) && !doneToday) return null;

  const kind = lead?.kind === 'hiring' ? 'hiring' : 'calls';
  const warn = lead ? dupeInfo(teamIdx, lead.phone, user.id) : null;
  const statuses = RECORD_TYPES[kind].statuses.filter((s) => kind !== 'hiring' || s.quick);

  const finish = async (fields) => {
    await updateRecord('leads', lead.id, fields);
    onLeadChanged(lead.id, fields);
  };

  const logResult = async (status) => {
    setBusy(true);
    try {
      const row = { title: lead.title, name: lead.name, phone: lead.phone, status, remarks: '', followUp: followUpFor(status, '', today), duration: 0 };
      const saved = await saveRecords(kind, [row], { date: today, employeeId: user.id, employee: user.name });
      emitSaved(kind, saved);
      await finish({ state: 'done', result: status, doneAt: new Date().toISOString() });
    } catch (e) { notify(`Not saved: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  const skip = () => {
    const next = [...skips.filter((x) => x !== lead.id), lead.id];
    setSkips(next);
    try { sessionStorage.setItem(SKIP_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const doNotCall = async () => {
    if (!window.confirm(`Add ${lead.name || lead.phone} to the do-not-call list? Nobody in the team will be asked to call this number again.`)) return;
    setBusy(true);
    try {
      if (!warn || warn.tone !== 'bad') {
        const saved = await saveRecords('dnc', [{ name: lead.name, phone: lead.phone, reason: 'Asked not to call' }], { date: today, employeeId: user.id, employee: user.name });
        emitSaved('dnc', saved);
      }
      await finish({ state: 'dnc', result: 'dnc', doneAt: new Date().toISOString() });
      notify('Removed and added to do-not-call');
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const total = mine.length;
  const doneInList = total - open.length;

  return (
    <section className="section queue">
      <div className="section-head">
        <span className="section-icon" style={{ background: 'var(--ever)', color: '#fff' }}><ListChecks size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>Call queue</h3>
          <p className="hint" style={{ margin: 0 }}>{open.length ? `${open.length} left to call · ${doneToday} done today` : `All done — ${doneToday} called today`}</p>
        </div>
      </div>
      <div className="section-body">
        {lists.length > 1 && (
          <div className="ql-title-chips" style={{ marginBottom: 12 }}>
            {lists.map((t) => (
              <button key={t} className={`chip chip-btn ${activeList === t ? 'on' : ''}`} onClick={() => setList(t)}>
                {t} · {leads.filter((l) => (l.title || 'Leads') === t && (l.state === 'open' || !l.state)).length}
              </button>
            ))}
          </div>
        )}
        <div className="q-progress" aria-label={`${doneInList} of ${total} called`}>
          <span style={{ width: `${total ? (doneInList / total) * 100 : 0}%` }} />
        </div>
        <p className="hint" style={{ marginTop: 6 }}>{doneInList} of {total} in “{activeList}”</p>

        {lead ? (
          <div className={`q-card ${busy ? 'busy' : ''}`}>
            <div className="q-top">
              <div style={{ minWidth: 0 }}>
                <div className="q-name">{lead.name || lead.phone}</div>
                <div className="q-meta">
                  <span>{lead.phone}</span>
                  {lead.area && <span><MapPin size={13} /> {lead.area}</span>}
                  {lead.kind === 'hiring' && <span className="chip">Candidate</span>}
                </div>
              </div>
            </div>
            {lead.notes && <div className="q-notes"><StickyNote size={14} /> {lead.notes}</div>}
            {warn && <div className={`dupe dupe-${warn.tone}`}>{warn.text}</div>}

            {warn?.tone === 'bad' ? (
              <button className="btn btn-danger btn-block" style={{ marginTop: 12 }} onClick={doNotCall} disabled={busy}><Ban size={16} /> Remove from my queue</button>
            ) : (
              <>
                <div className="q-actions">
                  <CallButton className="btn btn-primary q-call" label="Call" size={18}
                    call={{ type: kind, name: lead.name, phone: lead.phone, title: lead.title, leadId: lead.id }} />
                  <a className="btn btn-wa" href={waLink(lead.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={18} /></a>
                  <button className="btn btn-ghost" onClick={skip} disabled={busy || open.length < 2} title="Call later"><SkipForward size={17} /> Skip</button>
                </div>
                <p className="ql-cue">Called from another phone? Tap the result</p>
                <div className="ql-status">
                  {statuses.map((s) => (
                    <button key={s.value} className={`ql-btn sm tone-${s.tone}`} disabled={busy} onClick={() => logResult(s.value)}>{s.label}</button>
                  ))}
                  <button className="ql-btn sm tone-bad" disabled={busy} onClick={doNotCall}><Ban size={13} /> Don’t call</button>
                </div>
              </>
            )}
            {busy && <Loader2 size={18} className="spin q-busy" />}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>Nothing left in this list. Great work.</p>
        )}

        {open.length > 1 && (
          <div className="q-next">
            <span className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Up next</span>
            {open.slice(1, 4).map((l) => <span key={l.id} className="q-next-item">{l.name || l.phone}{l.area ? ` · ${l.area}` : ''}</span>)}
          </div>
        )}
      </div>
    </section>
  );
}
