import { useState } from 'react';
import { useApi, apiPost, apiPut, apiDelete } from '../hooks/useApi';
import type { Todo, FeishuStatus, FeishuSyncResult } from '../types';
import { Plus, Trash2, Check, Circle, Clock, Filter, Inbox, ArrowRight, Lightbulb, RefreshCw, ExternalLink, MessageCircle, Edit3, X } from 'lucide-react';

const priorityConfig = {
  P0: { label: 'P0 紧急', color: 'bg-blood/20 text-blood border-blood/30' },
  P1: { label: 'P1 高', color: 'bg-orange-500/20 text-orange-300 border-orange-200' },
  P2: { label: 'P2 中', color: 'bg-electric/20 text-electric border-electric/30' },
  P3: { label: 'P3 低', color: 'bg-sunken text-haze border-velvet' },
};

const urgencyConfig = {
  urgent: { label: '紧急', color: 'text-blood' },
  normal: { label: '普通', color: 'text-haze' },
  low: { label: '不急', color: 'text-haze' },
};

const statusConfig = {
  draft: { label: '草稿', icon: Lightbulb },
  todo: { label: '待办', icon: Circle },
  in_progress: { label: '进行中', icon: Clock },
  done: { label: '已完成', icon: Check },
};

type FilterType = 'all' | 'todo' | 'in_progress' | 'done' | 'draft';

export default function TodoPage() {
  const { data: todos, refetch } = useApi<Todo[]>('/api/todos');
  const { data: feishuStatus, refetch: refetchStatus } = useApi<FeishuStatus>('/api/feishu/status');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'P0' | 'P1' | 'P2' | 'P3'>('P2');
  const [newUrgency, setNewUrgency] = useState<'urgent' | 'normal' | 'low'>('normal');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const runSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/feishu/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ window_hours: 24 }),
      });
      const data: FeishuSyncResult = await res.json();
      if (data.ok) {
        setSyncMsg(`同步完成：扫描 ${data.messages_scanned} 条消息，识别 ${data.todos_extracted} 个 todo，新增 ${data.todos_inserted} 条草稿`);
      } else {
        setSyncMsg(`同步失败：${data.error || '未知错误'}`);
      }
      refetch();
      refetchStatus();
    } catch (e) {
      setSyncMsg(`同步失败：${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const filteredTodos = todos?.filter(t => {
    if (filter === 'draft') return t.status === 'draft';
    if (filter === 'all') return t.status !== 'draft';
    return t.status === filter;
  }) || [];

  const addTodo = async (asDraft = false) => {
    if (!newTitle.trim()) return;
    await apiPost('/api/todos', {
      title: newTitle,
      priority: newPriority,
      urgency: newUrgency,
      status: asDraft ? 'draft' : 'todo',
    });
    setNewTitle('');
    setNewPriority('P2');
    setNewUrgency('normal');
    setShowAdd(false);
    refetch();
  };

  const updateStatus = async (id: number, status: string) => {
    await apiPut(`/api/todos/${id}`, { status });
    refetch();
  };

  const updateTodo = async (id: number, patch: Partial<Todo>) => {
    await apiPut(`/api/todos/${id}`, patch);
    refetch();
  };

  const deleteTodo = async (id: number) => {
    await apiDelete(`/api/todos/${id}`);
    refetch();
  };

  const counts = {
    all: todos?.filter(t => t.status !== 'draft').length || 0,
    todo: todos?.filter(t => t.status === 'todo').length || 0,
    in_progress: todos?.filter(t => t.status === 'in_progress').length || 0,
    done: todos?.filter(t => t.status === 'done').length || 0,
    draft: todos?.filter(t => t.status === 'draft').length || 0,
  };

  return (
    <div className="max-w-screen-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bone">待办事项</h1>
          <p className="text-sm text-haze mt-1">管理你的任务，按优先级和紧急程度排列</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2.5 bg-gold text-stage-deep rounded-lg text-sm font-medium hover:bg-gold/90 flex items-center gap-1.5"
        >
          <Plus size={16} /> 新建待办
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-card rounded-xl border border-velvet p-5 mb-6">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTodo(filter === 'draft')}
            placeholder={filter === 'draft' ? '记录一个想法（草稿）...' : '输入待办事项...'}
            className="w-full px-4 py-2.5 text-sm border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold mb-3"
            autoFocus
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-haze">优先级:</span>
              {(['P0', 'P1', 'P2', 'P3'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setNewPriority(p)}
                  className={`text-xs px-2 py-1 rounded border ${
                    newPriority === p ? priorityConfig[p].color : 'border-velvet text-haze'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-haze">紧急:</span>
              {(['urgent', 'normal', 'low'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setNewUrgency(u)}
                  className={`text-xs px-2 py-1 rounded border ${
                    newUrgency === u ? 'border-gold/50 text-gold bg-gold/10' : 'border-velvet text-haze'
                  }`}
                >
                  {urgencyConfig[u].label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => addTodo(true)}
                className="px-3 py-1.5 border border-velvet text-cream rounded-lg text-sm hover:border-gold/50 hover:text-gold flex items-center gap-1"
                title="存到草稿箱"
              >
                <Lightbulb size={14} /> 存为草稿
              </button>
              <button
                onClick={() => addTodo(false)}
                className="px-4 py-1.5 bg-gold text-stage-deep rounded-lg text-sm hover:bg-gold/90"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-sunken rounded-lg p-1 w-fit">
          {([['all', '全部'], ['todo', '待办'], ['in_progress', '进行中'], ['done', '已完成']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                filter === key ? 'bg-card text-bone shadow-sm' : 'text-haze hover:text-cream'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        <button
          onClick={() => setFilter('draft')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border ${
            filter === 'draft'
              ? 'bg-gold/10 border-gold/40 text-gold'
              : 'bg-card border-velvet text-haze hover:border-spotlight'
          }`}
          title="草稿箱：存放还没决定要做的想法"
        >
          <Inbox size={14} /> 草稿箱 ({counts.draft})
        </button>
      </div>

      {/* Draft sync bar */}
      {filter === 'draft' && (
        <div className="flex flex-wrap items-center gap-3 mb-4 px-4 py-3 bg-gold/8 border border-gold/30 rounded-lg text-xs">
          <MessageCircle size={14} className="text-gold" />
          <span className="text-cream">
            飞书同步：
            {feishuStatus?.configured
              ? feishuStatus.last_sync_at
                ? `上次 ${formatTime(feishuStatus.last_sync_at)}`
                : '尚未同步'
              : '未配置'}
            {feishuStatus?.messages && (
              <span className="ml-2 text-haze">
                · 24h 收到 {feishuStatus.messages.recent_24h} 条
              </span>
            )}
          </span>
          <button
            onClick={runSync}
            disabled={syncing || !feishuStatus?.configured}
            className="ml-auto flex items-center gap-1 px-3 py-1 bg-card border border-velvet text-cream rounded-md hover:border-gold/50 hover:text-gold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? '同步中...' : '立即同步'}
          </button>
          {syncMsg && (
            <p className="basis-full text-cream">{syncMsg}</p>
          )}
        </div>
      )}

      {/* Todo List */}
      <div className="space-y-2">
        {!filteredTodos.length ? (
          <div className="text-center py-12 text-haze">
            {filter === 'draft' ? <Inbox size={32} className="mx-auto mb-2 opacity-50" /> : <Filter size={32} className="mx-auto mb-2 opacity-50" />}
            <p className="text-sm">{filter === 'draft' ? '草稿箱是空的，先记录一些想法吧' : '暂无待办事项'}</p>
          </div>
        ) : (
          filteredTodos.map(todo => (
            todo.status === 'draft' ? (
              <DraftRow
                key={todo.id}
                todo={todo}
                onPromote={(id) => updateStatus(id, 'todo')}
                onDelete={deleteTodo}
              />
            ) : (
              <TodoRow
                key={todo.id}
                todo={todo}
                onStatusChange={updateStatus}
                onUpdate={updateTodo}
                onDelete={deleteTodo}
              />
            )
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(s: string): string {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DraftRow({
  todo,
  onPromote,
  onDelete,
}: {
  todo: Todo;
  onPromote: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const Icon = todo.source === 'feishu' ? MessageCircle : Lightbulb;
  const iconColor = todo.source === 'feishu' ? 'text-electric' : 'text-gold';
  return (
    <div className="flex items-start gap-3 bg-gold/8 rounded-xl border border-gold/30 px-5 py-4 group hover:border-gold/40 transition-colors">
      <Icon size={18} className={`${iconColor} mt-0.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-cream break-words">{todo.title}</p>
        {todo.description && (
          <p className="text-xs text-haze mt-1 break-words">{todo.description}</p>
        )}
        {todo.source === 'feishu' && todo.source_url && (
          <a
            href={todo.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-1 text-[11px] text-electric hover:underline"
          >
            <ExternalLink size={10} /> 飞书原消息
          </a>
        )}
      </div>
      <button
        onClick={() => onPromote(todo.id)}
        className="text-xs px-2.5 py-1 rounded-md border border-gold/40 text-gold hover:bg-gold/10 flex items-center gap-1 flex-shrink-0"
        title="移到待办"
      >
        <ArrowRight size={12} /> 转待办
      </button>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-fog hover:text-blood opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function TodoRow({
  todo,
  onStatusChange,
  onUpdate,
  onDelete,
}: {
  todo: Todo;
  onStatusChange: (id: number, status: string) => void;
  onUpdate: (id: number, patch: Partial<Todo>) => void;
  onDelete: (id: number) => void;
}) {
  const StatusIcon = statusConfig[todo.status].icon;
  const nextStatus = todo.status === 'todo' ? 'in_progress' : todo.status === 'in_progress' ? 'done' : 'todo';

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(todo.title);
  const [draftPriority, setDraftPriority] = useState(todo.priority);
  const [draftUrgency, setDraftUrgency] = useState(todo.urgency);

  const startEdit = () => {
    setDraftTitle(todo.title);
    setDraftPriority(todo.priority);
    setDraftUrgency(todo.urgency);
    setEditing(true);
  };

  const save = () => {
    const patch: Partial<Todo> = {};
    if (draftTitle.trim() && draftTitle !== todo.title) patch.title = draftTitle.trim();
    if (draftPriority !== todo.priority) patch.priority = draftPriority;
    if (draftUrgency !== todo.urgency) patch.urgency = draftUrgency;
    if (Object.keys(patch).length > 0) onUpdate(todo.id, patch);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-card rounded-xl border border-gold/40 ring-2 ring-indigo-100 px-5 py-4 space-y-3">
        <input
          autoFocus
          value={draftTitle}
          onChange={e => setDraftTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-full px-3 py-2 text-sm border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-haze">优先级:</span>
            {(['P0','P1','P2','P3'] as const).map(p => (
              <button
                key={p}
                onClick={() => setDraftPriority(p)}
                className={`text-xs px-2 py-1 rounded border ${
                  draftPriority === p ? priorityConfig[p].color : 'border-velvet text-haze'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-haze">紧急:</span>
            {(['urgent','normal','low'] as const).map(u => (
              <button
                key={u}
                onClick={() => setDraftUrgency(u)}
                className={`text-xs px-2 py-1 rounded border ${
                  draftUrgency === u ? 'border-gold/50 text-gold bg-gold/10' : 'border-velvet text-haze'
                }`}
              >
                {urgencyConfig[u].label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={save} className="px-3 py-1.5 text-xs bg-gold text-stage-deep rounded-md hover:bg-gold/90 flex items-center gap-1">
              <Check size={12} /> 保存
            </button>
            <button onClick={() => setEditing(false)} className="px-2 py-1.5 text-xs text-haze hover:text-cream flex items-center gap-1">
              <X size={12} /> 取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 bg-card rounded-xl border border-velvet px-5 py-4 group hover:border-spotlight transition-colors ${
      todo.status === 'done' ? 'opacity-60' : ''
    }`}>
      <button
        onClick={() => onStatusChange(todo.id, nextStatus)}
        className={`flex-shrink-0 ${
          todo.status === 'done' ? 'text-grass' : todo.status === 'in_progress' ? 'text-electric' : 'text-fog hover:text-electric'
        }`}
      >
        <StatusIcon size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm break-words ${todo.status === 'done' ? 'line-through text-haze' : 'text-cream'}`}>
          {todo.title}
        </span>
        {todo.due_date && (
          <span className="text-xs text-haze ml-2">{todo.due_date}</span>
        )}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityConfig[todo.priority].color}`}>
        {todo.priority}
      </span>
      <span className={`text-xs ${urgencyConfig[todo.urgency].color}`}>
        {urgencyConfig[todo.urgency].label}
      </span>
      <button
        onClick={startEdit}
        className="text-fog hover:text-electric opacity-0 group-hover:opacity-100 transition-opacity"
        title="编辑"
      >
        <Edit3 size={14} />
      </button>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-fog hover:text-blood opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
