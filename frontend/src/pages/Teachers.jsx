import { useState, useEffect, useRef } from 'react';
import { teachers as api } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const UNDO_WINDOW_MS = 6000;

export default function Teachers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [unavail, setUnavail] = useState('');
  const [selected, setSelected] = useState(new Set());
  const { isAdmin } = useAuth();
  const pendingDeletes = useRef(new Map());

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

  const commitDelete = (id) => {
    const entry = pendingDeletes.current.get(id);
    if (!entry) return;
    api.remove(id).catch(() => { toast.error('Failed to remove on server'); load(); });
    pendingDeletes.current.delete(id);
  };

  const undoDelete = (id) => {
    const entry = pendingDeletes.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingDeletes.current.delete(id);
    setList(prev => {
      if (prev.some(t => t.id === id)) return prev;
      return [...prev, entry.record].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });
  };

  const remove = (id) => {
    const record = list.find(t => t.id === id);
    if (!record) return;
    if (!confirm('Remove this teacher?')) return;

    setList(prev => prev.filter(t => t.id !== id));
    setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });

    const timer = setTimeout(() => commitDelete(id), UNDO_WINDOW_MS);
    pendingDeletes.current.set(id, { record, timer });

    toast((t) => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        Removed "{record.name}"
        <button className="btn btn-sm" onClick={() => { undoDelete(id); toast.dismiss(t.id); }}>
          Undo
        </button>
      </span>
    ), { duration: UNDO_WINDOW_MS });
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === list.length) setSelected(new Set());
    else setSelected(new Set(list.map(t => t.id)));
  };

  const removeSelected = () => {
    if (!selected.size) return;
    const ids = [...selected];
    if (!confirm(`Remove ${ids.length} selected teacher(s)?`)) return;

    const records = list.filter(t => selected.has(t.id));
    setList(prev => prev.filter(t => !selected.has(t.id)));
    setSelected(new Set());

    const timer = setTimeout(() => {
      ids.forEach(id => { if (pendingDeletes.current.has(id)) commitDelete(id); });
    }, UNDO_WINDOW_MS);
    records.forEach(r => pendingDeletes.current.set(r.id, { record: r, timer }));

    toast((t) => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        Removed {ids.length} teacher(s)
        <button className="btn btn-sm" onClick={() => { ids.forEach(undoDelete); toast.dismiss(t.id); }}>
          Undo
        </button>
      </span>
    ), { duration: UNDO_WINDOW_MS });
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

      {isAdmin && selected.size > 0 && (
        <div className="btn-row" style={{ margin: '12px 0' }}>
          <button className="btn btn-danger" onClick={removeSelected}>Remove selected ({selected.size})</button>
          <button className="btn" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {isAdmin && <th style={{width:30}}><input type="checkbox" checked={selected.size === list.length && list.length > 0} onChange={toggleSelectAll} /></th>}
              <th>#</th><th>Name</th><th>Subject</th><th>Unavailable</th>{isAdmin && <th style={{width:70}}></th>}
            </tr>
          </thead>
          <tbody>
            {list.map((t, i) => (
              <tr key={t.id}>
                {isAdmin && <td><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} /></td>}
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