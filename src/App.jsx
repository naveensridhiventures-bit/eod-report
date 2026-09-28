import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, History, LayoutDashboard, FileDown, LogOut, Contact, Settings, BellRing } from 'lucide-react';
import Login from './pages/Login';
import DailyEntry from './pages/DailyEntry';
import MyReports from './pages/MyReports';
import TeamDashboard from './pages/TeamDashboard';
import ReportsCenter from './pages/ReportsCenter';
import RecordsPage from './pages/RecordsPage';
import SettingsPage from './pages/SettingsPage';
import { Avatar, Toast } from './components/ui';
import { fetchEmployees, fetchReports, peekEmployees, clearCache, IS_DEMO } from './lib/api';
import { REMINDER_HOUR } from './config/team';
import { todayISO } from './lib/date';

const SESSION_KEY = 'pulse_user_v1';

function Logo() {
  return (
    <span className="brand-mark">
      <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M6 34h12l5-13 9 25 6-17 4 5h16" fill="none" stroke="#F4A93B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  });
  const [employees, setEmployees] = useState(() => peekEmployees()); // last known team list, so sign-in shows instantly
  const [page, setPageRaw] = useState(null);
  const [pageParams, setPageParams] = useState(null);
  const setPage = useCallback((p, params = null) => { setPageParams(params); setPageRaw(p); window.scrollTo(0, 0); }, []);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, type = 'ok') => setToast({ message, type, id: Date.now() }), []);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    fetchEmployees({ onCache: setEmployees }).then(setEmployees).catch((e) => notify(`Couldn’t load the team list: ${e.message}`, 'error'));
  }, [notify]);

  useEffect(() => {
    if (user && !page) setPage(user.viewOnly ? 'team' : 'today');
  }, [user, page]);

  // In-app reminder: after the reminder hour, staff who haven't submitted see a banner on every page
  const [submittedToday, setSubmittedToday] = useState(true);
  useEffect(() => {
    if (!user || user.viewOnly) return undefined;
    const check = () => fetchReports({ employeeId: user.id, from: todayISO(), to: todayISO() })
      .then((list) => setSubmittedToday(list.length > 0)).catch(() => {});
    check();
    const id = setInterval(check, 300000);
    return () => clearInterval(id);
  }, [user, page]);

  const handleLogin = (u) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
    setPage(u.viewOnly ? 'team' : 'today');
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    clearCache(true); // nothing from this person's session stays on the device
    setUser(null);
    setPage(null);
  };

  if (!user) {
    return (
      <>
        <Login employees={employees} onLogin={handleLogin} />
        <Toast toast={toast} onDone={clearToast} />
      </>
    );
  }

  const nav = [
    !user.viewOnly && { key: 'today', label: 'Today’s report', short: 'Today', icon: CalendarCheck2 },
    !user.viewOnly && { key: 'history', label: 'My reports', short: 'Mine', icon: History },
    user.isAdmin && { key: 'team', label: 'Team dashboard', short: 'Team', icon: LayoutDashboard },
    (user.isAdmin || user.roles.some((r) => r === 'telecaller' || r === 'hiring')) && { key: 'records', label: 'Calls & follow-ups', short: 'Calls', icon: Contact },
    { key: 'reports', label: 'Download reports', short: 'Download', icon: FileDown },
    user.isAdmin && { key: 'settings', label: 'Email settings', short: 'Settings', icon: Settings, desktopOnly: true }
  ].filter(Boolean);

  const props = { user, employees, notify, goTo: setPage, params: pageParams };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Logo /><span className="brand-name">Team Pulse</span></div>
        <nav className="nav" aria-label="Main">
          {nav.map((n) => (
            <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)} aria-current={page === n.key ? 'page' : undefined}>
              <n.icon size={19} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <Avatar person={user} />
            <div><div className="me-name">{user.name}</div><div className="me-role">{user.title}</div></div>
          </div>
          <button className="logout" onClick={logout}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="brand"><Logo /><span className="brand-name">Team Pulse</span></div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {user.isAdmin && <button className="logout" onClick={() => setPage('settings')} aria-label="Email settings"><Settings size={19} /></button>}
            <button className="logout" onClick={logout} aria-label="Sign out"><Avatar person={user} size={30} /><LogOut size={16} /></button>
          </span>
        </header>
        {!user.viewOnly && !submittedToday && page !== 'today' && new Date().getHours() >= REMINDER_HOUR && new Date().getDay() !== 0 && (
          <div className="due-banner">
            <span><BellRing size={17} style={{ verticalAlign: -3, marginRight: 6 }} /><b>Today’s report isn’t submitted yet.</b> Please finish it before you leave.</span>
            <button className="btn btn-primary btn-sm" onClick={() => setPage('today')}>Submit now</button>
          </div>
        )}
        {IS_DEMO && <div className="demo-banner">Demo mode — reports are saved in this browser only. Add your Google Sheet link to go live.</div>}

        {page === 'today' && <DailyEntry {...props} />}
        {page === 'history' && <MyReports {...props} />}
        {page === 'team' && <TeamDashboard {...props} />}
        {page === 'reports' && <ReportsCenter {...props} />}
        {page === 'records' && <RecordsPage key={JSON.stringify(pageParams)} {...props} />}
        {page === 'settings' && <SettingsPage {...props} />}
      </div>

      <nav className="tabbar" aria-label="Main">
        {nav.filter((n) => !n.desktopOnly).map((n) => (
          <button key={n.key} className={`tab ${page === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)}>
            <n.icon size={20} /> {n.short}
          </button>
        ))}
      </nav>
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
