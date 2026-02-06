import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { UPLOADS_DIR, EXPORTS_DIR, SHARES_DIR, SHARES_META_FILE, fileExists } from '../utils/fileHandler.js';

await fs.mkdir(SHARES_DIR, { recursive: true });

function shortId() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 10);
}

async function readMeta() {
  try {
    const data = await fs.readFile(SHARES_META_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeMeta(meta) {
  await fs.writeFile(SHARES_META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Create a share for a file. fileId can be a filename in uploads or exports.
 * expiresIn: hours from now, or null for no expiry.
 */
export async function createShare(fileId, expiresInHours = null) {
  const id = shortId();
  const uploadsPath = path.join(UPLOADS_DIR, fileId);
  const exportsPath = path.join(EXPORTS_DIR, fileId);
  let sourcePath = null;
  if (await fileExists(uploadsPath)) sourcePath = uploadsPath;
  else if (await fileExists(exportsPath)) sourcePath = exportsPath;
  if (!sourcePath) throw new Error('File not found');

  const ext = path.extname(fileId);
  const shareFilename = `${id}${ext}`;
  const sharePath = path.join(SHARES_DIR, shareFilename);
  await fs.copyFile(sourcePath, sharePath);

  const expiresAt = expiresInHours != null
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    : null;

  const meta = await readMeta();
  meta[id] = { id, fileId, shareFilename, expiresAt, createdAt: new Date().toISOString() };
  await writeMeta(meta);

  return { id, shareFilename, expiresAt, url: `/api/shares/${id}` };
}

/**
 * Get share by id. Returns { path, filename } or null if not found/expired.
 */
export async function getShare(id) {
  const meta = await readMeta();
  const entry = meta[id];
  if (!entry) return null;
  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    await deleteShare(id);
    return null;
  }
  const sharePath = path.join(SHARES_DIR, entry.shareFilename);
  if (!(await fileExists(sharePath))) return null;
  return { path: sharePath, filename: entry.shareFilename };
}

export async function deleteShare(id) {
  const meta = await readMeta();
  const entry = meta[id];
  if (entry) {
    const sharePath = path.join(SHARES_DIR, entry.shareFilename);
    await fs.unlink(sharePath).catch(() => {});
    delete meta[id];
    await writeMeta(meta);
  }
}

/**
 * Remove expired shares from disk and meta.
 */
export async function cleanupExpired() {
  const meta = await readMeta();
  const now = new Date();
  let changed = false;
  for (const [id, entry] of Object.entries(meta)) {
    if (entry.expiresAt && new Date(entry.expiresAt) < now) {
      const sharePath = path.join(SHARES_DIR, entry.shareFilename);
      await fs.unlink(sharePath).catch(() => {});
      delete meta[id];
      changed = true;
    }
  }
  if (changed) await writeMeta(meta);
}
