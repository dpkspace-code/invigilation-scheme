import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { schedule } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    schedule.workload()
      .then(r => setStats(r.data.stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="subtitle">Welcome back, {user?.name}</p>

      {!loading && stats && (
        <div className="stat-grid">
          <div className="stat-card"><div className="num">{stats.totalExamRows}</div><div className="lbl">Exam rows</div></div>
          <div className="stat-card"><div className="num">{stats.totalPairSlots}</div><div className="lbl">Pair-slots</div></div>
          <div className="stat-card"><div className="num">{(stats.avgMinutes/60).toFixed(1)}h</div><div className="lbl">Target avg / pair</div></div>
          <div className="stat-card"><div className="num">{stats.unfilledSlots}</div><div className="lbl">Unfilled slots</div></div>
        </div>
      )}

      <div className="card">
        <h2>Quick start</h2>
        <p className="help">Follow these steps in order to build your invigilation scheme.</p>
        {[
          { to: '/teachers', num: '1', label: 'Teaching Staff', desc: 'Review and manage the 68 staff members.' },
          { to: '/attendants', num: '2', label: 'Attendants', desc: 'Add non-teaching staff for backup invigilation.' },
          { to: '/pairs', num: '3', label: 'Invigilator Pairs', desc: 'Set fixed pairs for the whole exam period.' },
          { to: '/venues', num: '4', label: 'Exam Venues', desc: 'Add rooms and the gymnasium with capacities.' },
          { to: '/exams', num: '5', label: 'Exam Timetable', desc: 'Enter all exam sessions — date, venue, time.' },
          { to: '/schedule', num: '6', label: 'Generate Scheme', desc: 'Generate, view, and export the invigilation schedule.' },
        ].map(step => (
          <Link key={step.to} to={step.to} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--line)', textDecoration: 'none', color: 'var(--ink)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 2, padding: '2px 7px', flexShrink: 0, marginTop: 2 }}>{step.num}</span>
            <div>
              <strong style={{ fontFamily: 'var(--mono)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{step.label}</strong>
              <div style={{ fontSize: 13, color: '#6b6555', marginTop: 2 }}>{step.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
