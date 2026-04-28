import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  const navigate = useNavigate();

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const inField = target && /^(input|textarea|select)$/i.test(target.tagName);

      // Cmd/Ctrl+K — jump to Decisions and open capture
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigate('/decisions?capture=1');
        return;
      }
      // gX — quick navigate (vim-style), only when not in a field
      if (!inField && e.key === 'g') {
        const onSecond = (e2: KeyboardEvent) => {
          window.removeEventListener('keydown', onSecond, true);
          const k = e2.key.toLowerCase();
          if (k === 'h') navigate('/');
          else if (k === 'o') navigate('/okr');
          else if (k === 't') navigate('/todo');
          else if (k === 'd') navigate('/decisions');
          else if (k === 'f') navigate('/fengshen');
        };
        window.addEventListener('keydown', onSecond, true);
        // safety timeout
        setTimeout(() => window.removeEventListener('keydown', onSecond, true), 1500);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-stage-deep text-cream">
      <Sidebar />
      <main className="flex-1 ml-60 p-6 lg:p-8 2xl:p-10 bg-stage min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
