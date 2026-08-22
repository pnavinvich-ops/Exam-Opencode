'use strict';

// Dual-mode storage adapter.
//  - Default: embedded SQLite via node:sqlite (local dev).
//  - If DATABASE_URL is set (libsql://... Turso): talks the Hrana-over-HTTP v2
//    protocol directly, because current Turso servers do not accept the
//    interactive-transaction steps used by @libsql/client. All methods are
//    async in both modes so route handlers stay identical.

const fs = require('node:fs');
const path = require('node:path');

const REMOTE_URL = (process.env.DATABASE_URL || '').replace(/\/+$/, '');
const REMOTE_HTTP = REMOTE_URL.replace(/^libsql:\/\//i, 'https://');
const REMOTE_TOKEN = process.env.DATABASE_AUTH_TOKEN || '';
let localDb = null;

if (!REMOTE_URL) {
  try {
    require('node:sqlite');
  } catch (e) {
    console.error('\n❌ node:sqlite unavailable (needs Node >= 23.4).');
    console.error('   Either upgrade Node.js, or point DATABASE_URL at a libSQL/Turso database.\n');
    process.exit(1);
  }
  const { DatabaseSync } = require('node:sqlite');
  const DATA_DIR = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  localDb = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
}

function normParams(params) {
  return params.map((p) => (p === undefined ? null : p));
}

function nowIso() {
  return new Date().toISOString();
}

function decodeHranaCell(v) {
  if (v == null || typeof v !== 'object') return v;
  switch (v.type) {
    case 'null': return null;
    case 'integer':
    case 'float':
      return Number(v.value);
    case 'text':
      return v.value == null ? null : String(v.value);
    case 'blob':
      return Buffer.from(v.value || '', 'base64');
    default:
      return v.value !== undefined ? v.value : v;
  }
}

function rowFromLibsql(row, columns) {
  const o = {};
  for (let i = 0; i < columns.length; i++) {
    o[columns[i]] = decodeHranaCell(row[i]);
  }
  return o;
}

// ---------- Hrana-over-HTTP v2 (Turso) ----------

function hranaValue(v) {
  if (v === null) return { type: 'null', value: null };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  if (typeof v === 'bigint') return { type: 'integer', value: String(v) };
  return { type: 'text', value: String(v) };
}

async function pipe(baton, sql, params) {
  const r = await pipeMulti(baton, [{ sql, args: params }]);
  return { baton: r.baton, ...(r.results[0]) };
}

async function pipeMulti(batonIn, stmts) {
  const body = {
    requests: stmts.map((s) => ({
      type: 'execute',
      stmt: { sql: s.sql, args: normParams(s.args || []).map(hranaValue) },
    })),
  };
  if (batonIn !== undefined && batonIn !== null) body.baton = batonIn;
  const res = await fetch(`${REMOTE_HTTP}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REMOTE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`libsql HTTP ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const results = (data.results || []).map((out) => {
    if (!out || out.type !== 'ok') throw new Error(`libsql step error: ${JSON.stringify(out).slice(0, 300)}`);
    const resp = out.response;
    if (!resp || resp.type !== 'execute') throw new Error('Unexpected libsql response');
    const cols = (resp.result.cols || []).map((c) => c.name);
    return {
      rows: (resp.result.rows || []).map((r) => rowFromLibsql(r, cols)),
      changes: Number(resp.result.affected_row_count || 0),
      lastInsertRowid: resp.result.last_insert_rowid != null ? Number(resp.result.last_insert_rowid) : undefined,
    };
  });
  return { baton: data.baton, results };
}

async function all(sql, ...params) {
  if (REMOTE_URL) return (await pipe(null, sql, normParams(params))).rows;
  return localDb.prepare(sql).all(...normParams(params));
}

async function get(sql, ...params) {
  const rows = await all(sql, ...params);
  return rows[0];
}

async function run(sql, ...params) {
  if (REMOTE_URL) {
    const r = await pipe(null, sql, params);
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  }
  const r = localDb.prepare(sql).run(...params);
  return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined };
}

function execLocalStmt(s) {
  const params = normParams(s.args || []);
  const isRead = /^\s*(select|with)\b/i.test(String(s.sql));
  if (isRead) {
    const rows = localDb.prepare(s.sql).all(...params);
    return { rows, changes: 0, lastInsertRowid: undefined };
  }
  const r = localDb.prepare(s.sql).run(...params);
  return { rows: [], changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined };
}

// Execute many statements in ONE round-trip. stmts: [{ sql, args: [...] }]
async function runBatch(stmts) {
  if (!stmts.length) return [];
  if (REMOTE_URL) return (await pipeMulti(null, stmts)).results;
  return stmts.map(execLocalStmt);
}

// tx(fn): fn receives transaction-scoped helpers { get, all, run, batch }.
// Remote mode buffers writes and flushes them in large pipelines so the whole
// transaction finishes in a couple of round-trips (Turso expires long-lived
// streams; a fresh stream also sidesteps that). Reads flush pending writes
// first, so callbacks always see their own writes. If a stream expires
// mid-flight ("stream not found"), the callback is re-run on a new one.
async function tx(fn) {
  if (REMOTE_URL) {
    const MAX_ATTEMPTS = 5;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let baton = null;
      let dead = false;
      let pending = [{ sql: 'BEGIN IMMEDIATE', args: [] }];
      let began = false;

      const flush = async () => {
        if (!pending.length) return;
        const stmts = pending;
        pending = [];
        const t0 = Date.now();
        try {
          const r = await pipeMulti(baton, stmts);
          baton = r.baton;
          began = true;
          if (process.env.DB_DEBUG) console.error(`[tx] flush ${stmts.length} stmts (${Date.now() - t0}ms) first=${JSON.stringify(stmts[0].sql).slice(0, 60)}`);
        } catch (e) {
          if (process.env.DB_DEBUG) console.error(`[tx] FLUSH FAIL ${stmts.length} stmts (${Date.now() - t0}ms): ${e.message.slice(0, 120)}`);
          if (/stream not found|expired|closed/i.test(String(e.message))) dead = true;
          throw e;
        }
      };

      try {
        const api = {
          run: async (sql, ...p) => { pending.push({ sql, args: p }); return { changes: 0, lastInsertRowid: undefined }; },
          batch: async (stmts) => { for (const s of stmts) pending.push({ sql: s.sql, args: s.args || [] }); return []; },
          all: async (sql, ...p) => {
            await flush();
            const r = await pipeMulti(baton, [{ sql, args: p }]);
            baton = r.baton;
            return r.results[0].rows;
          },
          get: async (sql, ...p) => (await api.all(sql, ...p))[0],
        };
        const out = await fn(api);
        pending.push({ sql: 'COMMIT', args: [] });
        await flush();
        return out;
      } catch (e) {
        lastErr = e;
        pending = [];
        if (!dead && began) {
          try { await pipeMulti(baton, [{ sql: 'ROLLBACK', args: [] }]); } catch { /* ignore */ }
        }
        if (!/stream not found|expired|closed/i.test(String(e.message)) || attempt === MAX_ATTEMPTS) throw e;
      }
    }
    throw lastErr;
  }
  localDb.exec('BEGIN');
  const lapi = {
    all: async (sql, ...p) => localDb.prepare(sql).all(...normParams(p)),
    get: async (sql, ...p) => localDb.prepare(sql).get(...normParams(p)),
    run: async (sql, ...p) => {
      const r = localDb.prepare(sql).run(...normParams(p));
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined };
    },
    batch: async (stmts) => stmts.map(execLocalStmt),
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
  q: { get, all, run, batch: runBatch },
  tx,
  audit,
  nowIso,
  ensureSchema,
  isRemote: !!REMOTE_URL,
};
