import { useState, useEffect } from 'react';
import api from '../api';

export default function Absences() {
  const [date, setDate] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [replacements, setReplacements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [allAbsences, setAllAbsences] = useState({});
  const [showAllPanel, setShowAllPanel] = useState(false);
  const [allLoading, setAllLoading] = useState(false);

  useEffect(() => {
    api.get('/api/teachers').then(r => setTeachers(r.data));
    api.get('/api/attendants').then(r => setAttendants(r.data));
  }, []);

  useEffect(() => {
    if (!date) return;
    api.get(`/api/absences/${date}`).then(r => setAbsences(r.data));
    api.get(`/api/absences/${date}/replacements`).then(r => setReplacements(r.data));
  }, [date]);

  const loadAllAbsences = async () => {
    setAllLoading(true);
    try {
      const r = await api.get('/api/absences/all/list');
      setAllAbsences(r.data);
    } catch (e) { setMsg(e.response?.data?.error || 'Error loading all absences'); }
    setAllLoading(false);
  };

  const toggleAllPanel = () => {
    const next = !showAllPanel;
    setShowAllPanel(next);
    if (next) loadAllAbsences();
  };

  const toggleAbsence = (name, type) => {
    setAbsences(prev => {
      const exists = prev.find(a => a.staff_name === name);
      if (exists) return prev.filter(a => a.staff_name !== name);
      return [...prev, { staff_name: name, staff_type: type }];
    });
  };

  const saveAbsences = async () => {
    if (!date) return setMsg('Please select a date first');
    setLoading(true);
    try {
      await api.post(`/api/absences/${date}`, { absences });
      setMsg('Absences saved!');
      if (showAllPanel) loadAllAbsences();
    } catch (e) { setMsg(e.response?.data?.error || 'Error saving'); }
    setLoading(false);
  };

  const getSuggestions = async () => {
    if (!date) return setMsg('Please select a date first');
    setLoading(true);
    try {
      const r = await api.get(`/api/absences/${date}/replacements/suggest`);
      setSuggestions(r.data.suggestions);
      setMsg('');
    } catch (e) { setMsg(e.response?.data?.error || 'Error getting suggestions'); }
    setLoading(false);
  };

  const confirmReplacement = async (suggestion, candidate) => {
    try {
      await api.post(`/api/absences/${date}/replacements`, {
        slot: suggestion.slot,
        venue: suggestion.venue,
        absent_name: suggestion.absent_name,
        replacement_name: candidate.name,
        replacement_type: candidate.type
      });
      const r = await api.get(`/api/absences/${date}/replacements`);
      setReplacements(r.data);
      setMsg('Replacement confirmed!');
    } catch (e) { setMsg(e.response?.data?.error || 'Error confirming'); }
  };

  const deleteReplacement = async (id) => {
    try {
      await api.delete(`/api/absences/${date}/replacements/${id}`);
      setReplacements(prev => prev.filter(r => r.id !== id));
    } catch (e) { setMsg(e.response?.data?.error || 'Error deleting'); }
  };

  const isAbsent = (name) => absences.some(a => a.staff_name === name);

  const sortedAllDates = Object.keys(allAbsences).sort();

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1rem' }}>Absences & Replacements</h2>

      <div style={{ marginBottom: '1rem', border: '1px solid #ddd', borderRadius: 4 }}>
        <button onClick={toggleAllPanel}
          style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.8rem', background: '#f5f5f5',
            border: 'none', borderRadius: showAllPanel ? '4px 4px 0 0' : 4, cursor: 'pointer', fontWeight: 600 }}>
          {showAllPanel ? '▾' : '▸'} All Absences — every exam day
        </button>
        {showAllPanel && (
          <div style={{ padding: '0.8rem' }}>
            {allLoading ? (
              <div>Loading…</div>
            ) : sortedAllDates.length === 0 ? (
              <div style={{ color: '#888' }}>No absences recorded on any date yet.</div>
            ) : (
              sortedAllDates.map(d => (
                <div key={d} style={{ marginBottom: '0.8rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>
                    {d} <span style={{ fontWeight: 400, color: '#888' }}>({allAbsences[d].length} absent)</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {allAbsences[d].map(a => (
                      <span key={a.id} style={{ padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.85rem',
                        background: a.staff_type === 'teacher' ? '#e3f2fd' : '#f3e5f5',
                        border: '1px solid', borderColor: a.staff_type === 'teacher' ? '#1976d2' : '#7b1fa2' }}>
                        {a.staff_name}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
            <button onClick={loadAllAbsences} disabled={allLoading}
              style={{ marginTop: '0.4rem', padding: '0.3rem 0.7rem', borderRadius: 4, cursor: 'pointer',
                background: 'none', border: '1px solid #ccc' }}>
              Refresh
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label><strong>Exam Date: </strong></label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '0.4rem', marginLeft: '0.5rem' }} />
      </div>

      {msg && <div style={{ padding: '0.5rem', marginBottom: '1rem', background: '#e8f5e9', borderRadius: 4 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h3>Teachers</h3>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4, padding: '0.5rem' }}>
            {teachers.map(t => (
              <div key={t.id} onClick={() => toggleAbsence(t.name, 'teacher')}
                style={{ padding: '0.4rem', cursor: 'pointer', borderRadius: 4,
                  background: isAbsent(t.name) ? '#ffebee' : 'transparent',
                  color: isAbsent(t.name) ? '#c62828' : 'inherit' }}>
                {isAbsent(t.name) ? '✗ ' : ''}  {t.name}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Attendants</h3>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4, padding: '0.5rem' }}>
            {attendants.map(a => (
              <div key={a.id} onClick={() => toggleAbsence(a.name, 'attendant')}
                style={{ padding: '0.4rem', cursor: 'pointer', borderRadius: 4,
                  background: isAbsent(a.name) ? '#ffebee' : 'transparent',
                  color: isAbsent(a.name) ? '#c62828' : 'inherit' }}>
                {isAbsent(a.name) ? '✗ ' : ''} {a.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button onClick={saveAbsences} disabled={loading}
          style={{ padding: '0.5rem 1rem', background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Save Absences
        </button>
        <button onClick={getSuggestions} disabled={loading}
          style={{ padding: '0.5rem 1rem', background: '#388e3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Get Replacement Suggestions
        </button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3>Replacement Suggestions</h3>
          {suggestions.map((s, i) => (
            <div key={i} style={{ border: '1px solid #ddd', borderRadius: 4, padding: '1rem', marginBottom: '0.5rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>{s.absent_name}</strong> — {s.slot} @ {s.venue}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {s.candidates.map((c, j) => (
                  <button key={j} onClick={() => confirmReplacement(s, c)}
                    style={{ padding: '0.3rem 0.7rem', borderRadius: 4, cursor: 'pointer',
                      background: c.type === 'teacher' ? '#e3f2fd' : '#f3e5f5',
                      border: '1px solid', borderColor: c.type === 'teacher' ? '#1976d2' : '#7b1fa2' }}>
                    {c.name} ({c.type})
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {replacements.length > 0 && (
        <div>
          <h3>Confirmed Replacements</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #ddd' }}>Slot</th>
                <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #ddd' }}>Venue</th>
                <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #ddd' }}>Absent</th>
                <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #ddd' }}>Replacement</th>
                <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #ddd' }}>Type</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}></th>
              </tr>
            </thead>
            <tbody>
              {replacements.map(r => (
                <tr key={r.id}>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{r.slot}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{r.venue}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{r.absent_name}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{r.replacement_name}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{r.replacement_type}</td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd', textAlign: 'center' }}>
                    <button onClick={() => deleteReplacement(r.id)}
                      style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}