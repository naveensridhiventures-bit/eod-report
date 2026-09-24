import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ROLES } from '../config/team';
import { fetchReports } from '../lib/api';
import { sumMetrics } from '../lib/reports';
import { monthRange } from '../lib/date';
import { fmtMetric } from '../lib/format';
import { Loading, Empty, ROLE_ICONS } from '../components/ui';
import DayCard from '../components/DayCard';

export default function MyReports({ user, notify, goTo }) {
  const [ref, setRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [reports, setReports] = useState(null);
  const { from, to } = monthRange(ref);

  useEffect(() => {
    setReports(null);
    fetchReports({ employeeId: user.id, from, to })
      .then(setReports)
      .catch((e) => { setReports([]); notify(e.message, 'error'); });
  }, [user.id, from, to, notify]);

  const totals = useMemo(() => sumMetrics(reports || []), [reports]);
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
          <strong className="num" style={{ minWidth: 130, textAlign: 'center', fontSize: 17 }}>
            {ref.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </strong>
          <button className="btn btn-ghost btn-sm" onClick={() => shift(1)} disabled={isCurrent} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
      </div>

      {!reports ? <Loading /> : (
        <>
          <div className="stack" style={{ marginBottom: 20 }}>
            {user.roles.map((rk) => {
              const role = ROLES[rk];
              const Icon = ROLE_ICONS[rk];
              return (
                <div className="panel" key={rk}>
                  <div className="panel-head">
                    <h3><span className="section-icon" style={{ background: role.color, width: 30, height: 30 }}><Icon size={16} /></span>{role.label} this month</h3>
                    <span className="chip">{reports.length} days reported</span>
                  </div>
                  <div className="kv" style={{ marginBottom: 0 }}>
                    {role.metrics.map((m) => (
                      <div key={m.key}><span>{m.label}</span><b style={{ color: m.highlight === 'bad' ? 'var(--bad)' : m.highlight === 'good' ? 'var(--good)' : undefined }}>{fmtMetric(m, totals[m.key])}</b></div>
                    ))}
                  </div>
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
