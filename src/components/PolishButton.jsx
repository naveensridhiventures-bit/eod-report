import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Undo2 } from 'lucide-react';
import { polishTexts } from '../lib/api';

/**
 * ✨ English — turns Thanglish or rough notes into clear English.
 * Keeps the original for one tap of Undo.
 */
export default function PolishButton({ value, onChange, notify, compact }) {
  const [busy, setBusy] = useState(false);
  const [before, setBefore] = useState(null);

  useEffect(() => { if (before && value !== before.after) setBefore(null); }, [value, before]); // user edited → drop undo

  const run = async () => {
    const text = String(value || '').trim();
    if (!text) { notify?.('Type something first, then tap English.', 'error'); return; }
    setBusy(true);
    try {
      const res = await polishTexts([text]);
      const out = String(res.texts?.[0] || '').trim();
      if (!out || out === text) { notify?.('Looks good already.'); return; }
      onChange(out);
      setBefore({ original: value, after: out });
      if (res.engine === 'basic') notify?.('Basic conversion. Ask your admin to add an AI key for full sentences.');
    } catch (e) {
      notify?.(`Couldn’t convert: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (before) {
    return (
      <button type="button" className="polish-btn undo" onClick={() => { onChange(before.original); setBefore(null); }} title="Put back what you typed">
        <Undo2 size={14} /> {compact ? '' : 'Undo'}
      </button>
    );
  }
  return (
    <button type="button" className="polish-btn" onClick={run} disabled={busy} title="Convert Thanglish / fix English">
      {busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {compact ? '' : 'English'}
    </button>
  );
}
