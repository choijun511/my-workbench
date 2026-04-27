import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { useExtensionCapture } from '../hooks/useExtensionCapture';
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
  Clipboard,
  Upload,
  Zap,
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
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <Plus size={16} /> 添加看板
        </button>
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

        <div className="flex-1 min-w-0">
          {selected ? (
            <div className="space-y-4">
              <PanelInsightCard panel={selected} />
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

function PanelInsightCard({ panel }: { panel: FengshenPanel }) {
  const { data: insights, refetch } = useApi<PanelInsight[]>(`/api/fengshen/${panel.id}/insights`);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [textBuffer, setTextBuffer] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [autoTriedFor, setAutoTriedFor] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ext = useExtensionCapture();

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

  const fileToBase64 = (file: File): Promise<{ b64: string; mime: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        const comma = url.indexOf(',');
        resolve({ b64: comma >= 0 ? url.slice(comma + 1) : '', mime: file.type || 'image/png' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const sendInsight = async (payload: { image_base64?: string; image_mime?: string; text?: string }) => {
    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/fengshen/${panel.id}/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || '生成失败');
        return false;
      }
      refetch();
      return true;
    } catch (e) {
      setErrorMsg((e as Error).message);
      return false;
    } finally {
      setGenerating(false);
    }
  };

  const handleImageFile = async (file: File) => {
    const { b64, mime } = await fileToBase64(file);
    if (b64) await sendInsight({ image_base64: b64, image_mime: mime });
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items || [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const f = item.getAsFile();
        if (f) await handleImageFile(f);
        return;
      }
    }
    // No image — fall back to text
    const text = e.clipboardData?.getData('text/plain') || '';
    if (text.trim()) {
      e.preventDefault();
      await sendInsight({ text: text.trim() });
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await handleImageFile(file);
    }
  };

  const submitText = async () => {
    if (!textBuffer.trim()) return;
    const ok = await sendInsight({ text: textBuffer.trim() });
    if (ok) {
      setTextBuffer('');
      setShowTextInput(false);
    }
  };

  const deleteInsight = async (id: number) => {
    await apiDelete(`/api/fengshen/insights/${id}`);
    refetch();
  };

  const captureViaExtension = async () => {
    if (!ext.available) return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      // Wait for the iframe to render before capturing.
      await new Promise(r => setTimeout(r, 1500));
      const r = await ext.capture();
      if (!r) {
        setErrorMsg(ext.lastError || '截图失败');
        return;
      }
      await sendInsight({ image_base64: r.image_base64, image_mime: r.image_mime });
    } finally {
      setGenerating(false);
    }
  };

  // Reset text-input expander when panel changes
  useEffect(() => {
    setShowTextInput(false);
    setTextBuffer('');
    setErrorMsg(null);
  }, [panel.id]);

  // Auto-capture once per panel per session, when extension is available and
  // there's no insight for today yet.
  useEffect(() => {
    if (!ext.available) return;
    if (insights === null) return; // wait for fetch
    if (autoTriedFor === panel.id) return;
    if (hasTodayInsight) {
      setAutoTriedFor(panel.id);
      return;
    }
    setAutoTriedFor(panel.id);
    captureViaExtension();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext.available, insights, panel.id, hasTodayInsight]);

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50/40 rounded-xl border border-indigo-100">
      <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-100/70 gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Sparkles size={16} className="text-indigo-500" />
          AI Insight
          {latest && (
            <span className="text-xs text-slate-400 font-normal ml-2">
              {hasTodayInsight ? '今日已生成' : `上次 ${formatTime(latest.created_at)}`}
            </span>
          )}
          {ext.available && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-1">
              <Zap size={10} /> 扩展已连接
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {generating && (
            <span className="text-xs text-indigo-600 flex items-center gap-1">
              <RefreshCw size={12} className="animate-spin" /> 分析中...
            </span>
          )}
          {ext.available && !generating && (
            <button
              onClick={captureViaExtension}
              className="text-xs px-2.5 py-1 rounded-md border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50 flex items-center gap-1"
              title="重新截图分析当前看板"
            >
              <RefreshCw size={11} /> 重新截图
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Paste / drop zone — always visible at top */}
        <div
          tabIndex={0}
          onPaste={onPaste}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer text-center transition-colors ${
            isDragOver
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-indigo-200/70 bg-white/60 hover:border-indigo-300 hover:bg-white focus:border-indigo-400 focus:bg-indigo-50/70 outline-none'
          }`}
        >
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <Clipboard size={14} className="text-indigo-400" />
            <span>
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] mr-1">⌘V</kbd>
              粘贴截图
              <span className="mx-1 text-slate-300">·</span>
              拖拽图片
              <span className="mx-1 text-slate-300">·</span>
              <span className="text-indigo-500">点击上传</span>
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async e => {
              const f = e.target.files?.[0];
              if (f) await handleImageFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className="text-indigo-600 hover:underline"
          >
            {showTextInput ? '收起文字输入' : '或者粘贴文字数据'}
          </button>
        </div>

        {showTextInput && (
          <div className="space-y-2">
            <textarea
              value={textBuffer}
              onChange={e => setTextBuffer(e.target.value)}
              placeholder="例如：DAU 100万（昨日 120万），新增 5000，留存率 35%..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <button
              onClick={submitText}
              disabled={!textBuffer.trim() || generating}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Upload size={12} /> 分析这段文字
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-600 rounded">
            {errorMsg}
          </div>
        )}

        {latestResult ? (
          <div className="pt-2 space-y-3">
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
        ) : (
          <p className="text-xs text-slate-400 pt-1">
            {ext.available
              ? '已自动开始截图分析当前看板...'
              : <>截一张看板的图（{navigator.platform.includes('Mac') ? 'Cmd+Shift+4' : 'Win+Shift+S'}），回到这里按 ⌘V 粘贴即可。装上 <a className="text-indigo-500 hover:underline" href="https://github.com/choijun511/my-workbench/tree/main/extension" target="_blank" rel="noreferrer">Chrome 扩展</a> 之后能自动截图。</>}
          </p>
        )}

        {insights && insights.length > 1 && (
          <div className="pt-3 border-t border-indigo-100/70">
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
