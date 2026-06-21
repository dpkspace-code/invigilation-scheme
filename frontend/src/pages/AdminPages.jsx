// Users.jsx
import { useState, useEffect } from 'react';
import { auth as authApi, config as configApi } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export function Users() {
  const [users, setUsers] = useState([]);
  const { user: currentUser } = useAuth();
  const load = () => authApi.users().then(r => setUsers(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const updateRole = async (id, role) => {
    try { await authApi.updateRole(id, role); toast.success('Role updated'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this user? They will no longer be able to log in.')) return;
    try { await authApi.deleteUser(id); toast.success('User deleted'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div>
      <h1>Manage Users</h1>
      <p className="subtitle">{users.length} user(s)</p>
      <p className="help">Admin users can view and edit everything. HOD users can manage papers for the subjects they're assigned to. Viewer users can only read data and view the schedule — they can't add, edit, or delete anything.</p>
      <div className="note">To add a new user, share the app link and ask them to click "Create account" on the login screen.</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th style={{width:80}}></th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}>
              <td>{u.name} {u.id === currentUser?.id && <span className="badge badge-admin">you</span>}</td>
              <td style={{fontFamily:'var(--mono)',fontSize:11}}>{u.email}</td>
              <td>
                {u.id === currentUser?.id
                  ? <span className={`badge badge-${u.role}`}>{u.role}</span>
                  : (
                    <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} style={{fontSize:12,padding:'3px 6px'}}>
                      <option value="admin">Admin</option>
                      <option value="hod">HOD</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  )}
              </td>
              <td style={{fontFamily:'var(--mono)',fontSize:11}}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td>{u.id !== currentUser?.id && <button className="btn btn-sm btn-danger" onClick={() => remove(u.id)}>Delete</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// Settings.jsx
export function Settings() {
  const [cfg, setCfg] = useState({ school_name: 'Curepipe College', series_label: '', own_subject_rule: 'false' });
  const [saving, setSaving] = useState(false);
  const { isAdmin } = useAuth();

  useEffect(() => {
    configApi.get().then(r => setCfg(c => ({...c, ...r.data}))).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await Promise.all([
        configApi.set('school_name', cfg.school_name),
        configApi.set('series_label', cfg.series_label),
        configApi.set('own_subject_rule', cfg.own_subject_rule),
      ]);
      toast.success('Settings saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h1>Settings</h1>
      <form className="card" onSubmit={save}>
        <h2>School information</h2>
        <div className="grid grid-2">
          <div className="field"><label>School / centre name</label>
            <input value={cfg.school_name} onChange={e => setCfg(c=>({...c,school_name:e.target.value}))} disabled={!isAdmin} />
          </div>
          <div className="field"><label>Exam series label</label>
            <input value={cfg.series_label} placeholder="e.g. Second Term Examinations 2026" onChange={e => setCfg(c=>({...c,series_label:e.target.value}))} disabled={!isAdmin} />
          </div>
        </div>
        <h2>Scheduling rules</h2>
        <div className="field">
          <label style={{display:'flex',alignItems:'center',gap:8,textTransform:'none',letterSpacing:'normal',fontSize:13}}>
            <input type="checkbox" checked={cfg.own_subject_rule === 'true'} style={{width:'auto'}}
              onChange={e => setCfg(c=>({...c,own_subject_rule:e.target.checked?'true':'false'}))} disabled={!isAdmin} />
            Avoid assigning a teacher to invigilate an exam in their own subject
          </label>
        </div>
        {isAdmin && (
          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}