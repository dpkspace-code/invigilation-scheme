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
      }

      const withMeta = allRows.map((r, i) => ({
        ...r,
        slot: r.slot || 'Slot 1',
        included: true,
        _key: `row-${Date.now()}-${i}`,
      }));

      setRows(withMeta);
      if (withMeta.length === 0) {
        toast.error('No exam rows were found in the uploaded file(s)');
      } else {
        toast.success(`Extracted ${withMeta.length} row(s) — review and edit below before saving`);
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

  const confirmSave = async () => {
    const toSave = rows.filter(r => r.included && r.exam_date && r.subject);
    if (!toSave.length) {
      toast.error('No valid rows selected to save (each row needs at least a Date and Subject)');
      return;
    }
    setSaving(true);
    try {
      const payload = toSave.map(({ _key, included, ...rest }) => rest);
      const r = await api.post('/api/exams/import/confirm', { rows: payload });
      toast.success(`Saved ${r.data.inserted} exam row(s) to the timetable`);
      setRows([]);
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
        Photos and PDFs are read with AI — works even with messy scans or handwriting, but always double-check the results below before saving.
        Excel/CSV files are read directly and don't use AI, so they're faster and more exact if the file is already in a clean table format.
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
          <h2>Review extracted rows ({rows.filter(r => r.included).length} of {rows.length} selected)</h2>
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
            <button className="btn btn-primary" onClick={confirmSave} disabled={saving}>
              {saving ? 'Saving…' : 'Confirm & Save to Timetable'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}