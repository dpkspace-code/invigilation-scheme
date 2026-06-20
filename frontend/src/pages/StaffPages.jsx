// Attendants.jsx
import { useState, useEffect, useRef } from 'react';
import { attendants as api } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const SAFETY_COMMIT_MS = 2 * 60 * 1000;

export function Attendants() {
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [unavail, setUnavail] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [undoStack, setUndoStack] = useState([]);
  const { isAdmin } = useAuth();
  const pendingDeletes = useRef(new Map());
  const load = () => api.list().then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { await api.create({ name: name.trim(), unavail: unavail.trim(), sort_order: list.length }); toast.success('Added'); setName(''); setUnavail(''); load(); }
    catch (err) { toast.error('Failed'); }
  };
  const update = async (id, field, value) => { try { await api.update(id, { [field]: value }); } catch { toast.error('Failed'); } };

  const commitDelete = (id) => {
    const entry = pendingDeletes.current.get(id);
    if (!entry) return;
    api.remove(id).catch(() => { toast.error('Failed to remove on server'); load(); });
    pendingDeletes.current.delete(id);
  };

  const dismissBatch = (batchId) => {
    setUndoStack(prev => prev.filter(b => b.batchId !== batchId));
    pendingDeletes.current.forEach((entry, id) => {
      if (entry.batchId === batchId) { clearTimeout(entry.timer); commitDelete(id); }
    });
  };

  const undoBatch = (batchId) => {
    const batch = undoStack.find(b => b.batchId === batchId);
    if (!batch) return;
    const restored = [];
    batch.records.forEach(record => {
      const entry = pendingDeletes.current.get(record.id);
      if (entry) { clearTimeout(entry.timer); pendingDeletes.current.delete(record.id); restored.push(record); }
    });
    setList(prev => {
      const ids = new Set(prev.map(a => a.id));
      const toAdd = restored.filter(r => !ids.has(r.id));
      return [...prev, ...toAdd].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });
    setUndoStack(prev => prev.filter(b => b.batchId !== batchId));
    toast.success(`Restored ${restored.length} attendant(s)`);
  };

  const startBatchDelete = (records, label) => {
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    records.forEach(record => {
      const timer = setTimeout(() => {
        commitDelete(record.id);
        setUndoStack(prev => prev.filter(b => b.batchId !== batchId));
      }, SAFETY_COMMIT_MS);
      pendingDeletes.current.set(record.id, { record, timer, batchId });
    });
    setUndoStack(prev => [...prev, { batchId, label, records }]);
  };

  const remove = (id) => {
    const record = list.find(a => a.id === id);
    if (!record) return;
    if (!confirm('Remove?')) return;
    setList(prev => prev.filter(a => a.id !== id));
    setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });
    startBatchDelete([record], `Removed "${record.name}"`);
  };

  const toggleSelect = (id) => { setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const toggleSelectAll = () => { if (selected.size === list.length) setSelected(new Set()); else setSelected(new Set(list.map(a => a.id))); };

  const removeSelected = () => {
    if (!selected.size) return;
    const records = list.filter(a => selected.has(a.id));
    if (!confirm(`Remove ${records.length} selected attendant(s)?`)) return;
    setList(prev => prev.filter(a => !selected.has(a.id)));
    setSelected(new Set());
    startBatchDelete(records, `Removed ${records.length} attendant(s)`);
  };

  return (
    <div>
      <h1>Attendants</h1>
      <p className="subtitle">{list.length} attendant(s)</p>
      <p className="help">Attendants are paired two-by-two in the order listed and used as backup when teacher pairs can't cover a session. Leave empty if not used.</p>

      {undoStack.length > 0 && (
        <div className="card" style={{ background: 'var(--warn-light, #fff8e1)', marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {undoStack.map(batch => (
              <div key={batch.batchId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>{batch.label}</span>
                <div className="btn-row" style={{ margin: 0 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => undoBatch(batch.batchId)}>Undo</button>
                  <button className="btn btn-sm" onClick={() => dismissBatch(batch.batchId)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <form className="card" onSubmit={add}>
          <h2>Add attendant</h2>
          <div className="grid grid-2">
            <div className="field"><label>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Lab attendant — RAMSAMY" required /></div>
            <div className="field"><label>Unavailable (optional)</label><input value={unavail} onChange={e => setUnavail(e.target.value)} placeholder="28.06" /></div>
          </div>
          <div className="btn-row"><button className="btn btn-primary" type="submit">Add attendant</button></div>
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
              <th>#</th><th>Name</th><th>Unavailable</th>{isAdmin && <th style={{width:70}}></th>}
            </tr>
          </thead>
          <tbody>{list.map((a, i) => (
            <tr key={a.id}>
              {isAdmin && <td><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} /></td>}
              <td>{i+1}</td>
              <td><input defaultValue={a.name} onBlur={e => update(a.id,'name',e.target.value)} disabled={!isAdmin} /></td>
              <td><input defaultValue={a.unavail} onBlur={e => update(a.id,'unavail',e.target.value)} disabled={!isAdmin} /></td>
              {isAdmin && <td><button className="btn btn-sm btn-danger" onClick={() => remove(a.id)}>Remove</button></td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// Pairs.jsx
import { teachers as teachersApi, attendants as attendantsApi, pairs as pairsApi } from '../api';

export function Pairs() {
  const [list, setList] = useState([]);
  const [teacherNames, setTeacherNames] = useState([]);
  const [attendantNames, setAttendantNames] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [undoStack, setUndoStack] = useState([]);
  const { isAdmin } = useAuth();
  const pendingDeletes = useRef(new Map());

  const load = () => Promise.all([pairsApi.list(), teachersApi.list(), attendantsApi.list()])
    .then(([p, t, a]) => {
      setList(p.data);
      setTeacherNames(t.data.map(x => x.name));
      setAttendantNames(a.data.map(x => x.name));
    }).catch(() => {});
  useEffect(() => { load(); }, []);

  const allNames = [...teacherNames, ...attendantNames];

  const regenerate = async () => {
    if (!confirm('Regenerate pairs sequentially from the staff list? This will replace all existing pairs.')) return;
    setGenerating(true);
    const newPairs = [];
    for (let i = 0; i < teacherNames.length; i += 2) {
      newPairs.push({ member_a: teacherNames[i], member_b: teacherNames[i+1] || '', sort_order: Math.floor(i/2) });
    }
    try { await pairsApi.bulkReplace(newPairs); toast.success('Pairs regenerated'); load(); }
    catch { toast.error('Failed'); }
    finally { setGenerating(false); }
  };

  const add = async () => {
    try { await pairsApi.create({ member_a: '', member_b: '', sort_order: list.length }); load(); }
    catch { toast.error('Failed'); }
  };

  const update = async (id, field, value) => {
    setList(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    try { await pairsApi.update(id, { [field]: value }); } catch { toast.error('Failed'); }
  };

  const removeMember = (pairId, field) => {
    const pair = list.find(p => p.id === pairId);
    if (!pair) return;
    const name = pair[field];
    if (!name) return;
    if (!confirm(`Remove "${name}" from this pair? You'll be able to pick a replacement right after.`)) return;
    update(pairId, field, '');
  };

  const commitDelete = (id) => {
    const entry = pendingDeletes.current.get(id);
    if (!entry) return;
    pairsApi.remove(id).catch(() => { toast.error('Failed to remove on server'); load(); });
    pendingDeletes.current.delete(id);
  };

  const dismissBatch = (batchId) => {
    setUndoStack(prev => prev.filter(b => b.batchId !== batchId));
    pendingDeletes.current.forEach((entry, id) => {
      if (entry.batchId === batchId) { clearTimeout(entry.timer); commitDelete(id); }
    });
  };

  const undoBatch = (batchId) => {
    const batch = undoStack.find(b => b.batchId === batchId);
    if (!batch) return;
    const restored = [];
    batch.records.forEach(record => {
      const entry = pendingDeletes.current.get(record.id);
      if (entry) { clearTimeout(entry.timer); pendingDeletes.current.delete(record.id); restored.push(record); }
    });
    setList(prev => {
      const ids = new Set(prev.map(p => p.id));
      const toAdd = restored.filter(r => !ids.has(r.id));
      return [...prev, ...toAdd].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });
    setUndoStack(prev => prev.filter(b => b.batchId !== batchId));
    toast.success(`Restored ${restored.length} pair(s)`);
  };

  const startBatchDelete = (records, label) => {
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    records.forEach(record => {
      const timer = setTimeout(() => {
        commitDelete(record.id);
        setUndoStack(prev => prev.filter(b => b.batchId !== batchId));
      }, 2 * 60 * 1000);
      pendingDeletes.current.set(record.id, { record, timer, batchId });
    });
    setUndoStack(prev => [...prev, { batchId, label, records }]);
  };

  const remove = (id) => {
    const record = list.find(p => p.id === id);
    if (!record) return;
    if (!confirm('Remove this whole pair?')) return;
    setList(prev => prev.filter(p => p.id !== id));
    setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });
    startBatchDelete([record], `Removed pair`);
  };

  const toggleSelect = (id) => { setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const toggleSelectAll = () => { if (selected.size === list.length) setSelected(new Set()); else setSelected(new Set(list.map(p => p.id))); };

  const removeSelected = () => {
    if (!selected.size) return;
    const records = list.filter(p => selected.has(p.id));
    if (!confirm(`Remove ${records.length} selected pair(s)?`)) return;
    setList(prev => prev.filter(p => !selected.has(p.id)));
    setSelected(new Set());
    startBatchDelete(records, `Removed ${records.length} pair(s)`);
  };

  const opts = (selectedVal) => ['', ...allNames].map(n =>
    `<option value="${n}" ${n===selectedVal?'selected':''}>${n || '-- select replacement --'}</option>`
  ).join('');

  return (
    <div>
      <h1>Invigilator Pairs</h1>
      <p className="subtitle">{list.filter(p=>p.member_a&&p.member_b&&p.member_a!==p.member_b).length} usable pair(s)</p>
      <p className="help">Fixed pairs for the whole exam period. Each pair is assigned to rooms as a unit. Remove a whole pair with the row's Remove button, or remove just one member (✕) to open a slot for a replacement — any teacher or attendant can be picked, not only unpaired ones.</p>

      {undoStack.length > 0 && (
        <div className="card" style={{ background: 'var(--warn-light, #fff8e1)', marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {undoStack.map(batch => (
              <div key={batch.batchId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>{batch.label}</span>
                <div className="btn-row" style={{ margin: 0 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => undoBatch(batch.batchId)}>Undo</button>
                  <button className="btn btn-sm" onClick={() => dismissBatch(batch.batchId)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="btn-row">
          <button className="btn btn-primary" onClick={regenerate} disabled={generating}>Regenerate (sequential)</button>
          <button className="btn" onClick={add}>Add empty pair</button>
        </div>
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
              <th>#</th><th>Member 1</th><th>Member 2</th>{isAdmin && <th style={{width:90}}>Whole pair</th>}
            </tr>
          </thead>
          <tbody>{list.map((p, i) => (
            <tr key={p.id} style={p.member_a && p.member_a === p.member_b ? {background:'var(--warn-light)'} : {}}>
              {isAdmin && <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} /></td>}
              <td>{i+1}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    defaultValue={p.member_a}
                    onChange={e => update(p.id,'member_a',e.target.value)}
                    disabled={!isAdmin}
                    style={p.member_a ? {} : { borderColor: 'var(--danger, #c62828)' }}
                    dangerouslySetInnerHTML={{__html: opts(p.member_a)}}
                  />
                  {isAdmin && p.member_a && (
                    <button className="btn btn-sm btn-danger" title="Remove this member, open slot for replacement" onClick={() => removeMember(p.id, 'member_a')}>✕</button>
                  )}
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    defaultValue={p.member_b}
                    onChange={e => update(p.id,'member_b',e.target.value)}
                    disabled={!isAdmin}
                    style={p.member_b ? {} : { borderColor: 'var(--danger, #c62828)' }}
                    dangerouslySetInnerHTML={{__html: opts(p.member_b)}}
                  />
                  {isAdmin && p.member_b && (
                    <button className="btn btn-sm btn-danger" title="Remove this member, open slot for replacement" onClick={() => removeMember(p.id, 'member_b')}>✕</button>
                  )}
                </div>
              </td>
              {isAdmin && <td><button className="btn btn-sm btn-danger" onClick={() => remove(p.id)}>Remove</button></td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// Venues.jsx
import { venues as venuesApi } from '../api';

export function Venues() {
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(20);
  const [pairsNeeded, setPairsNeeded] = useState(1);
  const { isAdmin } = useAuth();
  const load = () => venuesApi.list().then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try { await venuesApi.create({ name: name.trim(), capacity: +capacity, pairs_needed: +pairsNeeded, sort_order: list.length }); toast.success('Venue added'); setName(''); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const addStandardRooms = async () => {
    const newRooms = Array.from({length:32},(_,i) => ({ name:`Rm ${i+1}`, capacity:20, pairs_needed:1, sort_order:list.length+i }));
    try { for (const r of newRooms) await venuesApi.create(r); toast.success('Rooms Rm 1–32 added'); load(); }
    catch { toast.error('Failed'); }
  };

  const addGym = async () => {
    try { await venuesApi.create({ name:'Gym', capacity:110, pairs_needed:5, sort_order:list.length }); toast.success('Gymnasium added'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const update = async (id, field, value) => { try { await venuesApi.update(id, { [field]: field==='name'?value:+value }); } catch { toast.error('Failed'); } };
  const remove = async (id) => { if (!confirm('Remove venue?')) return; try { await venuesApi.remove(id); load(); } catch { toast.error('Failed'); } };

  return (
    <div>
      <h1>Exam Venues</h1>
      <p className="subtitle">{list.length} venue(s)</p>
      <p className="help">Add every venue used for examinations. "Pairs needed" is how many invigilator pairs must staff that venue per session — 1 for a standard room, 5 for the gymnasium.</p>
      {isAdmin && (
        <>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={addStandardRooms}>Add Rm 1–32 (capacity 20, 1 pair)</button>
            <button className="btn btn-primary" onClick={addGym}>Add Gymnasium (capacity 110, 5 pairs)</button>
          </div>
          <form className="card" onSubmit={add} style={{marginTop:12}}>
            <h2>Add a single venue</h2>
            <div className="grid grid-3">
              <div className="field"><label>Venue name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lib 1" required /></div>
              <div className="field"><label>Capacity (seats)</label><input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} min={1} /></div>
              <div className="field"><label>Pairs needed</label><input type="number" value={pairsNeeded} onChange={e => setPairsNeeded(e.target.value)} min={1} /></div>
            </div>
            <div className="btn-row"><button className="btn btn-primary" type="submit">Add venue</button></div>
          </form>
        </>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Venue</th><th>Capacity</th><th>Pairs needed</th>{isAdmin && <th style={{width:70}}></th>}</tr></thead>
          <tbody>{list.map(v => (
            <tr key={v.id}>
              <td><input defaultValue={v.name} onBlur={e => update(v.id,'name',e.target.value)} disabled={!isAdmin} /></td>
              <td><input type="number" defaultValue={v.capacity} onBlur={e => update(v.id,'capacity',e.target.value)} disabled={!isAdmin} /></td>
              <td><input type="number" defaultValue={v.pairs_needed} onBlur={e => update(v.id,'pairs_needed',e.target.value)} disabled={!isAdmin} /></td>
              {isAdmin && <td><button className="btn btn-sm btn-danger" onClick={() => remove(v.id)}>Remove</button></td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}