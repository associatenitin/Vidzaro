import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { UPLOADS_DIR } from '../utils/fileHandler.js';
import { fileExists } from '../utils/fileHandler.js';
import { getVideoInfo } from '../services/ffmpegService.js';
import { generateUniqueFilename } from '../utils/fileHandler.js';

const router = express.Router();

const MORPH_SERVICE_URL = process.env.MORPH_SERVICE_URL || 'http://localhost:8000';
const MORPH_TIMEOUT_MS = 600000; // 10 min for long swap jobs

/**
 * POST /api/morph/detect-faces
 * Body: { videoId } — videoId is the upload filename (same as /api/video/:id).
 * Proxies to Python POST /detect-faces with video_path; returns keyframes with face bboxes and trackId.
 */
router.post('/detect-faces', async (req, res, next) => {
  try {
    const { videoId, useCuda } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }
    const videoPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(videoPath))) {
      return res.status(404).json({ error: 'Video not found' });
    }
    const absolutePath = path.resolve(videoPath);
    const payload = { video_path: absolutePath };
    if (typeof useCuda === 'boolean') payload.use_cuda = useCuda;
    const response = await fetch(`${MORPH_SERVICE_URL}/detect-faces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000), // 2 min for detection
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'Morph service error',
        detail: text || response.statusText,
      });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Morph service timeout' });
    }
    next(err);
  }
});

/**
 * POST /api/morph/run
 * Body: { photoId, videoId, faceTrackId } — ids are upload filenames.
 * Calls Python /swap, copies output to uploads, returns new asset (same shape as upload response).
 */
router.post('/run', async (req, res, next) => {
  try {
    const { photoId, videoId, faceTrackId, useCuda } = req.body;
    if (!photoId || !videoId) {
      return res.status(400).json({ error: 'photoId and videoId are required' });
    }
    const photoPath = path.join(UPLOADS_DIR, photoId);
    const videoPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(photoPath))) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    if (!(await fileExists(videoPath))) {
      return res.status(404).json({ error: 'Video not found' });
    }
    const absolutePhoto = path.resolve(photoPath);
    const absoluteVideo = path.resolve(videoPath);
    const payload = {
      source_image_path: absolutePhoto,
      video_path: absoluteVideo,
      target_face_track_id: typeof faceTrackId === 'number' ? faceTrackId : 0,
    };
    if (typeof useCuda === 'boolean') payload.use_cuda = useCuda;
    const response = await fetch(`${MORPH_SERVICE_URL}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(MORPH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'Morph service error',
        detail: text || response.statusText,
      });
    }
    const { output_path } = await response.json();
    if (!output_path) {
      return res.status(500).json({ error: 'Morph service did not return output_path' });
    }
    const outFilename = generateUniqueFilename('morph.mp4');
    const destPath = path.join(UPLOADS_DIR, outFilename);
    await fs.copyFile(output_path, destPath);
    await fs.unlink(output_path).catch(() => {});
    const info = await getVideoInfo(destPath);
    const asset = {
      id: uuidv4(),
      filename: outFilename,
      originalName: `morph-${path.basename(videoId, path.extname(videoId))}.mp4`,
      path: `/uploads/${outFilename}`,
      size: (await fs.stat(destPath)).size,
      type: 'video',
      duration: info.duration || 0,
      resolution: info.video ? { width: info.video.width, height: info.video.height } : { width: 0, height: 0 },
      codec: info.video?.codec || 'unknown',
      uploadedAt: new Date().toISOString(),
    };
    res.json(asset);
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Morph service timeout' });
    }
    next(err);
  }
});

export default router;
