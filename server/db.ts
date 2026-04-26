import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'workbench.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS okr_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quarter TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS okr_objectives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quarter TEXT NOT NULL,
    title TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    status TEXT DEFAULT 'not_started',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS okr_key_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    objective_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    target_value REAL DEFAULT 100,
    current_value REAL DEFAULT 0,
    unit TEXT DEFAULT '%',
    status TEXT DEFAULT 'not_started',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (objective_id) REFERENCES okr_objectives(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS okr_kr_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kr_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (kr_id) REFERENCES okr_key_results(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT DEFAULT 'P2',
    urgency TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'todo',
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fengshen_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );
`);

const objectiveCols = db.prepare("PRAGMA table_info(okr_objectives)").all() as { name: string }[];
if (!objectiveCols.find(c => c.name === 'project_id')) {
  db.exec(`ALTER TABLE okr_objectives ADD COLUMN project_id INTEGER REFERENCES okr_projects(id) ON DELETE SET NULL`);
}

const todoCols = db.prepare("PRAGMA table_info(todos)").all() as { name: string }[];
const todoColNames = new Set(todoCols.map(c => c.name));
for (const [col, type] of [['source', 'TEXT'], ['source_ref', 'TEXT'], ['source_url', 'TEXT']]) {
  if (!todoColNames.has(col)) db.exec(`ALTER TABLE todos ADD COLUMN ${col} ${type}`);
}
db.exec(`DROP INDEX IF EXISTS idx_todos_source_ref`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_source_ref_title ON todos(source, source_ref, title) WHERE source_ref IS NOT NULL`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS feishu_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL,
    chat_id TEXT,
    chat_type TEXT,
    sender_id TEXT,
    msg_type TEXT,
    content TEXT,
    create_time INTEGER,
    received_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_feishu_messages_create_time ON feishu_messages(create_time);

  CREATE TABLE IF NOT EXISTS feishu_pull_chats (
    chat_id TEXT PRIMARY KEY,
    label TEXT,
    added_at TEXT DEFAULT (datetime('now'))
  );
`);

export default db;
