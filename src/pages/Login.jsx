import { useRef, useState } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Avatar } from '../components/ui';
import { login, IS_DEMO } from '../lib/api';

export default function Login({ employees, onLogin }) {
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pinRef = useRef(null);
  const now = new Date();

  const choose = (emp) => {
    setPicked(emp);
    setPin('');
    setError('');
    setTimeout(() => pinRef.current?.focus(), 50);
  };

  const submit = async (value) => {
    setBusy(true);
    setError('');
    try {
      onLogin(await login(picked.id, value));
    } catch (e) {
      setError(e.message || 'Sign-in failed. Check your internet and try again.');
      setPin('');
      pinRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onPin = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(v);
    if (v.length === 4) submit(v);
  };

  return (
    <div className="login">
      <section className="login-side">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-name" style={{ fontSize: 22 }}>Team Pulse</span>
        </div>
        <svg className="pulse-line" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 70 H180 L210 30 L250 110 L285 20 L320 90 L345 70 H600" fill="none" stroke="rgba(244,169,59,.35)" strokeWidth="3" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="login-date">{now.getDate()}</div>
          <div className="login-day">{now.toLocaleDateString('en-IN', { weekday: 'long' })}, {now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
          <p className="login-tag">Log today’s work in two minutes. Management sees the whole team’s day in one place.</p>
        </div>
      </section>

      <main className="login-main">
        {!picked ? (
          <>
            <h1>Who’s reporting?</h1>
            <p className="muted" style={{ marginTop: 6 }}>Pick your name to sign in.</p>
            <div className="people">
              {employees.map((e) => (
                <button key={e.id} className="person" onClick={() => choose(e)}>
                  <Avatar person={e} />
                  <span><span className="person-name">{e.name}</span><br /><span className="person-role">{e.title}</span></span>
                </button>
              ))}
            </div>
            {!employees.length && <p className="muted" style={{ marginTop: 20 }}>Loading team…</p>}
          </>
        ) : (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setPicked(null)} style={{ alignSelf: 'flex-start', marginBottom: 20 }}>
              <ArrowLeft size={16} /> Change person
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar person={picked} size={52} />
              <div>
                <h1 style={{ fontSize: 26 }}>Hi, {picked.name.split(' ')[0]}</h1>
                <p className="muted">Enter your 4-digit PIN</p>
              </div>
            </div>
            <label onClick={() => pinRef.current?.focus()} style={{ cursor: 'text' }}>
              <span className="sr-only">PIN</span>
              <input ref={pinRef} className="pin-input" inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={onPin} disabled={busy} aria-label="4-digit PIN" />
              <div className="pin-row">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`pin-box ${pin[i] ? 'filled' : ''}`}>{pin[i] ? '•' : ''}</div>
                ))}
                {busy && <Loader2 className="spin" size={22} style={{ alignSelf: 'center', color: 'var(--muted)' }} />}
              </div>
            </label>
            {error && <p className="err">{error}</p>}
            {IS_DEMO && <p className="hint" style={{ marginTop: 16 }}>Demo PINs: Naveen 1111 · Imran 2222 · Thulasi 3333 · Azgar 4444 · Sabi 5555 · Umar 6666 · Management 9999</p>}
          </>
        )}
      </main>
    </div>
  );
}
