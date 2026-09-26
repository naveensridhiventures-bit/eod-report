import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, History, LayoutDashboard, FileDown, LogOut, Contact, Settings, Users, ListChecks, Briefcase, TrendingUp, MoreHorizontal, X } from 'lucide-react';
import Login from './pages/Login';
import DailyEntry from './pages/DailyEntry';
import MyReports from './pages/MyReports';
import TeamDashboard from './pages/TeamDashboard';
import ReportsCenter from './pages/ReportsCenter';
import RecordsPage from './pages/RecordsPage';
import SettingsPage from './pages/SettingsPage';
import ContactsPage from './pages/ContactsPage';
import LeadsPage from './pages/LeadsPage';
import HiringPage from './pages/HiringPage';
import PerformancePage from './pages/PerformancePage';
import CallResultSheet from './components/CallResultSheet';
import { Avatar, Toast } from './components/ui';
import { fetchEmployees, IS_DEMO } from './lib/api';

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
  const [employees, setEmployees] = useState([]);
  const [page, setPage] = useState(null);
  const [toast, setToast] = useState(null);
  const [due, setDue] = useState(0);
  const [more, setMore] = useState(false);

  const notify = useCallback((message, type = 'ok') => setToast({ message, type, id: Date.now() }), []);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    fetchEmployees().then(setEmployees).catch((e) => notify(`Couldn’t load the team list: ${e.message}`, 'error'));
  }, [notify]);

  useEffect(() => {
    if (user && !page) setPage(user.viewOnly ? 'team' : 'today');
  }, [user, page]);

  useEffect(() => { window.scrollTo(0, 0); }, [page]);

  const handleLogin = (u) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
    setPage(u.viewOnly ? 'team' : 'today');
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
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
    (user.isAdmin || user.roles.some((r) => r === 'telecaller' || r === 'hiring')) && { key: 'contacts', label: 'Contacts & follow-ups', short: 'CRM', icon: Users },
    user.isAdmin && !user.viewOnly && { key: 'leads', label: 'Call queue', short: 'Leads', icon: ListChecks },
    (user.isAdmin || user.roles.includes('hiring')) && { key: 'hiring', label: 'Hiring pipeline', short: 'Hiring', icon: Briefcase },
    (user.isAdmin || user.roles.some((r) => r === 'telecaller' || r === 'hiring')) && { key: 'performance', label: 'Performance', short: 'Stats', icon: TrendingUp },
    !user.viewOnly && { key: 'history', label: 'My reports', short: 'Mine', icon: History },
    user.isAdmin && { key: 'team', label: 'Team dashboard', short: 'Team', icon: LayoutDashboard },
    (user.isAdmin || user.roles.some((r) => r === 'telecaller' || r === 'hiring')) && { key: 'records', label: 'Call data', short: 'Data', icon: Contact },
    { key: 'reports', label: 'Download reports', short: 'Download', icon: FileDown },
    user.isAdmin && { key: 'settings', label: 'Email settings', short: 'Settings', icon: Settings, desktopOnly: true }
  ].filter(Boolean);

  const props = { user, employees, notify, goTo: setPage };
  // Phone tab bar: the first four, the rest under "More"
  const mobileNav = nav.filter((n) => !n.desktopOnly);
  const primary = mobileNav.length > 5 ? mobileNav.slice(0, 4) : mobileNav;
  const extra = mobileNav.length > 5 ? [...mobileNav.slice(4), ...nav.filter((n) => n.desktopOnly)] : [];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Logo /><span className="brand-name">Team Pulse</span></div>
        <nav className="nav" aria-label="Main">
          {nav.map((n) => (
            <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)} aria-current={page === n.key ? 'page' : undefined}>
              <n.icon size={19} /> {n.label}
              {n.key === 'today' && due > 0 && <span className="nav-badge">{due}</span>}
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
        {IS_DEMO && <div className="demo-banner">Demo mode — reports are saved in this browser only. Add your Google Sheet link to go live.</div>}

        {page === 'today' && <DailyEntry {...props} onDue={setDue} />}
        {page === 'contacts' && <ContactsPage {...props} />}
        {page === 'leads' && <LeadsPage {...props} />}
        {page === 'hiring' && <HiringPage {...props} />}
        {page === 'performance' && <PerformancePage {...props} />}
        {page === 'history' && <MyReports {...props} />}
        {page === 'team' && <TeamDashboard {...props} />}
        {page === 'reports' && <ReportsCenter {...props} />}
        {page === 'records' && <RecordsPage {...props} />}
        {page === 'settings' && <SettingsPage {...props} />}
      </div>

      <nav className="tabbar" aria-label="Main">
        {primary.map((n) => (
          <button key={n.key} className={`tab ${page === n.key ? 'active' : ''}`} onClick={() => { setPage(n.key); setMore(false); }}>
            <span className="tab-icon"><n.icon size={20} />{n.key === 'today' && due > 0 && <span className="nav-badge">{due > 99 ? '99+' : due}</span>}</span> {n.short}
          </button>
        ))}
        {extra.length > 0 && (
          <button className={`tab ${extra.some((n) => n.key === page) ? 'active' : ''}`} onClick={() => setMore(true)} aria-haspopup="menu">
            <span className="tab-icon"><MoreHorizontal size={20} /></span> More
          </button>
        )}
      </nav>
      {more && (
        <div className="overlay" onClick={() => setMore(false)}>
          <div className="sheet more-sheet" role="menu" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-top"><h2 style={{ fontSize: 18 }}>More</h2><button className="icon-btn" onClick={() => setMore(false)} aria-label="Close"><X size={20} /></button></div>
            <div className="more-grid">
              {extra.map((n) => (
                <button key={n.key} role="menuitem" className={`more-item ${page === n.key ? 'active' : ''}`} onClick={() => { setPage(n.key); setMore(false); }}>
                  <n.icon size={22} /><span>{n.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {!user.viewOnly && <CallResultSheet user={user} notify={notify} />}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
