import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', exact: true },
  { label: 'Setup', section: true },
  { to: '/teachers', label: '1. Teaching Staff' },
  { to: '/attendants', label: '2. Attendants' },
  { to: '/pairs', label: '3. Invig. Pairs' },
  { to: '/venues', label: '4. Exam Venues' },
  { to: '/exams', label: '5. Exam Timetable' },
  { to: '/import-timetable', label: '6. Import Timetable (AI)' },
  { label: 'Scheduling', section: true },
  { to: '/workload', label: 'Live Workload' },
  { to: '/schedule', label: 'Generate Scheme' },
  { label: 'On Exam Day', section: true },
  { to: '/absences', label: 'Absences & Replacements' },
  { label: 'Admin', section: true },
  { to: '/users', label: 'Manage Users' },
  { to: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        Invigilation Scheme
        <small>Curepipe College</small>
      </div>
      <div className="sidebar-nav">
        {NAV.map((item, i) =>
          item.section ? (
            <div key={i} className="section-label">{item.label}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              {item.label}
            </NavLink>
          )
        )}
        <button onClick={handleLogout} style={{ marginTop: 8 }}>Sign out</button>
      </div>
      <div className="sidebar-user">
        <strong>{user?.name}</strong>
        <span className={`badge badge-${user?.role}`}>{user?.role}</span>
      </div>
    </nav>
  );
}