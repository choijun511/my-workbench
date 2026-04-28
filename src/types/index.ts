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

export interface PanelInsightAnomaly {
  metric: string;
  observation: string;
  severity: 'high' | 'medium' | 'low';
}

export interface PanelInsightResult {
  summary: string;
  anomalies: PanelInsightAnomaly[];
  insights: string[];
  generated_at?: string;
}

export interface PanelInsight {
  id: number;
  panel_id: number;
  source: 'image' | 'text';
  content: string;
  result: string; // JSON-stringified PanelInsightResult
  created_at: string;
}

export interface DecisionAlternative {
  name: string;
  why_not: string;
}
export interface DecisionVerify {
  method: string;
  after_days: number;
}
export interface DecisionReflection {
  at: string;
  status: 'holds' | 'wrong' | 'pivoted' | 'still_thinking';
  note: string;
}
export type DecisionStatus = 'draft' | 'active' | 'superseded' | 'reverted' | 'obsolete';

export interface Decision {
  id: number;
  title: string;
  decision: string;
  context: string;
  alternatives: DecisionAlternative[];
  assumptions: string[];
  verify: DecisionVerify | null;
  status: DecisionStatus;
  confidence: number | null;
  tags: string[];
  supersedes_id: number | null;
  source_tool: string | null;
  source_url: string | null;
  source_captured_at: string | null;
  raw_excerpt: string;
  reflection_log: DecisionReflection[];
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DecisionLinkKind = 'related' | 'extends' | 'contradicts' | 'supersedes' | 'reverts';
export type SuggestedLinkKind = DecisionLinkKind | 'unrelated';

export interface DecisionRelated {
  id: number;
  title: string;
  score: number;
  existing_link_kind: DecisionLinkKind | null;
  suggested_kind: SuggestedLinkKind | null;
  suggested_reason: string | null;
}

export interface DecisionLinkRow {
  link_id: number;
  kind: DecisionLinkKind;
  note: string;
  created_at: string;
  id: number;       // linked decision id
  title: string;    // linked decision title
  status: string;
}

export interface DecisionLinks {
  outgoing: DecisionLinkRow[];
  incoming: DecisionLinkRow[];
}
