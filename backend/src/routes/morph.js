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
    console.log(`[MORPH] detect-faces request for videoId: ${videoId}, useCuda: ${useCuda}`);
    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }
    const videoPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(videoPath))) {
      console.error(`[MORPH] Video not found at: ${videoPath}`);
      return res.status(404).json({ error: 'Video not found' });
    }
    const absolutePath = path.resolve(videoPath);
    const payload = { video_path: absolutePath };
    if (typeof useCuda === 'boolean') payload.use_cuda = useCuda;

    console.log(`[MORPH] Calling morph service at ${MORPH_SERVICE_URL}/detect-faces with payload:`, payload);
    const response = await fetch(`${MORPH_SERVICE_URL}/detect-faces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000), // 2 min for detection
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[MORPH] Morph service error (${response.status}):`, text);
      return res.status(response.status).json({
        error: 'Morph service error',
        detail: text || response.statusText,
      });
    }
    const data = await response.json();
    console.log(`[MORPH] Success: received ${data.keyframes?.length || 0} keyframes`);
    res.json(data);
  } catch (err) {
    console.error('[MORPH] Backend error in detect-faces:', err);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Morph service timeout' });
    }
    next(err);
  }
});

/**
 * GET /api/morph/progress/:jobId
 * Proxies to Python /progress/:jobId
 */
router.get('/progress/:jobId', async (req, res, next) => {
  try {
    const response = await fetch(`${MORPH_SERVICE_URL}/progress/${req.params.jobId}`);
    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Job not found' });
      const text = await response.text();
      return res.status(response.status).json({ error: 'Morph service error', detail: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/morph/run
 * Body: { photoId, videoId, faceTrackId, targetEmbedding, jobId }
 */
router.post('/run', async (req, res, next) => {
  try {
    const { photoId, videoId, faceTrackId, targetEmbedding, jobId, useCuda } = req.body;
    console.log(`[MORPH] run request: photoId=${photoId}, videoId=${videoId}, faceTrackId=${faceTrackId}`);

    if (!photoId || !videoId) {
      return res.status(400).json({ error: 'photoId and videoId are required' });
    }
    const photoPath = path.join(UPLOADS_DIR, photoId);
    const videoPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(photoPath)) || !(await fileExists(videoPath))) {
      return res.status(404).json({ error: 'Files not found' });
    }

    const payload = {
      source_image_path: path.resolve(photoPath),
      video_path: path.resolve(videoPath),
      target_face_track_id: typeof faceTrackId === 'number' ? faceTrackId : 0,
      target_face_embedding: targetEmbedding,
      job_id: jobId,
      use_cuda: useCuda
    };

    console.log(`[MORPH] Calling morph service at ${MORPH_SERVICE_URL}/swap...`);
    const response = await fetch(`${MORPH_SERVICE_URL}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Short timeout for the trigger request
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[MORPH] Morph swapper error (${response.status}):`, text);
      return res.status(response.status).json({ error: 'Morph service error', detail: text });
    }

    const triggerRes = await response.json();
    res.json({ jobId: triggerRes.jobId, status: triggerRes.status });
  } catch (err) {
    console.error('[MORPH] Backend error in run:', err);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Timeout starting job' });
    }
    next(err);
  }
});

// Cache for completed job assets to avoid double-copying
const completedJobAssets = new Map();

/**
 * GET /api/morph/progress/:jobId
 * Proxies to Python /progress/:jobId and handles completion
 */
router.get('/progress/:jobId', async (req, res, next) => {
  const { jobId } = req.params;
  try {
    if (completedJobAssets.has(jobId)) {
      return res.json(completedJobAssets.get(jobId));
    }

    const response = await fetch(`${MORPH_SERVICE_URL}/progress/${jobId}`);
    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Job not found' });
      const text = await response.text();
      return res.status(response.status).json({ error: 'Morph service error', detail: text });
    }
    const data = await response.json();

    if (data.status === 'completed' && data.result?.output_path) {
      console.log(`[MORPH] Job ${jobId} is COMPLETED. Ingesting result...`);
      try {
        const { output_path } = data.result;
        const outFilename = generateUniqueFilename('morph.mp4');
        const destPath = path.join(UPLOADS_DIR, outFilename);

        console.log(`[MORPH] Copying from ${output_path} to ${destPath}`);
        await fs.copyFile(output_path, destPath);

        const info = await getVideoInfo(destPath);
        const asset = {
          id: uuidv4(),
          filename: outFilename,
          originalName: `morph-${Date.now()}.mp4`,
          path: `/uploads/${outFilename}`,
          size: (await fs.stat(destPath)).size,
          type: 'video',
          duration: info.duration || 0,
          resolution: info.video ? { width: info.video.width, height: info.video.height } : { width: 0, height: 0 },
          codec: info.video?.codec || 'unknown',
          uploadedAt: new Date().toISOString(),
        };

        const finalData = { ...data, asset };
        completedJobAssets.set(jobId, finalData);
        console.log(`[MORPH] Ingestion successful for ${jobId}`);
        return res.json(finalData);
      } catch (ingestError) {
        console.error(`[MORPH] Ingestion failed for ${jobId}:`, ingestError);
        return res.json({ ...data, error: 'Ingestion failed', detail: ingestError.message });
      }
    }

    res.json(data);
  } catch (err) {
    console.error(`[MORPH] Progress route error for ${jobId}:`, err);
    next(err);
  }
});

export default router;
