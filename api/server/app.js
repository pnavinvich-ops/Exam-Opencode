'use strict';

// Express app builder shared by the local dev server (dev.js) and the
// Vercel serverless function (api/index.js). Exports the app without listening.

const path = require('node:path');
const express = require('express');

const { ensureSeeded } = require('./seed');
const authRoutes = require('./routes-auth');
const studentRoutes = require('./routes-student');
const adminRoutes = require('./routes-admin');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// Initialize schema + demo seed once per process, lazily on first request.
// Idempotent, so it is safe on every serverless cold start.
let initPromise = null;
function init() {
  if (!initPromise) {
    initPromise = ensureSeeded().catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}
app.use((req, res, next) => { init().then(() => next(), next); });

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', authRoutes);
app.use('/api', studentRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

app.use(express.static(PUBLIC_DIR));

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON' });
  res.status(500).json({ error: 'SERVER_ERROR' });
});

module.exports = app;
