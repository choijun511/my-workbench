import { useState, useMemo } from 'react';
import { useApi, apiPost, apiPut, apiDelete } from '../hooks/useApi';
import type { Objective, KeyResult, OKRProject } from '../types';
import { Plus, ChevronDown, ChevronRight, Trash2, Edit3, Check, X, Folder } from 'lucide-react';

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

const OBJECTIVE_LIMIT = 30;

const projectColorPalette = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#ef4444', // red
  '#f97316', // orange
  '#06b6d4', // cyan
];

const statusLabels: Record<string, { label: string; color: string }> = {
  not_started: { label: '未开始', color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-600' },
  at_risk: { label: '有风险', color: 'bg-amber-100 text-amber-600' },
  completed: { label: '已完成', color: 'bg-emerald-100 text-emerald-600' },
};

export default function OKRPage() {
  const [quarter, setQuarter] = useState(getCurrentQuarter());
  const { data: projects, refetch: refetchProjects } = useApi<OKRProject[]>(
    `/api/okr/projects?quarter=${quarter}`
  );
  const { data: objectives, refetch } = useApi<Objective[]>(
    `/api/okr/objectives?quarter=${quarter}`
  );

  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [addingProject, setAddingProject] = useState(false);

  const projectMap = useMemo(() => {
    const m = new Map<number, OKRProject>();
    projects?.forEach(p => m.set(p.id, p));
    return m;
  }, [projects]);

  const effectiveProjectId = newProjectId ?? projects?.[0]?.id ?? null;

  const objectivesCount = objectives?.length ?? 0;
  const reachedLimit = objectivesCount >= OBJECTIVE_LIMIT;

  const addObjective = async () => {
    if (!newTitle.trim() || !effectiveProjectId || reachedLimit) return;
    const res = await fetch('/api/okr/objectives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quarter, title: newTitle, project_id: effectiveProjectId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '添加失败');
      return;
    }
    setNewTitle('');
    refetch();
  };

  const addProject = async () => {
    if (!newProjectName.trim()) return;
    const used = new Set((projects || []).map(p => p.color));
    const nextColor = projectColorPalette.find(c => !used.has(c))
      ?? projectColorPalette[(projects?.length ?? 0) % projectColorPalette.length];
    const proj = await apiPost<OKRProject>('/api/okr/projects', {
      quarter,
      name: newProjectName,
      color: nextColor,
    });
    setNewProjectName('');
    setAddingProject(false);
    await refetchProjects();
    if (proj?.id) setNewProjectId(proj.id);
  };

  const deleteProject = async (id: number) => {
    if (!confirm('删除项目？该项目下的目标会被移到该季度的第一个项目。')) return;
    const res = await fetch(`/api/okr/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '删除失败');
      return;
    }
    if (newProjectId === id) setNewProjectId(null);
    refetchProjects();
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
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1 w-fit">
        {quarters.map(q => (
          <button
            key={q}
            onClick={() => { setQuarter(q); setNewProjectId(null); }}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
              quarter === q ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {q.split('-')[1]}
          </button>
        ))}
      </div>

      {/* Project management bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1 mr-1"><Folder size={13} /> 项目：</span>
        {projects?.map(p => (
          <div
            key={p.id}
            className="group flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full bg-white border border-slate-200"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-600">{p.name}</span>
            <button
              onClick={() => deleteProject(p.id)}
              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              title="删除项目"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {addingProject ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addProject();
                if (e.key === 'Escape') { setAddingProject(false); setNewProjectName(''); }
              }}
              placeholder="项目名称"
              className="px-2.5 py-0.5 text-xs border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white w-28"
            />
            <button onClick={addProject} className="text-emerald-500 hover:text-emerald-700"><Check size={14} /></button>
            <button onClick={() => { setAddingProject(false); setNewProjectName(''); }} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
        ) : (
          <button
            onClick={() => setAddingProject(true)}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-slate-300 hover:border-indigo-400 hover:text-indigo-600"
          >
            <Plus size={12} /> 新建项目
          </button>
        )}
      </div>

      {/* Add Objective with project picker */}
      <div className="flex flex-wrap gap-2 mb-2 items-center bg-white border border-slate-200 rounded-lg p-2">
        <select
          value={effectiveProjectId ?? ''}
          onChange={e => setNewProjectId(Number(e.target.value))}
          disabled={!projects?.length}
          className="px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-50"
        >
          {!projects?.length && <option value="">请先创建项目</option>}
          {projects?.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addObjective()}
          placeholder={reachedLimit ? `已达上限 ${OBJECTIVE_LIMIT}` : '添加新的 Objective...'}
          disabled={!effectiveProjectId || reachedLimit}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          onClick={addObjective}
          disabled={!effectiveProjectId || reachedLimit}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          <Plus size={16} /> 添加
        </button>
      </div>
      <div className="text-xs text-slate-400 mb-6 text-right">
        {objectivesCount} / {OBJECTIVE_LIMIT}
      </div>

      {/* Objectives List */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
        {!objectives?.length ? (
          <div className="text-center py-12 text-slate-400 col-span-full">
            <p className="text-sm">当前季度暂无 OKR 目标</p>
          </div>
        ) : (
          objectives.map(obj => (
            <ObjectiveCard
              key={obj.id}
              objective={obj}
              project={obj.project_id ? projectMap.get(obj.project_id) : undefined}
              projects={projects || []}
              onUpdate={refetch}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ObjectiveCard({
  objective,
  project,
  projects,
  onUpdate,
}: {
  objective: Objective;
  project?: OKRProject;
  projects: OKRProject[];
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [newKR, setNewKR] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingProject, setEditingProject] = useState(false);

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

  const updateProject = async (project_id: number) => {
    await apiPut(`/api/okr/objectives/${objective.id}`, { project_id });
    setEditingProject(false);
    onUpdate();
  };

  const statusInfo = statusLabels[objective.status] || statusLabels.not_started;
  const accent = project?.color || '#94a3b8';

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: accent + '4D',
        backgroundColor: accent + '0A',
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <button onClick={() => setExpanded(!expanded)} className="mt-1 text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* Project tag */}
              <div className="relative">
                <button
                  onClick={() => setEditingProject(!editingProject)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border"
                  style={{
                    color: project?.color || '#64748b',
                    borderColor: (project?.color || '#cbd5e1') + '55',
                    backgroundColor: (project?.color || '#cbd5e1') + '15',
                  }}
                  title="切换项目"
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: project?.color || '#94a3b8' }} />
                  {project?.name || '未分组'}
                </button>
                {editingProject && (
                  <div className="absolute top-7 left-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 min-w-[8rem]">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => updateProject(p.id)}
                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <h3 className="text-base font-semibold text-slate-800 truncate flex-1 min-w-0">{objective.title}</h3>
              <div className="relative">
                <button
                  onClick={() => setEditingStatus(!editingStatus)}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}
                >
                  {statusInfo.label}
                </button>
                {editingStatus && (
                  <div className="absolute top-7 right-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10">
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
        <div className="border-t border-slate-100 px-5 py-4 bg-white/60">
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
