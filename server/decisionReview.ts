import db from './db.js';
import { sendTextToEmail } from './feishu.js';

export interface ReviewResult {
  ok: boolean;
  candidates: number;
  notified: number;
  skipped_reason?: string;
  error?: string;
  duration_ms: number;
  ran_at: string;
}

const REMIND_COOLDOWN_DAYS = 3; // do not re-spam the same decision within N days
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://my-workbench.onrender.com';

const setSyncState = db.prepare(
  `INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
);

function fmt(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function safeJson<T>(s: any, fallback: T): T {
  if (!s) return fallback;
  if (typeof s !== 'string') return s as T;
  try { return JSON.parse(s); } catch { return fallback; }
}

export async function runDecisionReviewCheck(): Promise<ReviewResult> {
  const startedAt = Date.now();
  const result: ReviewResult = {
    ok: true,
    candidates: 0,
    notified: 0,
    duration_ms: 0,
    ran_at: new Date().toISOString(),
  };

  const cooldownCutoff = fmt(new Date(Date.now() - REMIND_COOLDOWN_DAYS * 86400 * 1000));
  const due = db.prepare(`
    SELECT id, title, decision, verify, next_review_at
    FROM decisions
    WHERE status = 'active'
      AND next_review_at IS NOT NULL
      AND next_review_at <= datetime('now')
      AND (last_reminded_at IS NULL OR last_reminded_at <= ?)
    ORDER BY next_review_at ASC
    LIMIT 20
  `).all(cooldownCutoff) as any[];

  result.candidates = due.length;

  if (!due.length) {
    result.duration_ms = Date.now() - startedAt;
    setSyncState.run('decision_review_last_run', JSON.stringify(result));
    return result;
  }

  const notifyEmail = process.env.FEISHU_NOTIFY_EMAIL || '';
  if (!notifyEmail) {
    result.ok = false;
    result.skipped_reason = 'FEISHU_NOTIFY_EMAIL 未配置';
    result.duration_ms = Date.now() - startedAt;
    setSyncState.run('decision_review_last_run', JSON.stringify(result));
    return result;
  }

  // Compose a single message, batched
  const lines = due.map(d => {
    const verify = safeJson<{ method?: string } | null>(d.verify, null);
    return `• ${d.title}\n  验证：${verify?.method || '未指定'}`;
  });
  const message =
    `📋 决策复盘提醒（${due.length} 条到期）\n\n` +
    lines.join('\n\n') +
    `\n\n→ ${PUBLIC_BASE}/decisions`;

  try {
    const resp = await sendTextToEmail(notifyEmail, message);
    if (resp.code !== 0) {
      throw new Error(`Feishu send returned code ${resp.code}: ${resp.msg || JSON.stringify(resp)}`);
    }
    const stmt = db.prepare(`UPDATE decisions SET last_reminded_at = datetime('now') WHERE id = ?`);
    const tx = db.transaction((ids: number[]) => { for (const id of ids) stmt.run(id); });
    tx(due.map(d => d.id));
    result.notified = due.length;
  } catch (e) {
    result.ok = false;
    result.error = (e as Error).message;
  }

  result.duration_ms = Date.now() - startedAt;
  setSyncState.run('decision_review_last_run', JSON.stringify(result));
  return result;
}
