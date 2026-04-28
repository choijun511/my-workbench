import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, apiPost, apiPut, apiDelete } from '../hooks/useApi';
import { useConfirm, usePrompt } from '../components/ui/Dialog';
import type { Decision, DecisionStatus, DecisionRelated, DecisionLinks, DecisionLinkKind, DecisionStats } from '../types';
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
  draft: { label: '草稿', className: 'bg-gold/20 text-gold' },
  active: { label: '生效中', className: 'bg-grass/20 text-grass' },
  superseded: { label: '已被替换', className: 'bg-sunken text-haze' },
  reverted: { label: '已推翻', className: 'bg-blood/20 text-blood' },
  obsolete: { label: '已废弃', className: 'bg-sunken text-haze' },
};

const filterTabs: Array<{ key: DecisionStatus | 'all' | 'closed'; label: string; statuses?: DecisionStatus[] }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '生效中' },
  { key: 'draft', label: '草稿箱' },
  { key: 'closed', label: '已结束', statuses: ['superseded', 'reverted', 'obsolete'] },
];

export default function DecisionsPage() {
  const [filter, setFilter] = useState<DecisionStatus | 'all' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [manualCapture, setManualCapture] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Honor ?capture=1 (e.g. from Cmd+K shortcut) — derive directly from URL
  const captureFromUrl = searchParams.get('capture') === '1';
  const showCapture = manualCapture || captureFromUrl;
  const closeCapture = () => {
    setManualCapture(false);
    if (captureFromUrl) {
      const next = new URLSearchParams(searchParams);
      next.delete('capture');
      setSearchParams(next, { replace: true });
    }
  };

  const queryUrl = useMemo(() => {
    const q = new URLSearchParams();
    if (filter !== 'all' && filter !== 'closed') q.set('status', filter);
    if (search.trim()) q.set('q', search.trim());
    return `/api/decisions${q.toString() ? '?' + q.toString() : ''}`;
  }, [filter, search]);

  const { data: rawDecisions, refetch } = useApi<Decision[]>(queryUrl);
  const decisions = useMemo(() => {
    if (!rawDecisions) return null;
    if (filter !== 'closed') return rawDecisions;
    return rawDecisions.filter(d => ['superseded', 'reverted', 'obsolete'].includes(d.status));
  }, [rawDecisions, filter]);
  const { data: stats, refetch: refetchStats } = useApi<DecisionStats>('/api/decisions/stats');

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
  const closedCount = (counts.superseded || 0) + (counts.reverted || 0) + (counts.obsolete || 0);
  const tabCount = (key: typeof filter) => {
    if (key === 'all') return totalAll;
    if (key === 'closed') return closedCount;
    return counts[key] || 0;
  };

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bone flex items-center gap-2">
            <BookOpen size={22} /> 决策
          </h1>
          <div className="text-sm text-haze mt-1 flex items-center gap-2 flex-wrap">
            <span>从 AI 对话中捕获产品决策，时间线 + 关联 + 反思一体</span>
            {(stats?.due_for_review ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gold/20 text-gold">
                <Calendar size={11} /> {stats!.due_for_review} 条待复盘
              </span>
            )}
            {stats?.judgment && (stats.judgment.holds_count > 0 || stats.judgment.wrong_count > 0) && (
              <ScoreBadge score={stats.judgment.total_score} subtitle={`${stats.judgment.holds_count}对 / ${stats.judgment.wrong_count}错 / ${stats.judgment.pending_count}待定`} />
            )}
          </div>
        </div>
        <button
          onClick={() => setManualCapture(true)}
          className="px-4 py-2.5 bg-gold text-stage-deep btn-glow-gold rounded-lg text-sm font-medium hover:bg-gold/90 btn-glow-gold flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
          title="新增决策（Cmd+K）"
        >
          <Plus size={16} /> 新增决策
        </button>
      </div>

      {showCapture && (
        <CaptureModal
          onClose={closeCapture}
          onSuccess={(d) => {
            closeCapture();
            refreshAll();
            setActiveId(d.id);
          }}
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
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索标题/内容..."
          className="flex-1 max-w-sm px-3 py-1.5 text-xs border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>

      <div className="flex gap-6">
        <div className="w-72 flex-shrink-0 space-y-2">
          {!decisions ? (
            <div className="text-xs text-haze">加载中...</div>
          ) : decisions.length === 0 ? (
            <div className="text-center py-8 text-haze">
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
            <DecisionDetail
              key={activeId}
              id={activeId}
              onChange={refreshAll}
              onNavigate={(id) => setActiveId(id)}
            />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-haze bg-card rounded-xl border border-velvet">
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
      className={`p-3 rounded-xl border cursor-pointer card-lift ${
        active ? 'border-gold/50 bg-gold/10 nav-active-glow' : 'border-velvet bg-card'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-bone break-words flex-1 min-w-0">{d.title}</h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.className} flex-shrink-0`}>{s.label}</span>
      </div>
      {d.decision && <p className="text-xs text-haze mt-1 line-clamp-2">{d.decision}</p>}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {d.tags.slice(0, 3).map(t => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-sunken text-haze">{t}</span>
        ))}
        <span className="text-[10px] text-haze ml-auto">{formatTime(d.created_at)}</span>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 backdrop-enter">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col grain modal-enter border border-velvet">
        <div className="px-5 py-3 border-b border-velvet flex items-center justify-between">
          <h2 className="text-base font-semibold text-bone flex items-center gap-2">
            <Sparkles size={16} className="text-electric" /> 新增决策
          </h2>
          <button onClick={onClose} className="text-haze hover:text-cream">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <p className="text-xs text-haze mb-2 flex items-center gap-1">
            <Clipboard size={12} /> 把 Claude/ChatGPT 等聊天里你做出决定那段对话粘进来，Gemini 会自动结构化
          </p>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="粘贴对话原文..."
            rows={12}
            className="w-full px-3 py-2 text-sm border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold font-mono"
          />
          {errorMsg && (
            <div className="mt-3 px-3 py-2 text-xs bg-blood/10 border border-blood/30 text-blood rounded">{errorMsg}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-velvet flex items-center justify-between">
          <p className="text-xs text-haze">
            置信度低于 65% 会自动进草稿箱
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-cream hover:text-bone">
              取消
            </button>
            <button
              onClick={submit}
              disabled={loading || !text.trim()}
              className="px-4 py-1.5 bg-gold text-stage-deep btn-glow-gold rounded-md text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
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

function DecisionDetail({
  id,
  onChange,
  onNavigate,
}: {
  id: number;
  onChange: () => void;
  onNavigate: (id: number) => void;
}) {
  const { data: d, refetch } = useApi<Decision>(`/api/decisions/${id}`);
  const { data: links, refetch: refetchLinks } = useApi<DecisionLinks>(`/api/decisions/${id}/links`);
  const confirmDialog = useConfirm();
  const promptDialog = usePrompt();
  const [editing, setEditing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [related, setRelated] = useState<DecisionRelated[] | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [analyze, setAnalyze] = useState(false);

  useEffect(() => {
    setEditing(false);
    setShowRaw(false);
    setRelated(null);
  }, [id]);

  if (!d) return <div className="bg-card rounded-xl border border-velvet p-8 text-sm text-haze">加载中...</div>;

  const findRelated = async () => {
    setLoadingRelated(true);
    try {
      const res = await fetch(`/api/decisions/${id}/find-related`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyze, min_score: 0.45, top_k: 8 }),
      });
      const data = await res.json();
      if (Array.isArray(data)) setRelated(data);
    } finally {
      setLoadingRelated(false);
    }
  };

  const createLink = async (toId: number, kind: DecisionLinkKind) => {
    const res = await fetch(`/api/decisions/${id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_id: toId, kind }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      await confirmDialog({ title: '链接失败', body: data.error || '未知错误', confirmLabel: '知道了', cancelLabel: '' });
      return;
    }
    await refetchLinks();
    if (kind === 'supersedes' || kind === 'reverts') {
      // status of linked decision changed; refresh list
      onChange();
    }
    // Refresh related to reflect existing_link_kind
    if (related) {
      setRelated(related.map(r => r.id === toId ? { ...r, existing_link_kind: kind } : r));
    }
  };

  const removeLink = async (linkId: number) => {
    await apiDelete(`/api/decisions/links/${linkId}`);
    await refetchLinks();
    onChange();
  };

  const promote = async () => {
    await apiPost(`/api/decisions/${id}/promote`, {});
    refetch();
    onChange();
  };

  const reflect = async (status: 'holds' | 'wrong' | 'pivoted' | 'still_thinking') => {
    const labels = {
      holds: { title: '判断仍成立', impact: `+${d.judgment_multiplier} 分` },
      wrong: { title: '判断错了', impact: `−${2 * d.judgment_multiplier} 分` },
      pivoted: { title: '已转向', impact: '不计分' },
      still_thinking: { title: '继续观察', impact: '不计分' },
    } as const;
    const note = await promptDialog({
      title: labels[status].title,
      body: `结算：${labels[status].impact}。可补充一句反思（可选）。`,
      placeholder: '比如：实际上更难做对，是因为…',
      multiline: true,
      confirmLabel: '记录',
    });
    if (note === null) return;
    await apiPost(`/api/decisions/${id}/reflect`, { status, note });
    refetch();
    onChange();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: '删除这条决策？',
      body: '一并清空它的关联和反思日志，无法恢复。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
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
      <div className="bg-card rounded-xl border border-velvet">
        <div className="px-5 py-4 border-b border-velvet flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.className}`}>{s.label}</span>
              {d.confidence != null && (
                <span className="text-[11px] text-haze">
                  置信度 {Math.round(d.confidence * 100)}%
                </span>
              )}
              {d.tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-sunken text-cream">{t}</span>
              ))}
            </div>
            <h2 className="text-lg font-semibold text-bone break-words">{d.title}</h2>
            <p className="text-[11px] text-haze mt-1">
              {formatTime(d.created_at)}
              {d.source_tool && <span className="ml-2">· 来源: {d.source_tool}</span>}
              {d.source_url && (
                <a href={d.source_url} target="_blank" rel="noreferrer" className="ml-2 text-electric hover:underline">原文链接</a>
              )}
            </p>
            <StakeMeter d={d} />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {d.status === 'draft' && (
              <button onClick={promote} className="text-xs px-2.5 py-1 rounded-md border border-grass/40 text-grass hover:bg-grass/10 flex items-center gap-1">
                <ArrowRight size={11} /> 转生效
              </button>
            )}
            <button onClick={() => setEditing(true)} className="text-haze hover:text-electric p-1.5" title="编辑">
              <Edit3 size={15} />
            </button>
            <button onClick={remove} className="text-haze hover:text-blood p-1.5" title="删除">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {d.decision && (
            <Section label="决策">
              <p className="text-sm text-cream leading-relaxed whitespace-pre-wrap">{d.decision}</p>
            </Section>
          )}
          {d.context && (
            <Section label="背景 / 为什么">
              <p className="text-sm text-cream leading-relaxed whitespace-pre-wrap">{d.context}</p>
            </Section>
          )}
          {d.alternatives.length > 0 && (
            <Section label="考虑过的选项">
              <ul className="space-y-1.5">
                {d.alternatives.map((a, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-cream">{a.name}</span>
                    {a.why_not && <span className="text-haze ml-2">— {a.why_not}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {d.assumptions.length > 0 && (
            <Section label="假设 (可被推翻)" icon={<AlertTriangle size={12} />}>
              <ul className="list-disc list-inside text-sm text-cream space-y-1">
                {d.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Section>
          )}
          {d.verify && (
            <Section label="如何验证" icon={<Lightbulb size={12} />}>
              <p className="text-sm text-cream">{d.verify.method}</p>
              <p className="text-xs text-haze mt-1">
                {d.verify.after_days} 天后复盘
                {dueIn !== null && (
                  <span className={`ml-2 ${dueIn <= 0 ? 'text-gold font-medium' : ''}`}>
                    ({dueIn <= 0 ? '已到期' : `还有 ${dueIn} 天`})
                  </span>
                )}
              </p>
            </Section>
          )}
        </div>
      </div>

      {/* Reflection */}
      <div className="bg-card rounded-xl border border-velvet p-5">
        <h3 className="text-sm font-medium text-cream mb-3 flex items-center gap-1.5">
          <Calendar size={13} /> 反思日志
        </h3>
        {d.reflection_log.length === 0 ? (
          <p className="text-xs text-haze mb-3">还没有反思记录</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {d.reflection_log.map((r, i) => (
              <li key={i} className="text-xs">
                <span className="text-haze">{formatTime(r.at)}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded ${reflectionColor(r.status)}`}>{reflectionLabel(r.status)}</span>
                {r.note && <span className="ml-2 text-cream">{r.note}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-haze">添加反思：</span>
          <button onClick={() => reflect('holds')} className="text-xs px-2.5 py-1 rounded border border-grass/40 text-grass hover:bg-grass/10 flex items-center gap-1">
            仍成立 <span className="font-mono text-[10px] opacity-80">+{d.judgment_multiplier}</span>
          </button>
          <button onClick={() => reflect('still_thinking')} className="text-xs px-2.5 py-1 rounded border border-velvet text-cream hover:bg-stage">
            还在观察
          </button>
          <button onClick={() => reflect('wrong')} className="text-xs px-2.5 py-1 rounded border border-blood/30 text-blood hover:bg-blood/10 flex items-center gap-1">
            假设错了 <span className="font-mono text-[10px] opacity-80">−{2 * d.judgment_multiplier}</span>
          </button>
          <button onClick={() => reflect('pivoted')} className="text-xs px-2.5 py-1 rounded border border-gold/40 text-gold hover:bg-gold/10">已转向</button>
        </div>
      </div>

      {/* Existing manual links */}
      {links && (links.outgoing.length > 0 || links.incoming.length > 0) && (
        <div className="bg-card rounded-xl border border-velvet p-5">
          <h3 className="text-sm font-medium text-cream flex items-center gap-1.5 mb-3">
            <Link2 size={13} /> 已关联决策
          </h3>
          {links.outgoing.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-haze mb-1.5">本条 → 其他</p>
              <ul className="space-y-1">
                {links.outgoing.map(l => (
                  <li key={l.link_id} className="group flex items-center gap-2 text-sm">
                    <LinkKindBadge kind={l.kind} />
                    <button
                      onClick={() => onNavigate(l.id)}
                      className="text-cream hover:text-gold hover:underline truncate flex-1 text-left"
                    >
                      {l.title}
                    </button>
                    <button
                      onClick={() => removeLink(l.link_id)}
                      className="text-fog hover:text-blood opacity-0 group-hover:opacity-100"
                      title="移除链接"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {links.incoming.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-haze mb-1.5">其他 → 本条</p>
              <ul className="space-y-1">
                {links.incoming.map(l => (
                  <li key={l.link_id} className="flex items-center gap-2 text-sm">
                    <LinkKindBadge kind={l.kind} />
                    <button
                      onClick={() => onNavigate(l.id)}
                      className="text-cream hover:text-gold hover:underline truncate flex-1 text-left"
                    >
                      {l.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Find related */}
      <div className="bg-card rounded-xl border border-velvet p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-medium text-cream flex items-center gap-1.5">
            <Sparkles size={13} className="text-electric" /> 智能关联
          </h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-haze flex items-center gap-1 select-none cursor-pointer">
              <input type="checkbox" checked={analyze} onChange={e => setAnalyze(e.target.checked)} className="cursor-pointer" />
              AI 解释关系（更慢）
            </label>
            <button
              onClick={findRelated}
              disabled={loadingRelated}
              className="text-xs px-2.5 py-1 rounded-md border border-gold/40 text-gold hover:bg-gold/10 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={11} className={loadingRelated ? 'animate-spin' : ''} />
              {loadingRelated ? '搜索中...' : (related ? '重新搜索' : '查找相关')}
            </button>
          </div>
        </div>
        {related === null ? (
          <p className="text-xs text-haze">通过 embedding 找语义相近的历史决策；勾上"AI 解释关系"会让 Gemini 给每条候选标注 supersedes / contradicts / extends / related。</p>
        ) : related.length === 0 ? (
          <p className="text-xs text-haze">没有找到分数 ≥ 0.45 的相关决策</p>
        ) : (
          <ul className="space-y-2">
            {related.map(r => (
              <RelatedRow
                key={r.id}
                row={r}
                onNavigate={() => onNavigate(r.id)}
                onLink={(kind) => createLink(r.id, kind)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Raw excerpt */}
      <div className="bg-card rounded-xl border border-velvet p-5">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-xs text-haze hover:text-cream flex items-center gap-1"
        >
          {showRaw ? '隐藏' : '查看'}原始对话片段 ({d.raw_excerpt.length} 字)
        </button>
        {showRaw && (
          <pre className="mt-3 text-xs text-cream bg-stage p-3 rounded whitespace-pre-wrap break-words font-mono leading-relaxed max-h-96 overflow-y-auto">
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
  const [odds, setOdds] = useState(d.odds.toString());
  const [conviction, setConviction] = useState(d.conviction);
  const [importance, setImportance] = useState(d.importance);
  const [nonConsensus, setNonConsensus] = useState(d.non_consensus);

  const oddsNum = Number(odds) || 1;
  const previewMultiplier = oddsNum * conviction * importance * nonConsensus;

  const save = async () => {
    const patch: any = {
      title,
      decision,
      context,
      tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
      odds: oddsNum,
      conviction,
      importance,
      non_consensus: nonConsensus,
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
    <div className="bg-card rounded-xl border border-gold/40 ring-2 ring-indigo-100 p-5 space-y-3">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="标题"
        className="w-full px-3 py-2 text-base font-semibold border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
      />
      <FieldLabel>决策</FieldLabel>
      <textarea
        value={decision}
        onChange={e => setDecision(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
      />
      <FieldLabel>背景</FieldLabel>
      <textarea
        value={context}
        onChange={e => setContext(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
      />
      <FieldLabel>标签 (逗号分隔)</FieldLabel>
      <input
        value={tagsText}
        onChange={e => setTagsText(e.target.value)}
        placeholder="OKR, 配色, 飞书集成"
        className="w-full px-3 py-2 text-sm border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
      />
      <FieldLabel>如何验证</FieldLabel>
      <input
        value={verifyMethod}
        onChange={e => setVerifyMethod(e.target.value)}
        placeholder="例如：观察一周内主页 DAU 是否回升"
        className="w-full px-3 py-2 text-sm border border-velvet rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
      />
      <div className="flex items-center gap-2 text-sm">
        <span className="text-haze">复盘窗口</span>
        <input
          type="number"
          value={verifyDays}
          onChange={e => setVerifyDays(e.target.value)}
          min={1}
          className="w-20 px-2 py-1 border border-velvet rounded focus:outline-none focus:ring-1 focus:ring-gold"
        />
        <span className="text-haze">天后</span>
      </div>

      <div className="border-t border-velvet pt-3 mt-2">
        <div className="flex items-center justify-between mb-2">
          <FieldLabel>判断力评分参数</FieldLabel>
          <span className="text-[11px] text-haze">
            倍数 = {previewMultiplier} · 对了 +{previewMultiplier} · 错了 -{previewMultiplier * 2}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ScoreInput label="赔率" hint="≥0.1，敢下重注就调高">
            <input
              type="number"
              value={odds}
              onChange={e => setOdds(e.target.value)}
              min={0.1}
              step={0.5}
              className="w-full px-2 py-1 text-sm border border-velvet rounded focus:outline-none focus:ring-1 focus:ring-gold"
            />
          </ScoreInput>
          <ScoreInput label="确信度" hint="3 = 非常笃定">
            <DotPicker value={conviction} onChange={setConviction} />
          </ScoreInput>
          <ScoreInput label="重要性" hint="3 = 高杠杆决定">
            <DotPicker value={importance} onChange={setImportance} />
          </ScoreInput>
          <ScoreInput label="非共识度" hint="3 = 大家不同意，我坚持">
            <DotPicker value={nonConsensus} onChange={setNonConsensus} />
          </ScoreInput>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-cream hover:text-bone flex items-center gap-1">
          <X size={13} /> 取消
        </button>
        <button onClick={save} className="px-4 py-1.5 bg-gold text-stage-deep btn-glow-gold rounded-md text-sm hover:bg-gold/90 btn-glow-gold flex items-center gap-1">
          <Check size={13} /> 保存
        </button>
      </div>
    </div>
  );
}

const LINK_KIND_META: Record<DecisionLinkKind, { label: string; className: string }> = {
  related: { label: '相关', className: 'bg-sunken text-cream' },
  extends: { label: '延伸', className: 'bg-gold/20 text-gold' },
  contradicts: { label: '冲突', className: 'bg-gold/20 text-gold' },
  supersedes: { label: '替换', className: 'bg-grass/20 text-grass' },
  reverts: { label: '推翻', className: 'bg-blood/20 text-blood' },
};

function LinkKindBadge({ kind }: { kind: DecisionLinkKind }) {
  const meta = LINK_KIND_META[kind] || LINK_KIND_META.related;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.className} flex-shrink-0`}>
      {meta.label}
    </span>
  );
}

function RelatedRow({
  row,
  onNavigate,
  onLink,
}: {
  row: DecisionRelated;
  onNavigate: () => void;
  onLink: (kind: DecisionLinkKind) => void;
}) {
  const linked = !!row.existing_link_kind;
  const suggestionMeta = row.suggested_kind && row.suggested_kind !== 'unrelated'
    ? LINK_KIND_META[row.suggested_kind as DecisionLinkKind]
    : null;

  return (
    <li className="border border-velvet rounded-lg p-2.5 hover:border-velvet group">
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold font-mono flex-shrink-0">
          {Math.round(row.score * 100)}%
        </span>
        {suggestionMeta && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${suggestionMeta.className} flex-shrink-0`}>
            AI: {suggestionMeta.label}
          </span>
        )}
        {linked && row.existing_link_kind && (
          <span className="text-[10px] flex-shrink-0">
            <LinkKindBadge kind={row.existing_link_kind} />
          </span>
        )}
        <button onClick={onNavigate} className="text-sm text-cream hover:text-gold hover:underline truncate flex-1 text-left">
          {row.title}
        </button>
      </div>
      {row.suggested_reason && (
        <p className="text-[11px] text-haze mt-1 ml-1">{row.suggested_reason}</p>
      )}
      {!linked && (
        <div className="flex items-center gap-1 mt-2 ml-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
          <span className="text-[10px] text-haze mr-1">标记为：</span>
          {(['related', 'extends', 'contradicts', 'supersedes', 'reverts'] as DecisionLinkKind[]).map(k => (
            <button
              key={k}
              onClick={() => onLink(k)}
              className={`text-[10px] px-1.5 py-0.5 rounded border border-velvet hover:border-gold/50 hover:text-gold ${LINK_KIND_META[k].className}`}
            >
              {LINK_KIND_META[k].label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function StakeMeter({ d }: { d: Decision }) {
  const positive = d.judgment_score > 0;
  const pending = d.judgment_verdict === 'pending';
  const bigBet = d.judgment_multiplier >= 18; // 押注规模大的高亮

  return (
    <div className="flex items-center gap-2 mt-3 flex-wrap text-[11px] font-mono">
      <span className="text-haze">赔率</span>
      <span className={'font-medium ' + (d.odds > 1 ? 'text-gold' : 'text-cream')}>{d.odds}×</span>
      <span className="text-fog">·</span>
      <DotRow value={d.conviction} title={`确信 ${d.conviction}/3`} />
      <DotRow value={d.importance} title={`重要 ${d.importance}/3`} />
      <DotRow value={d.non_consensus} title={`非共识 ${d.non_consensus}/3`} />
      <span className="text-fog">·</span>
      <span className={
        'inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium ' +
        (pending
          ? bigBet ? 'bg-stage-deep text-bone prism-ring' : 'bg-sunken text-haze'
          : positive
          ? bigBet ? 'bg-stage-deep text-grass prism-ring prism-glow' : 'bg-grass/20 text-grass'
          : bigBet ? 'bg-stage-deep text-blood prism-ring prism-glow' : 'bg-blood/20 text-blood')
      }>
        {pending ? `押注 ${d.judgment_multiplier}×` :
         (positive ? '+' : '') + d.judgment_score + ' 分'}
      </span>
    </div>
  );
}

function DotRow({ value, title }: { value: number; title: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={title}>
      {[1, 2, 3].map(i => (
        <span key={i} className={i <= value ? 'text-electric text-[10px]' : 'text-fog text-[10px]'}>●</span>
      ))}
    </span>
  );
}

function ScoreBadge({ score, subtitle }: { score: number; subtitle?: string }) {
  const positive = score > 0;
  const negative = score < 0;
  const bigBet = Math.abs(score) >= 18; // big stakes = prism ring
  const baseColor = positive ? 'text-grass' : negative ? 'text-blood' : 'text-haze';
  const baseBg = bigBet
    ? 'bg-stage-deep'
    : positive ? 'bg-grass/10 border border-grass/40'
      : negative ? 'bg-blood/10 border border-blood/30'
      : 'bg-stage border border-velvet';

  return (
    <span className={
      `inline-flex items-center gap-2 text-xs px-2 py-0.5 rounded-full ${baseColor} ${baseBg} ` +
      (bigBet ? 'prism-ring' : '')
    }>
      <span className="font-mono font-semibold">
        {positive ? '+' : ''}{score} 分
      </span>
      {subtitle && <span className="text-haze font-normal">· {subtitle}</span>}
    </span>
  );
}

function ScoreInput({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-cream font-medium">{label}</span>
        <span className="text-[10px] text-haze">{hint}</span>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DotPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={
            'w-7 h-7 rounded-md border text-sm font-medium transition-colors ' +
            (value >= i
              ? 'bg-gold/10 border-gold/50 text-gold'
              : 'bg-card border-velvet text-haze hover:border-spotlight')
          }
          title={`${i} / 3`}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function Section({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-haze uppercase tracking-wide mb-1.5 flex items-center gap-1">
        {icon} {label}
      </h4>
      {children}
    </div>
  );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-haze font-medium">{children}</label>;
}

function reflectionLabel(s: string): string {
  return ({ holds: '仍成立', wrong: '假设错了', pivoted: '已转向', still_thinking: '还在观察' } as Record<string, string>)[s] || s;
}
function reflectionColor(s: string): string {
  return (
    {
      holds: 'bg-grass/20 text-grass',
      wrong: 'bg-blood/20 text-blood',
      pivoted: 'bg-gold/20 text-gold',
      still_thinking: 'bg-sunken text-cream',
    } as Record<string, string>
  )[s] || 'bg-sunken text-cream';
}
function formatTime(s: string): string {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
