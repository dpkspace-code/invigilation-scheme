const router = require('express').Router();
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authMiddleware } = require('../middleware/auth');
const XLSX = require('xlsx');
const db = require('../db');

router.use(authMiddleware);

// Keep uploads in memory (no disk writes needed) — files are small (a few photos/PDFs)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB/file cap

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const EXTRACTION_PROMPT = `You are reading one or more photos or pages of a school exam timetable. The source material may be messy: scanned, photographed at an angle, handwritten dates, inconsistent table layout, abbreviations, etc. Extract every individual exam row you can find, across ALL provided files/pages combined into one single list.

For each exam row, extract these fields (use your best judgement and the surrounding context if a field is ambiguous or partially illegible):
- exam_date: the calendar date of the exam, in YYYY-MM-DD format. If the year is not shown, infer it from context (e.g. other dates on the same page) or leave it as null if truly unknown.
- grade: the grade/form/year level (e.g. "Grade 9", "Grade 10", "Grade 7 (Ext)"). Use the exact label as written, just cleaned up.
- subject: the subject or paper name (e.g. "Mathematics", "Additional Mathematics", "Biology").
- start_time: in 24-hour HH:MM format if shown.
- end_time: in 24-hour HH:MM format if shown. If only a duration is given instead of an end time, compute end_time from start_time + duration.
- venue: the room/venue name exactly as written (e.g. "Rm 13", "Gym"), if shown. Leave as empty string if not shown.
- candidates: the number of candidates/students sitting that paper, as an integer, if shown. Leave as null if not shown.

Do NOT invent data that isn't present or reasonably inferable from context. If a field is genuinely not determinable, use null (for exam_date, candidates) or an empty string (for grade, subject, start_time, end_time, venue) — never fabricate placeholder values.

Respond with ONLY a JSON array of objects, no other text, no markdown code fences, no explanation. Example format:
[{"exam_date":"2026-06-30","grade":"Grade 10","subject":"Mathematics","start_time":"08:30","end_time":"10:30","venue":"Rm 12","candidates":22}]`;

function fileToGeminiPart(file) {
  return {
    inlineData: {
      data: file.buffer.toString('base64'),
      mimeType: file.mimetype,
    },
  };
}

function extractJsonArray(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found in AI response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// POST /api/exams/import  (multipart/form-data, field name: files, multiple allowed)
// Returns extracted rows WITHOUT saving to the database — preview/edit happens client-side first.
router.post('/import', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const parts = [
      { text: EXTRACTION_PROMPT },
      ...req.files.map(fileToGeminiPart),
    ];

    const result = await model.generateContent(parts);
    const text = result.response.text();

    let rows;
    try {
      rows = extractJsonArray(text);
    } catch (parseErr) {
      return res.status(502).json({ error: 'AI response could not be parsed as valid data. Try again, or with clearer images.', raw: text.slice(0, 500) });
    }

    if (!Array.isArray(rows)) {
      return res.status(502).json({ error: 'AI response was not a list of exam rows' });
    }

    const normalized = rows.map(r => ({
      exam_date: r.exam_date || '',
      grade: r.grade || '',
      subject: r.subject || '',
      start_time: r.start_time || '',
      end_time: r.end_time || '',
      venue: r.venue || '',
      candidates: r.candidates != null ? Number(r.candidates) : null,
    }));

    return res.json({ rows: normalized, fileCount: req.files.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Spreadsheet (Excel/CSV) parsing — no AI needed ----

function normalizeHeader(h) {
  const s = String(h || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['date', 'examdate'].includes(s)) return 'exam_date';
  if (['grade', 'form', 'year', 'class'].includes(s)) return 'grade';
  if (['subject', 'paper'].includes(s)) return 'subject';
  if (['start', 'starttime', 'from'].includes(s)) return 'start_time';
  if (['end', 'endtime', 'to'].includes(s)) return 'end_time';
  if (['venue', 'room', 'location'].includes(s)) return 'venue';
  if (['candidates', 'students', 'numcandidates', 'count'].includes(s)) return 'candidates';
  return null;
}

function normalizeDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function normalizeTime(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60);
    const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const m = String(totalMinutes % 60).padStart(2, '0');
    return `${h}:${m}`;
  }
  const s = String(value).trim();
  const m = s.match(/(\d{1,2})[:.](\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s;
}

// POST /api/exams/import-spreadsheet  (multipart/form-data, field name: file, single file)
router.post('/import-spreadsheet', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (raw.length < 2) {
      return res.status(400).json({ error: 'Spreadsheet appears to have no data rows below the header' });
    }

    const headerRow = raw[0];
    const fieldMap = headerRow.map(normalizeHeader);

    if (!fieldMap.includes('exam_date') && !fieldMap.includes('subject')) {
      return res.status(400).json({ error: 'Could not recognize column headers. Expected columns like Date, Grade, Subject, Start, End, Venue, Candidates.' });
    }

    const rows = [];
    for (let i = 1; i < raw.length; i++) {
      const dataRow = raw[i];
      if (dataRow.every(cell => cell === '' || cell == null)) continue;

      const row = { exam_date: '', grade: '', subject: '', start_time: '', end_time: '', venue: '', candidates: null };
      fieldMap.forEach((field, idx) => {
        if (!field) return;
        const cell = dataRow[idx];
        if (field === 'exam_date') row.exam_date = normalizeDate(cell);
        else if (field === 'start_time') row.start_time = normalizeTime(cell);
        else if (field === 'end_time') row.end_time = normalizeTime(cell);
        else if (field === 'candidates') row.candidates = cell !== '' && cell != null ? Number(cell) : null;
        else row[field] = String(cell ?? '').trim();
      });

      if (row.exam_date || row.subject) rows.push(row);
    }

    return res.json({ rows, fileCount: 1 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Confirm & save ----

// POST /api/exams/import/confirm
// Body: { rows: [{ exam_date, grade, subject, start_time, end_time, venue, candidates }, ...] }
// Bulk-inserts the (possibly user-edited) reviewed rows into the exams table, appending to
// whatever exam rows already exist. Defaults slot to 'Slot 1' since neither extraction path
// determines slot — user can fix slot afterward on the Exam Timetable page like any manual row.
router.post('/import/confirm', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required and must be non-empty' });
    }

    const existingCountRes = await db.query('SELECT COUNT(*) FROM exams');
    let sortOrder = parseInt(existingCountRes.rows[0].count, 10);

    const inserted = [];
    for (const r of rows) {
      if (!r.exam_date || !r.subject) continue;
      const durationMin = (() => {
        if (!r.start_time || !r.end_time) return null;
        const [sh, sm] = r.start_time.split(':').map(Number);
        const [eh, em] = r.end_time.split(':').map(Number);
        if ([sh, sm, eh, em].some(Number.isNaN)) return null;
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        return diff > 0 ? diff : null;
      })();

      const result = await db.query(
        `INSERT INTO exams (exam_date, slot, start_time, end_time, duration_min, candidates, grade, subject, venue, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [r.exam_date, r.slot || 'Slot 1', r.start_time || '', r.end_time || '', durationMin,
         r.candidates != null ? Number(r.candidates) : null, r.grade || '', r.subject, r.venue || '', sortOrder]
      );
      inserted.push(result.rows[0]);
      sortOrder++;
    }

    return res.json({ inserted: inserted.length, rows: inserted });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;