import { Router } from 'express';
import db from '../db.js';
import { extractDecision, embedText, classifyRelationship } from '../gemini.js';
import { runDecisionReviewCheck } from '../decisionReview.js';

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

function clampInt(v: any, lo: number, hi: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function clampNum(v: any, lo: number, hi: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

function latestVerdict(reflectionLog: Array<{ status?: string }>): 'holds' | 'wrong' | null {
  for (let i = reflectionLog.length - 1; i >= 0; i--) {
    const s = reflectionLog[i]?.status;
    if (s === 'holds' || s === 'wrong') return s;
  }
  return null;
}

function computeJudgmentScore(d: {
  odds?: number; conviction?: number; importance?: number; non_consensus?: number;
  reflection_log: Array<{ status?: string }>;
}): { score: number; verdict: 'holds' | 'wrong' | 'pending'; multiplier: number } {
  const odds = d.odds ?? 1;
  const conviction = d.conviction ?? 1;
  const importance = d.importance ?? 1;
  const nonConsensus = d.non_consensus ?? 1;
  const multiplier = odds * conviction * importance * nonConsensus;
  const verdict = latestVerdict(d.reflection_log || []);
  if (!verdict) return { score: 0, verdict: 'pending', multiplier };
  const base = verdict === 'holds' ? 1 : -2;
  return { score: base * multiplier, verdict, multiplier };
}

function rowToDecision(r: any) {
  const reflectionLog = safeJson<any[]>(r.reflection_log, []);
  const judgment = computeJudgmentScore({
    odds: r.odds,
    conviction: r.conviction,
    importance: r.importance,
    non_consensus: r.non_consensus,
    reflection_log: reflectionLog,
  });
  return {
    ...r,
    alternatives: safeJson(r.alternatives, []),
    assumptions: safeJson(r.assumptions, []),
    verify: r.verify ? safeJson(r.verify, null) : null,
    tags: safeJson(r.tags, []),
    reflection_log: reflectionLog,
    odds: r.odds ?? 1,
    conviction: r.conviction ?? 1,
    importance: r.importance ?? 1,
    non_consensus: r.non_consensus ?? 1,
    judgment_score: judgment.score,
    judgment_verdict: judgment.verdict,
    judgment_multiplier: judgment.multiplier,
    embedding: undefined,
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

// Stats (counts per status, plus due-for-review count, plus aggregate judgment score)
router.get('/stats', (_req, res) => {
  const rows = db.prepare(`SELECT status, COUNT(*) as c FROM decisions GROUP BY status`).all() as Array<{ status: string; c: number }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = r.c;
  const due = db.prepare(
    `SELECT COUNT(*) AS c FROM decisions WHERE status = 'active' AND next_review_at IS NOT NULL AND next_review_at <= datetime('now')`
  ).get() as { c: number };

  // Judgment score: walk all decisions, compute score per row
  const all = db.prepare(`SELECT odds, conviction, importance, non_consensus, reflection_log FROM decisions`).all() as any[];
  let total = 0;
  let holds = 0;
  let wrong = 0;
  let pending = 0;
  let bestScore = 0;
  let worstScore = 0;
  for (const r of all) {
    const log = safeJson<any[]>(r.reflection_log, []);
    const j = computeJudgmentScore({
      odds: r.odds,
      conviction: r.conviction,
      importance: r.importance,
      non_consensus: r.non_consensus,
      reflection_log: log,
    });
    total += j.score;
    if (j.verdict === 'holds') holds += 1;
    else if (j.verdict === 'wrong') wrong += 1;
    else pending += 1;
    if (j.score > bestScore) bestScore = j.score;
    if (j.score < worstScore) worstScore = j.score;
  }
  res.json({
    counts,
    due_for_review: due.c,
    judgment: {
      total_score: total,
      holds_count: holds,
      wrong_count: wrong,
      pending_count: pending,
      best_score: bestScore,
      worst_score: worstScore,
    },
  });
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
  if (req.body.odds !== undefined) {
    sets.push(`odds = ?`);
    params.push(clampNum(req.body.odds, 0.1, 100, 1));
  }
  if (req.body.conviction !== undefined) {
    sets.push(`conviction = ?`);
    params.push(clampInt(req.body.conviction, 1, 3, 1));
  }
  if (req.body.importance !== undefined) {
    sets.push(`importance = ?`);
    params.push(clampInt(req.body.importance, 1, 3, 1));
  }
  if (req.body.non_consensus !== undefined) {
    sets.push(`non_consensus = ?`);
    params.push(clampInt(req.body.non_consensus, 1, 3, 1));
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

// Find related decisions via embeddings (lazy). Optionally classify relationship via LLM.
router.post('/:id/find-related', async (req, res) => {
  const target = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(req.params.id) as any;
  if (!target) return res.status(404).json({ error: 'not found' });

  const minScore = req.body?.min_score != null ? Number(req.body.min_score) : 0.45;
  const topK = req.body?.top_k != null ? Number(req.body.top_k) : 8;
  const analyze = !!req.body?.analyze; // when true, run LLM relationship classifier on top-K

  try {
    // Ensure target has an embedding
    let targetVec = safeJson<number[] | null>(target.embedding, null);
    if (!targetVec) {
      targetVec = await embedText(`${target.title}\n${target.decision}\n${target.context}`);
      db.prepare(`UPDATE decisions SET embedding = ? WHERE id = ?`).run(JSON.stringify(targetVec), target.id);
    }

    // Lazy-compute embeddings for other decisions
    const others = db.prepare(`SELECT id, title, decision, context, embedding, created_at FROM decisions WHERE id != ?`)
      .all(target.id) as any[];
    const updateStmt = db.prepare(`UPDATE decisions SET embedding = ? WHERE id = ?`);
    for (const o of others) {
      if (!o.embedding) {
        try {
          const v = await embedText(`${o.title}\n${o.decision}\n${o.context}`);
          updateStmt.run(JSON.stringify(v), o.id);
          o.embedding = JSON.stringify(v);
        } catch {
          continue;
        }
      }
    }

    // Mark already-linked candidates so frontend can show link status
    const existingLinks = db.prepare(`
      SELECT to_id, kind FROM decision_links WHERE from_id = ?
      UNION
      SELECT from_id AS to_id, kind FROM decision_links WHERE to_id = ?
    `).all(target.id, target.id) as Array<{ to_id: number; kind: string }>;
    const linkedKinds = new Map<number, string>();
    for (const l of existingLinks) linkedKinds.set(l.to_id, l.kind);

    const scored = others
      .map(o => {
        const v = safeJson<number[] | null>(o.embedding, null);
        if (!v) return null;
        return {
          id: o.id,
          title: o.title,
          decision: o.decision,
          context: o.context,
          created_at: o.created_at,
          score: cosine(targetVec!, v),
          existing_link_kind: linkedKinds.get(o.id) || null,
        };
      })
      .filter(Boolean) as Array<any>;
    scored.sort((a, b) => b.score - a.score);
    const filtered = scored.filter(s => s.score >= minScore).slice(0, topK);

    if (analyze) {
      for (const cand of filtered) {
        try {
          const cls = await classifyRelationship(
            { title: target.title, decision: target.decision, context: target.context, created_at: target.created_at },
            { title: cand.title, decision: cand.decision, context: cand.context, created_at: cand.created_at }
          );
          cand.suggested_kind = cls.kind;
          cand.suggested_reason = cls.reasoning;
        } catch (e) {
          cand.suggested_kind = null;
          cand.suggested_reason = (e as Error).message;
        }
      }
    }

    // Strip large fields before returning
    res.json(filtered.map(c => ({
      id: c.id,
      title: c.title,
      score: c.score,
      existing_link_kind: c.existing_link_kind,
      suggested_kind: c.suggested_kind || null,
      suggested_reason: c.suggested_reason || null,
    })));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// === Decision links ===

const VALID_LINK_KINDS = ['related', 'extends', 'contradicts', 'supersedes', 'reverts'];

// List links for a decision (both incoming and outgoing)
router.get('/:id/links', (req, res) => {
  const id = Number(req.params.id);
  const outgoing = db.prepare(`
    SELECT dl.id AS link_id, dl.kind, dl.note, dl.created_at, d.id, d.title, d.status
    FROM decision_links dl
    JOIN decisions d ON d.id = dl.to_id
    WHERE dl.from_id = ?
    ORDER BY dl.created_at DESC
  `).all(id) as any[];
  const incoming = db.prepare(`
    SELECT dl.id AS link_id, dl.kind, dl.note, dl.created_at, d.id, d.title, d.status
    FROM decision_links dl
    JOIN decisions d ON d.id = dl.from_id
    WHERE dl.to_id = ?
    ORDER BY dl.created_at DESC
  `).all(id) as any[];
  res.json({ outgoing, incoming });
});

// Create link
router.post('/:id/links', (req, res) => {
  const fromId = Number(req.params.id);
  const toId = Number(req.body?.to_id);
  const kind = String(req.body?.kind || '');
  const note = String(req.body?.note || '');
  if (!toId || fromId === toId) return res.status(400).json({ error: 'invalid to_id' });
  if (!VALID_LINK_KINDS.includes(kind)) return res.status(400).json({ error: 'invalid kind' });

  const target = db.prepare(`SELECT id FROM decisions WHERE id = ?`).get(toId);
  if (!target) return res.status(404).json({ error: 'target not found' });

  try {
    const tx = db.transaction(() => {
      const info = db.prepare(`INSERT OR IGNORE INTO decision_links (from_id, to_id, kind, note) VALUES (?, ?, ?, ?)`)
        .run(fromId, toId, kind, note);
      // If marking 'supersedes', also flip target.status to superseded
      if (kind === 'supersedes' && info.changes > 0) {
        db.prepare(`UPDATE decisions SET status = 'superseded', updated_at = datetime('now') WHERE id = ?`).run(toId);
      }
      // If marking 'reverts', flip target to reverted
      if (kind === 'reverts' && info.changes > 0) {
        db.prepare(`UPDATE decisions SET status = 'reverted', updated_at = datetime('now') WHERE id = ?`).run(toId);
      }
    });
    tx();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Delete link
router.delete('/links/:linkId', (req, res) => {
  db.prepare(`DELETE FROM decision_links WHERE id = ?`).run(req.params.linkId);
  res.json({ success: true });
});

// Decisions due for review (verify follow-up window has elapsed)
router.get('/review/due', (_req, res) => {
  const rows = db.prepare(
    `SELECT * FROM decisions WHERE status = 'active' AND next_review_at IS NOT NULL AND next_review_at <= datetime('now') ORDER BY next_review_at ASC`
  ).all() as any[];
  res.json(rows.map(rowToDecision));
});

// Manually trigger the daily review check (also runs at midnight via cron)
router.post('/review/run', async (_req, res) => {
  const result = await runDecisionReviewCheck();
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
});

// Last review run status
router.get('/review/status', (_req, res) => {
  const row = db.prepare(`SELECT value, updated_at FROM sync_state WHERE key = 'decision_review_last_run'`).get() as any;
  if (!row) return res.json({ ran_at: null, last: null });
  try {
    res.json({ ran_at: row.updated_at, last: JSON.parse(row.value) });
  } catch {
    res.json({ ran_at: row.updated_at, last: null });
  }
});

export default router;
