const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(400).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name, email, hash, 'admin']
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email, name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id, email, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, name: user.name, email, role: user.role } });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, role, created_at FROM users WHERE id=$1', [req.user.id]);
    return res.json(result.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get('/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const result = await db.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at');
  return res.json(result.rows);
});

router.patch('/users/:id/role', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { role } = req.body;
  if (!['admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const result = await db.query('UPDATE users SET role=$1 WHERE id=$2 RETURNING id, name, email, role', [role, req.params.id]);
  return res.json(result.rows[0]);
});

router.delete('/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (req.params.id === String(req.user.id)) return res.status(400).json({ error: 'Cannot delete yourself' });
  await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  return res.json({ success: true });
});

module.exports = router;
