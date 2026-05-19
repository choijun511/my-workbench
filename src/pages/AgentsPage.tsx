import { useEffect, useMemo, useState } from 'react';
import { useApi, apiPost, apiPut, apiDelete } from '../hooks/useApi';
import { useConfirm } from '../components/ui/Dialog';
import type { Agent, AgentKind, AgentStats, AgentStatus, AgentTask, AgentTaskStatus } from '../types';
import {
  Bot,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Activity,
  Pause,
  AlertTriangle,
  Power,
  RefreshCw,
  Clipboard,
  Send,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Terminal,
  Loader2,
} from 'lucide-react';

const KIND_LABELS: Record<AgentKind, string> = {
  'claude-code': 'Claude Code',
  'feishu-bot': '飞书机器人',
  'cron': '定时任务',
  'webhook': 'Webhook',
  'custom': '自定义',
};
const KINDS: AgentKind[] = ['claude-code', 'feishu-bot', 'cron', 'webhook', 'custom'];

const STATUS_META: Record<AgentStatus, { label: string; className: string; icon: any }> = {
  idle: { label: '空闲', className: 'bg-sunken text-haze', icon: Pause },
  running: { label: '运行中', className: 'bg-electric/20 text-electric', icon: Activity },
  error: { label: '出错', className: 'bg-blood/20 text-blood', icon: AlertTriangle },
  disabled: { label: '已停用', className: 'bg-fog/20 text-fog', icon: Power },
};

type Filter = 'all' | AgentStatus;

const filterTabs: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'running', label: '运行中' },
  { key: 'idle', label: '空闲' },
  { key: 'error', label: '出错' },
  { key: 'disabled', label: '已停用' },
];

export default function AgentsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const queryUrl = filter === 'all' ? '/api/agents' : `/api/agents?status=${filter}`;
  const { data: agents, refetch } = useApi<Agent[]>(queryUrl);
  const { data: stats, refetch: refetchStats } = useApi<AgentStats>('/api/agents/stats');

  // Poll every 10s so the dashboard feels live
  useEffect(() => {
    const t = setInterval(() => { refetch(); refetchStats(); }, 10_000);
    return () => clearInterval(t);
  }, [refetch, refetchStats]);

  const refreshAll = () => { refetch(); refetchStats(); };

  // Auto-select first item when list loads / filter changes
  useEffect(() => {
    if (!agents) return;
    if (agents.length === 0) { setActiveId(null); return; }
    if (!agents.find(a => a.id === activeId)) setActiveId(agents[0].id);
  }, [agents, activeId]);

  const counts = stats?.counts || {};
  const tabCount = (k: Filter) => k === 'all' ? (stats?.total || 0) : (counts[k] || 0);

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bone flex items-center gap-2">
            <Bot size={22} /> Agent
          </h1>
          <div className="text-sm text-haze mt-1 flex items-center gap-2 flex-wrap">
            <span>接入的 AI / 自动化 Agent 状态总览</span>
            {(stats?.error ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blood/20 text-blood">
                <AlertTriangle size={11} /> {stats!.error} 个出错
              </span>
            )}
            {(stats?.stale ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gold/20 text-gold">
                {stats!.stale} 个失联
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2.5 bg-gold text-stage-deep btn-glow-gold rounded-lg text-sm font-medium hover:bg-gold/90 flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus size={16} /> 接入 Agent
        </button>
      </div>

      {showAdd && (
        <AgentCreateModal
          onClose={() => setShowAdd(false)}
          onCreated={(a) => { setShowAdd(false); refreshAll(); setActiveId(a.id); }}
        />
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-sunken rounded-lg p-1 w-fit text-xs">
          {filterTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                filter === t.key ? 'bg-card text-bone shadow-sm' : 'text-haze hover:text-cream'
              }`}
            >
              {t.label} ({tabCount(t.key)})
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-72 flex-shrink-0 space-y-2">
          {!agents ? (
            <div className="text-xs text-haze">加载中...</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-haze bg-card border border-velvet rounded-xl">
              <Bot size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">尚未接入 Agent</p>
              <p className="text-xs mt-1">点右上角接入一个</p>
            </div>
          ) : (
            agents.map(a => (
              <AgentListItem
                key={a.id}
                a={a}
                active={a.id === activeId}
                onClick={() => setActiveId(a.id)}
              />
            ))
          )}
        </div>
        <div className="flex-1 min-w-0">
          {activeId ? (
            <AgentDetail key={activeId} id={activeId} onChange={refreshAll} />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-haze bg-card rounded-xl border border-velvet">
              <div className="text-center">
                <Bot size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">选择左侧 Agent 查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentListItem({ a, active, onClick }: { a: Agent; active: boolean; onClick: () => void }) {
  const meta = STATUS_META[a.status];
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-xl border cursor-pointer card-lift ${
        active ? 'border-gold/50 bg-gold/10 nav-active-glow' : 'border-velvet bg-card'
      }`}
    >
      <div className="flex items-center gap-2">
        <StatusDot status={a.status} stale={a.stale} />
        <h3 className="text-sm font-medium text-bone truncate flex-1">{a.name}</h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.className}`}>{meta.label}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-haze">
        <span className="px-1.5 py-0.5 rounded bg-sunken text-haze font-mono">{KIND_LABELS[a.kind]}</span>
        {a.stale && <span className="text-gold">失联</span>}
        <span className="ml-auto">{formatRelative(a.last_heartbeat_at)}</span>
      </div>
      {a.current_task && (
        <p className="text-xs text-cream mt-1.5 truncate">{a.current_task}</p>
      )}
    </div>
  );
}

function StatusDot({ status, stale }: { status: AgentStatus; stale: boolean }) {
  const color =
    status === 'running' && !stale ? 'bg-electric animate-pulse' :
    status === 'running' && stale ? 'bg-gold' :
    status === 'error' ? 'bg-blood animate-pulse' :
    status === 'disabled' ? 'bg-fog' :
    'bg-haze';
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

function AgentDetail({ id, onChange }: { id: number; onChange: () => void }) {
  const { data: a, refetch } = useApi<Agent>(`/api/agents/${id}`);
  const [editing, setEditing] = useState(false);
  const confirmDialog = useConfirm();

  if (!a) return <div className="bg-card rounded-xl border border-velvet p-8 text-sm text-haze">加载中...</div>;
  const meta = STATUS_META[a.status];

  const remove = async () => {
    const ok = await confirmDialog({
      title: '删除 Agent？',
      body: `确认删除「${a.name}」？历史心跳记录也会一并清除。`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    await apiDelete(`/api/agents/${a.id}`);
    onChange();
  };

  const toggleDisable = async () => {
    const next: AgentStatus = a.status === 'disabled' ? 'idle' : 'disabled';
    await apiPut(`/api/agents/${a.id}`, { status: next });
    refetch();
    onChange();
  };

  if (editing) {
    return <AgentEditor a={a} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); onChange(); }} />;
  }

  const baseUrl = window.location.origin;
  const heartbeatUrl = `${baseUrl}/api/agents/${a.id}/heartbeat`;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-velvet card-lift">
        <div className="px-5 py-4 border-b border-velvet flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <StatusDot status={a.status} stale={a.stale} />
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${meta.className}`}>{meta.label}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-sunken text-haze font-mono">{KIND_LABELS[a.kind]}</span>
              {a.stale && <span className="text-xs text-gold">失联（最近 5 分钟无心跳）</span>}
            </div>
            <h2 className="text-lg font-semibold text-bone break-words">{a.name}</h2>
            {a.description && <p className="text-sm text-haze mt-1">{a.description}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={toggleDisable}
              className="text-xs px-2.5 py-1 rounded-md border border-velvet text-cream hover:border-gold/40 hover:text-gold flex items-center gap-1"
            >
              <Power size={11} /> {a.status === 'disabled' ? '启用' : '停用'}
            </button>
            <button onClick={() => setEditing(true)} className="text-haze hover:text-gold p-1.5" title="编辑">
              <Edit3 size={15} />
            </button>
            <button onClick={remove} className="text-haze hover:text-blood p-1.5" title="删除">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm">
          {a.current_task && (
            <div>
              <h4 className="text-xs text-haze uppercase tracking-wider mb-1">当前任务</h4>
              <p className="text-cream">{a.current_task}</p>
            </div>
          )}
          {a.last_message && (
            <div>
              <h4 className="text-xs text-haze uppercase tracking-wider mb-1">最后一条消息</h4>
              <pre className="text-xs text-cream bg-stage rounded p-2 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-40 overflow-y-auto">{a.last_message}</pre>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-haze uppercase tracking-wider mb-0.5">最后心跳</p>
              <p className="text-cream font-mono">{a.last_heartbeat_at ? formatTime(a.last_heartbeat_at) : '从未'}</p>
            </div>
            <div>
              <p className="text-haze uppercase tracking-wider mb-0.5">创建时间</p>
              <p className="text-cream font-mono">{formatTime(a.created_at)}</p>
            </div>
            {a.endpoint_url && (
              <div className="col-span-2">
                <p className="text-haze uppercase tracking-wider mb-0.5">Endpoint</p>
                <a href={a.endpoint_url} target="_blank" rel="noreferrer" className="text-electric hover:underline font-mono break-all">{a.endpoint_url}</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tasks panel */}
      <TasksPanel agent={a} onUpdate={onChange} />

      {/* Bridge / auth instructions */}
      <BridgeBlock agent={a} baseUrl={baseUrl} heartbeatUrl={heartbeatUrl} onTokenRotated={refetch} />

      {/* Config */}
      {a.config && Object.keys(a.config).length > 0 && (
        <div className="bg-card rounded-xl border border-velvet p-5">
          <h3 className="text-sm font-medium text-bone mb-2">配置</h3>
          <pre className="text-[11px] bg-stage rounded p-3 text-cream font-mono leading-relaxed overflow-x-auto">{JSON.stringify(a.config, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function TasksPanel({ agent, onUpdate }: { agent: Agent; onUpdate: () => void }) {
  const { data: tasks, refetch } = useApi<AgentTask[]>(`/api/agents/${agent.id}/tasks?limit=20`);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const confirmDialog = useConfirm();

  // Poll tasks every 3s so user sees status updates live
  useEffect(() => {
    const t = setInterval(() => refetch(), 3000);
    return () => clearInterval(t);
  }, [refetch]);

  const send = async () => {
    if (!input.trim() || agent.status === 'disabled') return;
    setSending(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        await confirmDialog({ title: '派活失败', body: data.error || '未知错误', confirmLabel: '知道了', cancelLabel: '' });
        return;
      }
      setInput('');
      refetch();
      onUpdate();
    } finally {
      setSending(false);
    }
  };

  const cancel = async (taskId: number) => {
    await apiDelete(`/api/agents/tasks/${taskId}`);
    refetch();
  };

  return (
    <div className="bg-card rounded-xl border border-velvet p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-bone flex items-center gap-1.5">
          <Terminal size={13} /> 任务
        </h3>
        {tasks && tasks.length > 0 && (
          <span className="text-[11px] text-haze">
            队列 {tasks.filter(t => t.status === 'queued').length} · 运行 {tasks.filter(t => t.status === 'running').length}
          </span>
        )}
      </div>

      {/* Send form */}
      <div className="flex flex-col gap-2 mb-4">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
          }}
          placeholder={agent.status === 'disabled' ? 'Agent 已停用，无法派活' : '派一个任务给它... (⌘+Enter 提交)'}
          rows={2}
          disabled={agent.status === 'disabled'}
          className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream disabled:opacity-50"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={send}
            disabled={sending || !input.trim() || agent.status === 'disabled'}
            className="px-3 py-1.5 bg-gold text-stage-deep btn-glow-gold rounded-md text-xs font-medium hover:bg-gold/90 disabled:opacity-50 flex items-center gap-1"
          >
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {sending ? '排队中...' : '派活'}
          </button>
        </div>
      </div>

      {/* List */}
      {!tasks ? (
        <p className="text-xs text-haze">加载中...</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-haze py-4 text-center">还没有任务</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map(t => <TaskRow key={t.id} t={t} onCancel={cancel} />)}
        </ul>
      )}
    </div>
  );
}

const TASK_STATUS_META: Record<AgentTaskStatus, { label: string; className: string }> = {
  queued: { label: '排队中', className: 'bg-sunken text-haze' },
  running: { label: '运行中', className: 'bg-electric/20 text-electric' },
  done: { label: '已完成', className: 'bg-grass/20 text-grass' },
  error: { label: '出错', className: 'bg-blood/20 text-blood' },
  canceled: { label: '已取消', className: 'bg-fog/20 text-fog' },
};

function TaskRow({ t, onCancel }: { t: AgentTask; onCancel: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TASK_STATUS_META[t.status];
  const elapsedMs = t.finished_at && t.started_at
    ? new Date(t.finished_at.replace(' ', 'T') + 'Z').getTime() - new Date(t.started_at.replace(' ', 'T') + 'Z').getTime()
    : t.started_at
      ? Date.now() - new Date(t.started_at.replace(' ', 'T') + 'Z').getTime()
      : 0;
  const elapsed = elapsedMs > 0 ? formatElapsed(elapsedMs) : '';
  const canCancel = t.status === 'queued' || t.status === 'running';

  return (
    <li className="bg-stage/60 rounded-md border border-velvet/60">
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-haze hover:text-cream mt-0.5 flex-shrink-0"
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${meta.className}`}>
          {meta.label}
        </span>
        <span className="text-sm text-cream truncate flex-1 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          {t.input}
        </span>
        {elapsed && <span className="text-[10px] text-haze font-mono flex-shrink-0">{elapsed}</span>}
        <span className="text-[10px] text-fog font-mono flex-shrink-0">#{t.id}</span>
        {canCancel && (
          <button
            onClick={() => onCancel(t.id)}
            className="text-haze hover:text-blood flex-shrink-0"
            title="取消"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-velvet/60">
          <div>
            <p className="text-[10px] text-haze uppercase tracking-wider mb-1">输入</p>
            <pre className="text-xs text-cream bg-stage-deep/60 rounded p-2 whitespace-pre-wrap break-words font-mono leading-relaxed">{t.input}</pre>
          </div>
          {t.output && (
            <div>
              <p className="text-[10px] text-haze uppercase tracking-wider mb-1">输出</p>
              <pre className="text-xs text-cream bg-stage-deep/60 rounded p-2 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-96 overflow-y-auto">{t.output}</pre>
            </div>
          )}
          {t.error && (
            <div>
              <p className="text-[10px] text-blood uppercase tracking-wider mb-1">错误</p>
              <pre className="text-xs text-blood bg-blood/10 rounded p-2 whitespace-pre-wrap break-words font-mono leading-relaxed">{t.error}</pre>
            </div>
          )}
          <p className="text-[10px] text-fog font-mono">
            {formatTime(t.created_at)} 创建
            {t.started_at && ` · ${formatTime(t.started_at)} 开始`}
            {t.finished_at && ` · ${formatTime(t.finished_at)} 结束`}
          </p>
        </div>
      )}
    </li>
  );
}

function BridgeBlock({ agent, baseUrl, heartbeatUrl, onTokenRotated }: {
  agent: Agent;
  baseUrl: string;
  heartbeatUrl: string;
  onTokenRotated: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const confirmDialog = useConfirm();

  const rotate = async () => {
    const ok = await confirmDialog({
      title: '重新生成 Token？',
      body: '现有 bridge / agent 用到老 token 的会立即失效，需要重新部署。',
      confirmLabel: '生成',
      danger: true,
    });
    if (!ok) return;
    setRotating(true);
    try {
      await apiPost(`/api/agents/${agent.id}/rotate-token`, {});
      onTokenRotated();
    } finally {
      setRotating(false);
    }
  };

  const bridgeCmd = `node bridge.js --agent ${agent.id} --token ${agent.token} --base ${baseUrl}`;

  return (
    <div className="bg-card rounded-xl border border-velvet p-5 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-bone flex items-center gap-1.5">
            <Bot size={13} /> Agent Token
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRevealed(!revealed)}
              className="text-xs text-haze hover:text-cream flex items-center gap-1"
            >
              {revealed ? <EyeOff size={12} /> : <Eye size={12} />} {revealed ? '隐藏' : '查看'}
            </button>
            <button
              onClick={rotate}
              disabled={rotating}
              className="text-xs text-haze hover:text-blood flex items-center gap-1"
            >
              <RefreshCw size={12} /> 重新生成
            </button>
          </div>
        </div>
        <p className="text-xs text-haze mb-2">
          bridge / agent 用这个 token 拉任务和回传结果。**只在你自己机器上保存，别贴公开仓库**。
        </p>
        <CopyBlock label="Token" value={revealed ? agent.token : '••••••••••••••••••••••••••••••••••••'} actualValue={agent.token} />
      </div>

      <div>
        <h3 className="text-sm font-medium text-bone flex items-center gap-1.5 mb-2">
          <Terminal size={13} /> 一行启动 Bridge（拉任务模式）
        </h3>
        <p className="text-xs text-haze mb-2">
          在你本地仓库 <code className="text-electric font-mono">my-workbench/tools/openclaw-bridge/</code> 目录下：
        </p>
        <CopyBlock label="Shell" value={bridgeCmd} />
        <p className="text-xs text-haze mt-3">
          运行后 bridge 会长轮询任务、调用本地 <code className="text-electric font-mono">openclaw agent --message ...</code>、把结果传回来。
          关掉 bridge 后 Agent 在 5 分钟内会被标「失联」。
        </p>
      </div>

      <details className="text-xs">
        <summary className="text-haze hover:text-cream cursor-pointer">不用 bridge，自己写心跳上报？</summary>
        <div className="mt-2 space-y-2">
          <CopyBlock label="POST URL" value={heartbeatUrl} />
          <p className="text-xs text-haze">请求体示例：</p>
          <pre className="text-[11px] bg-stage rounded p-3 text-cream font-mono leading-relaxed overflow-x-auto">{`{
  "status": "running",
  "current_task": "...",
  "last_message": "..."
}`}</pre>
        </div>
      </details>
    </div>
  );
}

function CopyBlock({ label, value, actualValue }: { label: string; value: string; actualValue?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(actualValue ?? value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div>
      <p className="text-[10px] text-haze uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-stage rounded px-3 py-2">
        <code className="text-xs text-cream font-mono break-all flex-1">{value}</code>
        <button onClick={copy} className="text-xs text-haze hover:text-gold flex items-center gap-1 flex-shrink-0">
          <Clipboard size={12} /> {copied ? '已复制' : '复制'}
        </button>
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m${remSec.toString().padStart(2, '0')}s`;
}

function AgentCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: Agent) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AgentKind>('custom');
  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const a = await apiPost<Agent>('/api/agents', {
        name: name.trim(),
        kind,
        description: description.trim(),
        endpoint_url: endpointUrl.trim(),
      });
      onCreated(a);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm backdrop-enter" onClick={onClose}>
      <div
        className="bg-card border border-velvet rounded-xl shadow-2xl w-full max-w-md modal-enter grain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-velvet">
          <h2 className="text-base font-semibold text-bone flex items-center gap-2">
            <Bot size={16} className="text-electric" /> 接入 Agent
          </h2>
          <button onClick={onClose} className="text-haze hover:text-cream">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="名称">
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="比如：飞书 Todo 抽取"
              className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream"
            />
          </Field>
          <Field label="类型">
            <select
              value={kind}
              onChange={e => setKind(e.target.value as AgentKind)}
              className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream"
            >
              {KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="描述（可选）">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="这个 Agent 在做什么、什么时候跑、有什么注意事项..."
              className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream"
            />
          </Field>
          <Field label="Endpoint URL（可选）">
            <input
              value={endpointUrl}
              onChange={e => setEndpointUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream"
            />
          </Field>
        </div>
        <div className="px-5 py-3 border-t border-velvet flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-haze hover:text-cream">取消</button>
          <button
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="px-4 py-1.5 bg-gold text-stage-deep btn-glow-gold rounded-md text-sm font-medium hover:bg-gold/90 disabled:opacity-50"
          >
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentEditor({ a, onCancel, onSaved }: { a: Agent; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(a.name);
  const [kind, setKind] = useState<AgentKind>(a.kind);
  const [description, setDescription] = useState(a.description);
  const [endpointUrl, setEndpointUrl] = useState(a.endpoint_url);
  const [status, setStatus] = useState<AgentStatus>(a.status);

  const save = async () => {
    await apiPut(`/api/agents/${a.id}`, {
      name,
      kind,
      description,
      endpoint_url: endpointUrl,
      status,
    });
    onSaved();
  };

  return (
    <div className="bg-card rounded-xl border border-gold/50 ring-2 ring-gold/20 p-5 space-y-3">
      <Field label="名称">
        <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream font-semibold" />
      </Field>
      <Field label="类型">
        <select value={kind} onChange={e => setKind(e.target.value as AgentKind)} className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream">
          {KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
      </Field>
      <Field label="描述">
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream" />
      </Field>
      <Field label="Endpoint URL">
        <input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream" />
      </Field>
      <Field label="状态（手动覆盖）">
        <select value={status} onChange={e => setStatus(e.target.value as AgentStatus)} className="w-full px-3 py-2 text-sm bg-stage border border-velvet rounded-md focus:outline-none focus:ring-2 focus:ring-gold text-cream">
          {(['idle', 'running', 'error', 'disabled'] as AgentStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-haze hover:text-cream flex items-center gap-1">
          <X size={13} /> 取消
        </button>
        <button onClick={save} className="px-4 py-1.5 bg-gold text-stage-deep btn-glow-gold rounded-md text-sm font-medium hover:bg-gold/90 flex items-center gap-1">
          <Check size={13} /> 保存
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-haze font-medium mb-1">{label}</p>
      {children}
    </div>
  );
}

function formatTime(s: string): string {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRelative(s: string | null): string {
  if (!s) return '从未';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s 前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m 前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h 前`;
  const day = Math.floor(hr / 24);
  return `${day}d 前`;
}
