import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/useAuth';
import { supabase } from './lib/supabaseClient';
import Login from './pages/Login';
import Home from './pages/Home';
import Patients from './pages/Patients';
import PatientProfile from './pages/PatientProfile';
import Billings from './pages/Billings';
import Hub from './pages/Hub';
import Expenses from './pages/Expenses';
import Settings from './pages/Settings';

const PAGE_TITLES = {
  '/home': 'Home',
  '/patients': 'Patients',
  '/billings': 'Billings',
  '/hub': 'Hub',
  '/expenses': 'Expenses',
  '/settings': 'Settings',
};

function pageTitle(pathname) {
  if (pathname.startsWith('/patients')) return 'Patients';
  return PAGE_TITLES[pathname] || 'ClinicPilot';
}

export default function App() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="auth-loading">Loading ClinicPilot…</div>;
  }
  if (!session) return <Login />;
  if (!profile) {
    return (
      <div className="auth-loading">
        Your account isn't set up yet.
        <br />
        Ask Dr. Faseeh to add you in <code>staff_profiles</code>.
        <br />
        <button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => supabase.auth.signOut()}>
          Sign Out
        </button>
      </div>
    );
  }

  const isAdmin = profile.role === 'admin';
  const canSeeExpenses = isAdmin;
  const navClass = ({ isActive }) => 'nav-btn' + (isActive ? ' active' : '');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src={`${import.meta.env.BASE_URL}fdc-logo.png`} style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 4 }} />
            <div className="sidebar-brand__text">
              <span className="sidebar-brand__title">ClinicPilot</span>
              <span className="sidebar-brand__subtitle">Faseeh Dental Clinic</span>
            </div>
          </div>
          <nav className="sidebar-main" aria-label="Primary navigation">
            <NavLink to="/home" className={navClass}><span className="nav-btn__label">Home</span></NavLink>
            <NavLink to="/patients" className={navClass}><span className="nav-btn__label">Patients</span></NavLink>
            <NavLink to="/billings" className={navClass}><span className="nav-btn__label">Billings</span></NavLink>
            {isAdmin && <NavLink to="/hub" className={navClass}><span className="nav-btn__label">Hub</span></NavLink>}
            {canSeeExpenses && <NavLink to="/expenses" className={navClass}><span className="nav-btn__label">Expenses</span></NavLink>}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-footer">
            <NavLink to="/settings" className={navClass}><span className="nav-btn__label">Settings</span></NavLink>
            <button type="button" className="sign-out-btn" onClick={() => supabase.auth.signOut()}>Sign Out</button>
          </div>
          <div className="sidebar-powered">
            Powered by<br />
            <span style={{ color: '#009688', fontWeight: 600 }}>CyberHealth Solutions</span><br />
            <span style={{ opacity: 0.6 }}>Meesum Mir</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1 className="topbar-title">{pageTitle(location.pathname)}</h1>
          <div className="topbar-user">
            <span className="topbar-user__name">{profile.full_name}</span>
            <span className="topbar-user__role">{profile.role}</span>
          </div>
        </header>
        <div className="workspace">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home profile={profile} />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/:id" element={<PatientProfile profile={profile} />} />
            <Route path="/billings" element={<Billings profile={profile} />} />
            <Route path="/hub" element={isAdmin ? <Hub profile={profile} /> : <Navigate to="/home" replace />} />
            <Route path="/expenses" element={canSeeExpenses ? <Expenses profile={profile} /> : <Navigate to="/home" replace />} />
            <Route path="/settings" element={<Settings profile={profile} isAdmin={isAdmin} />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
