import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/Layout/AppLayout';
import Dashboard from './pages/Dashboard';
import OKRPage from './pages/OKRPage';
import TodoPage from './pages/TodoPage';
import FengshenPage from './pages/FengshenPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/okr" element={<OKRPage />} />
          <Route path="/todo" element={<TodoPage />} />
          <Route path="/fengshen" element={<FengshenPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
