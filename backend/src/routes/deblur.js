import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { UPLOADS_DIR } from '../utils/fileHandler.js';
import { fileExists } from '../utils/fileHandler.js';
import { getVideoInfo } from '../services/ffmpegService.js';
import { generateUniqueFilename } from '../utils/fileHandler.js';

const router = express.Router();

const DEBLUR_SERVICE_URL = process.env.DEBLUR_SERVICE_URL || 'http://localhost:8002';
const DEBLUR_TIMEOUT_MS = 600000; // 10 min for long enhancement jobs

/**
 * POST /api/deblur/enhance
 * Body: { videoId, useCuda, qualityMode }
 * Proxies to Python POST /enhance with video_path; returns job ID for progress tracking.
 */
router.post('/enhance', async (req, res, next) => {
  try {
    const { videoId, useCuda, qualityMode, jobId } = req.body;
    console.log(`[DEBLUR] enhance request for videoId: ${videoId}, useCuda: ${useCuda}, qualityMode: ${qualityMode}, jobId: ${jobId}`);
    
    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }
    
    const videoPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(videoPath))) {
      console.error(`[DEBLUR] Video not found at: ${videoPath}`);
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const absolutePath = path.resolve(videoPath);
    // Use provided jobId or generate one
    const finalJobId = jobId || uuidv4();
    
    const payload = {
      video_path: absolutePath,
      job_id: finalJobId,
      use_cuda: typeof useCuda === 'boolean' ? useCuda : true,
      quality_mode: qualityMode || 'balanced'
    };

    console.log(`[DEBLUR] Calling deblur service at ${DEBLUR_SERVICE_URL}/enhance with payload:`, payload);
    
    const response = await fetch(`${DEBLUR_SERVICE_URL}/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000), // 30s timeout for trigger
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[DEBLUR] Deblur service error (${response.status}):`, text);
      return res.status(response.status).json({
        error: 'Deblur service error',
        detail: text || response.statusText,
      });
    }
    
    const data = await response.json();
    // Ensure we return the jobId that was used (from frontend or generated)
    const responseJobId = data.jobId || finalJobId;
    console.log(`[DEBLUR] Success: job ${responseJobId} queued`);
    res.json({ jobId: responseJobId, status: data.status || 'queued' });
  } catch (err) {
    console.error('[DEBLUR] Backend error in enhance:', err);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Deblur service timeout' });
    }
    next(err);
  }
});

// Cache for completed job assets to avoid double-copying
const completedJobAssets = new Map();

/**
 * GET /api/deblur/progress/:jobId
 * Proxies to Python /progress/:jobId and handles completion
 */
router.get('/progress/:jobId', async (req, res, next) => {
  const { jobId } = req.params;
  try {
    console.log(`[DEBLUR] Progress check for jobId: ${jobId}`);
    
    if (completedJobAssets.has(jobId)) {
      console.log(`[DEBLUR] Job ${jobId} found in cache`);
      return res.json(completedJobAssets.get(jobId));
    }

    console.log(`[DEBLUR] Fetching progress from service: ${DEBLUR_SERVICE_URL}/progress/${jobId}`);
    const response = await fetch(`${DEBLUR_SERVICE_URL}/progress/${jobId}`);
    if (!response.ok) {
      const text = await response.text();
      console.error(`[DEBLUR] Service returned ${response.status}: ${text}`);
      if (response.status === 404) return res.status(404).json({ error: 'Job not found' });
      return res.status(response.status).json({ error: 'Deblur service error', detail: text });
    }
    
    const data = await response.json();

    if (data.status === 'completed' && data.result?.output_path) {
      console.log(`[DEBLUR] Job ${jobId} is COMPLETED. Ingesting result...`);
      try {
        const { output_path } = data.result;
        const outFilename = generateUniqueFilename('enhanced.mp4');
        const destPath = path.join(UPLOADS_DIR, outFilename);

        console.log(`[DEBLUR] Copying from ${output_path} to ${destPath}`);
        await fs.copyFile(output_path, destPath);

        const info = await getVideoInfo(destPath);
        const asset = {
          id: uuidv4(),
          filename: outFilename,
          originalName: `enhanced-${Date.now()}.mp4`,
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
        console.log(`[DEBLUR] Ingestion successful for ${jobId}`);
        return res.json(finalData);
      } catch (ingestError) {
        console.error(`[DEBLUR] Ingestion failed for ${jobId}:`, ingestError);
        return res.json({ ...data, error: 'Ingestion failed', detail: ingestError.message });
      }
    }

    res.json(data);
  } catch (err) {
    console.error(`[DEBLUR] Progress route error for ${jobId}:`, err);
    next(err);
  }
});

export default router;
