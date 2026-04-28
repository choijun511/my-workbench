import { useApi } from '../hooks/useApi';
import type { Objective, Todo, Decision } from '../types';
import { Target, CheckSquare, TrendingUp, AlertCircle, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

function getCurrentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

export default function Dashboard() {
  const quarter = getCurrentQuarter();
  const { data: objectives } = useApi<Objective[]>(`/api/okr/objectives?quarter=${quarter}`);
  const { data: todos } = useApi<Todo[]>('/api/todos?status=todo');
  const { data: decisionStats } = useApi<{ counts: Record<string, number>; due_for_review: number }>(
    '/api/decisions/stats'
  );
  const { data: dueDecisions } = useApi<Decision[]>('/api/decisions/review/due');

  const avgProgress = objectives?.length
    ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / objectives.length)
    : 0;
  const urgentTodos = todos?.filter(t => t.priority === 'P0' || t.priority === 'P1') || [];
  const dueCount = decisionStats?.due_for_review ?? 0;

  return (
    <div className="max-w-screen-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">工作台</h1>
        <p className="text-sm text-slate-500 mt-1">{quarter} - 欢迎回来</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 2xl:gap-6 mb-8">
        <StatCard icon={Target} label="OKR 目标" value={String(objectives?.length || 0)} color="indigo" />
        <StatCard icon={TrendingUp} label="整体进度" value={`${avgProgress}%`} color="emerald" />
        <StatCard icon={CheckSquare} label="待办事项" value={String(todos?.length || 0)} color="blue" />
        <StatCard icon={AlertCircle} label="紧急任务" value={String(urgentTodos.length)} color="red" />
        <StatCard icon={BookOpen} label="待复盘决策" value={String(dueCount)} color={dueCount > 0 ? 'amber' : 'slate'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
        {/* OKR Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">OKR 进度概览</h2>
            <Link to="/okr" className="text-xs text-indigo-600 hover:underline">查看全部</Link>
          </div>
          {!objectives?.length ? (
            <p className="text-sm text-slate-400 py-4">暂无 OKR 目标，去创建一个吧</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {objectives.slice(0, 30).map(obj => (
                <div key={obj.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-700 truncate flex-1">{obj.title}</span>
                    <span className="text-xs text-slate-500 ml-2">{obj.progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${Math.min(obj.progress, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Urgent Todos */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">高优待办</h2>
            <Link to="/todo" className="text-xs text-indigo-600 hover:underline">查看全部</Link>
          </div>
          {!urgentTodos.length ? (
            <p className="text-sm text-slate-400 py-4">没有紧急任务</p>
          ) : (
            <div className="space-y-2">
              {urgentTodos.slice(0, 5).map(todo => (
                <div key={todo.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    todo.priority === 'P0' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                  }`}>
                    {todo.priority}
                  </span>
                  <span className="text-sm text-slate-700 truncate">{todo.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Decisions due for review */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <BookOpen size={16} /> 待复盘决策
            </h2>
            <Link to="/decisions" className="text-xs text-indigo-600 hover:underline">查看全部</Link>
          </div>
          {!dueDecisions?.length ? (
            <p className="text-sm text-slate-400 py-4">暂无到期决策，节奏良好 🎯</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {dueDecisions.slice(0, 8).map(d => {
                const overdue = d.next_review_at
                  ? Math.max(0, Math.round((Date.now() - new Date(d.next_review_at).getTime()) / 86400000))
                  : 0;
                return (
                  <Link
                    key={d.id}
                    to="/decisions"
                    className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 group"
                  >
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">
                      {overdue === 0 ? '今' : `+${overdue}d`}
                    </span>
                    <span className="text-sm text-slate-700 truncate flex-1 group-hover:text-indigo-600">{d.title}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-50 text-slate-500',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
