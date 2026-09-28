import { useEffect, useState } from 'react';
import { X, Phone, MessageCircle, Pencil, Trash2, Loader2, Check, Send, History } from 'lucide-react';
import { RECORD_TYPES, COL_LABELS, statusInfo } from '../config/team';
import { updateRecords } from '../lib/api';
import { isFollowup, nowEntry, addEntry, editEntry, removeEntry, fmtWhen } from '../lib/history';
import { normalisePhone } from '../lib/parse';
import { StatusChip } from './Records';

const QUICK = {
  calls: [
    { status: 'no_answer', remark: 'RNR' },
    { status: 'no_answer', remark: 'Switched off' },
    { status: 'callback', remark: 'Busy, call back later' },
    { status: 'interested', remark: 'Interested, send details' },
    { status: 'not_interested', remark: 'Not interested' }
  ],
  hiring: [
    { status: 'no_answer', remark: 'RNR' },
    { status: 'called', remark: 'Will think and confirm' },
    { status: 'scheduled', remark: 'Interview scheduled' },
    { status: 'joined', remark: 'Joined today' },
    { status: 'not_interested', remark: 'Not interested' }
  ]
};

const TONE_COLOR = { good: 'var(--good)', bad: 'var(--bad)', gold: 'var(--marigold)', blue: 'var(--blue)', muted: '#9aaba7' };

/**
 * Detail view for one call: remark timeline, add a new remark, edit details, delete.
 * For orders / customers / cancellations it shows just the edit form.
 */
export default function CallDrawer({ type, record, user, canEdit, onClose, onChange, onDelete, notify }) {
  const def = RECORD_TYPES[type];
  const followup = isFollowup(type);
  const [rec, setRec] = useState(record);
  const [status, setStatus] = useState(record.status || def.statuses?.[0]?.value);
  const [remark, setRemark] = useState('');
  const [editingInfo, setEditingInfo] = useState(!followup);
  const [info, setInfo] = useState(record);
  const [editIdx, setEditIdx] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const persist = async (next, msg) => {
    setBusy(true);
    try {
      const [saved] = await updateRecords(type, [next]);
      setRec(saved);
      setInfo(saved);
      onChange(saved);
      if (msg) notify(msg);
      return true;
    } catch (e) {
      notify(`Not saved: ${e.message}`, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addUpdate = async () => {
    if (!remark.trim() && status === rec.status) { notify('Write a remark or pick a new status.', 'error'); return; }
    const ok = await persist(addEntry(rec, nowEntry(user, status, remark.trim())), 'Remark added');
    if (ok) setRemark('');
  };

  const saveInfo = async () => {
    const patch = { ...rec };
    def.cols.forEach((c) => { if (!(followup && (c === 'status' || c === 'remarks'))) patch[c] = info[c]; });
    patch.phone = normalisePhone(patch.phone);
    if (patch.qty !== undefined) patch.qty = Number(patch.qty) || 0;
    if (patch.amount !== undefined) patch.amount = Number(patch.amount) || 0;
    const ok = await persist(patch, 'Details saved');
    if (ok && followup) setEditingInfo(false);
  };

  const saveEntry = async (i) => {
    const ok = await persist(editEntry(rec, i, editDraft), 'Remark updated');
    if (ok) setEditIdx(null);
  };

  const dropEntry = async (i) => {
    if (rec.history.length < 2) { notify('This is the only remark. Delete the whole call instead.', 'error'); return; }
    if (!window.confirm('Delete this remark?')) return;
    await persist(removeEntry(rec, i), 'Remark deleted');
  };

  const del = async () => {
    if (!window.confirm(`Delete ${rec.name || 'this entry'} and all its remarks?`)) return;
    await onDelete(rec);
    onClose();
  };

  const phone = normalisePhone(rec.phone);
  const timeline = followup ? rec.history.map((e, i) => ({ ...e, i })).reverse() : [];
  const editCols = def.cols.filter((c) => !(followup && (c === 'status' || c === 'remarks')));

  return (
    <div className="overlay drawer-overlay" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-name" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            {rec.title && <span className="title-tag">{rec.title}</span>}
            <h2 id="dr-name">{rec.name || 'No name'}</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              {def.label} · added {fmtWhen({ d: rec.date })} by {rec.employee}{followup && rec.attempts > 1 ? ` · ${rec.attempts} calls` : ''}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        {phone && (
          <div className="drawer-actions">
            <a className="btn btn-primary btn-sm" href={`tel:${phone}`}><Phone size={16} /> Call {phone}</a>
            <a className="btn btn-wa btn-sm" href={`https://wa.me/91${phone}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>
            {followup && <StatusChip type={type} value={rec.status} />}
          </div>
        )}

        <div className="drawer-body">
          {followup && canEdit && (
            <section className="add-update">
              <h3>Add a remark</h3>
              <div className="quick">
                {QUICK[type].map((q) => (
                  <button key={q.remark} type="button" className="chip chip-btn" onClick={() => { setStatus(q.status); setRemark(q.remark); }}>{q.remark}</button>
                ))}
              </div>
              <textarea className="textarea" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="What happened on this call?" aria-label="Remark" />
              <div className="add-row">
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                  {def.statuses.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                </select>
                <button className="btn btn-gold" onClick={addUpdate} disabled={busy}>
                  {busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />} Save remark
                </button>
              </div>
              <p className="hint">Saved with today’s date and time ({fmtWhen(nowEntry(user, status, ''))}).</p>
            </section>
          )}

          {followup && (
            <section>
              <h3 className="drawer-h"><History size={17} /> Call history <span className="chip">{rec.history.length}</span></h3>
              <ol className="timeline">
                {timeline.map((e) => {
                  const st = statusInfo(type, e.status);
                  const mine = canEdit;
                  return (
                    <li key={e.i} className="tl-item">
                      <span className="tl-dot" style={{ background: TONE_COLOR[st.tone] || TONE_COLOR.muted }} />
                      {editIdx === e.i ? (
                        <div className="tl-edit">
                          <select className="select" value={editDraft.status} onChange={(ev) => setEditDraft({ ...editDraft, status: ev.target.value })} aria-label="Status">
                            {def.statuses.map((s2) => <option key={s2.value} value={s2.value}>{s2.label}</option>)}
                          </select>
                          <textarea className="textarea" rows={2} value={editDraft.remark} onChange={(ev) => setEditDraft({ ...editDraft, remark: ev.target.value })} aria-label="Remark" />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => saveEntry(e.i)} disabled={busy}><Check size={15} /> Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditIdx(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="tl-body">
                          <div className="tl-top">
                            <StatusChip type={type} value={e.status} />
                            <span className="tl-when">{fmtWhen(e)}</span>
                            {mine && (
                              <span className="tl-tools">
                                <button className="icon-btn" onClick={() => { setEditIdx(e.i); setEditDraft({ status: e.status, remark: e.remark }); }} aria-label="Edit remark"><Pencil size={14} /></button>
                                <button className="icon-btn" onClick={() => dropEntry(e.i)} aria-label="Delete remark"><Trash2 size={14} /></button>
                              </span>
                            )}
                          </div>
                          {e.remark ? <p className="tl-remark">{e.remark}</p> : <p className="tl-remark muted">No remark</p>}
                          <p className="tl-by">by {e.by}{e.edited ? ' · edited' : ''}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {canEdit && (
            <section>
              <div className="drawer-h-row">
                <h3 className="drawer-h">Details</h3>
                {followup && !editingInfo && <button className="btn btn-ghost btn-sm" onClick={() => setEditingInfo(true)}><Pencil size={15} /> Edit</button>}
              </div>
              {editingInfo ? (
                <div className="edit-grid">
                  {editCols.map((c) => (
                    <div key={c} className={c === 'reason' || c === 'remarks' ? 'span2' : ''}>
                      <label className="label" htmlFor={`ed-${c}`}>{COL_LABELS[c]}</label>
                      {c === 'status' || c === 'type' ? (
                        <select id={`ed-${c}`} className="select" value={info[c] || ''} onChange={(e) => setInfo({ ...info, [c]: e.target.value })}>
                          {def.statuses.map((s2) => <option key={s2.value} value={s2.value}>{s2.label}</option>)}
                        </select>
                      ) : (
                        <input id={`ed-${c}`} className="input" value={info[c] ?? ''} inputMode={['qty', 'amount', 'phone'].includes(c) ? 'decimal' : undefined} onChange={(e) => setInfo({ ...info, [c]: e.target.value })} />
                      )}
                    </div>
                  ))}
                  <div className="span2" style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={saveInfo} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Save details</button>
                    {followup && <button className="btn btn-ghost btn-sm" onClick={() => { setInfo(rec); setEditingInfo(false); }}>Cancel</button>}
                  </div>
                </div>
              ) : (
                <div className="kv">
                  {editCols.map((c) => <div key={c}><span>{COL_LABELS[c]}</span><b>{String(rec[c] ?? '') || '—'}</b></div>)}
                </div>
              )}
            </section>
          )}

          {canEdit && (
            <button className="btn btn-ghost danger" onClick={del}><Trash2 size={16} /> Delete {followup ? 'this call and its history' : 'this entry'}</button>
          )}
        </div>
      </aside>
    </div>
  );
}
