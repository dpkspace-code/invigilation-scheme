const router = require('express').Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

const parseTimeToMinutes = (str) => {
  if (!str) return null;
  const m = String(str).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
};
const computeDuration = (ex) => {
  const s = parseTimeToMinutes(ex.start_time);
  const e = parseTimeToMinutes(ex.end_time);
  if (s == null || e == null || e <= s) return 0;
  return e - s;
};

// Get every absence across all dates, grouped by date (for the overview panel)
router.get('/all/list', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM absences ORDER BY exam_date, staff_name');
    const grouped = {};
    result.rows.forEach(a => {
      if (!grouped[a.exam_date]) grouped[a.exam_date] = [];
      grouped[a.exam_date].push(a);
    });
    return res.json(grouped);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---- Absences ----

router.get('/:date', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM absences WHERE exam_date=$1 ORDER BY staff_name', [req.params.date]);
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { absences } = req.body;
    if (!Array.isArray(absences)) return res.status(400).json({ error: 'absences array required' });

    await db.query('DELETE FROM absences WHERE exam_date=$1', [date]);
    for (const a of absences) {
      if (!a.staff_name || !a.staff_type) continue;
      await db.query(
        `INSERT INTO absences (exam_date, staff_name, staff_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (exam_date, staff_name) DO NOTHING`,
        [date, a.staff_name, a.staff_type]
      );
    }
    const result = await db.query('SELECT * FROM absences WHERE exam_date=$1 ORDER BY staff_name', [date]);
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---- Confirmed replacements ----

router.get('/:date/replacements', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM replacements WHERE exam_date=$1 ORDER BY slot, venue', [req.params.date]);
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Confirm a replacement — upserts so re-picking a candidate for the same
// absent person/slot/venue replaces the previous choice instead of stacking rows
router.post('/:date/replacements', async (req, res) => {
  try {
    const { date } = req.params;
    const { slot, venue, absent_name, replacement_name, replacement_type } = req.body;
    if (!slot || !absent_name || !replacement_name) {
      return res.status(400).json({ error: 'slot, absent_name, replacement_name are required' });
    }
    const result = await db.query(
      `INSERT INTO replacements (exam_date, slot, venue, absent_name, replacement_name, replacement_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (exam_date, slot, venue, absent_name)
       DO UPDATE SET replacement_name = EXCLUDED.replacement_name, replacement_type = EXCLUDED.replacement_type
       RETURNING *`,
      [date, slot, venue || '', absent_name, replacement_name, replacement_type || null]
    );
    return res.json(result.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.delete('/:date/replacements/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM replacements WHERE id=$1 AND exam_date=$2', [req.params.id, req.params.date]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---- Replacement suggestions ----

router.get('/:date/replacements/suggest', async (req, res) => {
  try {
    const { date } = req.params;

    const [absencesRes, examsRes, pairsRes, teachersRes, attendantsRes, replacementsRes] = await Promise.all([
      db.query('SELECT * FROM absences WHERE exam_date=$1', [date]),
      db.query('SELECT * FROM exams WHERE exam_date=$1 ORDER BY sort_order, id', [date]),
      db.query('SELECT * FROM pairs'),
      db.query('SELECT * FROM teachers'),
      db.query('SELECT * FROM attendants'),
      db.query('SELECT * FROM replacements WHERE exam_date=$1', [date]),
    ]);

    const absentNames = new Set(absencesRes.rows.map(a => a.staff_name));
    if (absentNames.size === 0) {
      return res.json({ suggestions: [] });
    }

    const minutesByName = {};
    const addMinutes = (name, mins) => { minutesByName[name] = (minutesByName[name] || 0) + mins; };

    pairsRes.rows.forEach(p => {
      [p.member_a, p.member_b].filter(Boolean).forEach(name => addMinutes(name, 0));
    });
    examsRes.rows.forEach(ex => {
      const dur = computeDuration(ex);
      pairsRes.rows.forEach(p => {
        [p.member_a, p.member_b].filter(Boolean).forEach(name => {
          addMinutes(name, dur / (pairsRes.rows.length || 1));
        });
      });
    });
    replacementsRes.rows.forEach(r => addMinutes(r.replacement_name, 60));

    const alreadyReplacing = new Set(replacementsRes.rows.map(r => r.replacement_name));

    const buildCandidates = (rows, type) => rows
      .map(r => r.name)
      .filter(name => name && !absentNames.has(name) && !alreadyReplacing.has(name))
      .map(name => ({ name, type, minutes: minutesByName[name] || 0 }))
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 8);

    const teacherCandidates = buildCandidates(teachersRes.rows, 'teacher');
    const attendantCandidates = buildCandidates(attendantsRes.rows, 'attendant');
    const candidates = [...teacherCandidates, ...attendantCandidates];

    const suggestions = [];
    const seen = new Set();
    examsRes.rows.forEach(ex => {
      pairsRes.rows.forEach(p => {
        [p.member_a, p.member_b].forEach(member => {
          if (member && absentNames.has(member)) {
            const key = `${ex.slot}|${ex.venue}|${member}`;
            if (seen.has(key)) return;
            seen.add(key);
            suggestions.push({
              absent_name: member,
              slot: ex.slot,
              venue: ex.venue,
              candidates,
            });
          }
        });
      });
    });

    return res.json({ suggestions });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;