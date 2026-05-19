import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Target, CheckSquare, BarChart3, BookOpen, Bot } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import type { Todo, DecisionStats, AgentStats } from '../../types';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '工作台', shortcut: 'h' },
  { to: '/okr', icon: Target, label: 'OKR', shortcut: 'o' },
  { to: '/todo', icon: CheckSquare, label: '待办事项', shortcut: 't', badgeKey: 'todos-urgent' },
  { to: '/decisions', icon: BookOpen, label: '决策', shortcut: 'd', badgeKey: 'decisions-due' },
  { to: '/agents', icon: Bot, label: 'Agent', shortcut: 'a', badgeKey: 'agents-running' },
  { to: '/fengshen', icon: BarChart3, label: '风神看板', shortcut: 'f' },
];

export default function Sidebar() {
  const { data: todos } = useApi<Todo[]>('/api/todos?status=todo');
  const { data: decisionStats } = useApi<DecisionStats>('/api/decisions/stats');
  const { data: agentStats } = useApi<AgentStats>('/api/agents/stats');

  const urgentTodos = todos?.filter(t => t.priority === 'P0' || t.priority === 'P1').length || 0;
  const dueDecisions = decisionStats?.due_for_review ?? 0;
  const runningAgents = agentStats?.running ?? 0;

  const badges: Record<string, { count: number; tone: 'blood' | 'electric' | 'gold' }> = {
    'todos-urgent': { count: urgentTodos, tone: 'blood' },
    'decisions-due': { count: dueDecisions, tone: 'blood' },
    'agents-running': { count: runningAgents, tone: 'electric' },
  };

  return (
    <aside className="w-60 h-screen bg-stage-deep border-r border-velvet flex flex-col fixed left-0 top-0">
      <div className="px-6 py-6 border-b border-velvet">
        <h1 className="text-xl font-bold text-bone tracking-tight">My Workbench</h1>
        <p className="text-[11px] text-haze mt-1 uppercase tracking-[0.18em]">Personal Dashboard</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, badgeKey }) => {
          const badge = badgeKey ? badges[badgeKey] : null;
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gold/10 text-gold border-l-2 border-gold pl-[10px]'
                    : 'text-haze hover:bg-card hover:text-cream'
                }`
              }
            >
              <Icon size={17} />
              <span className="flex-1">{label}</span>
              {badge && badge.count > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  badge.tone === 'blood' ? 'bg-blood/15 text-blood' :
                  badge.tone === 'electric' ? 'bg-electric/15 text-electric' :
                  'bg-gold/15 text-gold'
                }`}>
                  {badge.count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="px-6 py-4 border-t border-velvet text-[10px] text-fog font-mono uppercase tracking-[0.15em]">
        2026 · Q2
      </div>
    </aside>
  );
}
