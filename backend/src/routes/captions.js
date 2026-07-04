import express from 'express';
import path from 'path';
import { UPLOADS_DIR } from '../utils/fileHandler.js';
import { fileExists } from '../utils/fileHandler.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const CAPTION_SERVICE_URL = process.env.CAPTION_SERVICE_URL || 'http://localhost:8004';

/**
 * POST /api/captions/generate
 * Body: { videoId, clipStart, clipEnd, useCuda, qualityMode, language, jobId }
 * Proxies to Python POST /transcribe with video_path; returns job ID for progress tracking.
 */
router.post('/generate', async (req, res, next) => {
  try {
    const { videoId, clipStart, clipEnd, useCuda, qualityMode, language, jobId } = req.body;
    console.log(`[CAPTIONS] generate request for videoId: ${videoId}, clipStart: ${clipStart}, clipEnd: ${clipEnd}, qualityMode: ${qualityMode}`);

    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }

    const videoPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(videoPath))) {
      console.error(`[CAPTIONS] Video not found at: ${videoPath}`);
      return res.status(404).json({ error: 'Video not found' });
    }

    const absolutePath = path.resolve(videoPath);
    const finalJobId = jobId || uuidv4();

    const payload = {
      video_path: absolutePath,
      job_id: finalJobId,
      start: typeof clipStart === 'number' ? clipStart : 0,
      end: typeof clipEnd === 'number' ? clipEnd : null,
      use_cuda: typeof useCuda === 'boolean' ? useCuda : true,
      quality_mode: qualityMode || 'balanced',
      language: language || null,
    };

    console.log(`[CAPTIONS] Calling caption service at ${CAPTION_SERVICE_URL}/transcribe with payload:`, payload);

    const response = await fetch(`${CAPTION_SERVICE_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000), // 30s timeout for trigger
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[CAPTIONS] Caption service error (${response.status}):`, text);
      return res.status(response.status).json({
        error: 'Caption service error',
        detail: text || response.statusText,
      });
    }

    const data = await response.json();
    const responseJobId = data.jobId || finalJobId;
    console.log(`[CAPTIONS] Success: job ${responseJobId} queued`);
    res.json({ jobId: responseJobId, status: data.status || 'queued' });
  } catch (err) {
    console.error('[CAPTIONS] Backend error in generate:', err);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Caption service timeout' });
    }
    next(err);
  }
});

/**
 * GET /api/captions/progress/:jobId
 * Proxies to Python /progress/:jobId. Result is text/timestamps, so there is
 * no file to ingest into the media library (unlike Deblur/Morph/Wan).
 */
router.get('/progress/:jobId', async (req, res, next) => {
  const { jobId } = req.params;
  try {
    const response = await fetch(`${CAPTION_SERVICE_URL}/progress/${jobId}`);
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 404) return res.status(404).json({ error: 'Job not found' });
      return res.status(response.status).json({ error: 'Caption service error', detail: text });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(`[CAPTIONS] Progress route error for ${jobId}:`, err);
    next(err);
  }
});

export default router;
