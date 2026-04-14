import { useState } from 'react';
import { useApi, apiPost, apiPut, apiDelete } from '../hooks/useApi';
import type { Objective, KeyResult } from '../types';
import { Plus, ChevronDown, ChevronRight, Trash2, Edit3, Check, X } from 'lucide-react';

function getCurrentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

const quarters = (() => {
  const now = new Date();
  const year = now.getFullYear();
  return [`${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`];
})();

const statusLabels: Record<string, { label: string; color: string }> = {
  not_started: { label: '未开始', color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-600' },
  at_risk: { label: '有风险', color: 'bg-amber-100 text-amber-600' },
  completed: { label: '已完成', color: 'bg-emerald-100 text-emerald-600' },
};

export default function OKRPage() {
  const [quarter, setQuarter] = useState(getCurrentQuarter());
  const { data: objectives, refetch } = useApi<Objective[]>(`/api/okr/objectives?quarter=${quarter}`);
  const [newTitle, setNewTitle] = useState('');

  const addObjective = async () => {
    if (!newTitle.trim()) return;
    await apiPost('/api/okr/objectives', { quarter, title: newTitle });
    setNewTitle('');
    refetch();
  };

  return (
    <div className="max-w-screen-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">OKR 目标跟踪</h1>
          <p className="text-sm text-slate-500 mt-1">追踪你的季度关键目标和成果</p>
        </div>
      </div>

      {/* Quarter Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
        {quarters.map(q => (
          <button
            key={q}
            onClick={() => setQuarter(q)}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
              quarter === q ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {q.split('-')[1]}
          </button>
        ))}
      </div>

      {/* Add Objective */}
      <div className="flex gap-3 mb-6">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addObjective()}
          placeholder="添加新的 Objective..."
          className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
        />
        <button
          onClick={addObjective}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <Plus size={16} /> 添加
        </button>
      </div>

      {/* Objectives List */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
        {!objectives?.length ? (
          <div className="text-center py-12 text-slate-400 col-span-full">
            <p className="text-sm">当前季度暂无 OKR 目标</p>
          </div>
        ) : (
          objectives.map(obj => (
            <ObjectiveCard key={obj.id} objective={obj} onUpdate={refetch} />
          ))
        )}
      </div>
    </div>
  );
}

function ObjectiveCard({ objective, onUpdate }: { objective: Objective; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [newKR, setNewKR] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);

  const addKR = async () => {
    if (!newKR.trim()) return;
    await apiPost('/api/okr/key-results', { objective_id: objective.id, title: newKR });
    setNewKR('');
    onUpdate();
  };

  const deleteObjective = async () => {
    await apiDelete(`/api/okr/objectives/${objective.id}`);
    onUpdate();
  };

  const updateStatus = async (status: string) => {
    await apiPut(`/api/okr/objectives/${objective.id}`, { status });
    setEditingStatus(false);
    onUpdate();
  };

  const statusInfo = statusLabels[objective.status] || statusLabels.not_started;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <button onClick={() => setExpanded(!expanded)} className="mt-1 text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-base font-semibold text-slate-800 truncate">{objective.title}</h3>
              <div className="relative">
                <button
                  onClick={() => setEditingStatus(!editingStatus)}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}
                >
                  {statusInfo.label}
                </button>
                {editingStatus && (
                  <div className="absolute top-7 left-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10">
                    {Object.entries(statusLabels).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => updateStatus(key)}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        {val.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    objective.progress >= 70 ? 'bg-emerald-500' : objective.progress >= 40 ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(objective.progress, 100)}%` }}
                />
              </div>
              <span className="text-sm font-medium text-slate-600 w-10 text-right">{objective.progress}%</span>
            </div>
          </div>
          <button onClick={deleteObjective} className="text-slate-300 hover:text-red-500 mt-1">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
          <div className="space-y-2 mb-3">
            {objective.key_results.map(kr => (
              <KRRow key={kr.id} kr={kr} onUpdate={onUpdate} />
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newKR}
              onChange={e => setNewKR(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKR()}
              placeholder="添加 Key Result..."
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <button onClick={addKR} className="px-3 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg text-sm">
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KRRow({ kr, onUpdate }: { kr: KeyResult; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(kr.current_value);

  const save = async () => {
    await apiPut(`/api/okr/key-results/${kr.id}`, { current_value: value });
    setEditing(false);
    onUpdate();
  };

  const remove = async () => {
    await apiDelete(`/api/okr/key-results/${kr.id}`);
    onUpdate();
  };

  const pct = Math.round((kr.current_value / kr.target_value) * 100);

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg border border-slate-100">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-700 truncate block">{kr.title}</span>
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            onChange={e => setValue(Number(e.target.value))}
            className="w-16 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
          <span className="text-xs text-slate-400">/ {kr.target_value}{kr.unit}</span>
          <button onClick={save} className="text-emerald-500 hover:text-emerald-700"><Check size={14} /></button>
          <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{kr.current_value}/{kr.target_value}{kr.unit}</span>
          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className="text-xs font-medium text-slate-600 w-8">{pct}%</span>
          <button onClick={() => setEditing(true)} className="text-slate-300 hover:text-indigo-500"><Edit3 size={13} /></button>
          <button onClick={remove} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  );
}
