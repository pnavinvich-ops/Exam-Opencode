'use strict';

const express = require('express');
const { q, audit } = require('./db');
const {
  hashPassword, makeSalt, createSession, destroySession,
  requireAuth, isLocked, registerFail, clearFails,
  issueOtp, verifyOtp,
} = require('./auth');

const router = express.Router();

function str(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

router.post('/auth/register', (req, res) => {
  const b = req.body || {};
  const firstName = str(b.firstName, 80);
  const lastName = str(b.lastName, 80);
  const org = typeof b.org === 'string' ? b.org.trim().slice(0, 120) : '';
  const username = str(b.username, 40);
  const password = typeof b.password === 'string' ? b.password : '';

  if (!firstName || !lastName) return res.status(400).json({ error: 'NAME_REQUIRED' });
  if (!username || !/^[A-Za-z0-9._@-]{3,40}$/.test(username)) return res.status(400).json({ error: 'USERNAME_INVALID' });
  if (password.length < 8) return res.status(400).json({ error: 'PASSWORD_SHORT' });
  if (q.get('SELECT id FROM users WHERE username = ?', username)) return res.status(409).json({ error: 'USERNAME_TAKEN' });

  const salt = makeSalt();
  q.run(
    `INSERT INTO users (username, pass_hash, salt, role, first_name, last_name, org, email, status, created_at)
     VALUES (?, ?, ?, 'student', ?, ?, ?, '', 'pending', ?)`,
    username, hashPassword(password, salt), salt, firstName, lastName, org, new Date().toISOString()
  );
  const code = issueOtp(username);
  audit(null, 'register', username);
  // Demo mode: no SMS/e-mail gateway, so the OTP is returned to be shown on screen.
  res.json({ ok: true, demoCode: code });
});

router.post('/auth/resend-otp', (req, res) => {
  const username = str((req.body || {}).username, 40);
  const user = username && q.get(`SELECT id, status FROM users WHERE username = ?`, username);
  if (!user || user.status !== 'pending') return res.status(400).json({ error: 'NOT_PENDING' });
  const code = issueOtp(username);
  res.json({ ok: true, demoCode: code });
});

router.post('/auth/verify-otp', (req, res) => {
  const b = req.body || {};
  const username = str(b.username, 40);
  const code = str(b.code, 6);
  const user = username && q.get(`SELECT * FROM users WHERE username = ?`, username);
  if (!user || user.status !== 'pending') return res.status(400).json({ error: 'NOT_PENDING' });
  const r = verifyOtp(username, code);
  if (!r.ok) return res.status(400).json({ error: r.reason });
  q.run(`UPDATE users SET status = 'active', last_login_at = ? WHERE id = ?`, new Date().toISOString(), user.id);
  createSession(res, user.id);
  audit(user.id, 'login', 'after-otp');
  res.json({ ok: true, user: publicUser({ ...user, status: 'active' }) });
});

function publicUser(u) {
  return {
    id: u.id, username: u.username, role: u.role,
    firstName: u.first_name, lastName: u.last_name,
    org: u.org, email: u.email, status: u.status,
    lastLoginAt: u.last_login_at, createdAt: u.created_at,
  };
}

router.post('/auth/login', (req, res) => {
  const b = req.body || {};
  const username = str(b.username, 40);
  const password = typeof b.password === 'string' ? b.password : '';
  if (!username || !password) return res.status(400).json({ error: 'BAD_CREDENTIALS' });

  const key = username.toLowerCase();
  const lock = isLocked(key);
  if (lock) return res.status(429).json({ error: 'LOCKED', retryAfterSec: Math.ceil((lock.until - Date.now()) / 1000) });

  const user = q.get(`SELECT * FROM users WHERE username = ?`, username);
  const okPass = user && hashPassword(password, user.salt) === user.pass_hash;

  if (!okPass) {
    registerFail(key);
    return res.status(401).json({ error: 'BAD_CREDENTIALS' });
  }
  clearFails(key);

  if (user.status === 'pending') return res.status(403).json({ error: 'OTP_REQUIRED', username: user.username });
  if (user.status === 'inactive') return res.status(403).json({ error: 'ACCOUNT_DISABLED' });

  q.run(`UPDATE users SET last_login_at = ? WHERE id = ?`, new Date().toISOString(), user.id);
  createSession(res, user.id);
  audit(user.id, 'login');
  res.json({ ok: true, user: publicUser(user) });
});

router.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: publicUser(req.user) });
});

router.put('/me', requireAuth, (req, res) => {
  const b = req.body || {};
  const firstName = str(b.firstName, 80);
  const lastName = str(b.lastName, 80);
  if (!firstName || !lastName) return res.status(400).json({ error: 'NAME_REQUIRED' });
  const org = typeof b.org === 'string' ? b.org.trim().slice(0, 120) : req.user.org;
  const email = typeof b.email === 'string' ? b.email.trim().slice(0, 120) : req.user.email;
  q.run(`UPDATE users SET first_name = ?, last_name = ?, org = ?, email = ? WHERE id = ?`,
    firstName, lastName, org, email, req.user.id);
  audit(req.user.id, 'profile.update');
  const u = q.get(`SELECT * FROM users WHERE id = ?`, req.user.id);
  res.json({ ok: true, user: publicUser(u) });
});

router.put('/me/password', requireAuth, (req, res) => {
  const b = req.body || {};
  const current = typeof b.currentPassword === 'string' ? b.currentPassword : '';
  const next = typeof b.newPassword === 'string' ? b.newPassword : '';
  if (hashPassword(current, req.user.salt) !== req.user.pass_hash) return res.status(401).json({ error: 'WRONG_PASSWORD' });
  if (next.length < 8) return res.status(400).json({ error: 'PASSWORD_SHORT' });
  const salt = makeSalt();
  q.run(`UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?`, hashPassword(next, salt), salt, req.user.id);
  audit(req.user.id, 'password.change');
  res.json({ ok: true });
});

module.exports = router;
