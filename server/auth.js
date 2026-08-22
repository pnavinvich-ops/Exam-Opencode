'use strict';

const crypto = require('node:crypto');
const { q, nowIso } = require('./db');

const SESSION_TTL_MS = 12 * 3600 * 1000;
const COOKIE_NAME = 'sid';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function createSession(res, userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await q.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
}

async function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) await q.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function currentUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const row = await q.get(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`, sha256(token), nowIso());
  if (!row) return null;
  if (row.status !== 'active') return null;
  return row;
}

async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    req.user = user;
    next();
  } catch (e) { next(e); }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });
    req.user = user;
    next();
  } catch (e) { next(e); }
}

const lockouts = new Map();

function isLocked(key) {
  const l = lockouts.get(key);
  return l && l.until > Date.now() ? l : null;
}

function registerFail(key) {
  const l = lockouts.get(key) || { fails: 0, until: 0 };
  l.fails += 1;
  if (l.fails >= 5) { l.until = Date.now() + 60000; l.fails = 0; }
  lockouts.set(key, l);
  return l;
}

function clearFails(key) {
  lockouts.delete(key);
}

const otps = new Map();

function issueOtp(username) {
  const code = String(crypto.randomInt(100000, 1000000));
  otps.set(username.toLowerCase(), { code, expires: Date.now() + 10 * 60 * 1000, tries: 0 });
  return code;
}

function verifyOtp(username, code) {
  const key = username.toLowerCase();
  const rec = otps.get(key);
  if (!rec) return { ok: false, reason: 'NO_OTP' };
  if (rec.expires < Date.now()) { otps.delete(key); return { ok: false, reason: 'OTP_EXPIRED' }; }
  rec.tries += 1;
  if (rec.tries > 5) { otps.delete(key); return { ok: false, reason: 'OTP_EXPIRED' }; }
  if (!safeEqual(rec.code, String(code))) return { ok: false, reason: 'OTP_MISMATCH' };
  otps.delete(key);
  return { ok: true };
}

module.exports = {
  hashPassword, makeSalt, createSession, destroySession,
  currentUser, requireAuth, requireAdmin,
  isLocked, registerFail, clearFails,
  issueOtp, verifyOtp,
};
