import express from 'express';
import { saveProject, loadProject, loadProjectByPath, listProjects, deleteProject } from '../services/projectService.js';

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
 * POST /api/projects/load-by-path
 * Load a project by file path
 */
router.post('/load-by-path', async (req, res, next) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const project = await loadProjectByPath(filePath);
    res.json(project);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/projects/load-from-content
 * Load a project from file content (for web file uploads)
 */
router.post('/load-from-content', async (req, res, next) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'File content is required' });
    }

    let project;
    try {
      project = JSON.parse(content);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON in project file' });
    }

    // Validate it's a valid project structure
    if (!project || typeof project !== 'object') {
      return res.status(400).json({ error: 'Invalid project file format' });
    }

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
