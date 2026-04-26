import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Get all todos with optional filters
router.get('/', (req, res) => {
  const { status, priority, urgency, exclude_draft } = req.query;
  let sql = 'SELECT * FROM todos WHERE 1=1';
  const params: any[] = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  else if (exclude_draft) { sql += " AND status != 'draft'"; }
  if (priority) { sql += ' AND priority = ?'; params.push(priority); }
  if (urgency) { sql += ' AND urgency = ?'; params.push(urgency); }

  sql += " ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 END, created_at DESC";

  res.json(db.prepare(sql).all(...params));
});

// Create todo (or draft when status='draft')
router.post('/', (req, res) => {
  const { title, description, priority, urgency, due_date, status } = req.body;
  const result = db.prepare(`
    INSERT INTO todos (title, description, priority, urgency, due_date, status) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    title,
    description || '',
    priority || 'P2',
    urgency || 'normal',
    due_date || null,
    status || 'todo'
  );
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.json(todo);
});

// Update todo
router.put('/:id', (req, res) => {
  const { title, description, priority, urgency, status, due_date } = req.body;
  db.prepare(`
    UPDATE todos
    SET title = COALESCE(?, title), description = COALESCE(?, description),
        priority = COALESCE(?, priority), urgency = COALESCE(?, urgency),
        status = COALESCE(?, status), due_date = COALESCE(?, due_date),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(title, description, priority, urgency, status, due_date, req.params.id);
  res.json({ success: true });
});

// Delete todo
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
