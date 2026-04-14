import { useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import type { FengshenPanel } from '../types';
import { Plus, Trash2, ExternalLink, Monitor } from 'lucide-react';

export default function FengshenPage() {
  const { data: panels, refetch } = useApi<FengshenPanel[]>('/api/fengshen');
  const [showAdd, setShowAdd] = useState(false);
  const [activePanel, setActivePanel] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');

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

  const selected = panels?.find(p => p.id === activePanel);

  return (
    <div className="max-w-6xl">
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

      {/* Add Form */}
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
        {/* Panel List */}
        <div className="w-64 flex-shrink-0 space-y-2">
          {!panels?.length ? (
            <div className="text-center py-8 text-slate-400">
              <Monitor size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无看板</p>
              <p className="text-xs mt-1">点击上方按钮添加风神看板</p>
            </div>
          ) : (
            panels.map(panel => (
              <div
                key={panel.id}
                className={`p-4 rounded-xl border cursor-pointer transition-all group ${
                  activePanel === panel.id
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                onClick={() => setActivePanel(panel.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
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
                      onClick={e => { e.stopPropagation(); deletePanel(panel.id); }}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Iframe View */}
        <div className="flex-1 min-h-[600px]">
          {selected ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full">
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
                style={{ height: 'calc(100% - 48px)' }}
                title={selected.name}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 bg-white rounded-xl border border-slate-200">
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
