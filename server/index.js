'use strict';

const path = require('node:path');
const express = require('express');

const { ensureSeeded } = require('./seed');
const authRoutes = require('./routes-auth');
const studentRoutes = require('./routes-student');
const adminRoutes = require('./routes-admin');

ensureSeeded();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', authRoutes);
app.use('/api', studentRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON' });
  res.status(500).json({ error: 'SERVER_ERROR' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Physics Exam Library running at http://localhost:${PORT}`);
});
