import './env.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import okrRoutes from './routes/okr.js';
import todoRoutes from './routes/todo.js';
import fengshenRoutes from './routes/fengshen.js';
import feishuRoutes from './routes/feishu.js';
import { scheduleDailySync } from './cron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/okr', okrRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/fengshen', fengshenRoutes);
app.use('/api/feishu', feishuRoutes);

// Serve static frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  scheduleDailySync();
});
