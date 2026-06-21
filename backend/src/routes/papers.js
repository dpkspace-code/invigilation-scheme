const router = require('express').Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

async function getManageableSubjectIds(user) {
  if (user.role === 'admin') {
    const res = await db.query('SELECT id FROM subjects');
    return res.rows.map(r => r.id);
  }
  const res = await db.query('SELECT subject_id FROM hod_subjects WHERE user_id = $1', [user.id]);
  return res.rows.map(r => r.subject_id);
}

router.get('/', async (req, res) => {
  try {
    const manageableIds = await getManageableSubjectIds(req.user);
    if (manageableIds.length === 0) {
      return res.json([]);
    }

    let query = `
      SELECT p.*, s.name as subject_name
      FROM papers p
      JOIN subjects s ON s.id = p.subject_id
      WHERE p.subject_id = ANY($1)
    `;
    const params = [manageableIds];

    if (req.query.subject_id) {
      query += ' AND p.subject_id = $2';
      params.push(req.query.subject_id);
    }

    query += ' ORDER BY s.name, p.grade, p.paper_name';

    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { subject_id, grade, paper_name, duration_min } = req.body;
    if (!subject_id || !grade || !paper_name || !duration_min) {
      return res.status(400).json({ error: 'subject_id, grade, paper_name, and duration_min are all required' });
    }

    const manageableIds = await getManageableSubjectIds(req.user);
    if (!manageableIds.includes(Number(subject_id))) {
      return res.status(403).json({ error: 'You do not have permission to manage papers for this subject' });
    }

    const result = await db.query(
      `INSERT INTO papers (subject_id, grade, paper_name, duration_min) VALUES ($1, $2, $3, $4) RETURNING *`,
      [subject_id, grade, paper_name, duration_min]
    );
    return res.json(result.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { grade, paper_name, duration_min } = req.body;

    const existingRes = await db.query('SELECT * FROM papers WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    const existing = existingRes.rows[0];

    const manageableIds = await getManageableSubjectIds(req.user);
    if (!manageableIds.includes(existing.subject_id)) {
      return res.status(403).json({ error: 'You do not have permission to edit this paper' });
    }

    const result = await db.query(
      `UPDATE papers SET grade = $1, paper_name = $2, duration_min = $3 WHERE id = $4 RETURNING *`,
      [grade || existing.grade, paper_name || existing.paper_name, duration_min || existing.duration_min, id]
    );
    return res.json(result.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existingRes = await db.query('SELECT * FROM papers WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    const existing = existingRes.rows[0];

    const manageableIds = await getManageableSubjectIds(req.user);
    if (!manageableIds.includes(existing.subject_id)) {
      return res.status(403).json({ error: 'You do not have permission to delete this paper' });
    }

    await db.query('DELETE FROM papers WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;