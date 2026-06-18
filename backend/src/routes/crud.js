const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const TABLE_COLUMNS = {
  teachers: ['name', 'subject', 'unavail', 'sort_order'],
  attendants: ['name', 'unavail', 'sort_order'],
  pairs: ['member_a', 'member_b', 'sort_order'],
  venues: ['name', 'capacity', 'pairs_needed', 'sort_order'],
  exams: ['exam_date', 'slot', 'start_time', 'end_time', 'duration_min', 'candidates', 'grade', 'subject', 'venue', 'sort_order']
};

function crudRoutes(table) {
  const r = require('express').Router();
  const cols = TABLE_COLUMNS[table] || [];
  r.use(authMiddleware);

  r.get('/', async (req, res) => {
    try {
      const result = await db.query(`SELECT * FROM ${table} ORDER BY sort_order, id`);
      return res.json(result.rows);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  });

  r.post('/', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
      const fields = cols.filter(c => req.body[c] !== undefined);
      const values = fields.map(f => req.body[f]);
      const placeholders = fields.map((_, i) => `$${i+1}`);
      const result = await db.query(
        `INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      return res.status(201).json(result.rows[0]);
    } catch (e) { return res.status(400).json({ error: e.message }); }
  });

  r.put('/:id', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
      const fields = cols.filter(c => req.body[c] !== undefined);
      const values = fields.map(f => req.body[f]);
      const sets = fields.map((f, i) => `${f}=$${i+1}`);
      values.push(req.params.id);
      const result = await db.query(
        `UPDATE ${table} SET ${sets.join(',')} WHERE id=$${values.length} RETURNING *`,
        values
      );
      return res.json(result.rows[0]);
    } catch (e) { return res.status(400).json({ error: e.message }); }
  });

  r.delete('/:id', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
      await db.query(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]);
      return res.json({ success: true });
    } catch (e) { return res.status(400).json({ error: e.message }); }
  });

  r.post('/bulk-replace', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
    try {
      await db.query(`DELETE FROM ${table}`);
      if (!items.length) return res.json([]);
      const inserted = [];
      for (let i = 0; i < items.length; i++) {
        const item = { ...items[i], sort_order: i };
        const fields = cols.filter(c => item[c] !== undefined);
        const values = fields.map(f => item[f]);
        const placeholders = fields.map((_, j) => `$${j+1}`);
        const result = await db.query(
          `INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders}) RETURNING *`,
          values
        );
        inserted.push(result.rows[0]);
      }
      return res.json(inserted);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  });

  return r;
}

module.exports = crudRoutes;
