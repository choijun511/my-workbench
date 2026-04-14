import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM fengshen_panels ORDER BY sort_order').all());
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

export default router;
