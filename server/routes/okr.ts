import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Get all objectives for a quarter
router.get('/objectives', (req, res) => {
  const quarter = (req.query.quarter as string) || getCurrentQuarter();
  const objectives = db.prepare(`
    SELECT * FROM okr_objectives WHERE quarter = ? ORDER BY created_at DESC
  `).all(quarter);

  const objectivesWithKRs = (objectives as any[]).map((obj) => {
    const keyResults = db.prepare(`
      SELECT * FROM okr_key_results WHERE objective_id = ? ORDER BY id
    `).all(obj.id);
    const progress = keyResults.length > 0
      ? Math.round((keyResults as any[]).reduce((sum, kr) => sum + (kr.current_value / kr.target_value) * 100, 0) / keyResults.length)
      : 0;
    return { ...obj, key_results: keyResults, progress };
  });

  res.json(objectivesWithKRs);
});

// Create objective
router.post('/objectives', (req, res) => {
  const { quarter, title } = req.body;
  const result = db.prepare(`
    INSERT INTO okr_objectives (quarter, title) VALUES (?, ?)
  `).run(quarter || getCurrentQuarter(), title);
  const objective = db.prepare('SELECT * FROM okr_objectives WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ...objective, key_results: [] });
});

// Update objective
router.put('/objectives/:id', (req, res) => {
  const { title, status } = req.body;
  db.prepare(`
    UPDATE okr_objectives SET title = COALESCE(?, title), status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?
  `).run(title, status, req.params.id);
  res.json({ success: true });
});

// Delete objective
router.delete('/objectives/:id', (req, res) => {
  db.prepare('DELETE FROM okr_objectives WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Create key result
router.post('/key-results', (req, res) => {
  const { objective_id, title, target_value, current_value, unit } = req.body;
  const result = db.prepare(`
    INSERT INTO okr_key_results (objective_id, title, target_value, current_value, unit) VALUES (?, ?, ?, ?, ?)
  `).run(objective_id, title, target_value || 100, current_value || 0, unit || '%');
  const kr = db.prepare('SELECT * FROM okr_key_results WHERE id = ?').get(result.lastInsertRowid);
  res.json(kr);
});

// Update key result
router.put('/key-results/:id', (req, res) => {
  const { title, current_value, target_value, unit, status } = req.body;
  db.prepare(`
    UPDATE okr_key_results
    SET title = COALESCE(?, title), current_value = COALESCE(?, current_value),
        target_value = COALESCE(?, target_value), unit = COALESCE(?, unit),
        status = COALESCE(?, status), updated_at = datetime('now')
    WHERE id = ?
  `).run(title, current_value, target_value, unit, status, req.params.id);
  res.json({ success: true });
});

// Delete key result
router.delete('/key-results/:id', (req, res) => {
  db.prepare('DELETE FROM okr_key_results WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

export default router;
