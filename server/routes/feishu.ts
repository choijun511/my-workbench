import { Router } from 'express';
import { runFeishuSync, getLastSync } from '../sync.js';
import { envReady } from '../env.js';

const router = Router();

router.get('/status', (_req, res) => {
  const ready = envReady();
  const last = getLastSync();
  res.json({
    configured: ready.ok,
    missing: ready.missing,
    last_sync_at: last.at,
    last_sync_result: last.value ? JSON.parse(last.value) : null,
  });
});

router.post('/sync', async (req, res) => {
  const windowHours = Number(req.body?.window_hours) || 24;
  const result = await runFeishuSync(windowHours);
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
});

export default router;
