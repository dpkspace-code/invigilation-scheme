const router = require('express').Router();
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authMiddleware } = require('../middleware/auth');

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
  // Gemini sometimes wraps output in markdown fences despite instructions — strip them defensively
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

    // Light normalization so the preview table has consistent shape
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

module.exports = router;