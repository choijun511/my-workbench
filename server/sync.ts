import db from './db.js';
import { feishuMessageUrl } from './feishu.js';
import { extractTodosFromMessages } from './gemini.js';
import { envReady } from './env.js';

export interface SyncResult {
  ok: boolean;
  messages_scanned: number;
  todos_extracted: number;
  todos_inserted: number;
  duration_ms: number;
  error?: string;
}

const setSyncState = db.prepare(
  `INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
);
const getSyncState = db.prepare(`SELECT value, updated_at FROM sync_state WHERE key = ?`);

export function getLastSync(): { value: string | null; at: string | null } {
  const row = getSyncState.get('feishu_last_sync') as { value: string; updated_at: string } | undefined;
  return { value: row?.value ?? null, at: row?.updated_at ?? null };
}

export function getMessageStats(): { total: number; recent_24h: number; pending: number } {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM feishu_messages`).get() as { c: number }).c;
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  const recent_24h = (db.prepare(`SELECT COUNT(*) AS c FROM feishu_messages WHERE create_time >= ?`).get(cutoff) as { c: number }).c;
  const pending = (db.prepare(`SELECT COUNT(*) AS c FROM feishu_messages WHERE processed_at IS NULL`).get() as { c: number }).c;
  return { total, recent_24h, pending };
}

let running = false;

interface MessageRow {
  message_id: string;
  chat_id: string;
  chat_type: string;
  sender_id: string;
  msg_type: string;
  content: string;
  create_time: number;
}

function extractTextFromStored(row: MessageRow): string {
  if (row.msg_type !== 'text' && row.msg_type !== 'post') return '';
  try {
    const body = JSON.parse(row.content);
    if (row.msg_type === 'text') return String(body.text || '').trim();
    if (row.msg_type === 'post') {
      const parts: string[] = [];
      if (body.title) parts.push(body.title);
      for (const para of body.content || []) {
        for (const seg of para || []) if (seg.tag === 'text' && seg.text) parts.push(seg.text);
      }
      return parts.join('\n').trim();
    }
  } catch {
    return '';
  }
  return '';
}

export async function runFeishuSync(windowHours = 24): Promise<SyncResult> {
  if (running) {
    return { ok: false, messages_scanned: 0, todos_extracted: 0, todos_inserted: 0, duration_ms: 0, error: '同步任务已在运行中' };
  }
  const ready = envReady();
  if (!ready.ok) {
    return { ok: false, messages_scanned: 0, todos_extracted: 0, todos_inserted: 0, duration_ms: 0, error: `缺少环境变量: ${ready.missing.join(', ')}` };
  }
  running = true;
  const startedAt = Date.now();
  const result: SyncResult = { ok: true, messages_scanned: 0, todos_extracted: 0, todos_inserted: 0, duration_ms: 0 };

  try {
    const cutoff = Math.floor(Date.now() / 1000) - windowHours * 3600;
    const rows = db.prepare(
      `SELECT * FROM feishu_messages WHERE create_time >= ? AND processed_at IS NULL ORDER BY create_time ASC`
    ).all(cutoff) as MessageRow[];

    const enriched = rows
      .map(r => {
        const text = extractTextFromStored(r);
        if (!text) return null;
        return {
          message_id: r.message_id,
          sender: r.sender_id || 'unknown',
          text,
          time: new Date(r.create_time * 1000).toISOString(),
        };
      })
      .filter(Boolean) as Array<{ message_id: string; sender: string; text: string; time: string }>;

    result.messages_scanned = enriched.length;

    if (enriched.length) {
      const todos = await extractTodosFromMessages(enriched);
      result.todos_extracted = todos.length;

      const insertTodo = db.prepare(`
        INSERT OR IGNORE INTO todos
          (title, description, priority, urgency, status, source, source_ref, source_url)
        VALUES (?, ?, 'P2', 'normal', 'draft', 'feishu', ?, ?)
      `);
      const markProcessed = db.prepare(`UPDATE feishu_messages SET processed_at = datetime('now') WHERE message_id = ?`);

      for (const t of todos) {
        const info = insertTodo.run(t.title, t.context || '', t.source_message_id, feishuMessageUrl(t.source_message_id));
        if (info.changes > 0) result.todos_inserted += 1;
      }
      // Mark all scanned messages as processed (whether they yielded todos or not)
      for (const m of enriched) markProcessed.run(m.message_id);
    }
  } catch (e) {
    result.ok = false;
    result.error = (e as Error).message;
  } finally {
    running = false;
    result.duration_ms = Date.now() - startedAt;
    setSyncState.run('feishu_last_sync', JSON.stringify(result));
  }
  return result;
}
