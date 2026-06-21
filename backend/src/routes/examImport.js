const router = require('express').Router();
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authMiddleware } = require('../middleware/auth');
const XLSX = require('xlsx');
const db = require('../db');

router.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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

const SUMMARY_SHEET_KEYWORDS = ['timing', 'balancing', 'tim.att', 'summary', 'workload'];

function looksLikeSummarySheet(name) {
  const lower = name.trim().toLowerCase();
  return SUMMARY_SHEET_KEYWORDS.some(k => lower.includes(k));
}

const SPREADSHEET_EXTRACTION_PROMPT = `You are reading one or more sheets from a school exam timetable workbook, provided below as plain-text CSV grids (one grid per sheet, each labelled with its sheet name). The layout may be irregular: some workbooks list one exam per row in a simple table; others use a "pivoted" layout where each sheet represents one exam date, with multiple "SLOT N" blocks placed side-by-side as separate column groups, and each invigilator pair spans two consecutive rows (the first row has the time/grade/subject/room for that slot plus the first pair member's name; the second row has only the second pair member's name in the name column, with the data columns blank for that row since both members share the same exam assignment).

Carefully read the structure of each sheet — column headers, any "SLOT" labels, any date shown in a title row or implied by the sheet's own name — and extract TWO separate things, combined across ALL sheets:

1. EXAM ROWS — every individual exam sitting, with these fields:
- exam_date: the calendar date of the exam, in YYYY-MM-DD format. If a sheet has no explicit date but its name looks like a date (e.g. "30.06" meaning day.month), infer the date from that, using the year from any other sheet in the workbook that does show a full date. If truly undeterminable, use null.
- grade: the grade/form/year level (e.g. "Grade 9", "10", "Form 3"). Use the exact label as written, just cleaned up.
- subject: the subject or paper name (e.g. "Mathematics", "French P1").
- start_time: in 24-hour HH:MM format if shown.
- end_time: in 24-hour HH:MM format if shown.
- venue: the room/venue name or number exactly as written, if shown. Leave as empty string if not shown.
- candidates: the number of candidates/students sitting that paper, as an integer, if shown anywhere. Leave as null if not shown.

2. INVIGILATOR PAIRS — if the file shows which staff members were paired together to invigilate (e.g. two names appearing together for the same slot/room, or a name spanning two consecutive rows as described above), extract each DISTINCT pair you can identify, deduplicated across the whole file (the same two people are very likely paired together across many different slots — only list each unique pair ONCE). For each pair:
- member_a: first person's full name, cleaned up (trim titles like "Mr."/"Mrs."/"Miss" only if they're clearly just honorifics, otherwise keep the name as written)
- member_b: second person's full name, same cleanup. If a "pair" only ever appears with one person alone (no consistent second member), you may still list them with member_b as an empty string.
- type: "teacher" or "attendant" if you can tell from context (e.g. a separate attendant list/sheet), otherwise default to "teacher".

Skip any sheet that is clearly a summary/totals sheet rather than an actual exam timetable (e.g. one titled "Timing", "Balancing Time", attendant totals, workload summaries) — only extract from sheets that list actual exam sittings, though you can still use names from those sheets to help identify pairs if helpful.

Do NOT invent data that isn't present or reasonably inferable from context. Never fabricate placeholder values.

Respond with ONLY a JSON object with exactly two keys, "rows" and "pairs", no other text, no markdown code fences, no explanation. Example format:
{"rows":[{"exam_date":"2026-06-30","grade":"7","subject":"English","start_time":"08:10","end_time":"10:10","venue":"1","candidates":null}],"pairs":[{"member_a":"ACKIAH Y.","member_b":"PRAYAG C.","type":"teacher"}]}`;

function extractJsonObject(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in AI response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

router.post('/import-spreadsheet', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    }

    const isCsv = req.file.originalname.toLowerCase().endsWith('.csv');
    let combinedText = '';

    if (isCsv) {
      combinedText = req.file.buffer.toString('utf-8');
    } else {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheetTexts = [];
      for (const sheetName of workbook.SheetNames) {
        if (looksLikeSummarySheet(sheetName)) continue;
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        if (csv.trim()) {
          sheetTexts.push(`--- Sheet: "${sheetName}" ---\n${csv}`);
        }
      }
      if (sheetTexts.length === 0) {
        return res.status(400).json({ error: 'No usable sheets found in this workbook (all sheets were empty or looked like summary/totals sheets).' });
      }
      combinedText = sheetTexts.join('\n\n');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([
      { text: SPREADSHEET_EXTRACTION_PROMPT },
      { text: combinedText },
    ]);
    const text = result.response.text();

    let parsed;
    try {
      parsed = extractJsonObject(text);
    } catch (parseErr) {
      return res.status(502).json({ error: 'AI response could not be parsed as valid data. Try again, or check the file format.', raw: text.slice(0, 500) });
    }

    const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const rawPairs = Array.isArray(parsed.pairs) ? parsed.pairs : [];

    const normalizedRows = rawRows.map(r => ({
      exam_date: r.exam_date || '',
      grade: r.grade || '',
      subject: r.subject || '',
      start_time: r.start_time || '',
      end_time: r.end_time || '',
      venue: r.venue || '',
      candidates: r.candidates != null ? Number(r.candidates) : null,
    }));

    const normalizedPairs = rawPairs
      .filter(p => p.member_a)
      .map(p => ({
        member_a: String(p.member_a).trim(),
        member_b: p.member_b ? String(p.member_b).trim() : '',
        type: p.type === 'attendant' ? 'attendant' : 'teacher',
      }));

    return res.json({ rows: normalizedRows, pairs: normalizedPairs, fileCount: 1 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalizeName(s) {
  let n = String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  n = n.replace(/^(MR|MRS|MISS|MS|DR)\.?\s+/i, '');
  n = n.replace(/\.$/, '');
  return n.trim();
}

function findFuzzyMatch(extractedName, knownNames) {
  const target = normalizeName(extractedName);
  if (!target) return null;

  for (const known of knownNames) {
    if (normalizeName(known) === target) return known;
  }
  for (const known of knownNames) {
    const k = normalizeName(known);
    if (k.startsWith(target.replace(/\.$/, '')) || target.startsWith(k)) return known;
    const targetParts = target.split(' ');
    const knownParts = k.split(' ');
    if (targetParts[0] === knownParts[0] && targetParts[1] && knownParts[1] && targetParts[1][0] === knownParts[1][0]) {
      return known;
    }
  }
  let best = null, bestDist = Infinity;
  for (const known of knownNames) {
    const k = normalizeName(known);
    const dist = levenshtein(target, k);
    if (dist < bestDist) { bestDist = dist; best = known; }
  }
  if (best && bestDist <= 2) return best;

  return null;
}

router.post('/import/confirm', async (req, res) => {
  try {
    const { rows, pairs } = req.body;
    if ((!Array.isArray(rows) || rows.length === 0) && (!Array.isArray(pairs) || pairs.length === 0)) {
      return res.status(400).json({ error: 'At least one of rows or pairs must be provided and non-empty' });
    }

    const insertedRows = [];
    if (Array.isArray(rows) && rows.length > 0) {
      const existingCountRes = await db.query('SELECT COUNT(*) FROM exams');
      let sortOrder = parseInt(existingCountRes.rows[0].count, 10);

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
        insertedRows.push(result.rows[0]);
        sortOrder++;
      }
    }

    const insertedPairs = [];
    const skippedPairs = [];
    if (Array.isArray(pairs) && pairs.length > 0) {
      const [teachersRes, attendantsRes, existingPairsRes] = await Promise.all([
        db.query('SELECT name FROM teachers'),
        db.query('SELECT name FROM attendants'),
        db.query('SELECT member_a, member_b FROM pairs'),
      ]);
      const allKnownNames = [...teachersRes.rows.map(r => r.name), ...attendantsRes.rows.map(r => r.name)];

      const usedNames = new Set();
      existingPairsRes.rows.forEach(p => {
        if (p.member_a) usedNames.add(p.member_a.trim().toLowerCase());
        if (p.member_b) usedNames.add(p.member_b.trim().toLowerCase());
      });

      const existingPairCountRes = await db.query('SELECT COUNT(*) FROM pairs');
      let pairSortOrder = parseInt(existingPairCountRes.rows[0].count, 10);

      for (const p of pairs) {
        const aRaw = (p.member_a || '').trim();
        const bRaw = (p.member_b || '').trim();
        if (!aRaw) continue;

        const aMatch = findFuzzyMatch(aRaw, allKnownNames);
        const bMatch = bRaw ? findFuzzyMatch(bRaw, allKnownNames) : null;

        if (!aMatch || (bRaw && !bMatch)) {
          skippedPairs.push({
            member_a: aRaw, member_b: bRaw,
            reason: !aMatch ? `"${aRaw}" doesn't match any existing Teacher or Attendant` : `"${bRaw}" doesn't match any existing Teacher or Attendant`,
          });
          continue;
        }

        const a = aMatch;
        const b = bMatch || null;

        const aUsed = usedNames.has(a.toLowerCase());
        const bUsed = b && usedNames.has(b.toLowerCase());
        if (aUsed || bUsed) {
          skippedPairs.push({ member_a: a, member_b: b, reason: aUsed ? `${a} is already in another pair` : `${b} is already in another pair` });
          continue;
        }

        const result = await db.query(
          `INSERT INTO pairs (member_a, member_b, sort_order) VALUES ($1, $2, $3) RETURNING *`,
          [a, b, pairSortOrder]
        );
        insertedPairs.push(result.rows[0]);
        usedNames.add(a.toLowerCase());
        if (b) usedNames.add(b.toLowerCase());
        pairSortOrder++;
      }
    }

    return res.json({
      inserted: insertedRows.length,
      rows: insertedRows,
      pairsInserted: insertedPairs.length,
      pairs: insertedPairs,
      pairsSkipped: skippedPairs,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;