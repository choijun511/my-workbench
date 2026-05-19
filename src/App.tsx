import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/Layout/AppLayout';
import { DialogProvider } from './components/ui/Dialog';
import Dashboard from './pages/Dashboard';
import OKRPage from './pages/OKRPage';
import TodoPage from './pages/TodoPage';
import FengshenPage from './pages/FengshenPage';
import DecisionsPage from './pages/DecisionsPage';
import AgentsPage from './pages/AgentsPage';

export default function App() {
  return (
    <BrowserRouter>
      <DialogProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/okr" element={<OKRPage />} />
            <Route path="/todo" element={<TodoPage />} />
            <Route path="/fengshen" element={<FengshenPage />} />
            <Route path="/decisions" element={<DecisionsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          </Route>
        </Routes>
      </DialogProvider>
    </BrowserRouter>
  );
}
