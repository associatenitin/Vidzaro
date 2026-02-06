import express from 'express';
import { saveProject, loadProject, listProjects, deleteProject } from '../services/projectService.js';

const router = express.Router();

/**
 * POST /api/projects
 * Save a project
 */
router.post('/', async (req, res, next) => {
  try {
    const project = await saveProject(req.body);
    res.json(project);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projects
 * List all projects
 */
router.get('/', async (req, res, next) => {
  try {
    const projects = await listProjects();
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projects/:id
 * Load a project by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    res.json(project);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await deleteProject(req.params.id);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
