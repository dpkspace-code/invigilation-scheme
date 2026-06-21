const router = require('express').Router();
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/subjects - list all subjects with their assigned HODs
router.get('/', async (req, res) => {
  try {
    const subjectsRes = await db.query('SELECT * FROM subjects ORDER BY name');
    const hodLinksRes = await db.query(`
      SELECT hs.subject_id, u.id as user_id, u.name as user_name, u.email as user_email
      FROM hod_subjects hs
      JOIN users u ON u.id = hs.user_id
      ORDER BY u.name
    `);

    const hodsBySubject = {};
    hodLinksRes.rows.forEach(link => {
      if (!hodsBySubject[link.subject_id]) hodsBySubject[link.subject_id] = [];
      hodsBySubject[link.subject_id].push({ id: link.user_id, name: link.user_name, email: link.user_email });
    });

    const result = subjectsRes.rows.map(s => ({
      ...s,
      hods: hodsBySubject[s.id] || [],
    }));

    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/subjects - create a subject and assign HOD(s) in one step (admin only)
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { name, hod_user_ids } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const subjectRes = await db.query(
      'INSERT INTO subjects (name) VALUES ($1) RETURNING *',
      [name.trim()]
    );
    const subject = subjectRes.rows[0];

    const hodIds = Array.isArray(hod_user_ids) ? hod_user_ids : [];
    for (const userId of hodIds) {
      await db.query(
        'INSERT INTO hod_subjects (user_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, subject.id]
      );
    }

    return res.json({ ...subject, hods: hodIds });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'A subject with this name already exists' });
    }
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/subjects/:id - rename a subject and/or replace its HOD assignments (admin only)
router.put('/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, hod_user_ids } = req.body;

    if (name && name.trim()) {
      await db.query('UPDATE subjects SET name = $1 WHERE id = $2', [name.trim(), id]);
    }

    if (Array.isArray(hod_user_ids)) {
      await db.query('DELETE FROM hod_subjects WHERE subject_id = $1', [id]);
      for (const userId of hod_user_ids) {
        await db.query(
          'INSERT INTO hod_subjects (user_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, id]
        );
      }
    }

    const result = await db.query('SELECT * FROM subjects WHERE id = $1', [id]);
    return res.json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'A subject with this name already exists' });
    }
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/subjects/:id (admin only) - cascades to hod_subjects and papers automatically
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;