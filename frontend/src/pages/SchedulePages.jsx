// Workload.jsx — live auto-refreshing invigilator workload
import { useState, useEffect } from 'react';
import { schedule as scheduleApi } from '../api';

export function Workload() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filter, setFilter] = useState('');

  const load = () => {
    scheduleApi.workload()
      .then(r => { setData(r.data); setLastUpdated(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  if (loading) return <div className="help">Computing workload…</div>;
  if (!data) return <div className="note warn">Could not load workload. Make sure exams and pairs are set up.</div>;

  const { pairSummary, individual, stats } = data;
  const filtered = Object.keys(individual).filter(n => !filter || n.toLowerCase().includes(filter.toLowerCase())).sort();

  return (
    <div>
      <h1>Live Invigilator Workload</h1>
      <p className="subtitle">
        Auto-updates every 15 seconds
        {lastUpdated && <span> · Last updated {lastUpdated.toLocaleTimeString()}</span>}
        <button className="btn btn-sm" style={{marginLeft:10}} onClick={load}>Refresh now</button>
      </p>

      {stats && (
        <div className="stat-grid">
          <div className="stat-card"><div className="num">{stats.totalExamRows}</div><div className="lbl">Exam rows</div></div>
          <div className="stat-card"><div className="num">{stats.totalPairSlots}</div><div className="lbl">Pair-slots</div></div>
          <div className="stat-card"><div className="num">{(stats.avgMinutes/60).toFixed(1)}h</div><div className="lbl">Target avg / pair</div></div>
          <div className="stat-card"><div className="num">{stats.unfilledSlots}</div><div className="lbl">Unfilled slots</div></div>
        </div>
      )}

      <h2>Workload by pair</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Pair members</th><th>Type</th><th>Sessions</th><th>Total time</th><th>Vs. target avg</th></tr></thead>
          <tbody>{pairSummary.sort((a,b) => b.totalMinutes - a.totalMinutes).map((p, i) => {
            const diff = p.deviation;
            return (
              <tr key={i}>
                <td>{p.members.join(' & ')}</td>
                <td><span className={`badge badge-${p.type === 'teacher' ? 'admin' : 'viewer'}`}>{p.type}</span></td>
                <td>{p.sessions}</td>
                <td style={{fontFamily:'var(--mono)'}}>{(p.totalMinutes/60).toFixed(1)}h ({p.totalMinutes} min)</td>
                <td style={{fontFamily:'var(--mono)', color: diff == null ? 'inherit' : diff > 30 ? 'var(--warn)' : 'var(--accent)'}}>
                  {diff != null ? `${diff > 0 ? '+' : ''}${(diff/60).toFixed(1)}h` : '—'}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

      <h2 style={{marginTop:24}}>Individual timetable lookup</h2>
      <div className="field" style={{maxWidth:300}}>
        <label>Search by name</label>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Type a name…" />
      </div>
      {filtered.map(name => {
        const rows = individual[name];
        const total = rows.reduce((s, r) => s + (r.durationMin || 0), 0);
        return (
          <details key={name} style={{marginBottom:8}}>
            <summary style={{cursor:'pointer', fontFamily:'var(--mono)', fontSize:11, padding:'8px 0'}}>
              {name} — {rows.length} session(s), {(total/60).toFixed(1)}h total
            </summary>
            <div className="table-wrap" style={{maxHeight:200}}>
              <table>
                <thead><tr><th>Date</th><th>Slot</th><th>Start</th><th>End</th><th>Duration</th><th>Grade</th><th>Subject</th><th>Venue</th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i}><td>{r.exam_date}</td><td>{r.slot}</td><td>{r.start_time}</td><td>{r.end_time}</td>
                    <td>{r.durationMin} min</td><td>{r.grade}</td><td>{r.subject}</td><td>{r.venue}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}

// Schedule.jsx — full generated scheme with export, per-row hide + persistent undo
export function Schedule() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(new Map());
  const [undoStack, setUndoStack] = useState([]);

  const rowKey = (row) => `${row.exam.exam_date}|${row.exam.slot}|${row.exam.venue}`;

  const generate = async () => {
    setLoading(true);
    try {
      const r = await scheduleApi.generate();
      setResult(r.data);
      setHidden(new Map());
      setUndoStack([]);
    } catch (err) {
      alert(err.response?.data?.error || 'Generation failed');
    } finally { setLoading(false); }
  };

  const hideRow = (row) => {
    const key = rowKey(row);
    if (!confirm(`Remove this slot (${row.exam.exam_date} · ${row.exam.slot} · ${row.exam.venue}) from the displayed/exported scheme?`)) return;
    setHidden(prev => { const next = new Map(prev); next.set(key, row); return next; });
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUndoStack(prev => [...prev, { batchId, label: `Removed ${row.exam.exam_date} · ${row.exam.slot} · ${row.exam.venue}`, keys: [key] }]);
  };

  const undoBatch = (batchId) => {
    const batch = undoStack.find(b => b.batchId === batchId);
    if (!batch) return;
    setHidden(prev => { const next = new Map(prev); batch.keys.forEach(k => next.delete(k)); return next; });
    setUndoStack(prev => prev.filter(b => b.batchId !== batchId));
  };

  const dismissBatch = (batchId) => {
    setUndoStack(prev => prev.filter(b => b.batchId !== batchId));
  };

  const dismissAll = () => setUndoStack([]);
  const undoAll = () => {
    setHidden(new Map());
    setUndoStack([]);
  };

  const exportCSV = () => {
    if (!result) return;
    const rows = [['Date','Slot','Start','End','Duration(min)','Candidates','Grade','Subject','Venue','Invigilator 1','Invigilator 2','Type']];
    result.rows.filter(row => !hidden.has(rowKey(row))).forEach(row => {
      row.pairsList.forEach(a => {
        rows.push([row.exam.exam_date, row.exam.slot, row.exam.start_time, row.exam.end_time, row.durationMin,
          row.exam.candidates||'', row.exam.grade, row.exam.subject, row.exam.venue,
          a.members[0]||'', a.members[1]||'', a.type]);
      });
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'invigilation_schedule.csv';
    a.click();
  };

  const visibleRows = (result?.rows || []).filter(row => !hidden.has(rowKey(row)));
  const byDate = {};
  visibleRows.forEach(row => {
    const d = row.exam.exam_date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(row);
  });

  const visibleUnfilled = visibleRows.reduce((sum, row) => sum + row.pairsList.filter(a => a.type === 'unfilled').length, 0);

  return (
    <div>
      <h1>Generate Invigilation Scheme</h1>
      <p className="help">This generates the full day-by-day schedule, assigning pairs to venues, balancing total invigilation time, and flagging any unfilled slots. You can remove individual slots from this view/export — removing a slot does not delete it from the Exam Timetable, so it will reappear next time you regenerate.</p>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading ? 'Generating…' : result ? 'Regenerate' : 'Generate scheme'}
        </button>
        {result && <button className="btn" onClick={exportCSV}>Export CSV</button>}
      </div>

      {result?.warnings?.length > 0 && (
        <div className="note warn" style={{marginTop:12}}>
          {result.warnings.map((w,i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {undoStack.length > 0 && (
        <div className="card" style={{ background: 'var(--warn-light, #fff8e1)', marginTop:12, marginBottom: 12 }}>
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
            {undoStack.length > 1 && (
              <div className="btn-row" style={{ margin: 0, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <button className="btn btn-sm btn-primary" onClick={undoAll}>Undo all ({undoStack.length})</button>
                <button className="btn btn-sm" onClick={dismissAll}>Dismiss all</button>
              </div>
            )}
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="stat-grid">
            <div className="stat-card"><div className="num">{visibleRows.length}</div><div className="lbl">Exam rows shown</div></div>
            <div className="stat-card"><div className="num">{result.stats.totalPairSlots}</div><div className="lbl">Pair-slots filled</div></div>
            <div className="stat-card"><div className="num">{(result.stats.avgMinutes/60).toFixed(1)}h</div><div className="lbl">Target avg / pair</div></div>
            <div className="stat-card"><div className="num">{visibleUnfilled}</div><div className="lbl">Unfilled slots shown</div></div>
          </div>
          {hidden.size > 0 && (
            <p className="help">{hidden.size} slot(s) currently hidden from this view and from the CSV export.</p>
          )}

          {Object.keys(byDate).sort().map(date => (
            <div key={date} style={{marginBottom:22}}>
              <h3>{date}</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Slot</th><th>Start</th><th>End</th><th>Duration</th><th>Candidates</th><th>Grade</th><th>Subject</th><th>Venue</th><th>Invigilators</th><th style={{width:70}}></th></tr></thead>
                  <tbody>
                    {byDate[date].map((row, i) => (
                      <tr key={i}>
                        <td>{row.exam.slot}</td>
                        <td>{row.exam.start_time}</td>
                        <td>{row.exam.end_time}</td>
                        <td style={{fontFamily:'var(--mono)'}}>{row.durationMin} min</td>
                        <td>{row.exam.candidates||''}</td>
                        <td>{row.exam.grade}</td>
                        <td>{row.exam.subject}</td>
                        <td>{row.exam.venue}</td>
                        <td>
                          {row.pairsList.map((a, j) => (
                            <div key={j}>
                              {row.pairsList.length > 1 && <span style={{fontFamily:'var(--mono)',fontSize:10}}>{j+1}. </span>}
                              {a.type === 'unfilled'
                                ? <span className="unfilled">Unassigned</span>
                                : <span>{a.members.join(' & ')}{a.type==='attendant' && <span className="badge badge-viewer" style={{marginLeft:4}}>attendant</span>}</span>}
                            </div>
                          ))}
                        </td>
                        <td><button className="btn btn-sm btn-danger" onClick={() => hideRow(row)}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <h2>Duty summary by pair</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Pair members</th><th>Type</th><th>Sessions</th><th>Total time</th><th>Vs. target</th></tr></thead>
              <tbody>{result.pairSummary.sort((a,b) => b.totalMinutes-a.totalMinutes).map((p,i) => (
                <tr key={i}>
                  <td>{p.members.join(' & ')}</td>
                  <td>{p.type}</td>
                  <td>{p.sessions}</td>
                  <td style={{fontFamily:'var(--mono)'}}>{(p.totalMinutes/60).toFixed(1)}h</td>
                  <td style={{fontFamily:'var(--mono)',color:p.deviation>30?'var(--warn)':p.deviation<-30?'#4a90d9':'inherit'}}>
                    {p.deviation != null ? `${p.deviation>0?'+':''}${(p.deviation/60).toFixed(1)}h` : '—'}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="help" style={{marginTop:8}}>Note: the duty summary above still reflects the full generated schedule (including any slots you've removed from view), since invigilator workload totals are computed from the actual generated assignments, not the filtered display.</p>
        </>
      )}
    </div>
  );
}