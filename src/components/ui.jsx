import { useEffect } from 'react';
import { PhoneCall, UserPlus, Code2, Crown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ROLES } from '../config/team';
import { initials } from '../lib/format';

export const ROLE_ICONS = { telecaller: PhoneCall, hiring: UserPlus, developer: Code2, saleshead: Crown };

const AVATAR_COLORS = ['#16504E', '#3D7DD8', '#8A5CD1', '#E0782F', '#2E9E6A', '#C2477A', '#5E706E'];
export function colorFor(id = '') {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ person, size }) {
  const style = { background: colorFor(person.id) };
  if (size) Object.assign(style, { width: size, height: size, fontSize: size * 0.38 });
  return <span className="avatar" style={style} aria-hidden="true">{initials(person.name)}</span>;
}

export function RoleChips({ roles }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {roles.map((r) => ROLES[r] && (
        <span key={r} className="chip">
          <span className="role-dot" style={{ background: ROLES[r].color }} />
          {ROLES[r].short}
        </span>
      ))}
    </span>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.type === 'error' ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast) return null;
  const Icon = toast.type === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div className={`toast ${toast.type === 'error' ? 'error' : ''}`} role="status">
      <Icon size={18} /> {toast.message}
    </div>
  );
}

export function Loading({ text = 'Loading reports…' }) {
  return <div className="loading"><Loader2 className="spin" size={20} /> {text}</div>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
