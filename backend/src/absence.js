const router = require('express').Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Get absences for a date
router.get('/:date', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM absences WHERE exam_date=$1 ORDER BY staff_type, staff_name',
      [req.params.date]
    );
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Mark absences for a date
router.post('/:date', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { absences } = req.body;
  if (!Array.isArray(absences)) return res.status(400).json({ error: 'Expected array' });
  try {
    await db.query('DELETE FROM absences WHERE exam_date=$1', [req.params.date]);
    for (const a of absences) {
      await db.query(
        'INSERT INTO absences (exam_date, staff_name, staff_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [req.params.date, a.staff_name, a.staff_type]
      );
    }
    const result = await db.query('SELECT * FROM absences WHERE exam_date=$1', [req.params.date]);
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Get replacement suggestions
router.get('/:date/replacements/suggest', async (req, res) => {
  try {
    const date = req.params.date;
    const [absenceRows, replacementRows, teacherRows, attendantRows, examRows, pairRows] = await Promise.all([
      db.query('SELECT * FROM absences WHERE exam_date=$1', [date]),
      db.query('SELECT * FROM replacements WHERE exam_date=$1', [date]),
      db.query('SELECT * FROM teachers ORDER BY sort_order'),
      db.query('SELECT * FROM attendants ORDER BY sort_order'),
      db.query('SELECT * FROM exams WHERE exam_date=$1 ORDER BY slot', [date]),
      db.query('SELECT * FROM pairs ORDER BY sort_order')
    ]);

    const absences = absenceRows.rows;
    const existingReplacements = replacementRows.rows;
    const teachers = teacherRows.rows;
    const attendants = attendantRows.rows;
    const exams = examRows.rows;
    const pairs = pairRows.rows;

    // Build workload map (count assignments per person)
    const allPairMembers = [];
    pairs.forEach(p => { allPairMembers.push(p.member_a); allPairMembers.push(p.member_b); });
    const workload = {};
    allPairMembers.forEach(name => { workload[name] = 0; });
    pairs.forEach(pair => {
      const pairExams = exams.filter(e => 
        e.venue && (pair.member_a || pair.member_b)
      );
      pairExams.forEach(() => {
        workload[pair.member_a] = (workload[pair.member_a] || 0) + 1;
        workload[pair.member_b] = (workload[pair.member_b] || 0) + 1;
      });
    });

    const absentNames = absences.map(a => a.staff_name);
    const suggestions = [];

    for (const absence of absences) {
      // Find slots this person is assigned to
      const assignedSlots = pairs
        .filter(p => p.member_a === absence.staff_name || p.member_b === absence.staff_name)
        .map(p => ({ pair: p, exams: exams.filter(e => true) }));

      const slots = [...new Set(exams.map(e => e.slot))];
      
      for (const slot of slots) {
        const slotExams = exams.filter(e => e.slot === slot);
        if (!slotExams.length) continue;

        // Find free staff for this slot (not absent, not already assigned in this slot)
        const busyInSlot = existingReplacements
          .filter(r => r.slot === slot)
          .map(r => r.replacement_name);

        const freeTeachers = teachers
          .filter(t => !absentNames.includes(t.name) && !busyInSlot.includes(t.name))
          .sort((a, b) => (workload[a.name] || 0) - (workload[b.name] || 0));

        const freeAttendants = attendants
          .filter(a => !absentNames.includes(a.name) && !busyInSlot.includes(a.name))
          .sort((a, b) => (workload[a.name] || 0) - (workload[b.name] || 0));

        const candidates = [...freeTeachers.map(t => ({ ...t, type: 'teacher' })),
                           ...freeAttendants.map(a => ({ ...a, type: 'attendant' }))];

        suggestions.push({
          absent_name: absence.staff_name,
          absent_type: absence.staff_type,
          slot,
          venue: slotExams[0]?.venue || '',
          candidates: candidates.slice(0, 5)
        });
      }
    }

    return res.json({ suggestions, existingReplacements });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Confirm a replacement
router.post('/:date/replacements', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { slot, venue, absent_name, replacement_name, replacement_type } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO replacements (exam_date, slot, venue, absent_name, replacement_name, replacement_type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.date, slot, venue, absent_name, replacement_name, replacement_type]
    );
    return res.json(result.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Get confirmed replacements for a date
router.get('/:date/replacements', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM replacements WHERE exam_date=$1 ORDER BY slot, absent_name',
      [req.params.date]
    );
    return res.json(result.rows);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Delete a replacement
router.delete('/:date/replacements/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    await db.query('DELETE FROM replacements WHERE id=$1', [req.params.id]);
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;