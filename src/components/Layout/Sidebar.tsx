import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Target, CheckSquare, BarChart3, BookOpen } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '工作台' },
  { to: '/okr', icon: Target, label: 'OKR' },
  { to: '/todo', icon: CheckSquare, label: '待办事项' },
  { to: '/decisions', icon: BookOpen, label: '决策' },
  { to: '/fengshen', icon: BarChart3, label: '风神看板' },
];

export default function Sidebar() {
  return (
    <aside className="w-60 h-screen bg-white border-r border-slate-200 flex flex-col fixed left-0 top-0">
      <div className="px-6 py-5 border-b border-slate-100">
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">My Workbench</h1>
        <p className="text-xs text-slate-400 mt-0.5">Personal Dashboard</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-slate-100 text-xs text-slate-400">
        2026 Q2
      </div>
    </aside>
  );
}
