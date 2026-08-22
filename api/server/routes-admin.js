'use strict';

const express = require('express');
const { q, nowIso, audit, tx } = require('./db');
const { requireAdmin, makeSalt, hashPassword } = require('./auth');
const { buildExamItems, sampleByBlueprint } = require('./examEngine');

const router = express.Router();

function bad(res, code, status = 400) { return res.status(status).json({ error: code }); }
function str(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}
function publicUser(u) {
  return {
    id: u.id, username: u.username, role: u.role,
    firstName: u.first_name, lastName: u.last_name,
    org: u.org, email: u.email, status: u.status,
    lastLoginAt: u.last_login_at, createdAt: u.created_at,
  };
}
function parseChoices(s) { try { return JSON.parse(s); } catch { return []; } }

// ================= dashboard =================
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const one = async (sql, ...p) => Number((await q.get(sql, ...p)).n);
    const rows = await q.all(
      `SELECT a.score, (SELECT COUNT(*) FROM exam_items ei WHERE ei.exam_id = a.exam_id) AS total
       FROM attempts a WHERE a.status = 'submitted' AND a.score IS NOT NULL`);
    const percents = [];
    for (const r of rows) if (r.total > 0) percents.push((r.score / r.total) * 100);
    const meanPct = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length * 10) / 10 : 0;

    res.json({
      ok: true,
      usersTotal: await one(`SELECT COUNT(*) AS n FROM users`),
      studentsActive: await one(`SELECT COUNT(*) AS n FROM users WHERE role='student' AND status='active'`),
      pendingUsers: await one(`SELECT COUNT(*) AS n FROM users WHERE status='pending'`),
      itemsActive: await one(`SELECT COUNT(*) AS n FROM items WHERE active=1`),
      examsPublished: await one(`SELECT COUNT(*) AS n FROM exams WHERE published=1`),
      examsTotal: await one(`SELECT COUNT(*) AS n FROM exams`),
      attemptsSubmitted: await one(`SELECT COUNT(*) AS n FROM attempts WHERE status='submitted'`),
      attemptsInProgress: await one(`SELECT COUNT(*) AS n FROM attempts WHERE status='in_progress'`),
      meanPercent: meanPct,
    });
  } catch (e) { next(e); }
});

// ================= topics =================
router.get('/topics', requireAdmin, async (req, res, next) => {
  try {
    const rows = await q.all(
      `SELECT t.*, (SELECT COUNT(*) FROM items i WHERE i.topic_id = t.id AND i.active = 1) AS item_count
       FROM topics t ORDER BY t.position`);
    res.json({ ok: true, topics: rows });
  } catch (e) { next(e); }
});

router.post('/topics', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const th = str(b.nameTh, 80); const en = str(b.nameEn, 80);
    if (!th || !en) return bad(res, 'TOPIC_NAME_REQUIRED');
    const posRow = await q.get(`SELECT COALESCE(MAX(position),0)+1 AS p FROM topics`);
    const r = await q.run(`INSERT INTO topics (name_th, name_en, position) VALUES (?, ?, ?)`, th, en, posRow.p);
    await audit(req.user.id, 'topic.create', `${th}/${en}`);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

// ================= users =================
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const like = `%${search}%`;
    const rows = await q.all(
      `SELECT * FROM users
       WHERE (? = '' OR username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR org LIKE ?)
       ORDER BY created_at DESC LIMIT 500`,
      search, like, like, like, like);
    res.json({ ok: true, users: rows.map(publicUser) });
  } catch (e) { next(e); }
});

router.post('/users', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const firstName = str(b.firstName, 80); const lastName = str(b.lastName, 80);
    const username = str(b.username, 40);
    const role = b.role === 'admin' ? 'admin' : 'student';
    const password = typeof b.password === 'string' ? b.password : '';
    const org = typeof b.org === 'string' ? b.org.trim().slice(0, 120) : '';
    if (!firstName || !lastName) return bad(res, 'NAME_REQUIRED');
    if (!username || !/^[A-Za-z0-9._@-]{3,40}$/.test(username)) return bad(res, 'USERNAME_INVALID');
    if (password.length < 8) return bad(res, 'PASSWORD_SHORT');
    if (await q.get(`SELECT id FROM users WHERE username = ?`, username)) return bad(res, 'USERNAME_TAKEN', 409);
    const salt = makeSalt();
    const r = await q.run(
      `INSERT INTO users (username, pass_hash, salt, role, first_name, last_name, org, email, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      username, hashPassword(password, salt), salt, role, firstName, lastName, org,
      typeof b.email === 'string' ? b.email.trim().slice(0, 120) : '', nowIso());
    await audit(req.user.id, 'user.create', username);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.put('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = Number.isInteger(id) && await q.get(`SELECT * FROM users WHERE id = ?`, id);
    if (!target) return bad(res, 'USER_NOT_FOUND', 404);
    const b = req.body || {};
    const firstName = str(b.firstName, 80); const lastName = str(b.lastName, 80);
    if (!firstName || !lastName) return bad(res, 'NAME_REQUIRED');
    let role = target.role;
    if (typeof b.role === 'string' && ['admin', 'student'].includes(b.role)) {
      if (target.id === req.user.id && b.role !== 'admin') return bad(res, 'CANNOT_DEMOTE_SELF', 409);
      role = b.role;
    }
    let status = target.status;
    if (typeof b.status === 'string' && ['active', 'inactive', 'pending'].includes(b.status)) {
      if (target.id === req.user.id && b.status !== 'active') return bad(res, 'CANNOT_DISABLE_SELF', 409);
      status = b.status;
    }
    await q.run(`UPDATE users SET first_name=?, last_name=?, org=?, email=?, role=?, status=? WHERE id=?`,
      firstName, lastName,
      typeof b.org === 'string' ? b.org.trim().slice(0, 120) : target.org,
      typeof b.email === 'string' ? b.email.trim().slice(0, 120) : target.email,
      role, status, id);
    await audit(req.user.id, 'user.update', target.username);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.put('/users/:id/password', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = Number.isInteger(id) && await q.get(`SELECT * FROM users WHERE id = ?`, id);
    if (!target) return bad(res, 'USER_NOT_FOUND', 404);
    const password = typeof (req.body || {}).newPassword === 'string' ? req.body.newPassword : '';
    if (password.length < 8) return bad(res, 'PASSWORD_SHORT');
    const salt = makeSalt();
    await q.run(`UPDATE users SET pass_hash=?, salt=? WHERE id=?`, hashPassword(password, salt), salt, id);
    await audit(req.user.id, 'user.reset_password', target.username);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = Number.isInteger(id) && await q.get(`SELECT * FROM users WHERE id = ?`, id);
    if (!target) return bad(res, 'USER_NOT_FOUND', 404);
    if (target.id === req.user.id) return bad(res, 'CANNOT_DELETE_SELF', 409);
    if (target.role === 'admin' && Number((await q.get(`SELECT COUNT(*) AS n FROM users WHERE role='admin'`)).n) <= 1) {
      return bad(res, 'LAST_ADMIN', 409);
    }
    // Manual cascade: FK enforcement is not guaranteed on remote libSQL.
    await tx(async (t) => {
      await t.run('DELETE FROM sessions WHERE user_id = ?', id);
      await t.run('DELETE FROM attempts WHERE user_id = ?', id);
      await t.run('DELETE FROM users WHERE id = ?', id);
    });
    await audit(req.user.id, 'user.delete', target.username);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ================= items =================
async function validateItemPayload(b) {
  const topicId = Number(b.topicId);
  const difficulty = Number(b.difficulty);
  const correctIndex = Number(b.correctIndex);
  const questionTh = str(b.questionTh, 1000);
  const questionEn = typeof b.questionEn === 'string' ? b.questionEn.trim().slice(0, 1000) : '';
  if (!Number.isInteger(topicId) || !(await q.get(`SELECT id FROM topics WHERE id=?`, topicId))) return { err: 'TOPIC_INVALID' };
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) return { err: 'DIFFICULTY_INVALID' };
  if (!questionTh) return { err: 'QUESTION_REQUIRED' };
  if (!Array.isArray(b.choicesTh) || b.choicesTh.length !== 5 || b.choicesTh.some(c => !str(c, 300))) return { err: 'CHOICES_5_REQUIRED' };
  let choicesEn = ['', '', '', '', ''];
  if (Array.isArray(b.choicesEn) && b.choicesEn.length === 5) choicesEn = b.choicesEn.map(c => (typeof c === 'string' ? c.trim().slice(0, 300) : ''));
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 4) return { err: 'CORRECT_INDEX_INVALID' };
  return {
    topicId, difficulty, correctIndex, questionTh, questionEn,
    choicesTh: b.choicesTh.map(c => c.trim()), choicesEn,
    explTh: typeof b.explanationTh === 'string' ? b.explanationTh.trim().slice(0, 2000) : '',
    explEn: typeof b.explanationEn === 'string' ? b.explanationEn.trim().slice(0, 2000) : '',
  };
}

router.get('/items', requireAdmin, async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const topicId = Number(req.query.topicId) || null;
    const diff = Number(req.query.difficulty) || null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize) || 15));
    const where = [`i.active = ${req.query.includeInactive === '1' ? '(CASE WHEN i.active=1 THEN 1 ELSE 1 END)' : '1'}`];
    const params = [];
    if (search) { where.push('(i.question_th LIKE ? OR i.question_en LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (topicId) { where.push('i.topic_id = ?'); params.push(topicId); }
    if (diff) { where.push('i.difficulty = ?'); params.push(diff); }
    const whereSql = where.join(' AND ');
    const total = Number((await q.get(`SELECT COUNT(*) AS n FROM items i WHERE ${whereSql}`, ...params)).n);
    const rows = await q.all(
      `SELECT i.*, t.name_th AS topic_th, t.name_en AS topic_en
       FROM items i JOIN topics t ON t.id = i.topic_id
       WHERE ${whereSql}
       ORDER BY i.topic_id, i.difficulty, i.id
       LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
    res.json({
      ok: true, total, page, pageSize,
      items: rows.map((r) => ({
        id: r.id, topicId: r.topic_id, topicTh: r.topic_th, topicEn: r.topic_en,
        difficulty: r.difficulty, active: !!r.active,
        questionTh: r.question_th, questionEn: r.question_en,
        choicesTh: parseChoices(r.choices_th), choicesEn: parseChoices(r.choices_en),
        correctIndex: r.correct_index,
        explanationTh: r.explanation_th, explanationEn: r.explanation_en,
      })),
    });
  } catch (e) { next(e); }
});

router.post('/items', requireAdmin, async (req, res, next) => {
  try {
    const v = await validateItemPayload(req.body || {});
    if (v.err) return bad(res, v.err);
    const r = await q.run(
      `INSERT INTO items (topic_id, difficulty, question_th, question_en, choices_th, choices_en, correct_index, explanation_th, explanation_en, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      v.topicId, v.difficulty, v.questionTh, v.questionEn, JSON.stringify(v.choicesTh), JSON.stringify(v.choicesEn),
      v.correctIndex, v.explTh, v.explEn, nowIso(), nowIso());
    await audit(req.user.id, 'item.create', String(r.lastInsertRowid));
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.put('/items/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = Number.isInteger(id) && await q.get(`SELECT * FROM items WHERE id = ?`, id);
    if (!item) return bad(res, 'ITEM_NOT_FOUND', 404);
    const v = await validateItemPayload(req.body || {});
    if (v.err) return bad(res, v.err);
    await q.run(
      `UPDATE items SET topic_id=?, difficulty=?, question_th=?, question_en=?, choices_th=?, choices_en=?,
       correct_index=?, explanation_th=?, explanation_en=?, updated_at=? WHERE id=?`,
      v.topicId, v.difficulty, v.questionTh, v.questionEn, JSON.stringify(v.choicesTh), JSON.stringify(v.choicesEn),
      v.correctIndex, v.explTh, v.explEn, nowIso(), id);
    await audit(req.user.id, 'item.update', String(id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/items/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = Number.isInteger(id) && await q.get(`SELECT * FROM items WHERE id = ?`, id);
    if (!item) return bad(res, 'ITEM_NOT_FOUND', 404);
    const used = Number((await q.get(`SELECT COUNT(*) AS n FROM exam_items WHERE item_id = ?`, id)).n);
    if (used > 0) {
      await q.run(`UPDATE items SET active = 0, updated_at = ? WHERE id = ?`, nowIso(), id);
      await audit(req.user.id, 'item.archive', String(id));
      return res.json({ ok: true, archived: true });
    }
    await tx(async (t) => {
      await t.run('DELETE FROM exam_items WHERE item_id = ?', id);
      await t.run('DELETE FROM items WHERE id = ?', id);
    });
    await audit(req.user.id, 'item.delete', String(id));
    res.json({ ok: true, archived: false });
  } catch (e) { next(e); }
});

router.put('/items/:id/restore', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await q.run(`UPDATE items SET active = 1, updated_at = ? WHERE id = ?`, nowIso(), id);
    await audit(req.user.id, 'item.restore', String(id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/items/import', requireAdmin, async (req, res, next) => {
  try {
    const list = Array.isArray((req.body || {}).items) ? req.body.items.slice(0, 500) : [];
    if (!list.length) return bad(res, 'IMPORT_EMPTY');
    let inserted = 0;
    const errors = [];
    await tx(async (t) => {
      let i = 0;
      for (const raw of list) {
        try {
          const v = await validateItemPayload(raw);
          if (v.err) throw new Error(v.err);
          await t.run(
            `INSERT INTO items (topic_id, difficulty, question_th, question_en, choices_th, choices_en, correct_index, explanation_th, explanation_en, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            v.topicId, v.difficulty, v.questionTh, v.questionEn, JSON.stringify(v.choicesTh), JSON.stringify(v.choicesEn),
            v.correctIndex, v.explTh, v.explEn, nowIso(), nowIso());
          inserted += 1;
        } catch (e) {
          errors.push({ index: i, error: e.message });
        }
        i += 1;
      }
    });
    await audit(req.user.id, 'item.import', `inserted:${inserted}`);
    res.json({ ok: true, inserted, errors });
  } catch (e) { next(e); }
});

// ================= exams =================
router.get('/exams', requireAdmin, async (req, res, next) => {
  try {
    const rows = await q.all(`SELECT * FROM exams ORDER BY created_at DESC`);
    const out = [];
    for (const e of rows) {
      out.push({
        ...e, published: !!e.published, shuffle: !!e.shuffle,
        itemCount: Number((await q.get(`SELECT COUNT(*) AS n FROM exam_items WHERE exam_id=?`, e.id)).n),
        attemptCount: Number((await q.get(`SELECT COUNT(*) AS n FROM attempts WHERE exam_id=? AND status='submitted'`, e.id)).n),
      });
    }
    res.json({ ok: true, exams: out });
  } catch (e) { next(e); }
});

function validWindow(openAt, closeAt) {
  const open = Date.parse(openAt);
  const close = Date.parse(closeAt);
  if (Number.isNaN(open) || Number.isNaN(close)) return false;
  return close > open;
}

router.post('/exams/create', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const titleTh = str(b.titleTh, 160);
    const titleEn = typeof b.titleEn === 'string' ? b.titleEn.trim().slice(0, 160) : '';
    const description = typeof b.description === 'string' ? b.description.trim().slice(0, 500) : '';
    const durationMin = Number(b.durationMin);
    if (!titleTh) return bad(res, 'TITLE_REQUIRED');
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 240) return bad(res, 'DURATION_INVALID');
    if (!validWindow(b.openAt, b.closeAt)) return bad(res, 'WINDOW_INVALID');

    let picked = [];
    let shortfall = [];
    if (b.mode === 'manual') {
      picked = [...new Set((Array.isArray(b.itemIds) ? b.itemIds : []).map(Number))];
      if (!picked.length) return bad(res, 'NO_ITEMS_SELECTED');
      const found = [];
      for (const iid of picked) {
        if (await q.get(`SELECT id FROM items WHERE id=? AND active=1`, iid)) found.push(iid);
      }
      if (found.length !== picked.length) return bad(res, 'ITEMS_INVALID');
    } else {
      const bp = b.blueprint && typeof b.blueprint === 'object' ? b.blueprint : null;
      if (!bp) return bad(res, 'BLUEPRINT_INVALID');
      const s = await sampleByBlueprint(bp);
      picked = s.picked;
      shortfall = s.shortfall;
      if (!picked.length) return bad(res, 'NO_ITEMS_MATCH_BLUEPRINT');
    }

    const examId = await tx(async (t) => {
      const r = await t.run(
        `INSERT INTO exams (title_th, title_en, description, duration_min, open_at, close_at, shuffle, published, blueprint, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        titleTh, titleEn, description, durationMin, b.openAt, b.closeAt,
        b.shuffle ? 1 : 0, b.published ? 1 : 0, JSON.stringify(b.blueprint || {}), req.user.id, nowIso());
      await buildExamItems(t, r.lastInsertRowid, picked, false);
      return r.lastInsertRowid;
    });
    await audit(req.user.id, 'exam.create', `${examId} items:${picked.length}`);
    res.json({ ok: true, id: examId, itemCount: picked.length, shortfall });
  } catch (e) { next(e); }
});

router.put('/exams/:id/publish', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = Number.isInteger(id) && await q.get(`SELECT * FROM exams WHERE id = ?`, id);
    if (!exam) return bad(res, 'EXAM_NOT_FOUND', 404);
    const publish = (req.body || {}).published ? 1 : 0;
    if (publish) {
      const count = Number((await q.get(`SELECT COUNT(*) AS n FROM exam_items WHERE exam_id = ?`, id)).n);
      if (!count) return bad(res, 'EXAM_HAS_NO_ITEMS', 409);
    }
    await q.run(`UPDATE exams SET published = ? WHERE id = ?`, publish, id);
    await audit(req.user.id, publish ? 'exam.publish' : 'exam.unpublish', String(id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/exams/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = Number.isInteger(id) && await q.get(`SELECT * FROM exams WHERE id = ?`, id);
    if (!exam) return bad(res, 'EXAM_NOT_FOUND', 404);
    const attempts = Number((await q.get(`SELECT COUNT(*) AS n FROM attempts WHERE exam_id = ?`, id)).n);
    if (attempts > 0) return bad(res, 'EXAM_HAS_ATTEMPTS', 409);
    // Manual cascade: FK enforcement is not guaranteed on remote libSQL.
    await tx(async (t) => {
      await t.run('DELETE FROM exam_items WHERE exam_id = ?', id);
      await t.run('DELETE FROM exams WHERE id = ?', id);
    });
    await audit(req.user.id, 'exam.delete', String(id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

function examMetaOut(e) {
  return {
    id: e.id, titleTh: e.title_th, titleEn: e.title_en || e.title_th,
    durationMin: e.duration_min, openAt: e.open_at, closeAt: e.close_at,
    shuffle: !!e.shuffle, published: !!e.published,
  };
}

router.get('/exams/:id/roster', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = Number.isInteger(id) && await q.get(`SELECT * FROM exams WHERE id = ?`, id);
    if (!exam) return bad(res, 'EXAM_NOT_FOUND', 404);
    const totalQ = Number((await q.get(`SELECT COUNT(*) AS n FROM exam_items WHERE exam_id = ?`, id)).n);
    const rows = await q.all(
      `SELECT a.*, u.username, u.first_name, u.last_name
       FROM attempts a JOIN users u ON u.id = a.user_id
       WHERE a.exam_id = ? ORDER BY a.started_at DESC`, id);
    const serverNow = nowIso();
    const roster = rows.map((r) => {
      const answered = Object.keys(JSON.parse(r.answers)).length;
      const percent = r.score != null && totalQ ? Math.round((r.score / totalQ) * 1000) / 10 : null;
      return {
        attemptId: r.id, userId: r.user_id, username: r.username,
        fullName: `${r.first_name} ${r.last_name}`,
        status: r.status, startedAt: r.started_at, deadlineAt: r.deadline_at,
        submittedAt: r.submitted_at, answeredCount: answered, totalQuestions: totalQ,
        score: r.score, percent,
        serverNow,
      };
    });
    res.json({ ok: true, exam: { ...examMetaOut(exam), totalQuestions: totalQ }, roster, serverNow });
  } catch (e) { next(e); }
});

router.get('/exams/:id/item-analysis', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = Number.isInteger(id) && await q.get(`SELECT * FROM exams WHERE id = ?`, id);
    if (!exam) return bad(res, 'EXAM_NOT_FOUND', 404);
    const submitted = await q.all(`SELECT answers FROM attempts WHERE exam_id = ? AND status = 'submitted'`, id);
    const withCorrect = await q.all(
      `SELECT ei.position, i.id, i.question_th, i.question_en, i.difficulty, i.correct_index, t.name_th AS topic_th
       FROM exam_items ei JOIN items i ON i.id = ei.item_id JOIN topics t ON t.id=i.topic_id
       WHERE ei.exam_id = ? ORDER BY ei.position`, id);
    const out = withCorrect.map((it) => {
      let attempted = 0; let correct = 0;
      for (const s of submitted) {
        const pick = JSON.parse(s.answers)[String(it.id)];
        if (pick === undefined) continue;
        attempted += 1;
        if (pick === it.correct_index) correct += 1;
      }
      return {
        position: it.position, itemId: it.id,
        snippetTh: it.question_th.slice(0, 80), difficulty: it.difficulty, topicTh: it.topic_th,
        attemptedCount: attempted, correctCount: correct,
        correctRate: attempted ? Math.round((correct / attempted) * 1000) / 10 : null,
      };
    });
    res.json({ ok: true, submittedAttempts: submitted.length, analysis: out });
  } catch (e) { next(e); }
});

// ================= scores & reports =================
router.get('/scores', requireAdmin, async (req, res, next) => {
  try {
    const examId = Number(req.query.examId) || null;
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : null;
    const where = [`a.status = 'submitted'`];
    const params = [];
    if (examId) { where.push('a.exam_id = ?'); params.push(examId); }
    if (search) { where.push('(u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (from) { where.push("substr(a.submitted_at, 1, 10) >= ?"); params.push(from); }
    if (to) { where.push("substr(a.submitted_at, 1, 10) <= ?"); params.push(to); }
    const rows = await q.all(
      `SELECT a.id AS attempt_id, a.score, a.submitted_at, a.started_at,
              u.id AS user_id, u.username, u.first_name, u.last_name, u.org,
              e.id AS exam_id, e.title_th, e.title_en
       FROM attempts a JOIN users u ON u.id = a.user_id JOIN exams e ON e.id = a.exam_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.score DESC, a.submitted_at ASC`, ...params);

    const totalsByExam = new Map();
    const getTotal = async (eid) => {
      if (!totalsByExam.has(eid)) {
        totalsByExam.set(eid, Number((await q.get(`SELECT COUNT(*) AS n FROM exam_items WHERE exam_id = ?`, eid)).n));
      }
      return totalsByExam.get(eid);
    };

    const out = [];
    for (const r of rows) {
      const total = await getTotal(r.exam_id);
      const percent = total ? Math.round((r.score / total) * 1000) / 10 : 0;
      out.push({
        attemptId: r.attempt_id, userId: r.user_id, username: r.username,
        fullName: `${r.first_name} ${r.last_name}`, org: r.org,
        examId: r.exam_id, examTitle: r.title_en && req.query.lang === 'en' ? r.title_en : r.title_th,
        score: r.score, total, percent, submittedAt: r.submitted_at,
      });
    }

    const pcts = out.map((o) => o.percent).sort((a, b) => a - b);
    const n = pcts.length;
    const mean = n ? Math.round(pcts.reduce((s, v) => s + v, 0) / n * 10) / 10 : 0;
    const median = n ? (n % 2 ? pcts[(n - 1) / 2] : Math.round(((pcts[n / 2 - 1] + pcts[n / 2]) / 2) * 10) / 10) : 0;
    const sd = n ? Math.round(Math.sqrt(pcts.reduce((s, v) => s + (v - mean) ** 2, 0) / n) * 10) / 10 : 0;
    res.json({
      ok: true,
      rows: out,
      stats: { n, mean, median, sd, high: n ? pcts[n - 1] : 0, low: n ? pcts[0] : 0 },
    });
  } catch (e) { next(e); }
});

// trend data: average percent per exam over time
router.get('/reports/trend', requireAdmin, async (req, res, next) => {
  try {
    const rows = await q.all(
      `SELECT e.id AS exam_id, e.title_th, e.title_en, e.close_at,
              a.score, (SELECT COUNT(*) FROM exam_items ei WHERE ei.exam_id = e.id) AS total
       FROM exams e JOIN attempts a ON a.exam_id = e.id
       WHERE a.status = 'submitted' AND a.score IS NOT NULL
       ORDER BY e.close_at ASC`);
    const byExam = new Map();
    for (const r of rows) {
      if (!byExam.has(r.exam_id)) byExam.set(r.exam_id, { label: r.title_th, labelEn: r.title_en || r.title_th, date: r.close_at.slice(0, 10), pcts: [] });
      if (r.total) byExam.get(r.exam_id).pcts.push((r.score / r.total) * 100);
    }
    const points = [...byExam.values()].map((g) => ({
      label: g.label, labelEn: g.labelEn, date: g.date,
      avgPercent: g.pcts.length ? Math.round(g.pcts.reduce((s, v) => s + v, 0) / g.pcts.length * 10) / 10 : 0,
    }));
    res.json({ ok: true, points });
  } catch (e) { next(e); }
});

// ================= audit =================
router.get('/audit', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(300, Math.max(10, Number(req.query.limit) || 100));
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rows = await q.all(
      `SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE (? = '' OR a.action LIKE ? OR u.username LIKE ?)
       ORDER BY a.at DESC LIMIT ?`,
      search, `%${search}%`, `%${search}%`, limit);
    res.json({ ok: true, entries: rows.map((r) => ({ id: r.id, at: r.at, action: r.action, detail: r.detail, username: r.username })) });
  } catch (e) { next(e); }
});

module.exports = router;
