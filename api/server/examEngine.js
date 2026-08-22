'use strict';

const { q } = require('./db');

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

// txApi: transaction-scoped { run, batch } helpers from db.tx()
async function buildExamItems(txApi, examId, itemIds, shuffle) {
  let ids = [...itemIds];
  if (shuffle) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  let pos = 1;
  await txApi.batch(ids.map((itemId) => ({
    sql: 'INSERT INTO exam_items (exam_id, item_id, position) VALUES (?, ?, ?)',
    args: [examId, itemId, pos++],
  })));
}

// dbApi defaults to the global handle; pass a tx api when sampling inside a transaction.
// All pool SELECTs go out as ONE batched round-trip.
async function sampleByBlueprint(bp, dbApi = q) {
  const stmts = [];
  for (const [topicIdStr, byDiff] of Object.entries(bp)) {
    for (const [diffStr, count] of Object.entries(byDiff)) {
      const need = Number(count) || 0;
      if (need <= 0) continue;
      stmts.push({
        sql: 'SELECT id FROM items WHERE active=1 AND topic_id=? AND difficulty=? ORDER BY RANDOM() LIMIT ?',
        args: [Number(topicIdStr), Number(diffStr), need],
        topicId: Number(topicIdStr),
        diff: Number(diffStr),
        need,
      });
    }
  }
  if (!stmts.length) return { picked: [], shortfall: [] };

  const picked = [];
  const shortfall = [];
  const results = await dbApi.batch(stmts);
  results.forEach((res, i) => {
    const meta = stmts[i];
    const pool = res.rows.map((r) => r.id);
    picked.push(...pool);
    if (pool.length < meta.need) shortfall.push({ topicId: meta.topicId, diff: meta.diff, missing: meta.need - pool.length });
  });
  return { picked, shortfall };
}

module.exports = { iso, grade, buildExamItems, sampleByBlueprint };
