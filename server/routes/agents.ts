import { Router } from 'express';
import db from '../db.js';

const router = Router();

const VALID_KINDS = ['claude-code', 'feishu-bot', 'cron', 'webhook', 'custom'];
const VALID_STATUSES = ['idle', 'running', 'error', 'disabled'];
const STALE_MINUTES = 5; // running but no heartbeat in N min → stale

function safeJson<T>(s: any, fallback: T): T {
  if (!s) return fallback;
  if (typeof s !== 'string') return s as T;
  try { return JSON.parse(s); } catch { return fallback; }
}

function rowToAgent(r: any) {
  const stale =
    r.status === 'running' &&
    r.last_heartbeat_at &&
    Date.now() - new Date(r.last_heartbeat_at.replace(' ', 'T') + 'Z').getTime() > STALE_MINUTES * 60_000;
  return {
    ...r,
    config: safeJson(r.config, {}),
    stale: !!stale,
  };
}

// List
router.get('/', (req, res) => {
  const status = req.query.status as string | undefined;
  let sql = 'SELECT * FROM agents WHERE 1=1';
  const params: any[] = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ` ORDER BY
    CASE status WHEN 'running' THEN 0 WHEN 'error' THEN 1 WHEN 'idle' THEN 2 ELSE 3 END,
    COALESCE(last_heartbeat_at, '') DESC,
    id DESC`;
  const rows = db.prepare(sql).all(...params) as any[];
  res.json(rows.map(rowToAgent));
});

// Stats
router.get('/stats', (_req, res) => {
  const rows = db.prepare(`SELECT status, COUNT(*) AS c FROM agents GROUP BY status`).all() as Array<{ status: string; c: number }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = r.c;
  // Count stale running agents
  const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const stale = db.prepare(
    `SELECT COUNT(*) AS c FROM agents WHERE status = 'running' AND (last_heartbeat_at IS NULL OR last_heartbeat_at < ?)`
  ).get(staleCutoff) as { c: number };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({
    counts,
    running: counts.running || 0,
    idle: counts.idle || 0,
    error: counts.error || 0,
    disabled: counts.disabled || 0,
    stale: stale.c,
    total,
  });
});

// Detail
router.get('/:id', (req, res) => {
  const r = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(req.params.id) as any;
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(rowToAgent(r));
});

// Create
router.post('/', (req, res) => {
  const { name, kind, description, config, endpoint_url } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  const k = VALID_KINDS.includes(kind) ? kind : 'custom';
  const info = db.prepare(`
    INSERT INTO agents (name, kind, description, config, endpoint_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(name).trim(),
    k,
    description || '',
    JSON.stringify(config || {}),
    endpoint_url || ''
  );
  const row = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(info.lastInsertRowid);
  res.json(rowToAgent(row));
});

// Update
router.put('/:id', (req, res) => {
  const allowed = ['name', 'kind', 'description', 'status', 'current_task', 'last_message', 'endpoint_url'];
  const sets: string[] = [];
  const params: any[] = [];
  for (const k of allowed) {
    if (req.body[k] === undefined) continue;
    if (k === 'kind' && !VALID_KINDS.includes(req.body[k])) continue;
    if (k === 'status' && !VALID_STATUSES.includes(req.body[k])) continue;
    sets.push(`${k} = ?`);
    params.push(req.body[k]);
  }
  if (req.body.config !== undefined) {
    sets.push(`config = ?`);
    params.push(JSON.stringify(req.body.config));
  }
  if (!sets.length) return res.json({ success: true });
  sets.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// Delete
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM agents WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// Heartbeat (called by the agent itself)
router.post('/:id/heartbeat', (req, res) => {
  const { status, current_task, last_message } = req.body || {};
  const agent = db.prepare(`SELECT id FROM agents WHERE id = ?`).get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  const finalStatus = VALID_STATUSES.includes(status) ? status : 'running';
  db.prepare(`
    UPDATE agents
    SET status = ?,
        current_task = COALESCE(?, current_task),
        last_message = COALESCE(?, last_message),
        last_heartbeat_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(finalStatus, current_task ?? null, last_message ?? null, req.params.id);
  res.json({ success: true });
});

export default router;
