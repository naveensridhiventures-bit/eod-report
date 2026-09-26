import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Phone, MessageCircle, CalendarPlus, X, Clock3, ShoppingBag, PhoneCall, UserPlus, Ban, Store, FileSpreadsheet, Check, Loader2, Plus, Mail, Lock } from 'lucide-react';
import { RECORD_TYPES } from '../config/team';
import { fetchRecords, saveRecords, updateRecord, saveMyEmail, emailMyFollowUps, IS_DEMO } from '../lib/api';
import { buildContacts, sortContacts } from '../lib/crm';
import { whenLabel, bucketOf, quickDates, calendarLink, waLink, followUpFor, parseWhen } from '../lib/followup';
import { toISO, addDays, todayISO, fmtDate } from '../lib/date';
import { inr } from '../lib/format';
import { Loading, Empty, Avatar } from '../components/ui';
import { StatusChip } from '../components/Records';
import FollowUpPicker from '../components/FollowUpPicker';
import PolishButton from '../components/PolishButton';
import VoiceButton from '../components/VoiceButton';

const KIND = { customer: 'Customer', candidate: 'Candidate', lead: 'Lead' };
const TYPE_ICON = { calls: PhoneCall, orders: ShoppingBag, customers: Store, cancellations: Ban, hiring: UserPlus };

function historyLine(r) {
  if (r.type_ === 'orders') return `Order: ${[r.product, r.qty ? `${r.qty} ${r.unit || ''}` : '', r.amount ? inr(r.amount) : ''].filter(Boolean).join(' · ')}`;
  if (r.type_ === 'cancellations') return `Cancelled: ${[r.product, r.amount ? inr(r.amount) : '', r.reason].filter(Boolean).join(' · ')}`;
  if (r.type_ === 'customers') return `Added as ${r.type === 'existing' ? 'existing' : 'new'} customer${r.area ? ` · ${r.area}` : ''}`;
  return r.remarks || '';
}

function ContactSheet({ c, user, onClose, onAdded, onUpdated, notify }) {
  const today = todayISO();
  const [remarks, setRemarks] = useState('');
  const [fu, setFu] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [order, setOrder] = useState({ product: '', qty: '', unit: 'kg', amount: '' });
  const type = c.logType;
  const statuses = RECORD_TYPES[type].statuses;

  const log = async (status) => {
    setBusy(true);
    try {
      const row = { title: c.title, name: c.name, phone: c.phone, remarks: remarks.trim(), status, followUp: followUpFor(status, remarks, today, fu) };
      const saved = await saveRecords(type, [row], { date: today, employeeId: user.id, employee: user.name });
      onAdded(type, saved);
      setRemarks(''); setFu('');
      notify(`Logged: ${statuses.find((s) => s.value === status)?.label}${row.followUp ? ` · follow up ${whenLabel(row.followUp)}` : ''}`);
    } catch (e) { notify(`Not saved: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  const addOrder = async () => {
    if (!Number(order.amount) && !Number(order.qty)) { notify('Add the quantity or amount.', 'error'); return; }
    setBusy(true);
    try {
      const saved = await saveRecords('orders', [{ title: c.title || 'Retail', name: c.name, phone: c.phone, product: order.product.trim(), qty: Number(order.qty) || 0, unit: order.unit, amount: Number(order.amount) || 0 }],
        { date: today, employeeId: user.id, employee: user.name });
      onAdded('orders', saved);
      setOrder({ product: '', qty: '', unit: 'kg', amount: '' }); setOrderOpen(false);
      notify('Order added');
    } catch (e) { notify(`Not saved: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  const move = async (value) => {
    if (!c.lastTouch) return;
    setBusy(true);
    try {
      await updateRecord(c.lastTouch.type_, c.lastTouch.id, { followUp: value });
      onUpdated(c.lastTouch.type_, c.lastTouch.id, { followUp: value });
      notify(value === 'done' ? 'Follow-up closed' : `Follow-up moved to ${whenLabel(value)}`);
    } catch (e) { notify(`Couldn’t change it: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet-wide contact-sheet" role="dialog" aria-modal="true" aria-labelledby="ct-name" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
            <Avatar person={{ id: c.key, name: c.name || c.phone }} size={46} />
            <div style={{ minWidth: 0 }}>
              <h2 id="ct-name" className="ct-name">{c.name || c.phone}</h2>
              <div className="ct-sub">
                <span className="chip">{KIND[c.kind]}</span>
                {c.title && <span className="title-tag">{c.title}</span>}
                {c.area && <span className="muted">{c.area}</span>}
                {c.phone && <span className="muted">{c.phone}</span>}
              </div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="ct-actions">
          {c.phone && <a className="btn btn-primary" href={`tel:${c.phone}`}><Phone size={17} /> Call</a>}
          {c.phone && <a className="btn btn-wa" href={waLink(c.phone, `Hello ${c.name || ''}`.trim())} target="_blank" rel="noreferrer"><MessageCircle size={17} /> WhatsApp</a>}
          {c.fu && <a className="btn btn-ghost" href={calendarLink({ ...c, remarks: c.lastTouch?.remarks }, c.fu)} target="_blank" rel="noreferrer"><CalendarPlus size={17} /> Calendar</a>}
        </div>

        <div className="ct-stats">
          <div><b>{c.calls + c.hr}</b><span>Calls</span></div>
          <div><b>{c.orders}</b><span>Orders</span></div>
          <div><b>{inr(c.orderValue)}</b><span>Sales</span></div>
          <div><b>{c.lastDate ? fmtDate(c.lastDate, { day: 'numeric', month: 'short' }) : '—'}</b><span>Last contact</span></div>
        </div>

        {user.viewOnly ? null : c.fu ? (
          <div className={`ct-next ${bucketOf(c.fu) === 'overdue' ? 'late' : ''}`}>
            <div><Clock3 size={15} /> Next follow-up: <b>{whenLabel(c.fu)}</b></div>
            <div className="ct-next-chips">
              {quickDates(today).map((q) => <button key={q.key} className="chip chip-btn" disabled={busy} onClick={() => move(q.value)}>{q.label}</button>)}
              <button className="chip chip-btn" disabled={busy} onClick={() => move('done')}><Check size={13} /> Close</button>
            </div>
          </div>
        ) : <p className="hint" style={{ marginTop: 12 }}>No follow-up planned. Log a call below to set one.</p>}

        {!user.viewOnly && <div className="ct-log">
          <div className="label-row">
            <label className="label" htmlFor="ct-remarks">Log a call</label>
            <span className="label-tools">
              <VoiceButton onText={(t) => setRemarks((x) => `${x ? `${x} ` : ''}${t}`)} />
              <PolishButton value={remarks} onChange={setRemarks} notify={notify} />
            </span>
          </div>
          <input id="ct-remarks" className="input" placeholder="What did they say? English or Thanglish" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          <FollowUpPicker value={fu} onChange={setFu} auto={parseWhen(remarks, today)} />
          <div className="ql-status">
            {statuses.map((s) => <button key={s.value} className={`ql-btn tone-${s.tone}`} disabled={busy} onClick={() => log(s.value)}>{s.label}</button>)}
          </div>
          {c.kind !== 'candidate' && (orderOpen ? (
            <div className="ct-order">
              <input className="input" placeholder="Product" value={order.product} onChange={(e) => setOrder({ ...order, product: e.target.value })} />
              <div className="ql-qty">
                <input className="input" inputMode="decimal" placeholder="Qty" value={order.qty} onChange={(e) => setOrder({ ...order, qty: e.target.value })} />
                <select className="input" value={order.unit} onChange={(e) => setOrder({ ...order, unit: e.target.value })}>{['kg', 'L', 'pcs', 'box', 'bag', 'g', 'ml'].map((u) => <option key={u}>{u}</option>)}</select>
              </div>
              <input className="input" inputMode="numeric" placeholder="Amount ₹" value={order.amount} onChange={(e) => setOrder({ ...order, amount: e.target.value })} />
              <button className="btn btn-primary" disabled={busy} onClick={addOrder}>{busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Add order</button>
            </div>
          ) : <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setOrderOpen(true)}><ShoppingBag size={15} /> Log an order</button>)}
        </div>}

        <h3 style={{ margin: '20px 0 8px' }}>History</h3>
        <div className="timeline">
          {c.history.map((r) => {
            const Icon = TYPE_ICON[r.type_] || PhoneCall;
            return (
              <div key={r.id} className="tl-item">
                <span className={`tl-dot t-${r.type_}`}><Icon size={14} /></span>
                <div className="tl-body">
                  <div className="tl-top">
                    <b>{fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                    {r.status && <StatusChip type={r.type_} value={r.status} />}
                    <span className="muted">by {r.employee}</span>
                  </div>
                  {historyLine(r) && <div className="tl-text">{historyLine(r)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReminderEmail({ user, notify }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(`pulse_email_${user.id}`) || ''; } catch { return ''; } });
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  if (user.viewOnly) return null;
  const save = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { notify('Enter a valid email.', 'error'); return; }
    if (pin.length !== 4) { notify('Enter your 4-digit PIN to confirm.', 'error'); return; }
    setBusy(true);
    try {
      await saveMyEmail(user.id, pin, email.trim());
      try { localStorage.setItem(`pulse_email_${user.id}`, email.trim()); } catch { /* ignore */ }
      setPin('');
      notify('Saved. Your follow-ups will be emailed every morning.');
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { await emailMyFollowUps(user.id); notify('Sent — check your inbox.'); }
    catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <div className="panel reminder-panel">
      <div>
        <h3><Mail size={17} style={{ verticalAlign: -3 }} /> Morning reminder email</h3>
        <p className="muted" style={{ fontSize: 14 }}>Every morning at about 9 AM you get your follow-ups for the day (and anything overdue) with tap-to-call numbers.</p>
      </div>
      <div className="reminder-row">
        <input className="input" type="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={IS_DEMO} />
        <input className="input pin-small" type="password" inputMode="numeric" maxLength={4} placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="Your PIN" disabled={IS_DEMO} />
        <button className="btn btn-primary" onClick={save} disabled={busy || IS_DEMO}>{busy ? <Loader2 size={16} className="spin" /> : <Lock size={16} />} Save</button>
        <button className="btn btn-ghost" onClick={test} disabled={busy || IS_DEMO}>Send me a test</button>
      </div>
      {IS_DEMO && <p className="hint">Available once the app is connected to Google Sheets.</p>}
    </div>
  );
}

export default function ContactsPage({ user, employees, notify }) {
  const types = useMemo(() => {
    if (user.isAdmin) return Object.keys(RECORD_TYPES);
    const t = [];
    if (user.roles.includes('telecaller')) t.push('calls', 'orders', 'customers', 'cancellations');
    if (user.roles.includes('hiring')) t.push('hiring');
    return t;
  }, [user]);
  const [who, setWho] = useState(user.isAdmin ? 'all' : user.id);
  const [records, setRecords] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('due');
  const [openKey, setOpenKey] = useState(null);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    setRecords(null);
    fetchRecords({ types, from: toISO(addDays(new Date(), -180)), employeeId: who === 'all' ? undefined : who })
      .then(setRecords)
      .catch((e) => { setRecords({}); notify(`Couldn’t load contacts: ${e.message}`, 'error'); });
  }, [types, who, notify]);

  const onAdded = useCallback((type, recs) => setRecords((all) => ({ ...all, [type]: [...recs, ...(all?.[type] || [])] })), []);
  const onUpdated = useCallback((type, id, fields) => setRecords((all) => ({ ...all, [type]: (all?.[type] || []).map((r) => (r.id === id ? { ...r, ...fields } : r)) })), []);

  const contacts = useMemo(() => (records ? sortContacts(buildContacts(records)) : []), [records]);
  const today = todayISO();
  const counts = useMemo(() => ({
    due: contacts.filter((c) => c.fu && c.fu.slice(0, 10) <= today).length,
    interested: contacts.filter((c) => c.status === 'interested').length,
    customer: contacts.filter((c) => c.kind === 'customer').length,
    candidate: contacts.filter((c) => c.kind === 'candidate').length,
    all: contacts.length
  }), [contacts, today]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filter === 'due' && !(c.fu && c.fu.slice(0, 10) <= today)) return false;
      if (filter === 'interested' && c.status !== 'interested') return false;
      if ((filter === 'customer' || filter === 'candidate') && c.kind !== filter) return false;
      if (!term) return true;
      return [c.name, c.phone, c.area, c.title, ...c.history.map((h) => h.remarks || h.product || '')].join(' ').toLowerCase().includes(term);
    });
  }, [contacts, filter, q, today]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = shown.map((c) => ({
      Name: c.name, Number: c.phone, Type: KIND[c.kind], Title: c.title, Area: c.area,
      'Last result': c.status ? RECORD_TYPES[c.logType].statuses.find((s) => s.value === c.status)?.label || c.status : '',
      'Last note': c.lastTouch?.remarks || '', 'Next follow-up': c.fu ? whenLabel(c.fu) : '', 'Last contact': c.lastDate,
      Calls: c.calls + c.hr, Orders: c.orders, 'Sales (₹)': c.orderValue, 'Handled by': [...c.owners].join(', ')
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || { a: 1 }).map((k) => ({ wch: Math.max(14, k.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
    XLSX.writeFile(wb, `contacts-${today}.xlsx`);
  };

  const open = contacts.find((c) => c.key === openKey);
  const FILTERS = [
    { key: 'due', label: 'Follow-up due' }, { key: 'interested', label: 'Interested' },
    { key: 'customer', label: 'Customers' }, { key: 'candidate', label: 'Candidates' }, { key: 'all', label: 'All' }
  ].filter((f) => (f.key === 'candidate' ? types.includes('hiring') : f.key === 'customer' || f.key === 'interested' ? types.includes('calls') : true));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Contacts</h1>
          <p>Every customer and candidate you’ve called in the last 6 months, with their full history and next follow-up.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user.isAdmin && (
            <select className="input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose contacts">
              <option value="all">Whole team</option>
              {employees.filter((e) => !e.viewOnly).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <button className="btn btn-ghost" onClick={exportExcel} disabled={!shown.length}><FileSpreadsheet size={17} /> Excel</button>
        </div>
      </div>

      <div className="ct-search">
        <Search size={17} />
        <input className="input" placeholder="Search name, number, area or notes" value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} />
      </div>
      <div className="ct-filters">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip chip-btn ${filter === f.key ? 'on' : ''}`} onClick={() => { setFilter(f.key); setLimit(60); }}>
            {f.label} <b style={{ marginLeft: 4 }}>{counts[f.key]}</b>
          </button>
        ))}
      </div>

      {!records ? <Loading text="Loading contacts…" /> : !shown.length ? (
        <Empty title={filter === 'due' ? 'No follow-ups due' : 'No contacts found'}>
          {filter === 'due' ? 'You’re all caught up. Check “All” to see everyone.' : 'Try a different search or filter.'}
        </Empty>
      ) : (
        <div className="ct-list">
          {shown.slice(0, limit).map((c) => (
            <button key={c.key} className="ct-row" onClick={() => setOpenKey(c.key)}>
              <Avatar person={{ id: c.key, name: c.name || c.phone }} />
              <div className="ct-row-main">
                <div className="ct-row-name">{c.name || c.phone} {c.title && <span className="title-tag">{c.title}</span>}</div>
                <div className="ct-row-meta">
                  {c.status && <StatusChip type={c.logType} value={c.status} />}
                  <span>{c.lastTouch?.remarks || historyLine(c.last) || c.phone}</span>
                </div>
              </div>
              <div className="ct-row-side">
                {c.fu
                  ? <span className={`fu-when ${bucketOf(c.fu) === 'overdue' ? 'late' : ''}`}><Clock3 size={12} /> {whenLabel(c.fu)}</span>
                  : <span className="muted" style={{ fontSize: 12 }}>{fmtDate(c.lastDate, { day: 'numeric', month: 'short' })}</span>}
                {c.orderValue > 0 && <span className="ct-sales">{inr(c.orderValue)}</span>}
              </div>
            </button>
          ))}
          {shown.length > limit && <button className="btn btn-ghost btn-block" onClick={() => setLimit((l) => l + 60)}>Show more ({shown.length - limit})</button>}
        </div>
      )}

      <ReminderEmail user={user} notify={notify} />

      {open && <ContactSheet c={open} user={user} onClose={() => setOpenKey(null)} onAdded={onAdded} onUpdated={onUpdated} notify={notify} />}
    </div>
  );
}
