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

router.get('/generate', async (req, res) => {
  try {
    const { teachers, attendants, pairs, venues, exams, config } = await loadAllData();
    const result = generateSchedule({ teachers, attendants, pairs, venues, exams, ownSubjectRule: config.own_subject_rule === 'true' });
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
