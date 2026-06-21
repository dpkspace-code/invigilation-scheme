// Papers.jsx — HODs manage their own subject(s)' paper catalogue; admins see/manage all
import { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const GRADES = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'Grade 13'];

export default function Papers() {
  const { isAdmin, user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [papers, setPapers] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [form, setForm] = useState({ grade: 'Grade 10', paper_name: '', duration_min: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    api.get('/api/subjects').then(r => {
      const mySubjects = isAdmin ? r.data : r.data.filter(s => s.hods.some(h => h.id === user.id));
      setSubjects(mySubjects);
      if (mySubjects.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(String(mySubjects[0].id));
      }
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const loadPapers = () => {
    if (!selectedSubjectId) { setPapers([]); return; }
    api.get('/api/papers', { params: { subject_id: selectedSubjectId } })
      .then(r => setPapers(r.data))
      .catch(() => {});
  };
  useEffect(() => { loadPapers(); }, [selectedSubjectId]);

  const resetForm = () => {
    setForm({ grade: 'Grade 10', paper_name: '', duration_min: '' });
    setEditingId(null);
  };

  const startEdit = (paper) => {
    setEditingId(paper.id);
    setForm({ grade: paper.grade, paper_name: paper.paper_name, duration_min: paper.duration_min });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedSubjectId) { toast.error('Select a subject first'); return; }
    if (!form.paper_name.trim() || !form.duration_min) { toast.error('Paper name and duration are required'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/papers/${editingId}`, { ...form, duration_min: Number(form.duration_min) });
        toast.success('Paper updated');
      } else {
        await api.post('/api/papers', { ...form, subject_id: selectedSubjectId, duration_min: Number(form.duration_min) });
        toast.success('Paper added');
      }
      resetForm();
      loadPapers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove this paper from the catalogue?')) return;
    try {
      await api.delete(`/api/papers/${id}`);
      toast.success('Paper removed');
      loadPapers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove');
    }
  };

  const formatDuration = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  };

  if (subjects.length === 0) {
    return (
      <div>
        <h1>My Papers</h1>
        <div className="note warn">
          {isAdmin
            ? 'No subjects exist yet — create one on the Subjects page first.'
            : "You aren't assigned as HOD for any subject yet. Ask an admin to assign you to a subject on the Subjects page."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>My Papers</h1>
      <p className="subtitle">The paper catalogue for your subject(s) — durations entered here are reused as a starting point each exam season, and you choose which papers actually run each time.</p>

      <div className="field" style={{ maxWidth: 300, marginBottom: 16 }}>
        <label>Subject</label>
        <select value={selectedSubjectId} onChange={e => { setSelectedSubjectId(e.target.value); resetForm(); }}>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <form className="card" onSubmit={submit} style={{ marginBottom: 20 }}>
        <h2>{editingId ? 'Edit paper' : 'Add a paper'}</h2>
        <div className="grid grid-3">
          <div className="field">
            <label>Grade</label>
            <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Paper name</label>
            <input value={form.paper_name} onChange={e => setForm(f => ({ ...f, paper_name: e.target.value }))} placeholder="e.g. Paper 1" />
          </div>
          <div className="field">
            <label>Duration (minutes)</label>
            <input type="number" min={1} value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))} placeholder="e.g. 105" />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add paper'}
          </button>
          {editingId && <button className="btn" type="button" onClick={resetForm}>Cancel edit</button>}
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Grade</th><th>Paper</th><th>Duration</th><th style={{ width: 140 }}></th></tr></thead>
          <tbody>
            {papers.length === 0 ? (
              <tr><td colSpan={4} className="help">No papers added yet for this subject.</td></tr>
            ) : papers.map(p => (
              <tr key={p.id}>
                <td>{p.grade}</td>
                <td>{p.paper_name}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{formatDuration(p.duration_min)}</td>
                <td>
                  <div className="btn-row" style={{ margin: 0 }}>
                    <button className="btn btn-sm" onClick={() => startEdit(p)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(p.id)}>Remove</button>
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