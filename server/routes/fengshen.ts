import { Router } from 'express';
import db from '../db.js';
import { analyzePanelData } from '../gemini.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM fengshen_panels ORDER BY sort_order, id').all());
});

// Bulk reorder
router.post('/reorder', (req, res) => {
  const ids = (req.body?.ids || []) as number[];
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
  const stmt = db.prepare('UPDATE fengshen_panels SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((items: number[]) => {
    items.forEach((id, idx) => stmt.run(idx, id));
  });
  tx(ids);
  res.json({ success: true });
});

router.post('/', (req, res) => {
  const { name, url, description, sort_order } = req.body;
  const result = db.prepare(`
    INSERT INTO fengshen_panels (name, url, description, sort_order) VALUES (?, ?, ?, ?)
  `).run(name, url, description || '', sort_order || 0);
  res.json(db.prepare('SELECT * FROM fengshen_panels WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, url, description, sort_order } = req.body;
  db.prepare(`
    UPDATE fengshen_panels SET name = COALESCE(?, name), url = COALESCE(?, url),
    description = COALESCE(?, description), sort_order = COALESCE(?, sort_order) WHERE id = ?
  `).run(name, url, description, sort_order, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM fengshen_panels WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// List insights for a panel
router.get('/:id/insights', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM panel_insights WHERE panel_id = ? ORDER BY created_at DESC, id DESC`
  ).all(req.params.id);
  res.json(rows);
});

// Generate a new insight via Gemini
router.post('/:id/insights', async (req, res) => {
  const panelId = Number(req.params.id);
  const panel = db.prepare(`SELECT * FROM fengshen_panels WHERE id = ?`).get(panelId) as
    | { name: string; description: string }
    | undefined;
  if (!panel) return res.status(404).json({ error: 'panel not found' });

  const { text, image_base64, image_mime } = req.body || {};
  if (!text && !image_base64) {
    return res.status(400).json({ error: '需要提供文本或图片' });
  }
  try {
    const result = await analyzePanelData({
      panelName: panel.name,
      panelDescription: panel.description || '',
      text: text || '',
      imageBase64: image_base64 || '',
      imageMime: image_mime || 'image/png',
    });
    const source = image_base64 ? 'image' : 'text';
    const info = db.prepare(
      `INSERT INTO panel_insights (panel_id, source, content, result) VALUES (?, ?, ?, ?)`
    ).run(panelId, source, text || '', JSON.stringify(result));
    const row = db.prepare(`SELECT * FROM panel_insights WHERE id = ?`).get(info.lastInsertRowid);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/insights/:insightId', (req, res) => {
  db.prepare(`DELETE FROM panel_insights WHERE id = ?`).run(req.params.insightId);
  res.json({ success: true });
});

export default router;
