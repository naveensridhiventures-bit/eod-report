import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageDown, FileDown, CalendarPlus, Share2, MessageCircle, Clock3, Loader2, Check } from 'lucide-react';
import { RECORD_TYPES } from '../config/team';
import { fetchRecords, updateRecord } from '../lib/api';
import { openFollowUps, fuDate, fuTime, timeLabel, followUpPrompt, calendarLink, downloadIcs, waLink, bucketOf } from '../lib/followup';
import { personaUri } from '../lib/persona';
import { RECORDS_SAVED, onEvent } from '../lib/events';
import { toISO, fromISO, addDays, todayISO } from '../lib/date';
import { Loading, Segmented } from '../components/ui';
import Persona from '../components/Persona';
import CallButton from '../components/CallButton';
import DateTimeSheet from '../components/DateTimeSheet';
import { nextSteps } from '../lib/followup';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const statusLabel = (type, v) => RECORD_TYPES[type]?.statuses?.find((s) => s.value === v)?.label || v;
const whatFor = (r) => followUpPrompt(r.type_, r.status) || (r.type_ === 'hiring' ? 'HR follow-up' : r.status === 'interested' ? 'Interested — close the order' : 'Call back');

function monthCells(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toISO(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  while (cells.length % 7) cells.push(null);
  return cells;
}

// ── Poster: a shareable picture of the month with every person on their date ──
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

async function drawPoster({ month, byDay, who, company }) {
  const cells = monthCells(month);
  const rows = cells.length / 7;
  const W = 1800, headH = 190, dayH = 44, pad = 40, cellW = (W - pad * 2) / 7, cellH = 218;
  const H = headH + dayH + rows * cellH + pad + 50;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px "Plus Jakarta Sans", "Segoe UI", Roboto, Arial, sans-serif`;

  // background + header
  x.fillStyle = '#F2F5F3'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, headH);
  g.addColorStop(0, '#0E3B3A'); g.addColorStop(1, '#155553');
  x.fillStyle = g; x.fillRect(0, 0, W, headH);
  x.fillStyle = '#F4A93B'; x.fillRect(0, headH - 8, W, 8);
  x.fillStyle = '#F4A93B'; x.font = font(800, 24); x.fillText(`${company.toUpperCase()} · FOLLOW-UP CALENDAR`, pad, 58);
  x.fillStyle = '#FFFFFF'; x.font = font(800, 60);
  x.fillText(month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), pad, 128);
  const total = Object.values(byDay).reduce((a, l) => a + l.length, 0);
  x.font = font(600, 26); x.fillStyle = 'rgba(255,255,255,.8)';
  x.fillText(`${who} · ${total} scheduled`, pad, 166);

  // legend
  x.textAlign = 'right'; x.font = font(700, 22);
  [['#2E9E6A', 'Sales'], ['#3D7DD8', 'Hiring'], ['#C23B33', 'Overdue']].forEach(([col, l], i) => {
    const lx = W - pad - i * 150;
    x.fillStyle = 'rgba(255,255,255,.9)'; x.fillText(l, lx, 128);
    x.fillStyle = col; x.beginPath(); x.arc(lx - x.measureText(l).width - 16, 120, 9, 0, Math.PI * 2); x.fill();
  });
  x.textAlign = 'left';

  // weekday header
  x.font = font(800, 20); x.fillStyle = '#5E706E';
  WEEK.forEach((d, i) => x.fillText(d.toUpperCase(), pad + i * cellW + 14, headH + 32));

  // images for everyone on the poster
  const faces = {};
  await Promise.all(Object.values(byDay).flat().map(async (r) => { faces[r.id] = await loadImg(personaUri(`${r.phone || ''}|${r.name || ''}`)); }));

  const today = todayISO();
  cells.forEach((iso, i) => {
    const cx = pad + (i % 7) * cellW, cy = headH + dayH + Math.floor(i / 7) * cellH;
    const rr = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
    rr(cx + 4, cy + 4, cellW - 8, cellH - 8, 16);
    if (!iso) { x.fillStyle = 'rgba(0,0,0,.02)'; x.fill(); return; }
    const list = byDay[iso] || [];
    const late = iso < today && list.length;
    x.fillStyle = iso === today ? '#FFF6E6' : late ? '#FDF0EE' : '#FFFFFF'; x.fill();
    x.lineWidth = iso === today ? 3 : 1.5; x.strokeStyle = iso === today ? '#F4A93B' : '#DCE5E1'; x.stroke();
    x.fillStyle = fromISO(iso).getDay() === 0 ? '#A3B1AE' : '#1A2B2A'; x.font = font(800, 26);
    x.fillText(String(fromISO(iso).getDate()), cx + 18, cy + 38);
    if (list.length) {
      x.textAlign = 'right'; x.font = font(700, 18); x.fillStyle = '#5E706E';
      x.fillText(`${list.length}`, cx + cellW - 20, cy + 36); x.textAlign = 'left';
    }
    // up to 3 people with face + name + time
    list.slice(0, 3).forEach((r, k) => {
      const py = cy + 56 + k * 40;
      const img = faces[r.id];
      const col = late ? '#C23B33' : r.type_ === 'hiring' ? '#3D7DD8' : '#2E9E6A';
      x.save(); x.beginPath(); x.arc(cx + 34, py + 14, 17, 0, Math.PI * 2); x.closePath(); x.clip();
      if (img) x.drawImage(img, cx + 17, py - 3, 34, 34);
      x.restore();
      x.beginPath(); x.arc(cx + 34, py + 14, 17, 0, Math.PI * 2); x.lineWidth = 3; x.strokeStyle = col; x.stroke();
      x.fillStyle = '#1A2B2A'; x.font = font(700, 17);
      let name = r.name || r.phone;
      const maxW = cellW - 78;
      while (x.measureText(name).width > maxW && name.length > 3) name = `${name.slice(0, -2)}…`;
      x.fillText(name, cx + 58, py + 12);
      x.fillStyle = col; x.font = font(600, 14);
      x.fillText(fuTime(r.fu) ? timeLabel(fuTime(r.fu)) : r.type_ === 'hiring' ? 'Interview / HR' : 'Call', cx + 58, py + 30);
    });
    if (list.length > 3) {
      x.fillStyle = '#5E706E'; x.font = font(700, 16);
      x.fillText(`+${list.length - 3} more`, cx + 20, cy + cellH - 16);
    }
  });
  x.fillStyle = '#8A9A97'; x.font = font(600, 18);
  x.fillText(`Made with Team Pulse · ${new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`, pad, H - 22);
  return c;
}

function DayItem({ r, today, onMoved, notify }) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const late = bucketOf(r.fu, today) === 'overdue';
  const move = async (v) => {
    setPicking(false); setBusy(true);
    try { await updateRecord(r.type_, r.id, { followUp: v }); onMoved(r, v); notify(v === 'done' ? 'Closed' : 'Rescheduled'); }
    catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <div className={`cal-item ${busy ? 'busy' : ''}`}>
      <Persona name={r.name} phone={r.phone} size={52} ring={late ? 'late' : r.type_ === 'hiring' ? 'hiring' : 'sales'} />
      <div className="cal-item-main">
        <div className="cal-item-name">{r.name || r.phone}{r.title && <span className="title-tag">{r.title}</span>}</div>
        <div className={`cal-item-when ${late ? 'late' : ''}`}><Clock3 size={13} /> {fuTime(r.fu) ? timeLabel(fuTime(r.fu)) : 'Any time'} · {whatFor(r)}</div>
        <div className="cal-item-meta">{statusLabel(r.type_, r.status)}{r.remarks ? ` — ${r.remarks}` : ''}{r.employee ? ` · ${r.employee}` : ''}</div>
        <div className="cal-item-actions">
          {r.phone && <CallButton className="btn btn-primary btn-sm" call={{ type: r.type_, name: r.name, phone: r.phone, title: r.title, options: nextSteps(r.type_, r.status), prev: r.status }} />}
          {r.phone && <a className="icon-btn" href={waLink(r.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={17} /></a>}
          <a className="chip chip-btn" href={calendarLink(r, r.fu)} target="_blank" rel="noreferrer"><CalendarPlus size={13} /> Google Calendar</a>
          <button className="chip chip-btn" onClick={() => setPicking(true)}>Reschedule</button>
          <button className="chip chip-btn" onClick={() => move('done')}><Check size={13} /> Close</button>
        </div>
      </div>
      {picking && <DateTimeSheet value={r.fu} title={`Move ${r.name || r.phone} to…`} onClose={() => setPicking(false)} onPick={move} />}
    </div>
  );
}

export default function CalendarPage({ user, employees, notify }) {
  const today = todayISO();
  const [who, setWho] = useState(user.isAdmin ? 'all' : user.id);
  const [records, setRecords] = useState(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState(today);
  const [kind, setKind] = useState('all');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setRecords(null);
    fetchRecords({ types: ['calls', 'hiring'], from: toISO(addDays(new Date(), -60)), employeeId: who === 'all' ? undefined : who })
      .then(setRecords).catch((e) => { notify(`Couldn’t load: ${e.message}`, 'error'); setRecords({ calls: [], hiring: [] }); });
  }, [who, notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => onEvent(RECORDS_SAVED, ({ type, records: recs }) => {
    if (type === 'calls' || type === 'hiring') setRecords((all) => (all ? { ...all, [type]: [...recs, ...(all[type] || [])] } : all));
  }), []);

  const items = useMemo(() => (records ? openFollowUps(records) : []).filter((r) => kind === 'all' || (kind === 'hiring' ? r.type_ === 'hiring' : r.type_ === 'calls')), [records, kind]);
  const byDay = useMemo(() => {
    const m = {};
    items.forEach((r) => { const d = fuDate(r.fu); (m[d] = m[d] || []).push(r); });
    Object.values(m).forEach((l) => l.sort((a, b) => (fuTime(a.fu) || '99') < (fuTime(b.fu) || '99') ? -1 : 1));
    return m;
  }, [items]);
  const overdue = items.filter((r) => fuDate(r.fu) < today);
  const cells = monthCells(month);
  const monthDays = Object.fromEntries(Object.entries(byDay).filter(([d]) => d.slice(0, 7) === toISO(month).slice(0, 7)));
  const selList = sel === 'overdue' ? overdue : byDay[sel] || [];
  const whoName = who === 'all' ? 'Whole team' : employees.find((e) => e.id === who)?.name || user.name;

  const onMoved = (r, v) => setRecords((all) => ({ ...all, [r.type_]: all[r.type_].map((x) => (x.id === r.id ? { ...x, followUp: v } : x)) }));

  const poster = async () => drawPoster({ month, byDay: monthDays, who: whoName, company: 'Team Pulse' });
  const fileName = `schedule-${whoName.toLowerCase().replace(/\s+/g, '-')}-${toISO(month).slice(0, 7)}`;

  const downloadPng = async () => {
    setBusy('png');
    try {
      const c = await poster();
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png'); a.download = `${fileName}.png`; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { notify(`Couldn’t make the picture: ${e.message}`, 'error'); }
    finally { setBusy(''); }
  };
  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      const c = await poster();
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      const scale = Math.min(pw / c.width, ph / c.height);
      doc.addImage(c.toDataURL('image/png'), 'PNG', (pw - c.width * scale) / 2, (ph - c.height * scale) / 2, c.width * scale, c.height * scale);
      doc.save(`${fileName}.pdf`);
    } catch (e) { notify(`Couldn’t make the PDF: ${e.message}`, 'error'); }
    finally { setBusy(''); }
  };
  const canShare = typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  const share = async () => {
    setBusy('share');
    try {
      const c = await poster();
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      await navigator.share({ files: [new File([blob], `${fileName}.png`, { type: 'image/png' })], title: `Schedule · ${whoName}` });
    } catch (e) { if (e.name !== 'AbortError') notify(e.message, 'error'); }
    finally { setBusy(''); }
  };
  const addAll = () => {
    const upcoming = items.filter((r) => fuDate(r.fu) >= today);
    if (!upcoming.length) { notify('Nothing upcoming to add.', 'error'); return; }
    downloadIcs(upcoming);
    notify(/android/i.test(navigator.userAgent)
      ? 'Downloaded. On Android, open it with Samsung/phone Calendar — or use “Google Calendar” on each person.'
      : 'Downloaded. Open the file to add everything to your calendar.');
  };

  if (!records) return <div className="page"><Loading text="Loading your calendar…" /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Calendar</h1>
          <p>Everyone you need to call, on the day you planned — tap a day to see who, and call from there.</p>
        </div>
        <div className="cal-tools">
          {user.isAdmin && (
            <select className="input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose calendar">
              <option value="all">Whole team</option>
              {employees.filter((e) => !e.viewOnly && e.roles.some((r) => r === 'telecaller' || r === 'hiring')).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <Segmented value={kind} onChange={setKind} label="Show" options={[{ value: 'all', label: 'All' }, { value: 'sales', label: 'Sales' }, { value: 'hiring', label: 'Hiring' }]} />
        </div>
      </div>

      <div className="cal-downloads">
        <button className="btn btn-primary" onClick={downloadPng} disabled={!!busy}>{busy === 'png' ? <Loader2 size={17} className="spin" /> : <ImageDown size={17} />} Download picture</button>
        <button className="btn btn-ghost" onClick={downloadPdf} disabled={!!busy}>{busy === 'pdf' ? <Loader2 size={17} className="spin" /> : <FileDown size={17} />} PDF</button>
        {canShare && <button className="btn btn-wa" onClick={share} disabled={!!busy}>{busy === 'share' ? <Loader2 size={17} className="spin" /> : <Share2 size={17} />} Share</button>}
        <button className="btn btn-ghost" onClick={addAll}><CalendarPlus size={17} /> Add all to phone calendar</button>
      </div>

      <div className="cal-layout">
        <div className="panel cal-month">
          <div className="cal-head">
            <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={20} /></button>
            <h2>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
            <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={20} /></button>
            <button className="chip chip-btn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(today); }}>Today</button>
            {overdue.length > 0 && <button className={`chip chip-btn cal-late-chip ${sel === 'overdue' ? 'on' : ''}`} onClick={() => setSel('overdue')}>{overdue.length} overdue</button>}
          </div>
          <div className="cal-grid">
            {WEEK.map((w) => <span key={w} className="cal-w">{w}</span>)}
            {cells.map((iso, i) => {
              if (!iso) return <span key={`e${i}`} className="cal-cell empty" />;
              const list = byDay[iso] || [];
              const late = iso < today && list.length > 0;
              return (
                <button key={iso} className={`cal-cell ${iso === today ? 'today' : ''} ${iso === sel ? 'sel' : ''} ${late ? 'late' : ''} ${fromISO(iso).getDay() === 0 ? 'sun' : ''}`} onClick={() => setSel(iso)}
                  aria-label={`${fromISO(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}: ${list.length} scheduled`}>
                  <span className="cal-num">{fromISO(iso).getDate()}</span>
                  {list.length > 0 && (
                    <span className="cal-faces">
                      {list.slice(0, 3).map((r) => <Persona key={r.id} name={r.name} phone={r.phone} size={26} ring={late ? 'late' : r.type_ === 'hiring' ? 'hiring' : 'sales'} />)}
                      {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
                    </span>
                  )}
                  {list.length > 0 && <span className={`cal-count ${late ? 'late' : ''}`}>{list.length}</span>}
                  {list.length > 0 && <span className="cal-names">{list.slice(0, 2).map((r) => (r.name || r.phone).split(' ')[0]).join(', ')}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel cal-day">
          <h3>{sel === 'overdue' ? 'Overdue' : fromISO(sel).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{selList.length ? `${selList.length} to call` : 'Nothing planned — enjoy the free time.'}</p>
          {selList.map((r) => <DayItem key={r.id} r={r} today={today} onMoved={onMoved} notify={notify} />)}
        </div>
      </div>
    </div>
  );
}
