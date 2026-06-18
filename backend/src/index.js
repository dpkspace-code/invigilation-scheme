// v2 - Neon database
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/config', require('./routes/config'));
app.use('/api/teachers', require('./routes/crud')('teachers'));
app.use('/api/attendants', require('./routes/crud')('attendants'));
app.use('/api/pairs', require('./routes/crud')('pairs'));
app.use('/api/venues', require('./routes/crud')('venues'));
app.use('/api/exams', require('./routes/crud')('exams'));
app.use('/api/schedule', require('./routes/schedule'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Invigilation API running on port ${PORT}`));
module.exports = app;
