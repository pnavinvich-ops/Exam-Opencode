'use strict';

const express = require('express');
const { q, nowIso, audit } = require('./db');
const { requireAuth } = require('./auth');
const { grade } = require('./examEngine');

const router = express.Router();

function bad(res, code, status = 400) { return res.status(status).json({ error: code }); }

function parseChoices(s) { try { return JSON.parse(s); } catch { return []; } }

function windowState(exam, now = Date.now()) {
  const open = Date.parse(exam.open_at);
  const close = Date.parse(exam.close_at);
  if (now < open) return 'upcoming';
  if (now > close) return 'closed';
  return 'open';
}

function examMeta(e, lang) {
  const title = lang === 'en' && e.title_en ? e.title_en : e.title_th;
  return {
    id: e.id, titleTh: e.title_th, titleEn: e.title_en || e.title_th,
    title, description: e.description,
    durationMin: e.duration_min, openAt: e.open_at, closeAt: e.close_at,
    shuffle: !!e.shuffle, published: !!e.published,
  };
}

function autoSubmitIfDue(attempt) {
  if (attempt.status !== 'in_progress') return attempt;
  if (Date.now() <= Date.parse(attempt.deadline_at)) return attempt;
  return submitAttempt(attempt, attempt.deadline_at);
}

function submitAttempt(attempt, submittedAtIso) {
  const items = q.all(
    `SELECT i.id, i.correct_index FROM exam_items ei JOIN items i ON i.id = ei.item_id
     WHERE ei.exam_id = ? ORDER BY ei.position`, attempt.exam_id);
  let score = 0;
  for (const it of items) {
    const pick = JSON.parse(attempt.answers)[String(it.id)];
    if (pick === it.correct_index) score += 1;
  }
  const submittedAt = submittedAtIso || nowIso();
  q.run(
    `UPDATE attempts SET status = 'submitted', submitted_at = ?, score = ? WHERE id = ?`,
    submittedAt < attempt.deadline_at ? submittedAt : attempt.deadline_at, score, attempt.id
  );
  return q.get(`SELECT * FROM attempts WHERE id = ?`, attempt.id);
}

function loadQuestions(examId) {
  return q.all(
    `SELECT i.id, i.topic_id, i.difficulty, i.question_th, i.question_en, i.choices_th, i.choices_en
     FROM exam_items ei JOIN items i ON i.id = ei.item_id
     WHERE ei.exam_id = ? ORDER BY ei.position`, examId)
    .map((r, idx) => ({
      position: idx + 1, itemId: r.id, topicId: r.topic_id, difficulty: r.difficulty,
      questionTh: r.question_th, questionEn: r.question_en,
      choicesTh: parseChoices(r.choices_th), choicesEn: parseChoices(r.choices_en),
    }));
}

function runnerPayload(attempt, exam) {
  return {
    attemptId: attempt.id,
    status: attempt.status,
    deadlineAt: attempt.deadline_at,
    startedAt: attempt.started_at,
    serverNow: nowIso(),
    answers: JSON.parse(attempt.answers),
    flagged: JSON.parse(attempt.flagged),
    exam: examMeta(exam),
    questions: loadQuestions(exam.id),
  };
}

// ---------- available exams ----------
router.get('/exams/available', requireAuth, (req, res) => {
  const rows = q.all(`SELECT * FROM exams WHERE published = 1 ORDER BY close_at ASC`);
  const out = [];
  for (const e of rows) {
    const att = q.get(`SELECT id, status, score FROM attempts WHERE exam_id = ? AND user_id = ?`, e.id, req.user.id);
    out.push({
      ...examMeta(e, req.query.lang),
      state: windowState(e),
      questionCount: q.get(`SELECT COUNT(*) AS n FROM exam_items WHERE exam_id = ?`, e.id).n,
      myAttempt: att ? { id: att.id, status: att.status, score: att.score } : null,
    });
  }
  res.json({ ok: true, exams: out });
});

// ---------- start / resume ----------
router.post('/attempts/start', requireAuth, (req, res) => {
  if (req.user.role === 'admin') return bad(res, 'ADMIN_CANNOT_TAKE', 403);
  const examId = Number((req.body || {}).examId);
  const exam = Number.isInteger(examId) && q.get(`SELECT * FROM exams WHERE id = ?`, examId);
  if (!exam || !exam.published) return bad(res, 'EXAM_NOT_FOUND', 404);

  const state = windowState(exam);
  if (state === 'upcoming') return bad(res, 'NOT_OPEN_YET', 403);
  if (state === 'closed') return bad(res, 'EXAM_CLOSED', 403);

  let attempt = q.get(`SELECT * FROM attempts WHERE exam_id = ? AND user_id = ?`, examId, req.user.id);
  if (attempt && attempt.status === 'submitted') return bad(res, 'ALREADY_SUBMITTED', 409);

  if (!attempt) {
    const start = new Date();
    const byDuration = new Date(start.getTime() + exam.duration_min * 60000);
    const close = new Date(Date.parse(exam.close_at));
    const deadline = byDuration < close ? byDuration : close;
    const r = q.run(
      `INSERT INTO attempts (exam_id, user_id, started_at, deadline_at) VALUES (?, ?, ?, ?)`,
      examId, req.user.id, start.toISOString(), deadline.toISOString()
    );
    audit(req.user.id, 'attempt.start', `exam:${examId}`);
    attempt = q.get(`SELECT * FROM attempts WHERE id = ?`, r.lastInsertRowid);
  } else {
    attempt = autoSubmitIfDue(attempt);
    if (attempt.status === 'submitted') return bad(res, 'ALREADY_SUBMITTED', 409);
  }

  res.json({ ok: true, ...runnerPayload(attempt, exam) });
});

function ownAttempt(req, res) {
  const id = Number(req.params.id);
  const attempt = Number.isInteger(id) && q.get(`SELECT * FROM attempts WHERE id = ?`, id);
  if (!attempt || attempt.user_id !== req.user.id) { bad(res, 'ATTEMPT_NOT_FOUND', 404); return null; }
  return attempt;
}

router.get('/attempts/:id', requireAuth, (req, res) => {
  const attempt = ownAttempt(req, res);
  if (!attempt) return;
  const fresh = autoSubmitIfDue(attempt);
  if (fresh.status === 'submitted') {
    return res.json({ ok: true, submitted: true, attemptId: fresh.id });
  }
  const exam = q.get(`SELECT * FROM exams WHERE id = ?`, fresh.exam_id);
  res.json({ ok: true, submitted: false, ...runnerPayload(fresh, exam) });
});

router.post('/attempts/:id/answer', requireAuth, (req, res) => {
  const attempt = ownAttempt(req, res);
  if (!attempt) return;
  if (attempt.status !== 'in_progress') return bad(res, 'ALREADY_SUBMITTED', 409);
  if (Date.now() > Date.parse(attempt.deadline_at)) {
    autoSubmitIfDue(attempt);
    return bad(res, 'TIME_UP', 409);
  }
  const b = req.body || {};
  const itemId = Number(b.itemId);
  if (!Number.isInteger(itemId)) return bad(res, 'BAD_ITEM');
  const answers = JSON.parse(attempt.answers);
  if (b.choice === null || b.choice === undefined) delete answers[String(itemId)];
  else {
    const choice = Number(b.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 4) return bad(res, 'BAD_CHOICE');
    answers[String(itemId)] = choice;
  }
  q.run(`UPDATE attempts SET answers = ? WHERE id = ?`, JSON.stringify(answers), attempt.id);
  res.json({ ok: true, savedAt: nowIso() });
});

router.post('/attempts/:id/flag', requireAuth, (req, res) => {
  const attempt = ownAttempt(req, res);
  if (!attempt) return;
  if (attempt.status !== 'in_progress') return bad(res, 'ALREADY_SUBMITTED', 409);
  const b = req.body || {};
  const itemId = Number(b.itemId);
  if (!Number.isInteger(itemId)) return bad(res, 'BAD_ITEM');
  const flagged = JSON.parse(attempt.flagged);
  const idx = flagged.indexOf(itemId);
  if (b.flagged === true && idx === -1) flagged.push(itemId);
  if (b.flagged === false && idx !== -1) flagged.splice(idx, 1);
  q.run(`UPDATE attempts SET flagged = ? WHERE id = ?`, JSON.stringify(flagged), attempt.id);
  res.json({ ok: true });
});

router.post('/attempts/:id/submit', requireAuth, (req, res) => {
  const attempt = ownAttempt(req, res);
  if (!attempt) return;
  if (attempt.status === 'submitted') {
    return res.json({ ok: true, alreadySubmitted: true, resultId: attempt.id });
  }
  const late = Date.now() > Date.parse(attempt.deadline_at);
  const fresh = submitAttempt(attempt, late ? attempt.deadline_at : null);
  audit(req.user.id, 'attempt.submit', late ? 'auto' : 'manual');
  res.json({ ok: true, resultId: fresh.id, autoSubmitted: late });
});

// ---------- results ----------
router.get('/attempts/:id/result', requireAuth, (req, res) => {
  const attempt = ownAttempt(req, res);
  if (!attempt) return;
  if (attempt.status !== 'submitted') return bad(res, 'NOT_SUBMITTED', 409);

  const exam = q.get(`SELECT * FROM exams WHERE id = ?`, attempt.exam_id);
  const rows = q.all(
    `SELECT i.*, t.name_th AS topic_th, t.name_en AS topic_en
     FROM exam_items ei JOIN items i ON i.id = ei.item_id JOIN topics t ON t.id = i.topic_id
     WHERE ei.exam_id = ? ORDER BY ei.position`, attempt.exam_id);

  const answers = JSON.parse(attempt.answers);
  const questions = rows.map((r, i) => ({
    position: i + 1,
    itemId: r.id,
    topicTh: r.topic_th, topicEn: r.topic_en,
    difficulty: r.difficulty,
    questionTh: r.question_th, questionEn: r.question_en,
    choicesTh: parseChoices(r.choices_th), choicesEn: parseChoices(r.choices_en),
    correctIndex: r.correct_index,
    yourChoice: Object.prototype.hasOwnProperty.call(answers, String(r.id)) ? answers[String(r.id)] : null,
    explanationTh: r.explanation_th, explanationEn: r.explanation_en,
  }));

  const total = questions.length;
  res.json({
    ok: true,
    attemptId: attempt.id,
    submittedAt: attempt.submitted_at,
    exam: examMeta(exam),
    score: attempt.score,
    total,
    percent: total ? Math.round((attempt.score / total) * 1000) / 10 : 0,
    questions,
  });
});

router.get('/my/results', requireAuth, (req, res) => {
  const rows = q.all(
    `SELECT a.id AS attempt_id, a.status, a.started_at, a.submitted_at, a.score,
            e.title_th, e.title_en, e.duration_min
     FROM attempts a JOIN exams e ON e.id = a.exam_id
     WHERE a.user_id = ? ORDER BY COALESCE(a.submitted_at, a.started_at) DESC`, req.user.id);
  const results = rows.map((r) => {
    const total = q.get(`SELECT COUNT(*) AS n FROM exam_items WHERE exam_id IN (SELECT exam_id FROM attempts WHERE id = ?)`, r.attempt_id).n;
    return {
      attemptId: r.attempt_id, status: r.status,
      titleTh: r.title_th, titleEn: r.title_en || r.title_th,
      durationMin: r.duration_min, startedAt: r.started_at, submittedAt: r.submitted_at,
      score: r.score, total, percent: total && r.score != null ? Math.round((r.score / total) * 1000) / 10 : null,
    };
  });
  res.json({ ok: true, results });
});

module.exports = router;
