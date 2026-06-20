import { useState, useRef } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

function isSpreadsheet(file) {
  const name = file.name.toLowerCase();
  return SPREADSHEET_EXTENSIONS.some(ext => name.endsWith(ext));
}

const SLOTS = Array.from({ length: 20 }, (_, i) => `Slot ${i + 1}`);

export default function ImportTimetable() {
  const { isAdmin } = useAuth();
  const [files, setFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList);
    setFiles(prev => [...prev, ...incoming]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const clearAll = () => {
    setFiles([]);
    setRows([]);
    setPairs([]);
    setError('');
  };

  const runExtraction = async () => {
    if (!files.length) return;
    setError('');
    setExtracting(true);
    try {
      const spreadsheets = files.filter(isSpreadsheet);
      const imagesAndPdfs = files.filter(f => !isSpreadsheet(f));

      let allRows = [];
      let allPairs = [];

      if (imagesAndPdfs.length) {
        const formData = new FormData();
        imagesAndPdfs.forEach(f => formData.append('files', f));
        const r = await api.post('/api/exams/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        allRows = allRows.concat(r.data.rows);
      }

      for (const sheet of spreadsheets) {
        const formData = new FormData();
        formData.append('file', sheet);
        const r = await api.post('/api/exams/import-spreadsheet', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        allRows = allRows.concat(r.data.rows);
        if (Array.isArray(r.data.pairs)) {
          allPairs = allPairs.concat(r.data.pairs);
        }
      }

      const withMeta = allRows.map((r, i) => ({
        ...r,
        slot: r.slot || 'Slot 1',
        included: true,
        _key: `row-${Date.now()}-${i}`,
      }));

      const pairsWithMeta = allPairs.map((p, i) => ({
        ...p,
        included: true,
        _key: `pair-${Date.now()}-${i}`,
      }));

      setRows(withMeta);
      setPairs(pairsWithMeta);

      if (withMeta.length === 0 && pairsWithMeta.length === 0) {
        toast.error('Nothing was found in the uploaded file(s)');
      } else {
        const parts = [];
        if (withMeta.length) parts.push(`${withMeta.length} exam row(s)`);
        if (pairsWithMeta.length) parts.push(`${pairsWithMeta.length} invigilator pair(s)`);
        toast.success(`Extracted ${parts.join(' and ')} — review below before saving`);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Extraction failed');
      toast.error('Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  };

  const toggleIncluded = (key) => {
    setRows(prev => prev.map(r => r._key === key ? { ...r, included: !r.included } : r));
  };

  const removeRow = (key) => {
    setRows(prev => prev.filter(r => r._key !== key));
  };

  const addBlankRow = () => {
    setRows(prev => [...prev, {
      exam_date: '', grade: '', subject: '', start_time: '', end_time: '',
      venue: '', candidates: null, slot: 'Slot 1', included: true, _key: `row-${Date.now()}-blank`,
    }]);
  };

  const updatePair = (key, field, value) => {
    setPairs(prev => prev.map(p => p._key === key ? { ...p, [field]: value } : p));
  };

  const togglePairIncluded = (key) => {
    setPairs(prev => prev.map(p => p._key === key ? { ...p, included: !p.included } : p));
  };

  const removePair = (key) => {
    setPairs(prev => prev.filter(p => p._key !== key));
  };

  const confirmSave = async () => {
    const toSaveRows = rows.filter(r => r.included && r.exam_date && r.subject);
    const toSavePairs = pairs.filter(p => p.included && p.member_a);

    if (!toSaveRows.length && !toSavePairs.length) {
      toast.error('Nothing selected to save (rows need at least a Date and Subject; pairs need at least one member)');
      return;
    }
    setSaving(true);
    try {
      const rowsPayload = toSaveRows.map(({ _key, included, ...rest }) => rest);
      const pairsPayload = toSavePairs.map(({ _key, included, ...rest }) => rest);
      const r = await api.post('/api/exams/import/confirm', { rows: rowsPayload, pairs: pairsPayload });

      const messages = [];
      if (r.data.inserted) messages.push(`${r.data.inserted} exam row(s) saved`);
      if (r.data.pairsInserted) messages.push(`${r.data.pairsInserted} pair(s) created`);
      if (r.data.pairsSkipped?.length) messages.push(`${r.data.pairsSkipped.length} pair(s) skipped (member already in another pair)`);
      toast.success(messages.join(' · ') || 'Saved');

      if (r.data.pairsSkipped?.length) {
        console.warn('Skipped pairs:', r.data.pairsSkipped);
      }

      setRows([]);
      setPairs([]);
      setFiles([]);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return <div className="note warn">Only admins can import exam timetables.</div>;
  }

  return (
    <div>
      <h1>Import Exam Timetable</h1>
      <p className="subtitle">Upload a photo, PDF, or spreadsheet of the secretary's exam timetable and have it read automatically.</p>
      <p className="help">
        Photos and PDFs are read with AI — works even with messy scans or handwriting. Excel/CSV files are also read with AI now, so any layout (including multi-slot pivoted timetables with one sheet per date) can be understood, not just simple flat tables.
        If the file shows which staff were paired together to invigilate, those pairs are extracted too — review them separately below before deciding whether to save them as new Pairs.
      </p>

      <div
        className="card"
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        style={{ border: '2px dashed var(--line)', textAlign: 'center', cursor: 'pointer', padding: '2rem' }}
        onClick={() => fileInputRef.current?.click()}
      >
        <p>Drag & drop files here, or click to browse</p>
        <p className="help">Accepts images (JPG/PNG), PDFs, and Excel/CSV files. You can select multiple photos/pages at once.</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2>Files to process ({files.length})</h2>
          <ul style={{ marginBottom: 12 }}>
            {files.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>{f.name} <span className="help" style={{ display: 'inline' }}>({(f.size / 1024).toFixed(0)} KB)</span></span>
                <button className="btn btn-sm btn-danger" onClick={() => removeFile(i)}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={runExtraction} disabled={extracting}>
              {extracting ? 'Reading file(s)…' : 'Extract exam rows'}
            </button>
            <button className="btn" onClick={clearAll} disabled={extracting}>Clear all</button>
          </div>
        </div>
      )}

      {error && <div className="note warn" style={{ marginTop: 12 }}>{error}</div>}

      {rows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2>Review extracted exam rows ({rows.filter(r => r.included).length} of {rows.length} selected)</h2>
          <p className="help">Uncheck any row you don't want to import, edit any field directly, or remove a row entirely. Nothing is saved until you click "Confirm & Save" below.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Date</th><th>Slot</th><th>Start</th><th>End</th>
                  <th>Grade</th><th>Subject</th><th>Venue</th><th>Candidates</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r._key} style={{ opacity: r.included ? 1 : 0.4 }}>
                    <td><input type="checkbox" checked={r.included} onChange={() => toggleIncluded(r._key)} /></td>
                    <td><input type="date" value={r.exam_date || ''} onChange={e => updateRow(r._key, 'exam_date', e.target.value)} /></td>
                    <td>
                      <select value={r.slot || 'Slot 1'} onChange={e => updateRow(r._key, 'slot', e.target.value)}>
                        {SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td><input type="time" value={r.start_time || ''} onChange={e => updateRow(r._key, 'start_time', e.target.value)} /></td>
                    <td><input type="time" value={r.end_time || ''} onChange={e => updateRow(r._key, 'end_time', e.target.value)} /></td>
                    <td><input value={r.grade || ''} onChange={e => updateRow(r._key, 'grade', e.target.value)} /></td>
                    <td><input value={r.subject || ''} onChange={e => updateRow(r._key, 'subject', e.target.value)} /></td>
                    <td><input value={r.venue || ''} onChange={e => updateRow(r._key, 'venue', e.target.value)} /></td>
                    <td><input type="number" min={0} value={r.candidates ?? ''} onChange={e => updateRow(r._key, 'candidates', e.target.value ? +e.target.value : null)} /></td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => removeRow(r._key)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={addBlankRow}>Add blank row</button>
          </div>
        </div>
      )}

      {pairs.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2>Review extracted invigilator pairs ({pairs.filter(p => p.included).length} of {pairs.length} selected)</h2>
          <p className="help">
            These pairs were identified from the uploaded file. Uncheck any you don't want to create as new Pairs.
            Any pair where a member already belongs to an existing Pair will be automatically skipped when you save, to avoid double-booking — you'll see a summary of any skipped pairs after saving.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Member A</th><th>Member B</th><th>Type</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {pairs.map(p => (
                  <tr key={p._key} style={{ opacity: p.included ? 1 : 0.4 }}>
                    <td><input type="checkbox" checked={p.included} onChange={() => togglePairIncluded(p._key)} /></td>
                    <td><input value={p.member_a || ''} onChange={e => updatePair(p._key, 'member_a', e.target.value)} /></td>
                    <td><input value={p.member_b || ''} onChange={e => updatePair(p._key, 'member_b', e.target.value)} /></td>
                    <td>
                      <select value={p.type || 'teacher'} onChange={e => updatePair(p._key, 'type', e.target.value)}>
                        <option value="teacher">teacher</option>
                        <option value="attendant">attendant</option>
                      </select>
                    </td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => removePair(p._key)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(rows.length > 0 || pairs.length > 0) && (
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={confirmSave} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm & Save to Timetable'}
          </button>
        </div>
      )}
    </div>
  );
}