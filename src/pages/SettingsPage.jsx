import { useEffect, useState } from 'react';
import { Loader2, Save, X, Plus, Mail } from 'lucide-react';
import { fetchSettings, saveSettings, IS_DEMO } from '../lib/api';
import { Loading } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SettingsPage({ notify }) {
  const [settings, setSettings] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    fetchSettings().then((s) => { if (live) setSettings(s); }).catch((e) => notify(`Couldn’t load settings: ${e.message}`, 'error'));
    return () => { live = false; };
  }, [notify]);

  const addEmail = () => {
    const v = emailInput.trim();
    if (!v) return;
    if (!EMAIL_RE.test(v)) { notify('That doesn’t look like a valid email address.', 'error'); return; }
    if (settings.managementEmails.includes(v)) { setEmailInput(''); return; }
    setSettings({ ...settings, managementEmails: [...settings.managementEmails, v] });
    setEmailInput('');
  };
  const removeEmail = (v) => setSettings({ ...settings, managementEmails: settings.managementEmails.filter((e) => e !== v) });

  const save = async () => {
    if (!settings.managementEmails.length) { notify('Add at least one management email before saving.', 'error'); return; }
    setSaving(true);
    try {
      await saveSettings(settings);
      notify('Settings saved');
    } catch (e) {
      notify(`Not saved: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="page"><Loading text="Loading settings…" /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Choose who gets emailed when reports are submitted, and how they’re sent.</p>
        </div>
      </div>

      {IS_DEMO && <div className="demo-banner" style={{ marginBottom: 16 }}>Demo mode — connect Google Sheets to actually save these settings.</div>}

      <div className="panel stack" style={{ maxWidth: 620 }}>
        <div>
          <label className="label">Management email addresses</label>
          <p className="hint" style={{ marginTop: -2, marginBottom: 10 }}>
            Every EOD report, the evening team summary, and anything sent from “Download reports” goes to every address here.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {settings.managementEmails.map((e) => (
              <span key={e} className="chip chip-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Mail size={13} /> {e}
                <button type="button" className="icon-btn" style={{ padding: 0, width: 16, height: 16 }} onClick={() => removeEmail(e)} aria-label={`Remove ${e}`}>
                  <X size={13} />
                </button>
              </span>
            ))}
            {!settings.managementEmails.length && <span className="muted" style={{ fontSize: 13 }}>No recipients yet — reports won’t be emailed anywhere.</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input" type="email" placeholder="e.g. hiring.sridhiventures@gmail.com" value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
            />
            <button type="button" className="btn btn-ghost" onClick={addEmail}><Plus size={16} /> Add</button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="company-name">Company name</label>
          <p className="hint" style={{ marginTop: -2, marginBottom: 8 }}>Shown in the email subject line and header.</p>
          <input id="company-name" className="input" value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} />
        </div>

        <div>
          <label className="switch-row">
            <input type="checkbox" checked={settings.notifyOnSubmit} onChange={(e) => setSettings({ ...settings, notifyOnSubmit: e.target.checked })} />
            <span>Email management automatically every time someone submits their EOD report</span>
          </label>
          <p className="hint" style={{ marginTop: 4 }}>Turn this off if you'd rather only rely on the evening team summary and manual “Email to management” sends.</p>
        </div>

        <div>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />} Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
