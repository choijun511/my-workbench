import { useEffect, useMemo, useState } from 'react';
import { useApi, apiPost, apiPut, apiDelete } from '../hooks/useApi';
import type { Decision, DecisionStatus, DecisionRelated } from '../types';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Clipboard,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  Link2,
  Inbox,
  RefreshCw,
  ArrowRight,
  Calendar,
  Loader2,
} from 'lucide-react';

const statusLabels: Record<DecisionStatus, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-amber-100 text-amber-700' },
  active: { label: '生效中', className: 'bg-emerald-100 text-emerald-700' },
  superseded: { label: '已被替换', className: 'bg-slate-100 text-slate-500' },
  reverted: { label: '已推翻', className: 'bg-red-100 text-red-600' },
  obsolete: { label: '已废弃', className: 'bg-slate-100 text-slate-400' },
};

const filterTabs: Array<{ key: DecisionStatus | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '生效中' },
  { key: 'draft', label: '草稿箱' },
  { key: 'superseded', label: '已替换' },
  { key: 'reverted', label: '已推翻' },
  { key: 'obsolete', label: '已废弃' },
];

export default function DecisionsPage() {
  const [filter, setFilter] = useState<DecisionStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showCapture, setShowCapture] = useState(false);

  const queryUrl = useMemo(() => {
    const q = new URLSearchParams();
    if (filter !== 'all') q.set('status', filter);
    if (search.trim()) q.set('q', search.trim());
    return `/api/decisions${q.toString() ? '?' + q.toString() : ''}`;
  }, [filter, search]);

  const { data: decisions, refetch } = useApi<Decision[]>(queryUrl);
  const { data: stats, refetch: refetchStats } = useApi<{ counts: Record<string, number>; due_for_review: number }>(
    '/api/decisions/stats'
  );

  const refreshAll = () => {
    refetch();
    refetchStats();
  };

  // Auto-select first decision when list loads / filter changes
  useEffect(() => {
    if (!decisions) return;
    if (decisions.length === 0) {
      setActiveId(null);
    } else if (!decisions.find(d => d.id === activeId)) {
      setActiveId(decisions[0].id);
    }
  }, [decisions, activeId]);

  const counts = stats?.counts || {};
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen size={22} /> 决策
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            从 AI 对话中捕获产品决策，时间线 + 关联 + 反思一体
            {(stats?.due_for_review ?? 0) > 0 && (
              <span className="ml-3 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                <Calendar size={11} /> {stats!.due_for_review} 条待复盘
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCapture(true)}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <Plus size={16} /> 新增决策
        </button>
      </div>

      {showCapture && (
        <CaptureModal
          onClose={() => setShowCapture(false)}
          onSuccess={(d) => {
            setShowCapture(false);
            refreshAll();
            setActiveId(d.id);
          }}
        />
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit text-xs">
          {filterTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                filter === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label} ({t.key === 'all' ? totalAll : counts[t.key] || 0})
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索标题/内容..."
          className="flex-1 max-w-sm px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex gap-6">
        <div className="w-72 flex-shrink-0 space-y-2">
          {!decisions ? (
            <div className="text-xs text-slate-400">加载中...</div>
          ) : decisions.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Inbox size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无决策</p>
              <p className="text-xs mt-1">点右上角"新增决策"开始</p>
            </div>
          ) : (
            decisions.map(d => (
              <DecisionListItem
                key={d.id}
                d={d}
                active={d.id === activeId}
                onClick={() => setActiveId(d.id)}
              />
            ))
          )}
        </div>
        <div className="flex-1 min-w-0">
          {activeId ? (
            <DecisionDetail key={activeId} id={activeId} onChange={refreshAll} />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-slate-400 bg-white rounded-xl border border-slate-200">
              <div className="text-center">
                <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">选择左侧决策查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DecisionListItem({ d, active, onClick }: { d: Decision; active: boolean; onClick: () => void }) {
  const s = statusLabels[d.status];
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-xl border cursor-pointer transition-all ${
        active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-800 break-words flex-1 min-w-0">{d.title}</h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.className} flex-shrink-0`}>{s.label}</span>
      </div>
      {d.decision && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{d.decision}</p>}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {d.tags.slice(0, 3).map(t => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t}</span>
        ))}
        <span className="text-[10px] text-slate-400 ml-auto">{formatTime(d.created_at)}</span>
      </div>
    </div>
  );
}

function CaptureModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (d: Decision) => void }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/decisions/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: text, source_tool: 'manual', source_url: window.location.href }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || '提取失败');
        return;
      }
      onSuccess(data);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-500" /> 新增决策
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
            <Clipboard size={12} /> 把 Claude/ChatGPT 等聊天里你做出决定那段对话粘进来，Gemini 会自动结构化
          </p>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="粘贴对话原文..."
            rows={12}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
          {errorMsg && (
            <div className="mt-3 px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-600 rounded">{errorMsg}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            置信度低于 65% 会自动进草稿箱
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">
              取消
            </button>
            <button
              onClick={submit}
              disabled={loading || !text.trim()}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? '抽取中...' : '抽取并保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionDetail({ id, onChange }: { id: number; onChange: () => void }) {
  const { data: d, refetch } = useApi<Decision>(`/api/decisions/${id}`);
  const [editing, setEditing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [related, setRelated] = useState<DecisionRelated[] | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    setEditing(false);
    setShowRaw(false);
    setRelated(null);
  }, [id]);

  if (!d) return <div className="bg-white rounded-xl border border-slate-200 p-8 text-sm text-slate-400">加载中...</div>;

  const findRelated = async () => {
    setLoadingRelated(true);
    try {
      const res = await fetch(`/api/decisions/${id}/find-related`, { method: 'POST' });
      const data = await res.json();
      if (Array.isArray(data)) setRelated(data);
    } finally {
      setLoadingRelated(false);
    }
  };

  const promote = async () => {
    await apiPost(`/api/decisions/${id}/promote`, {});
    refetch();
    onChange();
  };

  const reflect = async (status: 'holds' | 'wrong' | 'pivoted' | 'still_thinking') => {
    const note = prompt('补充一句反思 (可选):') || '';
    await apiPost(`/api/decisions/${id}/reflect`, { status, note });
    refetch();
    onChange();
  };

  const remove = async () => {
    if (!confirm('确定删除这条决策？')) return;
    await apiDelete(`/api/decisions/${id}`);
    onChange();
  };

  if (editing) {
    return <DecisionEditor d={d} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); onChange(); }} />;
  }

  const s = statusLabels[d.status];
  const dueIn = d.next_review_at ? Math.round((new Date(d.next_review_at).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.className}`}>{s.label}</span>
              {d.confidence != null && (
                <span className="text-[11px] text-slate-400">
                  置信度 {Math.round(d.confidence * 100)}%
                </span>
              )}
              {d.tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{t}</span>
              ))}
            </div>
            <h2 className="text-lg font-semibold text-slate-800 break-words">{d.title}</h2>
            <p className="text-[11px] text-slate-400 mt-1">
              {formatTime(d.created_at)}
              {d.source_tool && <span className="ml-2">· 来源: {d.source_tool}</span>}
              {d.source_url && (
                <a href={d.source_url} target="_blank" rel="noreferrer" className="ml-2 text-indigo-500 hover:underline">原文链接</a>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {d.status === 'draft' && (
              <button onClick={promote} className="text-xs px-2.5 py-1 rounded-md border border-emerald-200 text-emerald-600 hover:bg-emerald-50 flex items-center gap-1">
                <ArrowRight size={11} /> 转生效
              </button>
            )}
            <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-indigo-500 p-1.5" title="编辑">
              <Edit3 size={15} />
            </button>
            <button onClick={remove} className="text-slate-400 hover:text-red-500 p-1.5" title="删除">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {d.decision && (
            <Section label="决策">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{d.decision}</p>
            </Section>
          )}
          {d.context && (
            <Section label="背景 / 为什么">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{d.context}</p>
            </Section>
          )}
          {d.alternatives.length > 0 && (
            <Section label="考虑过的选项">
              <ul className="space-y-1.5">
                {d.alternatives.map((a, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-slate-700">{a.name}</span>
                    {a.why_not && <span className="text-slate-500 ml-2">— {a.why_not}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {d.assumptions.length > 0 && (
            <Section label="假设 (可被推翻)" icon={<AlertTriangle size={12} />}>
              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                {d.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Section>
          )}
          {d.verify && (
            <Section label="如何验证" icon={<Lightbulb size={12} />}>
              <p className="text-sm text-slate-600">{d.verify.method}</p>
              <p className="text-xs text-slate-400 mt-1">
                {d.verify.after_days} 天后复盘
                {dueIn !== null && (
                  <span className={`ml-2 ${dueIn <= 0 ? 'text-amber-600 font-medium' : ''}`}>
                    ({dueIn <= 0 ? '已到期' : `还有 ${dueIn} 天`})
                  </span>
                )}
              </p>
            </Section>
          )}
        </div>
      </div>

      {/* Reflection */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <Calendar size={13} /> 反思日志
        </h3>
        {d.reflection_log.length === 0 ? (
          <p className="text-xs text-slate-400 mb-3">还没有反思记录</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {d.reflection_log.map((r, i) => (
              <li key={i} className="text-xs">
                <span className="text-slate-400">{formatTime(r.at)}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded ${reflectionColor(r.status)}`}>{reflectionLabel(r.status)}</span>
                {r.note && <span className="ml-2 text-slate-600">{r.note}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">添加反思：</span>
          <button onClick={() => reflect('holds')} className="text-xs px-2.5 py-1 rounded border border-emerald-200 text-emerald-600 hover:bg-emerald-50">仍成立</button>
          <button onClick={() => reflect('still_thinking')} className="text-xs px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">还在观察</button>
          <button onClick={() => reflect('wrong')} className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">假设错了</button>
          <button onClick={() => reflect('pivoted')} className="text-xs px-2.5 py-1 rounded border border-amber-200 text-amber-700 hover:bg-amber-50">已转向</button>
        </div>
      </div>

      {/* Related */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Link2 size={13} /> 相关决策
          </h3>
          <button
            onClick={findRelated}
            disabled={loadingRelated}
            className="text-xs px-2.5 py-1 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loadingRelated ? 'animate-spin' : ''} />
            {loadingRelated ? '搜索中...' : (related ? '重新搜索' : '查找相关')}
          </button>
        </div>
        {related === null ? (
          <p className="text-xs text-slate-400">点右上"查找相关"通过 embedding 找语义近的历史决策</p>
        ) : related.length === 0 ? (
          <p className="text-xs text-slate-400">没有找到相关决策</p>
        ) : (
          <ul className="space-y-1.5">
            {related.map(r => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono">
                  {Math.round(r.score * 100)}%
                </span>
                <span className="text-slate-700 truncate">{r.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Raw excerpt */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          {showRaw ? '隐藏' : '查看'}原始对话片段 ({d.raw_excerpt.length} 字)
        </button>
        {showRaw && (
          <pre className="mt-3 text-xs text-slate-600 bg-slate-50 p-3 rounded whitespace-pre-wrap break-words font-mono leading-relaxed max-h-96 overflow-y-auto">
            {d.raw_excerpt}
          </pre>
        )}
      </div>
    </div>
  );
}

function DecisionEditor({ d, onCancel, onSaved }: { d: Decision; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(d.title);
  const [decision, setDecision] = useState(d.decision);
  const [context, setContext] = useState(d.context);
  const [tagsText, setTagsText] = useState(d.tags.join(', '));
  const [verifyMethod, setVerifyMethod] = useState(d.verify?.method || '');
  const [verifyDays, setVerifyDays] = useState(d.verify?.after_days?.toString() || '7');

  const save = async () => {
    const patch: any = {
      title,
      decision,
      context,
      tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
    };
    if (verifyMethod.trim()) {
      patch.verify = { method: verifyMethod.trim(), after_days: Number(verifyDays) || 7 };
      const next = new Date(Date.now() + (Number(verifyDays) || 7) * 86400000)
        .toISOString().slice(0, 19).replace('T', ' ');
      patch.next_review_at = next;
    } else {
      patch.verify = null;
      patch.next_review_at = null;
    }
    await apiPut(`/api/decisions/${d.id}`, patch);
    onSaved();
  };

  return (
    <div className="bg-white rounded-xl border border-indigo-200 ring-2 ring-indigo-100 p-5 space-y-3">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="标题"
        className="w-full px-3 py-2 text-base font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <FieldLabel>决策</FieldLabel>
      <textarea
        value={decision}
        onChange={e => setDecision(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <FieldLabel>背景</FieldLabel>
      <textarea
        value={context}
        onChange={e => setContext(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <FieldLabel>标签 (逗号分隔)</FieldLabel>
      <input
        value={tagsText}
        onChange={e => setTagsText(e.target.value)}
        placeholder="OKR, 配色, 飞书集成"
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <FieldLabel>如何验证</FieldLabel>
      <input
        value={verifyMethod}
        onChange={e => setVerifyMethod(e.target.value)}
        placeholder="例如：观察一周内主页 DAU 是否回升"
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">复盘窗口</span>
        <input
          type="number"
          value={verifyDays}
          onChange={e => setVerifyDays(e.target.value)}
          min={1}
          className="w-20 px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-slate-500">天后</span>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1">
          <X size={13} /> 取消
        </button>
        <button onClick={save} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 flex items-center gap-1">
          <Check size={13} /> 保存
        </button>
      </div>
    </div>
  );
}

function Section({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        {icon} {label}
      </h4>
      {children}
    </div>
  );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-slate-500 font-medium">{children}</label>;
}

function reflectionLabel(s: string): string {
  return ({ holds: '仍成立', wrong: '假设错了', pivoted: '已转向', still_thinking: '还在观察' } as Record<string, string>)[s] || s;
}
function reflectionColor(s: string): string {
  return (
    {
      holds: 'bg-emerald-100 text-emerald-700',
      wrong: 'bg-red-100 text-red-600',
      pivoted: 'bg-amber-100 text-amber-700',
      still_thinking: 'bg-slate-100 text-slate-600',
    } as Record<string, string>
  )[s] || 'bg-slate-100 text-slate-600';
}
function formatTime(s: string): string {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
