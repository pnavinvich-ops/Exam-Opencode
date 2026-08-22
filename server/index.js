'use strict';

// This app uses the built-in SQLite of Node.js (node:sqlite), which needs Node >= 23.4.
try {
  require('node:sqlite');
} catch (e) {
  console.error('\n❌ node:sqlite is not available in your Node.js ' + process.version);
  console.error('   This project requires Node.js >= 23.4 (built-in SQLite).');
  console.error('   Fix: install a current LTS/Current Node from https://nodejs.org,');
  console.error('   then run:  npm install && npm start\n');
  process.exit(1);
}

const path = require('node:path');
const express = require('express');

const { ensureSeeded } = require('./seed');
const authRoutes = require('./routes-auth');
const studentRoutes = require('./routes-student');
const adminRoutes = require('./routes-admin');

ensureSeeded().catch((e) => {
  console.error('❌ Database seeding failed:', e);
  process.exit(1);
});

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
const server = app.listen(PORT, () => {
  console.log(`Physics Exam Library running at http://localhost:${PORT}`);
  console.log('Open this address in your browser. Demo login: admin / Admin@1234');
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error('   Another server is probably still running.');
    console.error('   Fix: close it, or run on another port:  set PORT=3001 && npm start\n');
    process.exit(1);
  }
  throw err;
});
