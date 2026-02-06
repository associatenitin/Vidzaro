import express from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { EXPORTS_DIR, UPLOADS_DIR, ensureDirectories, fileExists } from '../utils/fileHandler.js';
import { validateProjectData } from '../utils/validation.js';
import { exportVideo } from '../services/ffmpegService.js';

await ensureDirectories();

const router = express.Router();

// In-memory job storage (for MVP - use Redis/BullMQ in production)
const exportJobs = new Map();

/**
 * POST /api/export
 * Start video export job
 */
router.post('/', async (req, res, next) => {
  try {
    const projectData = req.body;

    validateProjectData(projectData);

    // Generate job ID and output filename
    const jobId = uuidv4();
    const outputFilename = `export-${jobId}.mp4`;
    const outputPath = path.join(EXPORTS_DIR, outputFilename);

    // Create temp directory for this export
    const tempDir = path.join(EXPORTS_DIR, `temp-${jobId}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Initialize job status
    exportJobs.set(jobId, {
      id: jobId,
      status: 'processing',
      progress: 0,
      outputPath: null,
      error: null,
      createdAt: new Date().toISOString(),
    });

    // Resolve videoId to videoPath for each clip
    const processedClips = await Promise.all(
      projectData.clips.map(async (clip) => {
        const videoPath = clip.videoPath || path.join(UPLOADS_DIR, clip.videoId);
        
        if (!(await fileExists(videoPath))) {
          throw new Error(`Video file not found for clip ${clip.id}: ${clip.videoId}`);
        }

        return {
          ...clip,
          videoPath,
        };
      })
    );

    const processedProjectData = {
      ...projectData,
      clips: processedClips,
    };

    // Start export asynchronously
    exportVideo(processedProjectData, outputPath, tempDir)
      .then(async (finalPath) => {
        // Update job status
        exportJobs.set(jobId, {
          id: jobId,
          status: 'completed',
          progress: 100,
          outputPath: `/exports/${outputFilename}`,
          error: null,
          createdAt: exportJobs.get(jobId).createdAt,
          completedAt: new Date().toISOString(),
        });

        // Cleanup temp directory
        try {
          await fs.rmdir(tempDir, { recursive: true });
        } catch (err) {
          console.error('Error cleaning up temp directory:', err);
        }
      })
      .catch(async (error) => {
        // Update job status with error
        exportJobs.set(jobId, {
          id: jobId,
          status: 'failed',
          progress: 0,
          outputPath: null,
          error: error.message,
          createdAt: exportJobs.get(jobId).createdAt,
          failedAt: new Date().toISOString(),
        });

        // Cleanup temp directory
        try {
          await fs.rmdir(tempDir, { recursive: true });
        } catch (err) {
          console.error('Error cleaning up temp directory:', err);
        }
      });

    // Return job ID immediately
    res.json({
      jobId,
      status: 'processing',
      message: 'Export job started',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/export/:jobId/status
 * Get export job status
 */
router.get('/:jobId/status', (req, res) => {
  const jobId = req.params.jobId;
  const job = exportJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Export job not found' });
  }

  res.json(job);
});

/**
 * GET /api/export/:jobId/download
 * Download completed export
 */
router.get('/:jobId/download', (req, res, next) => {
  const jobId = req.params.jobId;
  const job = exportJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Export job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({ 
      error: 'Export not completed',
      status: job.status,
    });
  }

  const filePath = path.join(EXPORTS_DIR, path.basename(job.outputPath));
  
  res.download(filePath, (err) => {
    if (err && !res.headersSent) {
      next(err);
    }
  });
});

export default router;
