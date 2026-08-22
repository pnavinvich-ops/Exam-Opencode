'use strict';

const crypto = require('node:crypto');
const { q, tx, nowIso, audit } = require('./db');
const { hashPassword } = require('./auth');

function iso(daysFromNow, hours = 0) {
  return new Date(Date.now() + daysFromNow * 86400000 + hours * 3600000).toISOString();
}

function grade(orderedItems, answers) {
  let score = 0;
  const detail = [];
  for (const it of orderedItems) {
    const pick = answers[it.id] ?? answers[String(it.id)];
    const ok = Number.isInteger(pick) && pick === it.correct_index ? 1 : 0;
    score += ok;
    detail.push({ item_id: it.id, pick: Number.isInteger(pick) ? pick : null, correct: it.correct_index, ok });
  }
  return { score, detail };
}

function buildExamItems(examId, itemIds, shuffle) {
  let ids = [...itemIds];
  if (shuffle) for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  ids.forEach((itemId, idx) => q.run('INSERT INTO exam_items (exam_id, item_id, position) VALUES (?, ?, ?)', examId, itemId, idx + 1));
}

function sampleByBlueprint(bp) {
  const picked = [];
  const shortfall = [];
  for (const [topicIdStr, byDiff] of Object.entries(bp)) {
    for (const [diffStr, count] of Object.entries(byDiff)) {
      const need = Number(count) || 0;
      if (need <= 0) continue;
      const pool = q.all('SELECT id FROM items WHERE active=1 AND topic_id=? AND difficulty=? ORDER BY RANDOM() LIMIT ?', Number(topicIdStr), Number(diffStr), need);
      picked.push(...pool.map(r => r.id));
      if (pool.length < need) shortfall.push({ topicId: Number(topicIdStr), diff: Number(diffStr), missing: need - pool.length });
    }
  }
  return { picked, shortfall };
}

module.exports = { iso, grade, buildExamItems, sampleByBlueprint };
