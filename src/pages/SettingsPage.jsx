import { useEffect, useState } from 'react';
import { Mail, Save, Loader2, Send, Lock } from 'lucide-react';
import { fetchSettings, saveSettings, emailEODNow, IS_DEMO } from '../lib/api';
import { todayISO } from '../lib/date';
import { Loading } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SettingsPage({ user, notify }) {
  const [s, setS] = useState(null);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchSettings().then(setS).catch((e) => { notify(`Couldn’t load settings: ${e.message}`, 'error'); setS({}); });
  }, [notify]);

  if (!s) return <div className="page"><Loading text="Loading settings…" /></div>;

  const emails = String(s.MANAGEMENT_EMAILS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const bad = emails.filter((e) => !EMAIL_RE.test(e));

  const save = async () => {
    if (!emails.length) { notify('Add at least one email address.', 'error'); return; }
    if (bad.length) { notify(`Check this email: ${bad[0]}`, 'error'); return; }
    if (pin.length !== 4) { notify('Enter your 4-digit PIN to confirm.', 'error'); return; }
    setSaving(true);
    try {
      await saveSettings({ ...s, MANAGEMENT_EMAILS: emails.join(', ') }, user.id, pin);
      setPin('');
      notify('Settings saved');
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const sendNow = async () => {
    setSending(true);
    try { await emailEODNow(todayISO()); notify(`Today’s summary sent to ${emails.join(', ')}`); }
    catch (e) { notify(e.message, 'error'); }
    finally { setSending(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1>Email settings</h1>
          <p>Who receives the EOD reports, and when.</p>
        </div>
      </div>

      <div className="panel stack">
        <div>
          <label className="label" htmlFor="st-emails"><Mail size={15} style={{ verticalAlign: -2 }} /> Send reports to</label>
          <textarea id="st-emails" className="textarea" rows={2} value={s.MANAGEMENT_EMAILS || ''} onChange={(e) => setS({ ...s, MANAGEMENT_EMAILS: e.target.value })} placeholder="hiring.sridhiventures@gmail.com" />
          <p className="hint">Separate several addresses with commas. {emails.length > 0 && `${emails.length} address${emails.length > 1 ? 'es' : ''}.`}</p>
          {bad.length > 0 && <p className="err">Not a valid email: {bad.join(', ')}</p>}
        </div>

        <div>
          <span className="label">When to email</span>
          <div className="moods" role="radiogroup" aria-label="When to email">
            {[{ v: 'yes', l: 'Each submission + evening summary' }, { v: 'no', l: 'Evening summary only' }].map((o) => (
              <button key={o.v} type="button" role="radio" aria-checked={s.NOTIFY_ON_SUBMIT === o.v} className={`mood ${s.NOTIFY_ON_SUBMIT === o.v ? 'on' : ''}`} onClick={() => setS({ ...s, NOTIFY_ON_SUBMIT: o.v })}>{o.l}</button>
            ))}
          </div>
          <p className="hint">The evening summary goes out at about 8 PM once the daily trigger is set up in Apps Script.</p>
        </div>

        <div>
          <span className="label">Follow-up reminder emails (every morning, about 9 AM)</span>
          <div className="moods" role="radiogroup" aria-label="Follow-up reminder emails">
            {[{ v: 'yes', l: 'Email each person their follow-ups' }, { v: 'no', l: 'Off' }].map((o) => (
              <button key={o.v} type="button" role="radio" aria-checked={(s.FOLLOWUP_EMAILS || 'yes') === o.v} className={`mood ${(s.FOLLOWUP_EMAILS || 'yes') === o.v ? 'on' : ''}`} onClick={() => setS({ ...s, FOLLOWUP_EMAILS: o.v })}>{o.l}</button>
            ))}
          </div>
          <div className="moods" role="radiogroup" aria-label="Management follow-up digest" style={{ marginTop: 8 }}>
            {[{ v: 'yes', l: 'Also send management the overdue list' }, { v: 'no', l: 'Only to the person' }].map((o) => (
              <button key={o.v} type="button" role="radio" aria-checked={(s.FOLLOWUP_DIGEST || 'no') === o.v} className={`mood ${(s.FOLLOWUP_DIGEST || 'no') === o.v ? 'on' : ''}`} onClick={() => setS({ ...s, FOLLOWUP_DIGEST: o.v })}>{o.l}</button>
            ))}
          </div>
          <p className="hint">Each person sets their own reminder email on the Contacts page (or fill the <b>email</b> column in the Employees sheet). Needs <b>createFollowUpTrigger</b> run once in Apps Script.</p>
        </div>

        <div className="grid-2">
          <div>
            <label className="label" htmlFor="st-company">Company name (email heading)</label>
            <input id="st-company" className="input" value={s.COMPANY_NAME || ''} onChange={(e) => setS({ ...s, COMPANY_NAME: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="st-link">App link (for the “Open dashboard” button)</label>
            <input id="st-link" className="input" value={s.APP_LINK || ''} onChange={(e) => setS({ ...s, APP_LINK: e.target.value })} placeholder="https://your-app.netlify.app" />
          </div>
        </div>

        <div className="pin-confirm">
          <label className="label" htmlFor="st-pin"><Lock size={15} style={{ verticalAlign: -2 }} /> Your PIN to confirm</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input id="st-pin" className="input" style={{ maxWidth: 140, letterSpacing: '.4em', fontWeight: 700 }} type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />} Save settings</button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3>Send today’s summary now</h3>
          <p className="muted" style={{ fontSize: 14 }}>Useful to check how the email looks.</p>
        </div>
        <button className="btn btn-gold" onClick={sendNow} disabled={sending || IS_DEMO}>{sending ? <Loader2 size={17} className="spin" /> : <Send size={17} />} Send now</button>
      </div>
    </div>
  );
}
