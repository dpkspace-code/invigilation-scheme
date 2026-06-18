// Attendants.jsx
import { useState, useEffect } from 'react';
import { attendants as api } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export function Attendants() {
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [unavail, setUnavail] = useState('');
  const { isAdmin } = useAuth();
  const load = () => api.list().then(r => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { await api.create({ name: name.trim(), unavail: unavail.trim(), sort_order: list.length }); toast.success('Added'); setName(''); setUnavail(''); load(); }
    catch (err) { toast.error('Failed'); }
  };
  const update = async (id, field, value) => { try { await api.update(id, { [field]: value }); } catch { toast.error('Failed'); } };
  const remove = async (id) => { if (!confirm('Remove?')) return; try { await api.remove(id); load(); } catch { toast.error('Failed'); } };

  return (
    <div>
      <h1>Attendants</h1>
      <p className="subtitle">{list.length} attendant(s)</p>
      <p className="help">Attendants are paired two-by-two in the order listed and used as backup when teacher pairs can't cover a session. Leave empty if not used.</p>
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
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Unavailable</th>{isAdmin && <th style={{width:70}}></th>}</tr></thead>
          <tbody>{list.map((a, i) => (
            <tr key={a.id}>
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
import { teachers as teachersApi, pairs as pairsApi } from '../api';

export function Pairs() {
  const [list, setList] = useState([]);
  const [teacherNames, setTeacherNames] = useState([]);
  const [generating, setGenerating] = useState(false);
  const { isAdmin } = useAuth();
  const load = () => Promise.all([pairsApi.list(), teachersApi.list()]).then(([p, t]) => { setList(p.data); setTeacherNames(t.data.map(x => x.name)); }).catch(() => {});
  useEffect(() => { load(); }, []);

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

  const update = async (id, field, value) => { try { await pairsApi.update(id, { [field]: value }); } catch { toast.error('Failed'); } };
  const remove = async (id) => { if (!confirm('Remove pair?')) return; try { await pairsApi.remove(id); load(); } catch { toast.error('Failed'); } };

  const usedA = new Set(list.map(p => p.member_a).filter(Boolean));
  const usedB = new Set(list.map(p => p.member_b).filter(Boolean));

  return (
    <div>
      <h1>Invigilator Pairs</h1>
      <p className="subtitle">{list.filter(p=>p.member_a&&p.member_b&&p.member_a!==p.member_b).length} usable pair(s)</p>
      <p className="help">Fixed pairs for the whole exam period. Each pair is assigned to rooms as a unit. Use the dropdowns to change who's paired with whom.</p>
      {isAdmin && (
        <div className="btn-row">
          <button className="btn btn-primary" onClick={regenerate} disabled={generating}>Regenerate (sequential)</button>
          <button className="btn" onClick={add}>Add empty pair</button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Member 1</th><th>Member 2</th>{isAdmin && <th style={{width:70}}></th>}</tr></thead>
          <tbody>{list.map((p, i) => {
            const opts = (selected) => ['', ...teacherNames].map(n =>
              `<option value="${n}" ${n===selected?'selected':''}>${n || '-- select --'}</option>`
            ).join('');
            return (
              <tr key={p.id} style={p.member_a && p.member_a === p.member_b ? {background:'var(--warn-light)'} : {}}>
                <td>{i+1}</td>
                <td>
                  <select defaultValue={p.member_a} onChange={e => update(p.id,'member_a',e.target.value)} disabled={!isAdmin}
                    dangerouslySetInnerHTML={{__html: opts(p.member_a)}} />
                </td>
                <td>
                  <select defaultValue={p.member_b} onChange={e => update(p.id,'member_b',e.target.value)} disabled={!isAdmin}
                    dangerouslySetInnerHTML={{__html: opts(p.member_b)}} />
                </td>
                {isAdmin && <td><button className="btn btn-sm btn-danger" onClick={() => remove(p.id)}>Remove</button></td>}
              </tr>
            );
          })}</tbody>
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
