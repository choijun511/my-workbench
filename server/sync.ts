import db from './db.js';
import { listChats, listMessages, extractText, feishuMessageUrl } from './feishu.js';
import { extractTodosFromMessages } from './gemini.js';
import { envReady } from './env.js';

export interface SyncResult {
  ok: boolean;
  chats_scanned: number;
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

let running = false;

export async function runFeishuSync(windowHours = 24): Promise<SyncResult> {
  if (running) {
    return {
      ok: false,
      chats_scanned: 0,
      messages_scanned: 0,
      todos_extracted: 0,
      todos_inserted: 0,
      duration_ms: 0,
      error: '同步任务已在运行中',
    };
  }
  const ready = envReady();
  if (!ready.ok) {
    return {
      ok: false,
      chats_scanned: 0,
      messages_scanned: 0,
      todos_extracted: 0,
      todos_inserted: 0,
      duration_ms: 0,
      error: `缺少环境变量: ${ready.missing.join(', ')}`,
    };
  }

  running = true;
  const startedAt = Date.now();
  const result: SyncResult = {
    ok: true,
    chats_scanned: 0,
    messages_scanned: 0,
    todos_extracted: 0,
    todos_inserted: 0,
    duration_ms: 0,
  };

  try {
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - windowHours * 3600;
    const chats = await listChats();
    result.chats_scanned = chats.length;

    const insertTodo = db.prepare(`
      INSERT OR IGNORE INTO todos
        (title, description, priority, urgency, status, source, source_ref, source_url)
      VALUES (?, ?, 'P2', 'normal', 'draft', 'feishu', ?, ?)
    `);

    for (const chat of chats) {
      let messages;
      try {
        messages = await listMessages(chat.chat_id, startSec, endSec);
      } catch (e) {
        console.warn(`[sync] skip chat ${chat.chat_id}: ${(e as Error).message}`);
        continue;
      }
      const enriched = messages
        .map(m => {
          const text = extractText(m);
          if (!text) return null;
          const time = new Date(Number(m.create_time)).toISOString();
          return { message_id: m.message_id, sender: m.sender.id, text, time };
        })
        .filter(Boolean) as Array<{ message_id: string; sender: string; text: string; time: string }>;
      result.messages_scanned += enriched.length;
      if (!enriched.length) continue;

      let todos;
      try {
        todos = await extractTodosFromMessages(enriched);
      } catch (e) {
        console.warn(`[sync] gemini error for chat ${chat.chat_id}: ${(e as Error).message}`);
        continue;
      }
      result.todos_extracted += todos.length;

      for (const t of todos) {
        const desc = (chat.name ? `[${chat.name}] ` : '') + (t.context || '');
        const info = insertTodo.run(t.title, desc, t.source_message_id, feishuMessageUrl(t.source_message_id));
        if (info.changes > 0) result.todos_inserted += 1;
      }
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
