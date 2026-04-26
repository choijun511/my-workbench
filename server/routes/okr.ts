import { Router } from 'express';
import db from '../db.js';

const router = Router();

function ensureDefaultProject(quarter: string): number {
  const existing = db.prepare(
    `SELECT id FROM okr_projects WHERE quarter = ? ORDER BY sort_order, id LIMIT 1`
  ).get(quarter) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare(
    `INSERT INTO okr_projects (quarter, name, color, sort_order) VALUES (?, '通用', '#64748b', 0)`
  ).run(quarter);
  const projectId = Number(result.lastInsertRowid);
  // Adopt orphan objectives for this quarter
  db.prepare(`UPDATE okr_objectives SET project_id = ? WHERE quarter = ? AND project_id IS NULL`)
    .run(projectId, quarter);
  return projectId;
}

// List projects for a quarter
router.get('/projects', (req, res) => {
  const quarter = (req.query.quarter as string) || getCurrentQuarter();
  ensureDefaultProject(quarter);
  const projects = db.prepare(
    `SELECT * FROM okr_projects WHERE quarter = ? ORDER BY sort_order, id`
  ).all(quarter);
  res.json(projects);
});

// Create project
router.post('/projects', (req, res) => {
  const { quarter, name, color } = req.body;
  const q = quarter || getCurrentQuarter();
  ensureDefaultProject(q);
  const maxOrder = db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM okr_projects WHERE quarter = ?`
  ).get(q) as { m: number };
  const result = db.prepare(
    `INSERT INTO okr_projects (quarter, name, color, sort_order) VALUES (?, ?, ?, ?)`
  ).run(q, name, color || '#6366f1', maxOrder.m + 1);
  const project = db.prepare('SELECT * FROM okr_projects WHERE id = ?').get(result.lastInsertRowid);
  res.json(project);
});

// Update project
router.put('/projects/:id', (req, res) => {
  const { name, color } = req.body;
  db.prepare(
    `UPDATE okr_projects SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?`
  ).run(name, color, req.params.id);
  res.json({ success: true });
});

// Delete project (objectives in this project are reassigned to default project for that quarter)
router.delete('/projects/:id', (req, res) => {
  const project = db.prepare(`SELECT * FROM okr_projects WHERE id = ?`).get(req.params.id) as
    | { id: number; quarter: string; sort_order: number }
    | undefined;
  if (!project) return res.json({ success: true });

  const defaultId = db.prepare(
    `SELECT id FROM okr_projects WHERE quarter = ? AND id != ? ORDER BY sort_order, id LIMIT 1`
  ).get(project.quarter, project.id) as { id: number } | undefined;

  if (defaultId) {
    db.prepare(`UPDATE okr_objectives SET project_id = ? WHERE project_id = ?`)
      .run(defaultId.id, project.id);
    db.prepare(`DELETE FROM okr_projects WHERE id = ?`).run(project.id);
  } else {
    // Don't allow deleting the only project; just clear its objectives' project_id stays as is
    return res.status(400).json({ error: '不能删除该季度唯一的项目' });
  }
  res.json({ success: true });
});

// Get all objectives for a quarter (optionally filter by project)
router.get('/objectives', (req, res) => {
  const quarter = (req.query.quarter as string) || getCurrentQuarter();
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;

  ensureDefaultProject(quarter);

  const objectives = projectId
    ? db.prepare(
        `SELECT * FROM okr_objectives WHERE quarter = ? AND project_id = ? ORDER BY created_at DESC`
      ).all(quarter, projectId)
    : db.prepare(
        `SELECT * FROM okr_objectives WHERE quarter = ? ORDER BY created_at DESC`
      ).all(quarter);

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
  const { quarter, title, project_id } = req.body;
  const q = quarter || getCurrentQuarter();
  const pid = project_id || ensureDefaultProject(q);
  const result = db.prepare(`
    INSERT INTO okr_objectives (quarter, title, project_id) VALUES (?, ?, ?)
  `).run(q, title, pid);
  const objective = db.prepare('SELECT * FROM okr_objectives WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ...objective, key_results: [] });
});

// Update objective
router.put('/objectives/:id', (req, res) => {
  const { title, status, project_id } = req.body;
  db.prepare(`
    UPDATE okr_objectives SET title = COALESCE(?, title), status = COALESCE(?, status),
      project_id = COALESCE(?, project_id), updated_at = datetime('now') WHERE id = ?
  `).run(title, status, project_id, req.params.id);
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
