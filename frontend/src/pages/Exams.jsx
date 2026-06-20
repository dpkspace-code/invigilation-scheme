import { useState, useEffect } from 'react';
import { exams as api, venues as venuesApi, config as configApi } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const SLOTS = Array.from({length: 20}, (_, i) => `Slot ${i+1}`);
const DEFAULT_GRADES = ['Grade 7','Grade 7 (Ext)','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12','Grade 13','PVE'];
const DEFAULT_SUBJECTS = ['Economics','General Paper','Hindi','Commerce','Physics','Social Studies','Business Studies','Art','Food & Textile Studies','Computer Science','Mathematics','Additional Mathematics','French','Design','English','Biology','Chemistry','Hinduism','ICT','Sociology','Travel & Tourism','Entrepreneurship Education','Life Skills','Physical Education','Accounting'];

// Common exam times at the school: 08:30 -> 16:30 in 15-min steps, used for both
// the quick start-time row and the quick end-time row.
const QUICK_TIMES = (() => {
  const out = [];
  for (let mins = 8*60+30; mins <= 16*60+30; mins += 15) {
    const h = String(Math.floor(mins/60)).padStart(2,'0');
    const m = String(mins%60).padStart(2,'0');
    out.push(`${h}:${m}`);
  }
  return out;
})();

function computeDuration(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

export default function Exams() {
  const [list, setList] = useState([]);
  const [venueNames, setVenueNames] = useState([]);
  const [grades, setGrades] = useState(DEFAULT_GRADES);
  const [subjects, setSubjects] = useState(DEFAULT_SUBJECTS);
  const [newGrade, setNewGrade] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [showLists, setShowLists] = useState(false);
  const [form, setForm] = useState({ exam_date:'', slot:'Slot 1', start_time:'', end_time:'', candidates:'', grade:'', subject:'', venue:'' });
  const [duration, setDuration] = useState(null);
  const { isAdmin } = useAuth();

  const load = () => {
    Promise.all([api.list(), venuesApi.list(), configApi.get()]).then(([e, v, c]) => {
      setList(e.data);
      setVenueNames(v.data.map(x => x.name));
      if (c.data.grades_list) setGrades(c.data.grades_list.split('|'));
      if (c.data.subjects_list) setSubjects(c.data.subjects_list.split('|'));
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const setField = (k, v) => {
    setForm(f => {
      const nf = {...f, [k]: v};
      setDuration(computeDuration(nf.start_time, nf.end_time));
      return nf;
    });
  };

  const pickStartTime = (t) => {
    setForm(f => {
      const nf = { ...f, start_time: t };
      setDuration(computeDuration(nf.start_time, nf.end_time));
      return nf;
    });
  };

  const pickEndTime = (t) => {
    setForm(f => {
      const nf = { ...f, end_time: t };
      setDuration(computeDuration(nf.start_time, nf.end_time));
      return nf;
    });
  };

  const add = async (e) => {
    e.preventDefault();
    if (!form.exam_date || !form.venue || !form.subject) return;
    try {
      await api.create({ ...form, candidates: form.candidates ? +form.candidates : null, duration_min: duration, sort_order: list.length });
      toast.success('Exam row added');
      setForm(f => ({...f, subject:'', candidates:'', venue:''}));
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const update = async (id, field, value) => {
    try { await api.update(id, { [field]: value }); }
    catch { toast.error('Failed to save'); }
  };

  const remove = async (id) => {
    if (!confirm('Remove this exam row?')) return;
    try { await api.remove(id); load(); } catch { toast.error('Failed'); }
  };

  const saveListsToDb = async () => {
    try {
      await configApi.set('grades_list', grades.join('|'));
      await configApi.set('subjects_list', subjects.join('|'));
      toast.success('Lists saved');
    } catch { toast.error('Failed'); }
  };

  const addGrade = () => { if (!newGrade.trim() || grades.includes(newGrade.trim())) return; setGrades(g => [...g, newGrade.trim()]); setNewGrade(''); };
  const removeGrade = (i) => setGrades(g => g.filter((_, j) => j !== i));
  const addSubject = () => { if (!newSubject.trim() || subjects.includes(newSubject.trim())) return; setSubjects(s => [...s, newSubject.trim()]); setNewSubject(''); };
  const removeSubject = (i) => setSubjects(s => s.filter((_, j) => j !== i));

  return (
    <div>
      <h1>Exam Timetable</h1>
      <p className="subtitle">{list.length} exam row(s)</p>
      <p className="help">One row per paper per venue. Enter rows in chronological order. "Slot" marks sessions that happen at the same time — a pair can only be in one venue per date+slot.</p>

      <details open={showLists} style={{marginBottom:16}}>
        <summary style={{cursor:'pointer',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',letterSpacing:1,color:'#6b6555'}}
          onClick={e => {e.preventDefault(); setShowLists(s => !s);}}>
          Edit grade &amp; subject lists (add or remove)
        </summary>
        <div className="card" style={{marginTop:8}}>
          <div className="grid grid-2">
            <div>
              <h3>Grades</h3>
              <div className="pillrow">
                {grades.map((g, i) => <span key={i} className="pill">{g}<button className="remove" onClick={() => removeGrade(i)}>&times;</button></span>)}
              </div>
              <div className="btn-row">
                <input style={{flex:1,padding:'5px 8px',border:'1px solid var(--line)',background:'var(--paper)',fontFamily:'inherit',fontSize:13}} value={newGrade} onChange={e => setNewGrade(e.target.value)} placeholder="New grade" onKeyDown={e => e.key==='Enter'&&(e.preventDefault(),addGrade())} />
                <button className="btn btn-sm" onClick={addGrade}>Add</button>
              </div>
            </div>
            <div>
              <h3>Subjects / Papers</h3>
              <div className="pillrow">
                {subjects.map((s, i) => <span key={i} className="pill">{s}<button className="remove" onClick={() => removeSubject(i)}>&times;</button></span>)}
              </div>
              <div className="btn-row">
                <input style={{flex:1,padding:'5px 8px',border:'1px solid var(--line)',background:'var(--paper)',fontFamily:'inherit',fontSize:13}} value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="New subject" onKeyDown={e => e.key==='Enter'&&(e.preventDefault(),addSubject())} />
                <button className="btn btn-sm" onClick={addSubject}>Add</button>
              </div>
            </div>
          </div>
          {isAdmin && <div className="btn-row" style={{marginTop:12}}><button className="btn btn-primary" onClick={saveListsToDb}>Save lists to database</button></div>}
        </div>
      </details>

      {isAdmin && (
        <form className="card" onSubmit={add}>
          <h2>Add exam row</h2>
          <div className="grid grid-4">
            <div className="field"><label>Date</label><input type="date" value={form.exam_date} onChange={e => setField('exam_date', e.target.value)} required /></div>
            <div className="field"><label>Venue</label>
              <select value={form.venue} onChange={e => setField('venue', e.target.value)} required>
                <option value="">-- select --</option>
                {venueNames.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="field"><label>Grade</label>
              <select value={form.grade} onChange={e => setField('grade', e.target.value)}>
                <option value="">-- select --</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="field"><label>Subject</label>
              <select value={form.subject} onChange={e => setField('subject', e.target.value)} required>
                <option value="">-- select --</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-4">
            <div className="field"><label>Candidates</label><input type="number" min={0} value={form.candidates} onChange={e => setField('candidates', e.target.value)} placeholder="e.g. 20" /></div>
            <div className="field"><label>Slot</label>
              <select value={form.slot} onChange={e => setField('slot', e.target.value)}>
                {SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field"><label>Start time</label><input type="time" value={form.start_time} onChange={e => setField('start_time', e.target.value)} /></div>
            <div className="field"><label>End time</label><input type="time" value={form.end_time} onChange={e => setField('end_time', e.target.value)} /></div>
          </div>

          <div className="field" style={{marginTop:4}}>
            <label>Quick start time</label>
            <div className="pillrow">
              {QUICK_TIMES.map(t => (
                <button
                  type="button"
                  key={`start-${t}`}
                  className={`btn btn-sm ${form.start_time === t ? 'btn-primary' : ''}`}
                  onClick={() => pickStartTime(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{marginTop:4}}>
            <label>Quick end time</label>
            <div className="pillrow">
              {QUICK_TIMES.map(t => (
                <button
                  type="button"
                  key={`end-${t}`}
                  className={`btn btn-sm ${form.end_time === t ? 'btn-primary' : ''}`}
                  onClick={() => pickEndTime(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {duration != null && <div className="note">Duration: {duration} min ({(duration/60).toFixed(2)}h)</div>}
          <div className="btn-row"><button className="btn btn-primary" type="submit">Add exam row</button></div>
          <p className="help" style={{marginTop:8}}>Tip: date, slot, start and end time stay filled in after each add — only venue, grade, subject, and candidates clear, so you can rapid-fire through every room for the same exam session. You can also type or use the native picker in the Start/End time boxes directly instead of the quick buttons.</p>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Venue</th><th>Grade</th><th>Subject</th><th>Candidates</th><th>Slot</th><th>Start</th><th>End</th><th>Duration</th>{isAdmin && <th style={{width:70}}></th>}</tr></thead>
          <tbody>
            {list.map((ex, i) => {
              const dur = computeDuration(ex.start_time, ex.end_time);
              return (
                <tr key={ex.id}>
                  <td>{i+1}</td>
                  <td><input type="date" defaultValue={ex.exam_date} onBlur={e => update(ex.id,'exam_date',e.target.value)} disabled={!isAdmin} /></td>
                  <td>
                    <select defaultValue={ex.venue} onChange={e => update(ex.id,'venue',e.target.value)} disabled={!isAdmin}>
                      {venueNames.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td>
                    <select defaultValue={ex.grade} onChange={e => update(ex.id,'grade',e.target.value)} disabled={!isAdmin}>
                      <option value="">--</option>
                      {grades.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td>
                    <select defaultValue={ex.subject} onChange={e => update(ex.id,'subject',e.target.value)} disabled={!isAdmin}>
                      <option value="">--</option>
                      {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><input type="number" defaultValue={ex.candidates||''} onBlur={e => update(ex.id,'candidates',e.target.value ? +e.target.value : null)} disabled={!isAdmin} /></td>
                  <td>
                    <select defaultValue={ex.slot} onChange={e => update(ex.id,'slot',e.target.value)} disabled={!isAdmin}>
                      {SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><input type="time" defaultValue={ex.start_time||''} onBlur={e => update(ex.id,'start_time',e.target.value)} disabled={!isAdmin} /></td>
                  <td><input type="time" defaultValue={ex.end_time||''} onBlur={e => update(ex.id,'end_time',e.target.value)} disabled={!isAdmin} /></td>
                  <td style={{fontFamily:'var(--mono)',fontSize:11}}>{dur ? `${dur} min` : <span className="unfilled">—</span>}</td>
                  {isAdmin && <td><button className="btn btn-sm btn-danger" onClick={() => remove(ex.id)}>Remove</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}