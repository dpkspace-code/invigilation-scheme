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

// Swap confirmed replacement names into an already-generated schedule result,
// matched by exam_date + slot + venue + the specific absent name being replaced.
// Does not touch the underlying exams/pairs tables.
function applyReplacements(result, replacements) {
  if (!replacements.length) return result;

  // key: date|slot|venue|absent_name -> replacement_name
  const repMap = {};
  replacements.forEach(r => {
    const key = `${r.exam_date}|${r.slot}|${r.venue}|${r.absent_name}`;
    repMap[key] = r.replacement_name;
  });

  result.rows.forEach(row => {
    row.pairsList.forEach(pair => {
      pair.members = pair.members.map(name => {
        const key = `${row.exam.exam_date}|${row.exam.slot}|${row.exam.venue}|${name}`;
        return repMap[key] || name;
      });
    });
  });

  // Rebuild individual timetables to reflect substitutions
  const newIndividual = {};
  Object.entries(result.individual).forEach(([name, slots]) => {
    slots.forEach(slot => {
      const key = `${slot.exam_date}|${slot.slot}|${slot.venue}|${name}`;
      const finalName = repMap[key] || name;
      if (!newIndividual[finalName]) newIndividual[finalName] = [];
      newIndividual[finalName].push(slot);
    });
  });
  result.individual = newIndividual;

  return result;
}

router.get('/generate', async (req, res) => {
  try {
    const { date } = req.query;
    const { teachers, attendants, pairs, venues, exams, config } = await loadAllData();
    let result = generateSchedule({ teachers, attendants, pairs, venues, exams, ownSubjectRule: config.own_subject_rule === 'true' });

    // Apply any confirmed replacements — if a date is given, only that date's;
    // otherwise apply all confirmed replacements across every date.
    const repRows = date
      ? await db.query('SELECT * FROM replacements WHERE exam_date=$1', [date])
      : await db.query('SELECT * FROM replacements');
    result = applyReplacements(result, repRows.rows);

    return res.json({ ...result, config });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/workload', async (req, res) => {
  try {
    const { teachers, attendants, pairs, venues, exams } = await loadAllData();
    const result = generateSchedule({ teachers, attendants, pairs, venues, exams, ownSubjectRule: false });
    const repRows = await db.query('SELECT * FROM replacements');
    const applied = applyReplacements(result, repRows.rows);
    return res.json({ pairSummary: applied.pairSummary, individual: applied.individual, stats: applied.stats, warnings: applied.warnings });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;