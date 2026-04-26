import { useState } from 'react';
import { useApi, apiPost, apiPut, apiDelete } from '../hooks/useApi';
import type { Todo } from '../types';
import { Plus, Trash2, Check, Circle, Clock, Filter, Inbox, ArrowRight, Lightbulb } from 'lucide-react';

const priorityConfig = {
  P0: { label: 'P0 紧急', color: 'bg-red-100 text-red-600 border-red-200' },
  P1: { label: 'P1 高', color: 'bg-orange-100 text-orange-600 border-orange-200' },
  P2: { label: 'P2 中', color: 'bg-blue-100 text-blue-600 border-blue-200' },
  P3: { label: 'P3 低', color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const urgencyConfig = {
  urgent: { label: '紧急', color: 'text-red-500' },
  normal: { label: '普通', color: 'text-slate-500' },
  low: { label: '不急', color: 'text-slate-400' },
};

const statusConfig = {
  draft: { label: '草稿', icon: Lightbulb },
  todo: { label: '待办', icon: Circle },
  in_progress: { label: '进行中', icon: Clock },
  done: { label: '已完成', icon: Check },
};

type FilterType = 'all' | 'todo' | 'in_progress' | 'done' | 'draft';

export default function TodoPage() {
  const { data: todos, refetch } = useApi<Todo[]>('/api/todos');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'P0' | 'P1' | 'P2' | 'P3'>('P2');
  const [newUrgency, setNewUrgency] = useState<'urgent' | 'normal' | 'low'>('normal');

  const filteredTodos = todos?.filter(t => {
    if (filter === 'draft') return t.status === 'draft';
    if (filter === 'all') return t.status !== 'draft';
    return t.status === filter;
  }) || [];

  const addTodo = async (asDraft = false) => {
    if (!newTitle.trim()) return;
    await apiPost('/api/todos', {
      title: newTitle,
      priority: newPriority,
      urgency: newUrgency,
      status: asDraft ? 'draft' : 'todo',
    });
    setNewTitle('');
    setNewPriority('P2');
    setNewUrgency('normal');
    setShowAdd(false);
    refetch();
  };

  const updateStatus = async (id: number, status: string) => {
    await apiPut(`/api/todos/${id}`, { status });
    refetch();
  };

  const deleteTodo = async (id: number) => {
    await apiDelete(`/api/todos/${id}`);
    refetch();
  };

  const counts = {
    all: todos?.filter(t => t.status !== 'draft').length || 0,
    todo: todos?.filter(t => t.status === 'todo').length || 0,
    in_progress: todos?.filter(t => t.status === 'in_progress').length || 0,
    done: todos?.filter(t => t.status === 'done').length || 0,
    draft: todos?.filter(t => t.status === 'draft').length || 0,
  };

  return (
    <div className="max-w-screen-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">待办事项</h1>
          <p className="text-sm text-slate-500 mt-1">管理你的任务，按优先级和紧急程度排列</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5"
        >
          <Plus size={16} /> 新建待办
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTodo(filter === 'draft')}
            placeholder={filter === 'draft' ? '记录一个想法（草稿）...' : '输入待办事项...'}
            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
            autoFocus
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">优先级:</span>
              {(['P0', 'P1', 'P2', 'P3'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setNewPriority(p)}
                  className={`text-xs px-2 py-1 rounded border ${
                    newPriority === p ? priorityConfig[p].color : 'border-slate-200 text-slate-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">紧急:</span>
              {(['urgent', 'normal', 'low'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setNewUrgency(u)}
                  className={`text-xs px-2 py-1 rounded border ${
                    newUrgency === u ? 'border-indigo-300 text-indigo-600 bg-indigo-50' : 'border-slate-200 text-slate-400'
                  }`}
                >
                  {urgencyConfig[u].label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => addTodo(true)}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm hover:border-indigo-300 hover:text-indigo-600 flex items-center gap-1"
                title="存到草稿箱"
              >
                <Lightbulb size={14} /> 存为草稿
              </button>
              <button
                onClick={() => addTodo(false)}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {([['all', '全部'], ['todo', '待办'], ['in_progress', '进行中'], ['done', '已完成']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                filter === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        <button
          onClick={() => setFilter('draft')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border ${
            filter === 'draft'
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
          title="草稿箱：存放还没决定要做的想法"
        >
          <Inbox size={14} /> 草稿箱 ({counts.draft})
        </button>
      </div>

      {/* Todo List */}
      <div className="space-y-2">
        {!filteredTodos.length ? (
          <div className="text-center py-12 text-slate-400">
            {filter === 'draft' ? <Inbox size={32} className="mx-auto mb-2 opacity-50" /> : <Filter size={32} className="mx-auto mb-2 opacity-50" />}
            <p className="text-sm">{filter === 'draft' ? '草稿箱是空的，先记录一些想法吧' : '暂无待办事项'}</p>
          </div>
        ) : (
          filteredTodos.map(todo => (
            todo.status === 'draft' ? (
              <DraftRow
                key={todo.id}
                todo={todo}
                onPromote={(id) => updateStatus(id, 'todo')}
                onDelete={deleteTodo}
              />
            ) : (
              <TodoRow
                key={todo.id}
                todo={todo}
                onStatusChange={updateStatus}
                onDelete={deleteTodo}
              />
            )
          ))
        )}
      </div>
    </div>
  );
}

function DraftRow({
  todo,
  onPromote,
  onDelete,
}: {
  todo: Todo;
  onPromote: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex items-start gap-3 bg-amber-50/40 rounded-xl border border-amber-100 px-5 py-4 group hover:border-amber-200 transition-colors">
      <Lightbulb size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 break-words">{todo.title}</p>
        {todo.description && (
          <p className="text-xs text-slate-500 mt-1 break-words">{todo.description}</p>
        )}
      </div>
      <button
        onClick={() => onPromote(todo.id)}
        className="text-xs px-2.5 py-1 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 flex items-center gap-1 flex-shrink-0"
        title="移到待办"
      >
        <ArrowRight size={12} /> 转待办
      </button>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function TodoRow({
  todo,
  onStatusChange,
  onDelete,
}: {
  todo: Todo;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
}) {
  const StatusIcon = statusConfig[todo.status].icon;
  const nextStatus = todo.status === 'todo' ? 'in_progress' : todo.status === 'in_progress' ? 'done' : 'todo';

  return (
    <div className={`flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-5 py-4 group hover:border-slate-300 transition-colors ${
      todo.status === 'done' ? 'opacity-60' : ''
    }`}>
      <button
        onClick={() => onStatusChange(todo.id, nextStatus)}
        className={`flex-shrink-0 ${
          todo.status === 'done' ? 'text-emerald-500' : todo.status === 'in_progress' ? 'text-blue-500' : 'text-slate-300 hover:text-indigo-500'
        }`}
      >
        <StatusIcon size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${todo.status === 'done' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
          {todo.title}
        </span>
        {todo.due_date && (
          <span className="text-xs text-slate-400 ml-2">{todo.due_date}</span>
        )}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityConfig[todo.priority].color}`}>
        {todo.priority}
      </span>
      <span className={`text-xs ${urgencyConfig[todo.urgency].color}`}>
        {urgencyConfig[todo.urgency].label}
      </span>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
