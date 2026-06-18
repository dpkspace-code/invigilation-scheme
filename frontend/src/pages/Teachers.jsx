import { useState, useEffect } from 'react';
import { teachers as api } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Teachers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [unavail, setUnavail] = useState('');
  const { isAdmin } = useAuth();

  const load = () => api.list().then(r => setList(r.data)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.create({ name: name.trim(), subject: subject.trim(), unavail: unavail.trim(), sort_order: list.length });
      toast.success('Teacher added');
      setName(''); setSubject(''); setUnavail('');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add'); }
  };

  const update = async (id, field, value) => {
    try {
      await api.update(id, { [field]: value });
    } catch (err) { toast.error('Failed to save'); }
  };

  const remove = async (id) => {
    if (!confirm('Remove this teacher?')) return;
    try { await api.remove(id); toast.success('Removed'); load(); }
    catch (err) { toast.error('Failed'); }
  };

  if (loading) return <div className="help">Loading…</div>;

  return (
    <div>
      <h1>Teaching Staff</h1>
      <p className="subtitle">{list.length} staff members</p>
      <p className="help">Pre-loaded with all staff. Edit names, add subjects (used for the "avoid own subject" rule), or mark dates/slots when someone is unavailable — e.g. <code>28.06</code> for a full day, or <code>28.06 Slot 2</code> for one slot.</p>

      {isAdmin && (
        <form className="card" onSubmit={add}>
          <h2>Add new teacher</h2>
          <div className="grid grid-3">
            <div className="field"><label>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SMITH John" required /></div>
            <div className="field"><label>Subject (optional)</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Biology" /></div>
            <div className="field"><label>Unavailable (optional)</label><input value={unavail} onChange={e => setUnavail(e.target.value)} placeholder="28.06, 02.07 Slot 2" /></div>
          </div>
          <div className="btn-row"><button className="btn btn-primary" type="submit">Add teacher</button></div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Subject</th><th>Unavailable</th>{isAdmin && <th style={{width:70}}></th>}</tr></thead>
          <tbody>
            {list.map((t, i) => (
              <tr key={t.id}>
                <td style={{fontFamily:'var(--mono)',fontSize:11}}>{i+1}</td>
                <td><input defaultValue={t.name} onBlur={e => update(t.id, 'name', e.target.value)} disabled={!isAdmin} /></td>
                <td><input defaultValue={t.subject} onBlur={e => update(t.id, 'subject', e.target.value)} disabled={!isAdmin} /></td>
                <td><input defaultValue={t.unavail} onBlur={e => update(t.id, 'unavail', e.target.value)} disabled={!isAdmin} /></td>
                {isAdmin && <td><button className="btn btn-sm btn-danger" onClick={() => remove(t.id)}>Remove</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
