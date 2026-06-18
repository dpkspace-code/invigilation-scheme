import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        await register(name, email, password);
        toast.success('Account created!');
      }
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Invigilation Scheme</h1>
        <p className="subtitle">Curepipe College</p>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="field">
              <label>Full name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" />
            </div>
          )}
          <div className="field">
            <label>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@curepipe.edu" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="········" minLength={8} />
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1, textAlign: 'center' }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11 }}>
          {mode === 'login' ? (
            <span>New admin? <button className="btn btn-sm" onClick={() => setMode('register')}>Create account</button></span>
          ) : (
            <span>Already have an account? <button className="btn btn-sm" onClick={() => setMode('login')}>Sign in</button></span>
          )}
        </div>
      </div>
    </div>
  );
}
