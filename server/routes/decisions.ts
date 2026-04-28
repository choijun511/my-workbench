import { Router } from 'express';
import db from '../db.js';
import { extractDecision, embedText } from '../gemini.js';

const router = Router();

const DRAFT_THRESHOLD = 0.65; // confidence below this → status='draft'

// Cosine similarity helper
function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

function rowToDecision(r: any) {
  return {
    ...r,
    alternatives: safeJson(r.alternatives, []),
    assumptions: safeJson(r.assumptions, []),
    verify: r.verify ? safeJson(r.verify, null) : null,
    tags: safeJson(r.tags, []),
    reflection_log: safeJson(r.reflection_log, []),
    embedding: undefined, // never ship raw embeddings to client
  };
}
function safeJson<T>(s: any, fallback: T): T {
  if (!s) return fallback;
  if (typeof s !== 'string') return s as T;
  try { return JSON.parse(s); } catch { return fallback; }
}

// List decisions
router.get('/', (req, res) => {
  const status = req.query.status as string | undefined;
  const tag = req.query.tag as string | undefined;
  const q = req.query.q as string | undefined;
  let sql = `SELECT * FROM decisions WHERE 1=1`;
  const params: any[] = [];
  if (status) { sql += ` AND status = ?`; params.push(status); }
  if (q) {
    sql += ` AND (title LIKE ? OR decision LIKE ? OR context LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ` ORDER BY created_at DESC`;
  const rows = db.prepare(sql).all(...params) as any[];
  let filtered = rows;
  if (tag) filtered = rows.filter(r => safeJson<string[]>(r.tags, []).includes(tag));
  res.json(filtered.map(rowToDecision));
});

// Stats (counts per status, plus due-for-review count)
router.get('/stats', (_req, res) => {
  const rows = db.prepare(`SELECT status, COUNT(*) as c FROM decisions GROUP BY status`).all() as Array<{ status: string; c: number }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = r.c;
  const due = db.prepare(
    `SELECT COUNT(*) AS c FROM decisions WHERE status = 'active' AND next_review_at IS NOT NULL AND next_review_at <= datetime('now')`
  ).get() as { c: number };
  res.json({ counts, due_for_review: due.c });
});

// Detail
router.get('/:id', (req, res) => {
  const r = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(req.params.id) as any;
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(rowToDecision(r));
});

// Capture: extract from raw text via Gemini, save
router.post('/capture', async (req, res) => {
  const { raw_text, source_tool, source_url, source_captured_at } = req.body || {};
  if (!raw_text || !String(raw_text).trim()) {
    return res.status(400).json({ error: 'raw_text required' });
  }
  try {
    const ext = await extractDecision(String(raw_text), source_tool, source_url);
    const status = ext.confidence >= DRAFT_THRESHOLD ? 'active' : 'draft';

    const nextReviewAt = ext.verify?.after_days
      ? new Date(Date.now() + ext.verify.after_days * 24 * 3600 * 1000)
          .toISOString().slice(0, 19).replace('T', ' ')
      : null;

    const info = db.prepare(`
      INSERT INTO decisions (
        title, decision, context, alternatives, assumptions, verify, status,
        confidence, tags, source_tool, source_url, source_captured_at, raw_excerpt, next_review_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ext.title,
      ext.decision,
      ext.context,
      JSON.stringify(ext.alternatives),
      JSON.stringify(ext.assumptions),
      ext.verify ? JSON.stringify(ext.verify) : '',
      status,
      ext.confidence,
      JSON.stringify(ext.tags),
      source_tool || null,
      source_url || null,
      source_captured_at || new Date().toISOString(),
      String(raw_text),
      nextReviewAt
    );
    const row = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(info.lastInsertRowid);
    res.json({ ...rowToDecision(row), reasoning: ext.reasoning });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Update fields
router.put('/:id', (req, res) => {
  const allowed = ['title', 'decision', 'context', 'status', 'next_review_at'];
  const jsonAllowed = ['alternatives', 'assumptions', 'verify', 'tags'];
  const sets: string[] = [];
  const params: any[] = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(req.body[k]);
    }
  }
  for (const k of jsonAllowed) {
    if (req.body[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(JSON.stringify(req.body[k]));
    }
  }
  if (!sets.length) return res.json({ success: true });
  sets.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE decisions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// Delete
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM decisions WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// Promote draft → active
router.post('/:id/promote', (req, res) => {
  db.prepare(`UPDATE decisions SET status = 'active', updated_at = datetime('now') WHERE id = ? AND status = 'draft'`)
    .run(req.params.id);
  res.json({ success: true });
});

// Mark superseded by another decision
router.post('/:id/supersede', (req, res) => {
  const supersedes_id = Number(req.body?.supersedes_id);
  if (!supersedes_id) return res.status(400).json({ error: 'supersedes_id required' });
  const tx = db.transaction(() => {
    db.prepare(`UPDATE decisions SET supersedes_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(supersedes_id, req.params.id);
    db.prepare(`UPDATE decisions SET status = 'superseded', updated_at = datetime('now') WHERE id = ?`)
      .run(supersedes_id);
  });
  tx();
  res.json({ success: true });
});

// Add a reflection entry
router.post('/:id/reflect', (req, res) => {
  const { status: reflectStatus, note } = req.body || {};
  if (!['holds', 'wrong', 'pivoted', 'still_thinking'].includes(reflectStatus)) {
    return res.status(400).json({ error: 'invalid reflection status' });
  }
  const r = db.prepare(`SELECT reflection_log, status FROM decisions WHERE id = ?`).get(req.params.id) as any;
  if (!r) return res.status(404).json({ error: 'not found' });
  const log = safeJson<any[]>(r.reflection_log, []);
  log.push({ at: new Date().toISOString(), status: reflectStatus, note: note || '' });
  let newStatus = r.status;
  if (reflectStatus === 'wrong') newStatus = 'reverted';
  else if (reflectStatus === 'pivoted') newStatus = 'obsolete';
  db.prepare(`UPDATE decisions SET reflection_log = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(log), newStatus, req.params.id);
  res.json({ success: true });
});

// Find related decisions via embeddings (lazy)
router.post('/:id/find-related', async (req, res) => {
  const target = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(req.params.id) as any;
  if (!target) return res.status(404).json({ error: 'not found' });

  try {
    // Ensure target has an embedding
    let targetVec = safeJson<number[] | null>(target.embedding, null);
    if (!targetVec) {
      targetVec = await embedText(`${target.title}\n${target.decision}\n${target.context}`);
      db.prepare(`UPDATE decisions SET embedding = ? WHERE id = ?`).run(JSON.stringify(targetVec), target.id);
    }

    // Lazy-compute embeddings for any other decisions missing them
    const others = db.prepare(`SELECT id, title, decision, context, embedding FROM decisions WHERE id != ?`)
      .all(target.id) as any[];
    const updateStmt = db.prepare(`UPDATE decisions SET embedding = ? WHERE id = ?`);
    for (const o of others) {
      if (!o.embedding) {
        try {
          const v = await embedText(`${o.title}\n${o.decision}\n${o.context}`);
          updateStmt.run(JSON.stringify(v), o.id);
          o.embedding = JSON.stringify(v);
        } catch {
          // skip on error; no embedding for this one this round
          continue;
        }
      }
    }

    // Score
    const scored = others
      .map(o => {
        const v = safeJson<number[] | null>(o.embedding, null);
        if (!v) return null;
        return { id: o.id, title: o.title, score: cosine(targetVec!, v) };
      })
      .filter(Boolean) as Array<{ id: number; title: string; score: number }>;
    scored.sort((a, b) => b.score - a.score);
    res.json(scored.slice(0, 8));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Decisions due for review (verify follow-up window has elapsed)
router.get('/review/due', (_req, res) => {
  const rows = db.prepare(
    `SELECT * FROM decisions WHERE status = 'active' AND next_review_at IS NOT NULL AND next_review_at <= datetime('now') ORDER BY next_review_at ASC`
  ).all() as any[];
  res.json(rows.map(rowToDecision));
});

export default router;
