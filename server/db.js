'use strict';

// Dual-mode storage adapter.
//  - Default: embedded SQLite via node:sqlite (local dev).
//  - If DATABASE_URL is set (libsql://... Turso / or file: URL): @libsql/client.
// All methods are async in both modes so route handlers stay identical.

const fs = require('node:fs');
const path = require('node:path');

const REMOTE_URL = process.env.DATABASE_URL || '';
let localDb = null;
let remoteClient = null;

if (REMOTE_URL) {
  const { createClient } = require('@libsql/client');
  remoteClient = createClient({
    url: REMOTE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
} else {
  try {
    require('node:sqlite');
  } catch (e) {
    console.error('\n❌ node:sqlite unavailable (needs Node >= 23.4).');
    console.error('   Either upgrade Node.js, or point DATABASE_URL at a libSQL/Turso database.\n');
    process.exit(1);
  }
  const { DatabaseSync } = require('node:sqlite');
  const DATA_DIR = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  localDb = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
}

function normParams(params) {
  return params.map((p) => (p === undefined ? null : p));
}

function nowIso() {
  return new Date().toISOString();
}

function rowFromLibsql(row, columns) {
  const o = {};
  for (let i = 0; i < columns.length; i++) {
    let v = row[i];
    if (typeof v === 'bigint') v = Number(v);
    o[columns[i]] = v;
  }
  return o;
}

async function all(sql, ...params) {
  if (remoteClient) {
    const rs = await remoteClient.execute({ sql, args: normParams(params) });
    return rs.rows.map((r) => rowFromLibsql(r, rs.columns));
  }
  return localDb.prepare(sql).all(...normParams(params));
}

async function get(sql, ...params) {
  const rows = await all(sql, ...params);
  return rows[0];
}

async function run(sql, ...params) {
  if (remoteClient) {
    const rs = await remoteClient.execute({ sql, args: normParams(params) });
    return {
      changes: Number(rs.rowsAffected || 0),
      lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined,
    };
  }
  const r = localDb.prepare(sql).run(...normParams(params));
  return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined };
}

// tx(fn): fn receives transaction-scoped helpers { get, all, run } as its first argument.
async function tx(fn) {
  if (remoteClient) {
    const t = await remoteClient.transaction('write');
    const api = {
      all: async (sql, ...p) => {
        const rs = await t.execute({ sql, args: normParams(p) });
        return rs.rows.map((r) => rowFromLibsql(r, rs.columns));
      },
      get: async (sql, ...p) => (await api.all(sql, ...p))[0],
      run: async (sql, ...p) => {
        const rs = await t.execute({ sql, args: normParams(p) });
        return {
          changes: Number(rs.rowsAffected || 0),
          lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined,
        };
      },
    };
    try {
      const out = await fn(api);
      await t.commit();
      return out;
    } catch (e) {
      try { await t.rollback(); } catch { /* ignore */ }
      throw e;
    }
  }
  localDb.exec('BEGIN');
  const lapi = {
    all: async (sql, ...p) => localDb.prepare(sql).all(...normParams(p)),
    get: async (sql, ...p) => localDb.prepare(sql).get(...normParams(p)),
    run: async (sql, ...p) => {
      const r = localDb.prepare(sql).run(...normParams(p));
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined };
    },
  };
  try {
    const out = await fn(lapi);
    localDb.exec('COMMIT');
    return out;
  } catch (e) {
    localDb.exec('ROLLBACK');
    throw e;
  }
}

async function audit(userId, action, detail = '') {
  await run('INSERT INTO audit_log (user_id, action, detail, at) VALUES (?, ?, ?, ?)',
    userId || null, action, String(detail).slice(0, 500), nowIso());
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','student')),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    org TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','pending')),
    created_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_th TEXT NOT NULL,
    name_en TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL REFERENCES topics(id),
    difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 4),
    question_th TEXT NOT NULL,
    question_en TEXT NOT NULL DEFAULT '',
    choices_th TEXT NOT NULL,
    choices_en TEXT NOT NULL DEFAULT '',
    correct_index INTEGER NOT NULL CHECK(correct_index BETWEEN 0 AND 4),
    explanation_th TEXT NOT NULL DEFAULT '',
    explanation_en TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_items_topic_diff ON items(topic_id, difficulty)`,
  `CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_th TEXT NOT NULL,
    title_en TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    duration_min INTEGER NOT NULL,
    open_at TEXT NOT NULL,
    close_at TEXT NOT NULL,
    shuffle INTEGER NOT NULL DEFAULT 1,
    published INTEGER NOT NULL DEFAULT 0,
    blueprint TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS exam_items (
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (exam_id, item_id)
  )`,
  `CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    submitted_at TEXT,
    answers TEXT NOT NULL DEFAULT '{}',
    flagged TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted')),
    score REAL,
    UNIQUE(exam_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    at TEXT NOT NULL
  )`,
];

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  for (const stmt of SCHEMA) await run(stmt);
  // Migration: older builds stored audit entries in a table named `audit`.
  const legacy = await get(`SELECT name FROM sqlite_master WHERE type='table' AND name='audit'`);
  if (legacy) {
    await run('INSERT INTO audit_log (user_id, action, detail, at) SELECT user_id, action, detail, at FROM audit');
    await run('DROP TABLE audit');
  }
  schemaReady = true;
}

module.exports = {
  q: { get, all, run },
  tx,
  audit,
  nowIso,
  ensureSchema,
  isRemote: !!REMOTE_URL,
};
