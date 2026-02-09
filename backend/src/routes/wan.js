import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { UPLOADS_DIR } from '../utils/fileHandler.js';
import { fileExists } from '../utils/fileHandler.js';
import { getVideoInfo } from '../services/ffmpegService.js';
import { generateUniqueFilename } from '../utils/fileHandler.js';

const router = express.Router();

const WAN_SERVICE_URL = process.env.WAN_SERVICE_URL || 'http://localhost:8003';

/**
 * POST /api/wan/generate
 * Body: { mode, prompt, negativePrompt, imageId?, duration, guidanceScale, useCuda, lowVram, jobId }
 * Proxies to wan-service POST /generate; returns job ID for progress tracking.
 */
router.post('/generate', async (req, res, next) => {
  try {
    const {
      mode = 'text-to-video',
      prompt,
      negativePrompt,
      imageId,
      duration = 5,
      guidanceScale = 6,
      useCuda = true,
      lowVram = false,
      jobId,
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const finalJobId = jobId || uuidv4();

    const payload = {
      mode: mode === 'image-to-video' ? 'image-to-video' : 'text-to-video',
      prompt: prompt.trim(),
      negative_prompt: negativePrompt || null,
      image_path: null,
      duration: [3, 5, 8].includes(Number(duration)) ? Number(duration) : 5,
      guidance_scale: Math.min(10, Math.max(1, Number(guidanceScale) || 6)),
      use_cuda: Boolean(useCuda),
      low_vram: Boolean(lowVram),
      job_id: finalJobId,
    };

    if (imageId && mode === 'image-to-video') {
      const imagePath = path.join(UPLOADS_DIR, imageId);
      if (await fileExists(imagePath)) {
        payload.image_path = path.resolve(imagePath);
      }
    }

    const response = await fetch(`${WAN_SERVICE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'Wan service error',
        detail: text || response.statusText,
      });
    }

    const data = await response.json();
    res.json({ jobId: data.jobId || finalJobId, status: data.status || 'queued' });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Wan service timeout' });
    }
    next(err);
  }
});

const completedJobAssets = new Map();

/**
 * GET /api/wan/progress/:jobId
 * Proxies to wan-service GET /progress/:jobId; ingests output on completion.
 */
router.get('/progress/:jobId', async (req, res, next) => {
  const { jobId } = req.params;
  try {
    if (completedJobAssets.has(jobId)) {
      return res.json(completedJobAssets.get(jobId));
    }

    const response = await fetch(`${WAN_SERVICE_URL}/progress/${jobId}`);
    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Job not found' });
      const text = await response.text();
      return res.status(response.status).json({ error: 'Wan service error', detail: text });
    }

    const data = await response.json();

    if (data.status === 'completed' && data.result?.output_path) {
      try {
        const { output_path } = data.result;
        const outFilename = generateUniqueFilename('gen-ai.mp4');
        const destPath = path.join(UPLOADS_DIR, outFilename);

        await fs.copyFile(output_path, destPath);

        const info = await getVideoInfo(destPath);
        const asset = {
          id: uuidv4(),
          filename: outFilename,
          originalName: `gen-ai-${Date.now()}.mp4`,
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
        return res.json(finalData);
      } catch (ingestError) {
        return res.json({ ...data, error: 'Ingestion failed', detail: ingestError.message });
      }
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
