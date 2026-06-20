const router = require('express').Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { generateSchedule } = require('../scheduler');

router.use(authMiddleware);

async function loadAllData() {
  const [teachers, attendants, pairs, venues, exams, configRows] = await Promise.all([
    db.query('SELECT * FROM teachers ORDER BY sort_order, id'),
    db.query('SELECT * FROM attendants ORDER BY sort_order, id'),
    db.query('SELECT * FROM pairs ORDER BY sort_order, id'),
    db.query('SELECT * FROM venues ORDER BY sort_order, id'),
    db.query('SELECT * FROM exams ORDER BY sort_order, id'),
    db.query('SELECT key, value FROM config')
  ]);
  const config = {};
  configRows.rows.forEach(r => { config[r.key] = r.value; });
  return { teachers: teachers.rows, attendants: attendants.rows, pairs: pairs.rows, venues: venues.rows, exams: exams.rows, config };
}

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

router.get('/:date/replacements', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM replacements WHERE exam_date=$1 ORDER BY slot, venue', [req.params.date]);
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

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

router.get('/:date/replacements/suggest', async (req, res) => {
  try {
    const { date } = req.params;

    const [absencesRes, { teachers, attendants, pairs, venues, exams, config }] = await Promise.all([
      db.query('SELECT * FROM absences WHERE exam_date=$1', [date]),
      loadAllData(),
    ]);

    const absentNames = new Set(absencesRes.rows.map(a => a.staff_name));
    if (absentNames.size === 0) {
      return res.json({ suggestions: [] });
    }

    const result = generateSchedule({ teachers, attendants, pairs, venues, exams, ownSubjectRule: config.own_subject_rule === 'true' });

    const replacementsRes = await db.query('SELECT * FROM replacements WHERE exam_date=$1', [date]);
    const alreadyReplacing = new Set(replacementsRes.rows.map(r => r.replacement_name));
    const alreadyResolved = new Set(replacementsRes.rows.map(r => `${r.slot}|${r.venue}|${r.absent_name}`));

    const minutesByName = {};
    (result.pairSummary || []).forEach(p => {
      p.members.forEach(name => { minutesByName[name] = p.totalMinutes; });
    });

    const buildCandidates = (rows, type) => rows
      .map(r => r.name)
      .filter(name => name && !absentNames.has(name) && !alreadyReplacing.has(name))
      .map(name => ({ name, type, minutes: minutesByName[name] || 0 }))
      .sort((a, b) => a.minutes - b.minutes)
      .slice(0, 8);

    const teacherCandidates = buildCandidates(teachers, 'teacher');
    const attendantCandidates = buildCandidates(attendants, 'attendant');
    const candidates = [...teacherCandidates, ...attendantCandidates];

    const suggestions = [];
    (result.rows || []).forEach(row => {
      row.pairsList.forEach(pair => {
        if (pair.type === 'unfilled') return;
        pair.members.forEach(member => {
          if (member && absentNames.has(member)) {
            const key = `${row.exam.slot}|${row.exam.venue}|${member}`;
            if (alreadyResolved.has(key)) return;
            suggestions.push({
              absent_name: member,
              slot: row.exam.slot,
              venue: row.exam.venue,
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