import { useEffect, useMemo, useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { useDisplayCapture } from '../hooks/useDisplayCapture';
import type { FengshenPanel, PanelInsight, PanelInsightResult } from '../types';
import {
  Plus,
  Trash2,
  ExternalLink,
  Monitor,
  GripVertical,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  ScreenShare,
} from 'lucide-react';

export default function FengshenPage() {
  const { data: panels, refetch } = useApi<FengshenPanel[]>('/api/fengshen');
  const [showAdd, setShowAdd] = useState(false);
  const [activePanel, setActivePanel] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const capture = useDisplayCapture();

  const addPanel = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    await apiPost('/api/fengshen', { name: newName, url: newUrl, description: newDesc });
    setNewName('');
    setNewUrl('');
    setNewDesc('');
    setShowAdd(false);
    refetch();
  };

  const deletePanel = async (id: number) => {
    await apiDelete(`/api/fengshen/${id}`);
    if (activePanel === id) setActivePanel(null);
    refetch();
  };

  const reorder = async (sourceId: number, targetId: number) => {
    if (!panels || sourceId === targetId) return;
    const ids = panels.map(p => p.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newIds = [...ids];
    newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, sourceId);
    await apiPost('/api/fengshen/reorder', { ids: newIds });
    refetch();
  };

  const selected = panels?.find(p => p.id === activePanel);

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">风神看板</h1>
          <p className="text-sm text-slate-500 mt-1">嵌入风神系统的关键指标和看板</p>
        </div>
        <div className="flex items-center gap-2">
          <ScreenShareToggle capture={capture} />
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5"
          >
            <Plus size={16} /> 添加看板
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="看板名称"
              className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="风神看板 URL"
              className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-3">
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="描述（可选）"
              className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button onClick={addPanel} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
              保存
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Panel list with drag-and-drop */}
        <div className="w-64 flex-shrink-0 space-y-2">
          {!panels?.length ? (
            <div className="text-center py-8 text-slate-400">
              <Monitor size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无看板</p>
              <p className="text-xs mt-1">点击上方按钮添加风神看板</p>
            </div>
          ) : (
            panels.map(panel => {
              const isDragOver = dragOverId === panel.id && dragId !== panel.id;
              return (
                <div
                  key={panel.id}
                  draggable
                  onDragStart={e => {
                    setDragId(panel.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverId !== panel.id) setDragOverId(panel.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === panel.id) setDragOverId(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragId !== null) reorder(dragId, panel.id);
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all group ${
                    activePanel === panel.id
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${isDragOver ? 'ring-2 ring-indigo-300 ring-offset-1' : ''} ${
                    dragId === panel.id ? 'opacity-50' : ''
                  }`}
                  onClick={() => setActivePanel(panel.id)}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical size={14} className="text-slate-300 group-hover:text-slate-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-slate-800 truncate">{panel.name}</h3>
                      {panel.description && (
                        <p className="text-xs text-slate-400 mt-1 truncate">{panel.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={panel.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-slate-400 hover:text-indigo-500"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          deletePanel(panel.id);
                        }}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right side: AI Insight + iframe */}
        <div className="flex-1 min-w-0">
          {selected ? (
            <div className="space-y-4">
              <PanelInsightCard panel={selected} capture={capture} />
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden min-h-[600px] 2xl:min-h-[700px]">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{selected.name}</span>
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    在新窗口打开 <ExternalLink size={12} />
                  </a>
                </div>
                <iframe
                  src={selected.url}
                  className="w-full border-0"
                  style={{ height: 'calc(100% - 48px)', minHeight: '600px' }}
                  title={selected.name}
                />
              </div>
            </div>
          ) : (
            <div className="h-[600px] flex items-center justify-center text-slate-400 bg-white rounded-xl border border-slate-200">
              <div className="text-center">
                <Monitor size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">选择一个看板查看</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScreenShareToggle({ capture }: { capture: ReturnType<typeof useDisplayCapture> }) {
  if (capture.active) {
    return (
      <button
        onClick={capture.stop}
        className="px-3 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm flex items-center gap-1.5 hover:bg-emerald-100"
        title="停止屏幕共享"
      >
        <ScreenShare size={16} /> 共享中
      </button>
    );
  }
  return (
    <button
      onClick={capture.start}
      disabled={capture.starting}
      className="px-3 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm flex items-center gap-1.5 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
      title="开启屏幕共享后可自动截图生成洞察"
    >
      <ScreenShare size={16} /> {capture.starting ? '请求中...' : '开启自动洞察'}
    </button>
  );
}

function PanelInsightCard({
  panel,
  capture,
}: {
  panel: FengshenPanel;
  capture: ReturnType<typeof useDisplayCapture>;
}) {
  const { data: insights, refetch } = useApi<PanelInsight[]>(`/api/fengshen/${panel.id}/insights`);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [autoTriedFor, setAutoTriedFor] = useState<number | null>(null);

  const latest = insights?.[0];
  const latestResult: PanelInsightResult | null = useMemo(() => {
    if (!latest) return null;
    try { return JSON.parse(latest.result); } catch { return null; }
  }, [latest]);

  const isToday = (s?: string) => {
    if (!s) return false;
    const d = new Date(s.replace(' ', 'T') + 'Z');
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  };
  const hasTodayInsight = isToday(latest?.created_at);

  const generate = async () => {
    if (!capture.active) {
      setErrorMsg('请先在右上角开启屏幕共享');
      return;
    }
    setGenerating(true);
    setErrorMsg(null);
    try {
      // Give iframe a moment to render
      await new Promise(r => setTimeout(r, 600));
      const b64 = await capture.captureFrameJpeg();
      if (!b64) {
        setErrorMsg('截图失败，请确认共享的是当前标签页');
        return;
      }
      const res = await fetch(`/api/fengshen/${panel.id}/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, image_mime: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || '生成失败');
        return;
      }
      refetch();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate on panel select if capture is active and no insight exists for today
  useEffect(() => {
    if (!capture.active) return;
    if (autoTriedFor === panel.id) return;
    if (insights === null) return; // wait for fetch
    if (hasTodayInsight) {
      setAutoTriedFor(panel.id);
      return;
    }
    setAutoTriedFor(panel.id);
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, capture.active, insights, hasTodayInsight]);

  const deleteInsight = async (id: number) => {
    await apiDelete(`/api/fengshen/insights/${id}`);
    refetch();
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50/40 rounded-xl border border-indigo-100">
      <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-100/70">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Sparkles size={16} className="text-indigo-500" />
          AI Insight
          {latest && (
            <span className="text-xs text-slate-400 font-normal ml-2">
              {hasTodayInsight ? '今日已生成' : `上次 ${formatTime(latest.created_at)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!capture.active && (
            <span className="text-xs text-slate-400">先点右上角"开启自动洞察"</span>
          )}
          <button
            onClick={generate}
            disabled={generating || !capture.active}
            className="text-xs px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-md hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
            {generating ? '分析中...' : hasTodayInsight ? '重新生成' : '生成今日洞察'}
          </button>
        </div>
      </div>

      <div className="p-4">
        {errorMsg && (
          <div className="mb-3 px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-600 rounded">
            {errorMsg}
          </div>
        )}

        {!latestResult ? (
          <p className="text-sm text-slate-400 py-2">
            {capture.active
              ? '尚无洞察。点右上角"生成今日洞察"开始。'
              : '开启屏幕共享后，进入看板会自动截图分析。'}
          </p>
        ) : (
          <div className="space-y-3">
            {latestResult.summary && (
              <p className="text-sm text-slate-700 leading-relaxed">{latestResult.summary}</p>
            )}

            {latestResult.anomalies?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                  <AlertTriangle size={12} /> 异常数据提醒
                </h4>
                <ul className="space-y-1.5">
                  {latestResult.anomalies.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span
                        className={`mt-0.5 px-1.5 py-0.5 rounded font-medium ${
                          a.severity === 'high'
                            ? 'bg-red-100 text-red-600'
                            : a.severity === 'medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {a.metric}
                      </span>
                      <span className="text-slate-700 flex-1">{a.observation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {latestResult.insights?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                  <Lightbulb size={12} /> 关键数据洞察
                </h4>
                <ul className="space-y-1 list-disc list-inside text-xs text-slate-700">
                  {latestResult.insights.map((s, i) => (
                    <li key={i} className="leading-relaxed">{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {insights && insights.length > 1 && (
          <div className="mt-4 pt-3 border-t border-indigo-100/70">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />} 历史 ({insights.length - 1})
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-1">
                {insights.slice(1).map(it => {
                  let r: PanelInsightResult | null = null;
                  try { r = JSON.parse(it.result); } catch {}
                  return (
                    <li key={it.id} className="group flex items-start gap-2 text-xs py-1">
                      <span className="text-slate-400 w-28 flex-shrink-0">{formatTime(it.created_at)}</span>
                      <span className="flex-1 text-slate-600 truncate">{r?.summary || ''}</span>
                      <button
                        onClick={() => deleteInsight(it.id)}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={11} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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
