import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '../../');

export const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
export const PROJECTS_DIR = path.join(ROOT_DIR, 'projects');
export const EXPORTS_DIR = path.join(ROOT_DIR, 'exports');
export const THUMBNAILS_DIR = path.join(ROOT_DIR, 'thumbnails');
export const SHARES_DIR = path.join(ROOT_DIR, 'shares');
export const SHARES_META_FILE = path.join(ROOT_DIR, 'shares-meta.json');

// Ensure directories exist
export async function ensureDirectories() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  await fs.mkdir(EXPORTS_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
  await fs.mkdir(SHARES_DIR, { recursive: true });
}

// Get file extension
export function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

// Generate unique filename
export function generateUniqueFilename(originalName) {
  const ext = getFileExtension(originalName);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${random}${ext}`;
}

// Check if file exists
export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Delete file
export async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.error(`Error deleting file ${filePath}:`, err);
  }
}
