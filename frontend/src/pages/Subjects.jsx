// Subjects.jsx — admin page to create subjects and assign HOD(s) to each
import { useState, useEffect } from 'react';
import api, { auth as authApi } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Subjects() {
  const { isAdmin } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [selectedHodIds, setSelectedHodIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    api.get('/api/subjects').then(r => setSubjects(r.data)).catch(() => {});
    authApi.users().then(r => setUsers(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const hodCandidates = users.filter(u => u.role === 'hod' || u.role === 'admin');

  const toggleHod = (id) => {
    setSelectedHodIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const resetForm = () => {
    setName('');
    setSelectedHodIds([]);
    setEditingId(null);
  };

  const startEdit = (subject) => {
    setEditingId(subject.id);
    setName(subject.name);
    setSelectedHodIds(subject.hods.map(h => h.id));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Subject name is required'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/subjects/${editingId}`, { name, hod_user_ids: selectedHodIds });
        toast.success('Subject updated');
      } else {
        await api.post('/api/subjects', { name, hod_user_ids: selectedHodIds });
        toast.success('Subject created');
      }
      resetForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this subject? This also removes all its papers and HOD assignments.')) return;
    try {
      await api.delete(`/api/subjects/${id}`);
      toast.success('Subject deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (!isAdmin) {
    return <div className="note warn">Only admins can manage subjects.</div>;
  }

  return (
    <div>
      <h1>Subjects</h1>
      <p className="subtitle">{subjects.length} subject(s)</p>
      <p className="help">
        Create each subject offered at school and assign the Head(s) of Department who own it.
        Once a subject exists, its HOD(s) can log in and add their own papers (with durations) under "My Papers."
        If a staff member isn't appearing in the HOD list below, first give them the "HOD" role on the Manage Users page.
      </p>

      <form className="card" onSubmit={submit} style={{ marginBottom: 20 }}>
        <h2>{editingId ? 'Edit subject' : 'Add a new subject'}</h2>
        <div className="field">
          <label>Subject name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Biology" />
        </div>
        <div className="field">
          <label>Head(s) of Department</label>
          {hodCandidates.length === 0 ? (
            <p className="help">No users with the HOD role yet — assign the role on Manage Users first, then come back here.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {hodCandidates.map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, border: '1px solid var(--line)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedHodIds.includes(u.id)} onChange={() => toggleHod(u.id)} style={{ width: 'auto' }} />
                  {u.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create subject'}
          </button>
          {editingId && <button className="btn" type="button" onClick={resetForm}>Cancel edit</button>}
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Subject</th><th>Head(s) of Department</th><th style={{ width: 140 }}></th></tr></thead>
          <tbody>
            {subjects.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  {s.hods.length === 0
                    ? <span className="help">No HOD assigned</span>
                    : s.hods.map(h => h.name).join(', ')}
                </td>
                <td>
                  <div className="btn-row" style={{ margin: 0 }}>
                    <button className="btn btn-sm" onClick={() => startEdit(s)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}