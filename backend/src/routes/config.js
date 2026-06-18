const router = require('express').Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT key, value FROM config');
    const obj = {};
    result.rows.forEach(r => { obj[r.key] = r.value; });
    return res.json(obj);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.patch('/:key', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { value } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW() RETURNING *',
      [req.params.key, value]
    );
    return res.json(result.rows[0]);
  } catch (e) { return res.status(400).json({ error: e.message }); }
});

module.exports = router;
