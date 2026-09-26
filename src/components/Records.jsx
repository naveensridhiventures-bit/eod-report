import { useRef, useState } from 'react';
import { X, Upload, ClipboardPaste, Trash2, Loader2, Wand2, ArrowLeft, Tag } from 'lucide-react';
import { RECORD_TYPES, COL_LABELS, statusInfo } from '../config/team';
import { parseBulk, readSheetFile } from '../lib/parse';
import { saveRecords } from '../lib/api';
import { fmtDate } from '../lib/date';
import { inr } from '../lib/format';
import { fmtQty } from '../lib/stats';
import { recentTitles, rememberTitle } from '../lib/titles';

export function StatusChip({ type, value }) {
  const s = statusInfo(type, value);
  const cls = { good: 'chip-good', bad: 'chip-bad', gold: 'chip-gold', blue: 'chip-blue' }[s.tone] || '';
  return <span className={`chip ${cls}`}>{s.label}</span>;
}

function cellValue(type, col, r) {
  if (col === 'status' || col === 'type') return <StatusChip type={type} value={r[col]} />;
  if (col === 'title') return r.title ? <span className="title-tag">{r.title}</span> : '';
  if (col === 'amount') return r.amount ? inr(r.amount) : '';
  if (col === 'qty') return r.qty ? fmtQty(r.qty) : '';
  return r[col] || '';
}

/** Read-only table of saved records */
export function RecordTable({ type, rows, showWho, showDate, onDelete, limit }) {
  const cols = RECORD_TYPES[type].cols;
  const list = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="table-wrap">
      <table className="table rec-table">
        <thead>
          <tr>
            {showDate && <th>Date</th>}
            {showWho && <th>By</th>}
            {cols.map((c) => <th key={c} className={['qty', 'amount'].includes(c) ? 'r' : ''}>{COL_LABELS[c]}</th>)}
            {onDelete && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className={r.status === 'interested' ? 'hl' : ''}>
              {showDate && <td>{fmtDate(r.date, { day: 'numeric', month: 'short' })}</td>}
              {showWho && <td>{r.employee}</td>}
              {cols.map((c) => (
                <td key={c} className={`${['qty', 'amount'].includes(c) ? 'r' : ''} ${c === 'remarks' || c === 'reason' ? 'wrap' : ''}`}>
                  {c === 'phone' && r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : cellValue(type, c, r)}
                </td>
              ))}
              {onDelete && (
                <td className="r"><button className="icon-btn" onClick={() => onDelete(r)} aria-label={`Delete ${r.name}`}><Trash2 size={15} /></button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {limit && rows.length > limit && <p className="hint" style={{ padding: '10px 20px' }}>Showing {limit} of {rows.length}.</p>}
    </div>
  );
}

function PreviewSummary({ type, rows }) {
  const def = RECORD_TYPES[type];
  const noPhone = rows.filter((r) => !r.phone).length;
  const chips = [];
  if (def.statuses) {
    def.statuses.forEach((s) => {
      const n = rows.filter((r) => (type === 'customers' ? r.type : r.status) === s.value).length;
      if (n) chips.push(<StatusChip key={s.value} type={type} value={s.value} />, <b key={`${s.value}n`} style={{ marginRight: 8 }}>{n}</b>);
    });
  }
  if (type === 'orders' || type === 'cancellations') {
    const amt = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    chips.push(<span key="amt" className="chip">Total {inr(amt)}</span>);
  }
  return (
    <div className="preview-sum">
      <strong>{rows.length} {def.noun} found</strong>
      {chips}
      {noPhone > 0 && <span className="chip chip-bad">{noPhone} without number</span>}
    </div>
  );
}

/** Paste / upload → check → save */
export function BulkImport({ type, date, user, onClose, onSaved, notify }) {
  const def = RECORD_TYPES[type];
  const [title, setTitle] = useState(() => recentTitles(type)[0] || ''); // last-used title is filled in for you
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const titleRef = useRef(null);

  const suggestions = [...new Set([...recentTitles(type), ...(def.titles || [])])].slice(0, 8);
  const needTitle = () => {
    if (title.trim()) return false;
    notify('Add a title for this list first — e.g. Driver, Sales, Distributor hiring.', 'error');
    titleRef.current?.focus();
    return true;
  };
  const stamp = (parsed) => parsed.map((r) => ({ ...r, title: r.title || title.trim() }));

  const read = (src = text) => {
    if (needTitle()) return;
    const parsed = parseBulk(type, src);
    if (!parsed.length) { notify('No rows found. Put one entry per line with a name and number.', 'error'); return; }
    setRows(stamp(parsed));
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || needTitle()) return;
    try {
      const parsed = parseBulk(type, await readSheetFile(file));
      if (!parsed.length) { notify('No rows found in that file. Check it has a Name and Number column.', 'error'); return; }
      setRows(stamp(parsed));
    } catch (err) {
      notify(`Couldn’t read that file: ${err.message}`, 'error');
    }
  };

  // Changing the title on the preview screen updates every row that still has the old one
  const retitle = (v) => {
    const old = title.trim();
    setTitle(v);
    if (rows) setRows((rs) => rs.map((r) => (r.title === old || !r.title ? { ...r, title: v.trim() } : r)));
  };

  const edit = (i, col, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [col]: v } : r)));
  const remove = (i) => setRows((rs) => rs.filter((_, j) => j !== i));

  const save = async () => {
    if (rows.some((r) => !String(r.title || '').trim())) { notify('Every row needs a title.', 'error'); return; }
    setSaving(true);
    try {
      const clean = rows.map((r) => ({ ...r, title: String(r.title).trim(), qty: r.qty !== undefined ? Number(r.qty) || 0 : undefined, amount: r.amount !== undefined ? Number(r.amount) || 0 : undefined }));
      await saveRecords(type, clean, { date, employeeId: user.id, employee: user.name });
      rememberTitle(type, title.trim());
      notify(`${rows.length} ${def.noun} saved under “${title.trim()}”`);
      onSaved();
      onClose();
    } catch (e) {
      notify(`Not saved: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const titleBox = (
    <div className="title-box">
      <label className="label" htmlFor="bi-title-input"><Tag size={15} /> List title <span className="req">required</span></label>
      <input id="bi-title-input" ref={titleRef} className="input title-input" value={title} onChange={(e) => retitle(e.target.value)}
        placeholder={def.titleHint} autoFocus={!rows && !title} maxLength={60} />
      {!rows && suggestions.length > 0 && (
        <div className="title-chips">
          {suggestions.map((t) => (
            <button key={t} type="button" className={`chip chip-btn ${title === t ? 'on' : ''}`} onClick={() => retitle(t)}>{t}</button>
          ))}
        </div>
      )}
      <p className="hint">Every row in this list is saved under this title, so you can filter and report by it later.</p>
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet-wide" role="dialog" aria-modal="true" aria-labelledby="bi-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top">
          <div>
            <h2 id="bi-title">{def.verb}</h2>
            <p className="muted" style={{ fontSize: 14 }}>For {fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        {titleBox}

        {!rows ? (
          <>
            <p style={{ fontSize: 14, margin: '16px 0 10px' }}>
              Paste your list, one per line — <b>name, number, then {def.cols.filter((c) => !['title', 'name', 'phone'].includes(c)).map((c) => COL_LABELS[c].toLowerCase()).join(', ')}</b>.
              Copy straight from Excel, WhatsApp or notes. {def.statuses && type !== 'customers' && 'The status is picked up from your remarks; you can change it on the next screen.'}
            </p>
            <textarea className="textarea mono" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={def.example} autoFocus={!!title}
              onPaste={(e) => {
                // Pasting into an empty box reads the list straight away — no extra tap
                const pasted = e.clipboardData.getData('text');
                if (!text.trim() && pasted.trim() && title.trim()) { e.preventDefault(); setText(pasted); read(pasted); }
              }} />
            <div className="bi-actions">
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={17} /> Upload Excel / CSV</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={upload} />
              <button className="btn btn-primary" onClick={() => read()} disabled={!text.trim()}><Wand2 size={17} /> Read list</button>
            </div>
            <p className="hint">Excel files need a header row, e.g. {def.cols.filter((c) => c !== 'title').map((c) => COL_LABELS[c].replace(' (₹)', '')).join(' | ')}.</p>
          </>
        ) : (
          <>
            <div style={{ marginTop: 14 }}><PreviewSummary type={type} rows={rows} /></div>
            <div className="table-wrap bi-table">
              <table className="table">
                <thead><tr><th>#</th>{def.cols.map((c) => <th key={c}>{COL_LABELS[c]}</th>)}<th aria-label="Remove" /></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={r.status === 'interested' || r.status === 'scheduled' ? 'hl' : ''}>
                      <td className="muted">{i + 1}</td>
                      {def.cols.map((c) => (
                        <td key={c}>
                          {(c === 'status' || c === 'type') ? (
                            <select className="cell-input" value={r[c]} onChange={(e) => edit(i, c, e.target.value)}>
                              {def.statuses.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                            </select>
                          ) : (
                            <input className={`cell-input ${c}`} value={r[c] ?? ''} onChange={(e) => edit(i, c, e.target.value)} inputMode={['qty', 'amount', 'phone'].includes(c) ? 'decimal' : undefined} />
                          )}
                        </td>
                      ))}
                      <td><button className="icon-btn" onClick={() => remove(i)} aria-label={`Remove row ${i + 1}`}><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bi-actions">
              <button className="btn btn-ghost" onClick={() => setRows(null)}><ArrowLeft size={17} /> Edit pasted text</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !rows.length}>
                {saving ? <Loader2 size={17} className="spin" /> : <ClipboardPaste size={17} />} Save {rows.length} {def.noun}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
