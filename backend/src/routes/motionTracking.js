import express from 'express';
import path from 'path';
import { UPLOADS_DIR } from '../utils/fileHandler.js';
import { fileExists } from '../utils/fileHandler.js';

const router = express.Router();

const MORPH_SERVICE_URL = process.env.MORPH_SERVICE_URL || 'http://localhost:8000';
const TRACKING_TIMEOUT_MS = 300000; // 5 min for tracking jobs

console.log('[MOTION-TRACKING] Routes module loaded');

// Health check route to verify the motion tracking routes are loaded
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Motion tracking routes are active' });
});

/**
 * POST /api/motion-tracking/track
 * Body: { videoId, clipStart, clipEnd, target: { x, y, width?, height? } }
 * Tracks an object in a video and returns keyframes with positions over time.
 */
router.post('/track', async (req, res, next) => {
  try {
    const { videoId, clipStart = 0, clipEnd = null, target, fps = null } = req.body;
    console.log(`[MOTION-TRACKING] track request for videoId: ${videoId}, target:`, target);

    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
      return res.status(400).json({ error: 'target with x and y coordinates is required' });
    }

    const videoPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(videoPath))) {
      console.error(`[MOTION-TRACKING] Video not found at: ${videoPath}`);
      return res.status(404).json({ error: 'Video not found' });
    }

    const absolutePath = path.resolve(videoPath);
    const payload = {
      video_path: absolutePath,
      clip_start: clipStart,
      clip_end: clipEnd,
      target_x: target.x,
      target_y: target.y,
      target_width: target.width || 0.05, // Default 5% of frame width
      target_height: target.height || 0.05, // Default 5% of frame height
    };
    if (fps !== null) payload.fps = fps;

    console.log(`[MOTION-TRACKING] Calling morph service at ${MORPH_SERVICE_URL}/track-object with payload:`, payload);

    // For now, we'll use a synchronous approach - the morph service should implement /track-object
    // If it returns a jobId, we'll handle polling in a separate endpoint
    const response = await fetch(`${MORPH_SERVICE_URL}/track-object`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TRACKING_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[MOTION-TRACKING] Morph service error (${response.status}):`, text);
      return res.status(response.status).json({
        error: 'Motion tracking service error',
        detail: text || response.statusText,
      });
    }

    const data = await response.json();
    console.log(`[MOTION-TRACKING] Success: received ${data.keyframes?.length || 0} keyframes`);

    // If the service returns a jobId, return it for polling
    // Otherwise, return keyframes directly
    if (data.jobId) {
      res.json({ jobId: data.jobId, status: data.status || 'processing' });
    } else if (data.keyframes) {
      res.json({ keyframes: data.keyframes });
    } else {
      res.status(500).json({ error: 'Invalid response from tracking service' });
    }
  } catch (err) {
    console.error('[MOTION-TRACKING] Backend error in track:', err);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Motion tracking service timeout' });
    }
    next(err);
  }
});

/**
 * GET /api/motion-tracking/progress/:jobId
 * Polls the tracking service for job progress
 */
router.get('/progress/:jobId', async (req, res, next) => {
  const { jobId } = req.params;
  try {
    const response = await fetch(`${MORPH_SERVICE_URL}/track-object/progress/${jobId}`);
    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Job not found' });
      const text = await response.text();
      return res.status(response.status).json({ error: 'Tracking service error', detail: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[MOTION-TRACKING] Backend error in progress:', err);
    next(err);
  }
});

export default router;
