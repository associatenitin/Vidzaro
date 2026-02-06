import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PROJECTS_DIR, ensureDirectories } from '../utils/fileHandler.js';

await ensureDirectories();

/**
 * Save project to JSON file
 */
export async function saveProject(projectData) {
  const projectId = projectData.id || uuidv4();
  const project = {
    id: projectId,
    name: projectData.name || 'Untitled Project',
    clips: projectData.clips || [],
    createdAt: projectData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);
  await fs.writeFile(filePath, JSON.stringify(project, null, 2));

  return project;
}

/**
 * Load project by ID
 */
export async function loadProject(projectId) {
  const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Project not found: ${projectId}`);
    }
    throw new Error(`Failed to load project: ${error.message}`);
  }
}

/**
 * List all projects
 */
export async function listProjects() {
  try {
    const files = await fs.readdir(PROJECTS_DIR);
    const projects = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const projectId = file.replace('.json', '');
          const project = await loadProject(projectId);
          projects.push({
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            clipCount: project.clips.length,
          });
        } catch (error) {
          console.error(`Error loading project ${file}:`, error);
        }
      }
    }

    return projects.sort((a, b) => 
      new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  } catch (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
}

/**
 * Delete project
 */
export async function deleteProject(projectId) {
  const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);

  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Project not found: ${projectId}`);
    }
    throw new Error(`Failed to delete project: ${error.message}`);
  }
}
