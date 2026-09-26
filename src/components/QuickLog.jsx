import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Loader2, Tag, Check } from 'lucide-react';
import { RECORD_TYPES } from '../config/team';
import { saveRecords } from '../lib/api';
import { normalisePhone, classifyCall, classifyHiring } from '../lib/parse';
import { recentTitles, rememberTitle } from '../lib/titles';
import { followUpFor, parseWhen } from '../lib/followup';
import FollowUpPicker from './FollowUpPicker';
import PolishButton from './PolishButton';
import CallButton from './CallButton';
import { dupeInfo } from '../lib/teamIndex';
import { RECORDS_SAVED, onEvent } from '../lib/events';

const UNITS = ['kg', 'L', 'pcs', 'box', 'bag', 'g', 'ml'];

// Which inputs each record type shows in the quick form (title/status handled separately)
const FIELDS = {
  calls: ['phone', 'name', 'remarks'],
  hiring: ['phone', 'name', 'remarks'],
  orders: ['name', 'phone', 'product', 'qty', 'amount'],
  customers: ['name', 'phone', 'area'],
  cancellations: ['name', 'phone', 'product', 'qty', 'amount', 'reason']
};

const PLACEHOLDER = {
  phone: 'Mobile number', name: 'Name / shop', remarks: 'Remarks (optional)', product: 'Product',
  qty: 'Qty', amount: 'Amount ₹', area: 'Area', reason: 'Reason'
};

const ADD_LABEL = { orders: 'Add order', customers: 'Add customer', cancellations: 'Add cancellation' };

const blank = (type) => ({ name: '', phone: '', remarks: '', product: '', qty: '', unit: type === 'orders' || type === 'cancellations' ? 'kg' : '', amount: '', area: '', reason: '', type: 'new' });

/**
 * Log one call / order / candidate at a time, the moment it happens.
 * For calls and HR calls, tapping the outcome saves the entry — no Save button needed.
 */
export default function QuickLog({ type, date, user, dayRows, onAdded, onRemoved, notify, teamIdx }) {
  const def = RECORD_TYPES[type];
  const fields = FIELDS[type];
  const tapToSave = type === 'calls' || type === 'hiring';

  const [title, setTitle] = useState(() => recentTitles(type)[0] || def.titles?.[0] || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [v, setV] = useState(() => blank(type));
  const [busy, setBusy] = useState(false);
  const [fu, setFu] = useState('');
  const firstRef = useRef(null);

  // Switching tabs (calls → orders) resets the form and picks that list's last title
  useEffect(() => {
    setTitle(recentTitles(type)[0] || def.titles?.[0] || '');
    setV(blank(type));
    setEditingTitle(false);
  }, [type, def.titles]);

  const titleOptions = useMemo(() => [...new Set([...recentTitles(type), ...(def.titles || [])])].slice(0, 6), [type, def.titles, title]);

  const phone = normalisePhone(v.phone);
  const dupe = phone.length === 10 && dayRows.some((r) => r.phone === phone);
  const warn = dupeInfo(teamIdx, phone, user.id);

  // A call made with the Call button and logged from the result sheet clears this form
  useEffect(() => onEvent(RECORDS_SAVED, ({ records }) => {
    setV((cur) => (records.some((r) => r.phone && r.phone === normalisePhone(cur.phone)) ? blank(type) : cur));
  }), [type]);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const save = async (status) => {
    if (!title.trim()) { setEditingTitle(true); notify('Pick a list title first.', 'error'); return; }
    if (!v.name.trim() && !phone) { notify('Enter a number or a name.', 'error'); firstRef.current?.focus(); return; }
    if (v.phone.trim() && phone.length !== 10) { notify('Mobile number should be 10 digits.', 'error'); return; }
    if (type === 'orders' && !Number(v.amount) && !Number(v.qty)) { notify('Add the quantity or amount.', 'error'); return; }

    const row = { title: title.trim(), name: v.name.trim(), phone };
    if (type === 'calls' || type === 'hiring') {
      row.remarks = v.remarks.trim();
      row.status = status || (type === 'calls' ? classifyCall(row.remarks) : classifyHiring(row.remarks));
      row.followUp = followUpFor(row.status, row.remarks, date, fu);
    }
    if (type === 'orders' || type === 'cancellations') {
      Object.assign(row, { product: v.product.trim(), qty: Number(v.qty) || 0, unit: v.unit, amount: Number(v.amount) || 0 });
      if (type === 'cancellations') row.reason = v.reason.trim();
    }
    if (type === 'customers') Object.assign(row, { area: v.area.trim(), type: v.type });

    // Clear the form straight away so the next entry can be typed while this one saves
    const previous = v;
    const previousFu = fu;
    setV(blank(type));
    setFu('');
    firstRef.current?.focus();
    setBusy(true);
    const tempId = `pending_${Date.now()}`;
    onAdded(type, [{ ...row, id: tempId, date, employeeId: user.id, employee: user.name, createdAt: new Date().toISOString(), pending: true }]);
    try {
      const saved = await saveRecords(type, [row], { date, employeeId: user.id, employee: user.name });
      onRemoved(type, tempId);
      onAdded(type, saved);
      rememberTitle(type, title.trim());
    } catch (e) {
      onRemoved(type, tempId);
      setV(previous);
      setFu(previousFu);
      notify(`Not saved: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };

  const input = (k, i) => {
    if (k === 'qty') {
      return (
        <div key={k} className="ql-qty">
          <input className="input" inputMode="decimal" placeholder="Qty" value={v.qty} onChange={set('qty')} onKeyDown={onKey} aria-label="Quantity" />
          <select className="input" value={v.unit} onChange={set('unit')} aria-label="Unit">
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      );
    }
    if (k === 'remarks' || k === 'reason') {
      return (
        <div key={k} className={`ql-${k} ql-with-btn`}>
          <input className="input" type="text" autoComplete="off" placeholder={k === 'remarks' ? 'Remarks — English or Thanglish' : PLACEHOLDER[k]} aria-label={PLACEHOLDER[k]}
            value={v[k]} onChange={set(k)} onKeyDown={onKey} />
          <PolishButton compact value={v[k]} onChange={(t) => setV((x) => ({ ...x, [k]: t }))} notify={notify} />
        </div>
      );
    }
    return (
      <input
        key={k}
        ref={i === 0 ? firstRef : undefined}
        className={`input ql-${k}`}
        type={k === 'phone' ? 'tel' : 'text'}
        inputMode={k === 'phone' || k === 'amount' ? 'numeric' : undefined}
        autoComplete="off"
        placeholder={PLACEHOLDER[k]}
        aria-label={PLACEHOLDER[k]}
        value={v[k]}
        onChange={set(k)}
        onKeyDown={onKey}
      />
    );
  };

  return (
    <div className="quicklog">
      <div className="ql-title">
        <Tag size={14} />
        {editingTitle ? (
          <>
            <input className="input ql-title-input" value={title} autoFocus maxLength={60} placeholder={def.titleHint}
              onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)} />
            <button className="icon-btn" onClick={() => setEditingTitle(false)} aria-label="Done"><Check size={16} /></button>
          </>
        ) : (
          <div className="ql-title-chips">
            {titleOptions.map((t) => (
              <button key={t} type="button" className={`chip chip-btn ${title === t ? 'on' : ''}`} onClick={() => setTitle(t)}>{t}</button>
            ))}
            <button type="button" className="chip chip-btn" onClick={() => setEditingTitle(true)}>+ New</button>
          </div>
        )}
      </div>

      <div className={`ql-fields ql-${type}`}>{fields.map(input)}</div>
      {warn && <div className={`dupe dupe-${warn.tone}`}>{warn.text}</div>}
      {dupe && !warn && <p className="hint" style={{ color: '#87540a' }}>You already logged this number today — saving again adds a second entry.</p>}
      {tapToSave && phone.length === 10 && !warn?.tone?.startsWith('bad') && (
        <div className="ql-callrow">
          <CallButton className="btn btn-primary btn-sm" label="Call now" call={{ type, name: v.name.trim(), phone, title }} />
          <span className="hint" style={{ margin: 0 }}>Come back after the call — the app will ask how it went.</span>
        </div>
      )}

      {type === 'customers' && (
        <div className="ql-status">
          {def.statuses.map((s) => (
            <button key={s.value} type="button" className={`ql-btn ${v.type === s.value ? `on tone-${s.tone}` : ''}`} onClick={() => setV((x) => ({ ...x, type: s.value }))}>{s.label}</button>
          ))}
        </div>
      )}

      {tapToSave ? (
        <>
          <FollowUpPicker value={fu} onChange={setFu} auto={parseWhen(v.remarks, date)} base={date}
            label={type === 'hiring' ? 'Interview / follow up' : 'Follow up'} />
          <p className="ql-cue">Tap the result to save</p>
          <div className="ql-status">
            {def.statuses.filter((s) => type !== 'hiring' || s.quick).map((s) => (
              <button key={s.value} type="button" className={`ql-btn tone-${s.tone}`} onClick={() => save(s.value)}>{s.label}</button>
            ))}
          </div>
        </>
      ) : (
        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => save()}>
          {busy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />} {ADD_LABEL[type]}
        </button>
      )}
    </div>
  );
}
