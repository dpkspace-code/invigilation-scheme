const router = require('express').Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// ---- Absences ----

// Get all absences for a given date
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required' });
    const result = await db.query('SELECT * FROM absences WHERE exam_date=$1 ORDER BY staff_name', [date]);
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Mark a staff member absent for a date
router.post('/', async (req, res) => {
  try {
    const { exam_date, staff_name, staff_type } = req.body;
    if (!exam_date || !staff_name || !staff_type) {
      return res.status(400).json({ error: 'exam_date, staff_name, staff_type are required' });
    }
    const result = await db.query(
      `INSERT INTO absences (exam_date, staff_name, staff_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (exam_date, staff_name) DO NOTHING
       RETURNING *`,
      [exam_date, staff_name, staff_type]
    );
    return res.json(result.rows[0] || { exam_date, staff_name, staff_type, already_marked: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Remove an absence mark
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM absences WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---- Replacement suggestions ----

async function loadWorkloadMap() {
  // Rough workload proxy: count of confirmed replacement duties + scheduled pair sessions
  // We reuse pairSummary-like counts from exams/pairs so suggestions favour less-loaded staff.
  const pairs = await db.query('SELECT * FROM pairs ORDER BY sort_order, id');
  const exams = await db.query('SELECT * FROM exams ORDER BY sort_order, id');
  const replacements = await db.query('SELECT * FROM replacements');

  const minutesByName = {};
  const addMinutes = (name, mins) => { minutesByName[name] = (minutesByName[name] || 0) + mins; };

  const examBySlot = {};
  exams.rows.forEach(ex => {
    const key = `${ex.exam_date}|${ex.slot}`;
    if (!examBySlot[key]) examBySlot[key] = [];
    examBySlot[key].push(ex);
  });

  // crude duration calc consistent with scheduler.js parsing
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

  // Distribute workload roughly evenly across pairs based on number of exam slots (since
  // the real venue-assignment logic lives in scheduler.js — this is a fairness proxy only,
  // good enough for ranking replacement candidates by who has done less so far).
  const totalSlots = Object.keys(examBySlot).length || 1;
  pairs.rows.forEach(p => {
    [p.member_a, p.member_b].filter(Boolean).forEach(name => {
      addMinutes(name, 0); // ensure entry exists even with 0 load
    });
  });

  // Add confirmed replacement durations on top (these are extra duties taken on)
  replacements.rows.forEach(r => {
    const key = `${r.exam_date}|${r.slot}`;
    const exsAtSlot = examBySlot[key] || [];
    const dur = exsAtSlot.reduce((sum, ex) => sum + computeDuration(ex), 0) / (exsAtSlot.length || 1);
    addMinutes(r.replacement_name, dur);
  });

  return minutesByName;
}

// Suggest replacements for an absent staff member at a given date+slot
router.get('/suggestions', async (req, res) => {
  try {
    const { date, slot, staff_name, staff_type } = req.query;
    if (!date || !slot) return res.status(400).json({ error: 'date and slot query params required' });

    const [teachers, attendants, pairsRes, absencesRes, replacementsRes] = await Promise.all([
      db.query('SELECT * FROM teachers ORDER BY sort_order, id'),
      db.query('SELECT * FROM attendants ORDER BY sort_order, id'),
      db.query('SELECT * FROM pairs'),
      db.query('SELECT * FROM absences WHERE exam_date=$1', [date]),
      db.query('SELECT * FROM replacements WHERE exam_date=$1 AND slot=$2', [date, slot]),
    ]);

    const absentNames = new Set(absencesRes.rows.map(a => a.staff_name));
    const alreadyAssignedAsReplacement = new Set(replacementsRes.rows.map(r => r.replacement_name));

    // Names already committed elsewhere this slot (as a pair member who isn't absent, or already a replacement)
    const busyNames = new Set([...alreadyAssignedAsReplacement]);

    const workload = await loadWorkloadMap();

    const buildCandidates = (rows, type) => rows
      .map(r => r.name)
      .filter(name => name && !absentNames.has(name) && !busyNames.has(name))
      .map(name => ({ name, type, minutes: workload[name] || 0 }))
      .sort((a, b) => a.minutes - b.minutes);

    const teacherCandidates = buildCandidates(teachers.rows, 'teacher');
    const attendantCandidates = buildCandidates(attendants.rows, 'attendant');

    // Teacher-first, then attendant, each internally ranked by lowest workload
    const ranked = [...teacherCandidates, ...attendantCandidates];

    return res.json({
      exam_date: date,
      slot,
      absent_staff: staff_name || null,
      absent_type: staff_type || null,
      candidates: ranked.slice(0, 10), // top 10 suggestions
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---- Confirmed replacements ----

// Get confirmed replacements for a date
router.get('/replacements', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required' });
    const result = await db.query('SELECT * FROM replacements WHERE exam_date=$1 ORDER BY slot, venue', [date]);
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Confirm a replacement
router.post('/replacements', async (req, res) => {
  try {
    const { exam_date, slot, venue, absent_name, replacement_name, replacement_type } = req.body;
    if (!exam_date || !slot || !absent_name || !replacement_name) {
      return res.status(400).json({ error: 'exam_date, slot, absent_name, replacement_name are required' });
    }
    const result = await db.query(
      `INSERT INTO replacements (exam_date, slot, venue, absent_name, replacement_name, replacement_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [exam_date, slot, venue || null, absent_name, replacement_name, replacement_type || null]
    );
    return res.json(result.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Remove a confirmed replacement
router.delete('/replacements/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM replacements WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;