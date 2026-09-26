import { useEffect, useState } from 'react';
import { PhoneCall, X, Loader2, Timer } from 'lucide-react';
import { RECORD_TYPES } from '../config/team';
import { saveRecords, updateRecord } from '../lib/api';
import { watchCallReturn, clearCall, fmtDuration } from '../lib/callLog';
import { followUpFor, parseWhen, whenLabel } from '../lib/followup';
import { emitSaved, emitLead } from '../lib/events';
import { todayISO } from '../lib/date';
import FollowUpPicker from './FollowUpPicker';
import PolishButton from './PolishButton';
import VoiceButton from './VoiceButton';

/** Pops up after a call made from the app: "How did the call with X go?" */
export default function CallResultSheet({ user, notify }) {
  const [call, setCall] = useState(null);
  const [secs, setSecs] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [fu, setFu] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => watchCallReturn((c, s) => {
    setCall((cur) => (cur && cur.startedAt === c.startedAt ? cur : c));
    setSecs(s);
  }), []);

  if (!call) return null;
  const type = call.type === 'hiring' ? 'hiring' : 'calls';
  const statuses = RECORD_TYPES[type].statuses;
  const shown = call.options?.length
    ? statuses.filter((s) => call.options.includes(s.value))
    : type === 'hiring' ? statuses.filter((s) => s.quick) : statuses;
  const today = todayISO();

  const close = () => { clearCall(); setCall(null); setRemarks(''); setFu(''); };

  const save = async (status) => {
    setBusy(true);
    try {
      const label = statuses.find((s) => s.value === status)?.label || status;
      const row = {
        title: call.title || '', name: call.name || '', phone: call.phone, status,
        remarks: remarks.trim() || (call.prev ? `Follow-up: ${label}` : ''),
        followUp: followUpFor(status, remarks, today, fu),
        duration: status === 'no_answer' ? 0 : secs
      };
      const saved = await saveRecords(type, [row], { date: today, employeeId: user.id, employee: user.name });
      emitSaved(type, saved);
      if (call.leadId) {
        const fields = { state: 'done', result: status, doneAt: new Date().toISOString() };
        await updateRecord('leads', call.leadId, fields);
        emitLead(call.leadId, fields);
      }
      notify(`${call.name || call.phone}: ${label}${row.followUp ? ` · follow up ${whenLabel(row.followUp)}` : ''}`);
      close();
    } catch (e) {
      notify(`Not saved: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay call-overlay">
      <div className="sheet call-sheet" role="dialog" aria-modal="true" aria-labelledby="call-title">
        <div className="sheet-top">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="call-icon"><PhoneCall size={20} /></span>
            <div>
              <h2 id="call-title" style={{ fontSize: 19 }}>How did the call go?</h2>
              <p className="muted" style={{ fontSize: 14 }}>{call.name || call.phone}{call.title ? ` · ${call.title}` : ''}</p>
            </div>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Don't log this call"><X size={20} /></button>
        </div>
        <div className="call-timer"><Timer size={15} /> About {fmtDuration(secs)} on the call</div>

        <div className="label-row" style={{ marginTop: 14 }}>
          <label className="label" htmlFor="call-remarks">What did they say? (optional)</label>
          <span className="label-tools">
            <VoiceButton onText={(t) => setRemarks((x) => `${x ? `${x} ` : ''}${t}`)} />
            <PolishButton value={remarks} onChange={setRemarks} notify={notify} />
          </span>
        </div>
        <input id="call-remarks" className="input" style={{ height: 46, fontSize: 16 }} placeholder="English or Thanglish" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        <FollowUpPicker value={fu} onChange={setFu} auto={parseWhen(remarks, today)} />

        <p className="ql-cue">Tap the result to save</p>
        <div className="ql-status">
          {shown.map((s) => (
            <button key={s.value} className={`ql-btn tone-${s.tone}`} disabled={busy} onClick={() => save(s.value)}>
              {busy ? <Loader2 size={15} className="spin" /> : s.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={close}>Skip — don’t log this call</button>
      </div>
    </div>
  );
}
