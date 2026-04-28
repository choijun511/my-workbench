import { useApi } from '../hooks/useApi';
import type { Objective, Todo, Decision, DecisionStats } from '../types';
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
  const { data: decisionStats } = useApi<DecisionStats>('/api/decisions/stats');
  const { data: dueDecisions } = useApi<Decision[]>('/api/decisions/review/due');

  const avgProgress = objectives?.length
    ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / objectives.length)
    : 0;
  const urgentTodos = todos?.filter(t => t.priority === 'P0' || t.priority === 'P1') || [];
  const dueCount = decisionStats?.due_for_review ?? 0;
  const totalScore = decisionStats?.judgment.total_score ?? 0;

  return (
    <div className="max-w-screen-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-display text-bone tracking-tight">工作台</h1>
        <p className="text-sm text-haze mt-1.5 font-mono uppercase tracking-[0.15em]">{quarter} · welcome back</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 2xl:gap-5 mb-10">
        <StatCard icon={Target} label="OKR 目标" value={String(objectives?.length || 0)} accent="electric" />
        <StatCard icon={TrendingUp} label="整体进度" value={`${avgProgress}%`} accent="grass" />
        <StatCard icon={CheckSquare} label="待办事项" value={String(todos?.length || 0)} accent="electric" />
        <StatCard icon={AlertCircle} label="紧急任务" value={String(urgentTodos.length)} accent={urgentTodos.length > 0 ? 'blood' : 'haze'} />
        <StatCard icon={BookOpen} label="待复盘" value={String(dueCount)} accent={dueCount > 0 ? 'gold' : 'haze'}
          subtitle={totalScore !== 0 ? `判断力 ${totalScore > 0 ? '+' : ''}${totalScore}` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
        {/* OKR Summary */}
        <Card title="OKR 进度概览" linkTo="/okr">
          {!objectives?.length ? (
            <p className="text-sm text-haze py-4">暂无 OKR 目标，去创建一个吧</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {objectives.slice(0, 30).map(obj => (
                <div key={obj.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-cream truncate flex-1">{obj.title}</span>
                    <span className="text-[11px] font-mono text-haze ml-2">{obj.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-velvet rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        obj.progress >= 70 ? 'bg-grass' : obj.progress >= 40 ? 'bg-gold' : 'bg-electric'
                      }`}
                      style={{ width: `${Math.min(obj.progress, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Urgent Todos */}
        <Card title="高优待办" linkTo="/todo">
          {!urgentTodos.length ? (
            <p className="text-sm text-haze py-4">没有紧急任务</p>
          ) : (
            <div className="space-y-1">
              {urgentTodos.slice(0, 5).map(todo => (
                <div key={todo.id} className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-sunken/60">
                  <span className={`text-[11px] font-bold font-mono px-1.5 py-0.5 rounded ${
                    todo.priority === 'P0' ? 'bg-blood/20 text-blood' : 'bg-orange-500/15 text-orange-300'
                  }`}>
                    {todo.priority}
                  </span>
                  <span className="text-sm text-cream truncate">{todo.title}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Decisions due for review */}
        <Card title="待复盘决策" linkTo="/decisions" titleIcon={<BookOpen size={15} />}>
          {!dueDecisions?.length ? (
            <p className="text-sm text-haze py-4">暂无到期决策，节奏良好 🎯</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {dueDecisions.slice(0, 8).map(d => {
                const overdue = d.next_review_at
                  ? Math.max(0, Math.round((Date.now() - new Date(d.next_review_at).getTime()) / 86400000))
                  : 0;
                return (
                  <Link
                    key={d.id}
                    to="/decisions"
                    className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-sunken/60 group"
                  >
                    <span className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-gold/20 text-gold flex-shrink-0">
                      {overdue === 0 ? '今' : `+${overdue}d`}
                    </span>
                    <span className="text-sm text-cream truncate flex-1 group-hover:text-bone">{d.title}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, titleIcon, linkTo, children }: { title: string; titleIcon?: React.ReactNode; linkTo?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-velvet p-5 grain card-lift">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-bone flex items-center gap-2 uppercase tracking-wider">
          {titleIcon} {title}
        </h2>
        {linkTo && <Link to={linkTo} className="text-[11px] text-electric hover:underline">查看全部 →</Link>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, subtitle }: { icon: any; label: string; value: string; accent: string; subtitle?: string }) {
  const accentMap: Record<string, string> = {
    gold: 'bg-gold/15 text-gold',
    electric: 'bg-electric/15 text-electric',
    grass: 'bg-grass/15 text-grass',
    blood: 'bg-blood/20 text-blood',
    haze: 'bg-velvet text-haze',
  };
  return (
    <div className="bg-card rounded-xl border border-velvet p-4 grain card-lift">
      <div className={`w-8 h-8 rounded-md flex items-center justify-center mb-3 ${accentMap[accent]}`}>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold text-bone font-mono">{value}</p>
      <p className="text-[11px] text-haze mt-1 uppercase tracking-wider">{label}</p>
      {subtitle && <p className="text-[10px] text-fog mt-0.5 font-mono">{subtitle}</p>}
    </div>
  );
}
