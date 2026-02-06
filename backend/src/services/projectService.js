import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PROJECTS_DIR, ensureDirectories } from '../utils/fileHandler.js';

await ensureDirectories();

/**
 * Sanitize filename to be safe for filesystem
 */
function sanitizeFilename(name) {
  // Replace invalid characters with underscores
  // Windows invalid chars: < > : " / \ | ? *
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .substring(0, 255) // Limit length
    || 'Untitled_Project'; // Fallback if empty
}

/**
 * Save project to JSON file
 */
export async function saveProject(projectData) {
  const projectId = projectData.id || uuidv4();
  const projectName = projectData.name || 'Untitled Project';
  const project = {
    id: projectId,
    name: projectName,
    clips: projectData.clips || [],
    assets: projectData.assets || [], // Save media library assets
    tracks: projectData.tracks || [], // Save timeline tracks
    createdAt: projectData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Use sanitized project name as filename, with ID as fallback for uniqueness
  const sanitizedName = sanitizeFilename(projectName);
  const fileName = `${sanitizedName}.json`;
  const filePath = path.join(PROJECTS_DIR, fileName);

  // If file already exists with same name, append ID to make it unique
  let finalFilePath = filePath;
  let counter = 1;
  while (await fs.access(finalFilePath).then(() => true).catch(() => false)) {
    const nameWithoutExt = sanitizedName;
    finalFilePath = path.join(PROJECTS_DIR, `${nameWithoutExt}_${counter}.json`);
    counter++;
  }

  await fs.writeFile(finalFilePath, JSON.stringify(project, null, 2));

  return {
    ...project,
    filePath: finalFilePath,
  };
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
 * Load project by file path (can be anywhere on filesystem)
 */
export async function loadProjectByPath(filePath) {
  try {
    // Validate that file exists and is readable
    await fs.access(filePath);
    
    const data = await fs.readFile(filePath, 'utf-8');
    const project = JSON.parse(data);
    
    // Validate it's a valid project structure
    if (!project || typeof project !== 'object') {
      throw new Error('Invalid project file format');
    }
    
    return project;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Project file not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in project file: ${error.message}`);
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
          const filePath = path.join(PROJECTS_DIR, file);
          const project = await loadProjectByPath(filePath);
          projects.push({
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            clipCount: project.clips.length,
            fileName: file,
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
