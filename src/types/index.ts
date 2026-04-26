export interface KeyResult {
  id: number;
  objective_id: number;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
  status: string;
}

export interface Objective {
  id: number;
  quarter: string;
  project_id: number | null;
  title: string;
  progress: number;
  status: string;
  key_results: KeyResult[];
  created_at: string;
  updated_at: string;
}

export interface KRLog {
  id: number;
  kr_id: number;
  content: string;
  created_at: string;
}

export interface OKRProject {
  id: number;
  quarter: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface Todo {
  id: number;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  urgency: 'urgent' | 'normal' | 'low';
  status: 'draft' | 'todo' | 'in_progress' | 'done';
  due_date: string | null;
  source: string | null;
  source_ref: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeishuSyncResult {
  ok: boolean;
  messages_scanned: number;
  todos_extracted: number;
  todos_inserted: number;
  duration_ms: number;
  error?: string;
}

export interface FeishuStatus {
  configured: boolean;
  missing: string[];
  last_sync_at: string | null;
  last_sync_result: FeishuSyncResult | null;
  messages: { total: number; recent_24h: number; pending: number };
}

export interface FengshenPanel {
  id: number;
  name: string;
  url: string;
  description: string;
  sort_order: number;
}
