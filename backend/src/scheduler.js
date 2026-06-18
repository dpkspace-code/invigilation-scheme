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

function applyReplacements(result, replacements) {
  if (!replacements.length) return result;

  // Build a map: absent_name -> replacement_name per slot
  const repMap = {};
  replacements.forEach(r => {
    const key = `${r.absent_name}|${r.slot}`;
    repMap[key] = r.replacement_name;
  });

  // Apply to rows
  result.rows.forEach(row => {
    row.pairsList.forEach(pair => {
      pair.members = pair.members.map(name => {
        const key = `${name}|${row.exam.slot}`;
        return repMap[key] || name;
      });
    });
  });

  // Apply to individual timetables
  const newIndividual = {};
  Object.entries(result.individual).forEach(([name, slots]) => {
    const newName = replacements.find(r => r.absent_name === name)?.replacement_name || name;
    if (!newIndividual[newName]) newIndividual[newName] = [];
    newIndividual[newName].push(...slots);
  });
  result.individual = newIndividual;

  return result;
}

router.get('/generate', async (req, res) => {
  try {
    const { date } = req.query;
    const { teachers, attendants, pairs, venues, exams, config } = await loadAllData();
    let result = generateSchedule({ teachers, attendants, pairs, venues, exams, ownSubjectRule: config.own_subject_rule === 'true' });

    if (date) {
      const repRows = await db.query('SELECT * FROM replacements WHERE exam_date=$1', [date]);
      result = applyReplacements(result, repRows.rows);
    }

    return res.json({ ...result, config });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/workload', async (req, res) => {
  try {
    const { teachers, attendants, pairs, venues, exams } = await loadAllData();
    const result = generateSchedule({ teachers, attendants, pairs, venues, exams, ownSubjectRule: false });
    return res.json({ pairSummary: result.pairSummary, individual: result.individual, stats: result.stats, warnings: result.warnings });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;