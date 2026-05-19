import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = Router();

const VALID_KINDS = ['claude-code', 'feishu-bot', 'cron', 'webhook', 'custom'];
const VALID_STATUSES = ['idle', 'running', 'error', 'disabled'];
const VALID_TASK_STATUSES = ['queued', 'running', 'done', 'error', 'canceled'];
const STALE_MINUTES = 5;
const MAX_POLL_WAIT_SEC = 50;
const POLL_INTERVAL_MS = 1000;

function safeJson<T>(s: any, fallback: T): T {
  if (!s) return fallback;
  if (typeof s !== 'string') return s as T;
  try { return JSON.parse(s); } catch { return fallback; }
}

function newToken(): string {
  return 'agt_' + crypto.randomBytes(16).toString('hex');
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

function bearerToken(req: Request): string {
  const h = req.headers.authorization || '';
  return h.replace(/^Bearer\s+/i, '').trim();
}

function requireAgentToken(req: Request, res: Response, agentId: number | string): { token: string; id: number } | null {
  const agent = db.prepare(`SELECT id, token FROM agents WHERE id = ?`).get(agentId) as { id: number; token: string } | undefined;
  if (!agent) { res.status(404).json({ error: 'agent not found' }); return null; }
  const provided = bearerToken(req);
  if (!agent.token || !provided || agent.token !== provided) { res.status(401).json({ error: 'invalid agent token' }); return null; }
  return agent;
}

// =========== Static-path routes first (must come before /:id) ===========

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

router.get('/stats', (_req, res) => {
  const rows = db.prepare(`SELECT status, COUNT(*) AS c FROM agents GROUP BY status`).all() as Array<{ status: string; c: number }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = r.c;
  const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const stale = db.prepare(
    `SELECT COUNT(*) AS c FROM agents WHERE status = 'running' AND (last_heartbeat_at IS NULL OR last_heartbeat_at < ?)`
  ).get(staleCutoff) as { c: number };
  const queued = db.prepare(`SELECT COUNT(*) AS c FROM agent_tasks WHERE status = 'queued'`).get() as { c: number };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({
    counts,
    running: counts.running || 0,
    idle: counts.idle || 0,
    error: counts.error || 0,
    disabled: counts.disabled || 0,
    stale: stale.c,
    queued_tasks: queued.c,
    total,
  });
});

// Submit task result (bridge → server) — token-authenticated
router.post('/tasks/:taskId/result', (req, res) => {
  const taskId = req.params.taskId;
  const task = db.prepare(`
    SELECT t.*, a.token AS agent_token
    FROM agent_tasks t
    JOIN agents a ON a.id = t.agent_id
    WHERE t.id = ?
  `).get(taskId) as any;
  if (!task) return res.status(404).json({ error: 'task not found' });

  const provided = bearerToken(req);
  if (!task.agent_token || !provided || task.agent_token !== provided) {
    return res.status(401).json({ error: 'invalid agent token' });
  }

  const { output, error } = req.body || {};
  const finalStatus = error ? 'error' : 'done';
  db.prepare(`
    UPDATE agent_tasks
    SET status = ?, output = ?, error = ?, finished_at = datetime('now')
    WHERE id = ?
  `).run(finalStatus, output ?? null, error ?? null, taskId);

  // Update parent agent: idle if no more queued/running, else running
  const remaining = db.prepare(
    `SELECT COUNT(*) AS c FROM agent_tasks WHERE agent_id = ? AND status IN ('queued','running')`
  ).get(task.agent_id) as { c: number };
  const newAgentStatus = remaining.c === 0 ? 'idle' : 'running';
  const newCurrentTask = remaining.c === 0 ? '' : null; // null = leave unchanged
  db.prepare(`
    UPDATE agents
    SET status = ?,
        current_task = COALESCE(?, current_task),
        last_heartbeat_at = datetime('now'),
        last_message = COALESCE(?, last_message),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(newAgentStatus, newCurrentTask, error ? `❌ ${String(error).slice(0, 200)}` : `✓ task #${taskId} done`, task.agent_id);

  res.json({ success: true });
});

// Cancel a task (web)
router.delete('/tasks/:taskId', (req, res) => {
  db.prepare(`
    UPDATE agent_tasks
    SET status = 'canceled', finished_at = datetime('now')
    WHERE id = ? AND status IN ('queued','running')
  `).run(req.params.taskId);
  res.json({ success: true });
});

// =========== Dynamic-id routes ===========

// Detail (includes token — needed for bridge setup screen)
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
    INSERT INTO agents (name, kind, description, config, endpoint_url, token)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(name).trim(),
    k,
    description || '',
    JSON.stringify(config || {}),
    endpoint_url || '',
    newToken()
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

// Rotate token
router.post('/:id/rotate-token', (req, res) => {
  const agent = db.prepare(`SELECT id FROM agents WHERE id = ?`).get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  const token = newToken();
  db.prepare(`UPDATE agents SET token = ?, updated_at = datetime('now') WHERE id = ?`).run(token, req.params.id);
  res.json({ token });
});

// Delete
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM agents WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// Heartbeat (bridge or agent → server). Open by default — heartbeat doesn't expose anything;
// but if token header is present, we verify it.
router.post('/:id/heartbeat', (req, res) => {
  const { status, current_task, last_message } = req.body || {};
  const agent = db.prepare(`SELECT id, token FROM agents WHERE id = ?`).get(req.params.id) as { id: number; token: string } | undefined;
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  const provided = bearerToken(req);
  if (provided && agent.token && provided !== agent.token) {
    return res.status(401).json({ error: 'invalid agent token' });
  }
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

// =========== Task routes (per agent) ===========

// Enqueue task (web → queue). Open (matches the rest of the app's no-auth model).
router.post('/:id/tasks', (req, res) => {
  const { input, meta } = req.body || {};
  if (!input || !String(input).trim()) return res.status(400).json({ error: 'input required' });
  const agent = db.prepare(`SELECT id, status FROM agents WHERE id = ?`).get(req.params.id) as { id: number; status: string } | undefined;
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  if (agent.status === 'disabled') return res.status(400).json({ error: 'agent is disabled' });

  const info = db.prepare(`
    INSERT INTO agent_tasks (agent_id, input, meta)
    VALUES (?, ?, ?)
  `).run(req.params.id, String(input), JSON.stringify(meta || {}));
  const row = db.prepare(`SELECT * FROM agent_tasks WHERE id = ?`).get(info.lastInsertRowid);
  res.json(row);
});

// List tasks for an agent
router.get('/:id/tasks', (req, res) => {
  const status = req.query.status as string | undefined;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  let sql = 'SELECT * FROM agent_tasks WHERE agent_id = ?';
  const params: any[] = [req.params.id];
  if (status && VALID_TASK_STATUSES.includes(status)) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Long-poll for next queued task (bridge ← server). Token-authenticated.
router.get('/:id/tasks/next', async (req, res) => {
  const auth = requireAgentToken(req, res, req.params.id);
  if (!auth) return; // 401/404 already sent
  const agentId = auth.id;
  const wait = Math.max(1, Math.min(Number(req.query.wait || 25), MAX_POLL_WAIT_SEC));
  const deadline = Date.now() + wait * 1000;

  const pickStmt = db.prepare(
    `SELECT * FROM agent_tasks WHERE agent_id = ? AND status = 'queued' ORDER BY id ASC LIMIT 1`
  );
  const claimStmt = db.prepare(
    `UPDATE agent_tasks SET status = 'running', started_at = datetime('now') WHERE id = ? AND status = 'queued'`
  );

  while (Date.now() < deadline) {
    const row = pickStmt.get(agentId) as any;
    if (row) {
      const result = claimStmt.run(row.id);
      if (result.changes > 0) {
        // Reflect on agent: now running this task
        db.prepare(`
          UPDATE agents
          SET status = 'running',
              current_task = ?,
              last_heartbeat_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(String(row.input).slice(0, 200), agentId);
        return res.json({ task: { ...row, status: 'running' } });
      }
      // Race lost — someone else claimed it; loop again
    }
    // Wait a bit then retry
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Long poll timed out — also opportunistically refresh heartbeat
  db.prepare(`UPDATE agents SET last_heartbeat_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(agentId);
  res.json({ task: null });
});

export default router;
