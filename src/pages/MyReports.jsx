import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ROLES } from '../config/team';
import { fetchBundle } from '../lib/api';
import { statsFor } from '../lib/stats';
import { monthRange } from '../lib/date';
import { Loading, Empty, ROLE_ICONS } from '../components/ui';
import DayCard from '../components/DayCard';
import { Tiles } from './DailyEntry';

const MONTH_TILES = {
  telecaller: [
    { key: 'calls_made', label: 'Calls made' },
    { key: 'interested_calls', label: 'Interested', tone: 'good' },
    { key: 'orders', label: 'Orders', tone: 'good' },
    { key: 'sales_value', label: 'Sales', money: true, tone: 'good' },
    { key: 'sales_kg', label: 'Sold (kg)' },
    { key: 'sales_l', label: 'Sold (L)' },
    { key: 'orders_cancelled', label: 'Cancelled', tone: 'bad' },
    { key: 'customers_total', label: 'My customers' },
    { key: 'customers_existing', label: 'Existing' },
    { key: 'customers_new', label: 'New' }
  ],
  hiring: [
    { key: 'hr_calls', label: 'Calls made' },
    { key: 'scheduled', label: 'Scheduled', tone: 'good' },
    { key: 'joined', label: 'Joined', tone: 'good' },
    { key: 'drivers_arranged', label: 'Drivers arranged', tone: 'good' },
    { key: 'relieved', label: 'Relieved', tone: 'bad' }
  ]
};

export default function MyReports({ user, notify, goTo }) {
  const [ref, setRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [reports, setReports] = useState(null);
  const [records, setRecords] = useState(null);
  const { from, to } = monthRange(ref);

  useEffect(() => {
    let live = true;
    const apply = ({ reports: rep, records: rec }) => { if (live) { setReports(rep); setRecords(rec); } };
    setReports(null);
    fetchBundle({ employeeId: user.id, from, to }, apply)
      .then(apply)
      .catch((e) => { if (live) { setReports([]); setRecords({}); notify(e.message, 'error'); } });
    return () => { live = false; };
  }, [user.id, from, to, notify]);

  const stats = useMemo(() => statsFor(records || {}, { from, to }), [records, from, to]);
  const isCurrent = ref.getMonth() === new Date().getMonth() && ref.getFullYear() === new Date().getFullYear();
  const shift = (n) => setRef(new Date(ref.getFullYear(), ref.getMonth() + n, 1));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My reports</h1>
          <p>Your month at a glance, and every day you’ve logged.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <strong className="num" style={{ minWidth: 130, textAlign: 'center', fontSize: 17 }}>{ref.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
          <button className="btn btn-ghost btn-sm" onClick={() => shift(1)} disabled={isCurrent} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
      </div>

      {!reports ? <Loading /> : (
        <>
          <div className="stack" style={{ marginBottom: 20 }}>
            {user.roles.filter((rk) => MONTH_TILES[rk]).map((rk) => {
              const Icon = ROLE_ICONS[rk];
              return (
                <div className="panel" key={rk}>
                  <div className="panel-head">
                    <h3><span className="section-icon" style={{ background: ROLES[rk].color, width: 30, height: 30 }}><Icon size={16} /></span>{ROLES[rk].label} this month</h3>
                    <span className="chip">{reports.length} days reported</span>
                  </div>
                  <Tiles items={MONTH_TILES[rk]} stats={stats} />
                </div>
              );
            })}
          </div>

          <h2 style={{ marginBottom: 12 }}>Daily log</h2>
          {reports.length === 0
            ? <div className="panel"><Empty title="No reports this month" action={isCurrent && <button className="btn btn-primary" onClick={() => goTo('today')}>Write today’s report</button>}>Reports you submit will appear here.</Empty></div>
            : reports.map((r) => <DayCard key={r.id} report={r} />)}
        </>
      )}
    </div>
  );
}
