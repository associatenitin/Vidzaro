import express from 'express';
import path from 'path';
import { UPLOADS_DIR, THUMBNAILS_DIR } from '../utils/fileHandler.js';
import { validateTimestamp, validateDuration } from '../utils/validation.js';
import { getVideoInfo, trimVideo, splitVideo, generateThumbnails } from '../services/ffmpegService.js';
import { fileExists, deleteFile } from '../utils/fileHandler.js';
import fs from 'fs';

const router = express.Router();

/**
 * GET /api/video/:id/info
 * Get video metadata
 */
router.get('/:id/info', async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const videoPath = path.join(UPLOADS_DIR, videoId);

    if (!(await fileExists(videoPath))) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const info = await getVideoInfo(videoPath);
    res.json(info);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/video/:id/thumbnails
 * Generate and get thumbnails for a video
 */
router.get('/:id/thumbnails', async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const videoPath = path.join(UPLOADS_DIR, videoId);
    const videoThumbDir = path.join(THUMBNAILS_DIR, videoId);

    if (!(await fileExists(videoPath))) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Create thumbnail directory for this video if it doesn't exist
    if (!(await fileExists(videoThumbDir))) {
      await fs.promises.mkdir(videoThumbDir, { recursive: true });
      await generateThumbnails(videoPath, videoThumbDir);
    }

    // List thumbnails
    const files = await fs.promises.readdir(videoThumbDir);
    const thumbnails = files
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
      })
      .map(f => `/thumbnails/${videoId}/${f}`);

    res.json(thumbnails);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/video/:id
 * Stream video file
 */
router.get('/:id', async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const videoPath = path.join(UPLOADS_DIR, videoId);

    if (!(await fileExists(videoPath))) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const stat = await fs.promises.stat(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Partial content support for video streaming
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/video/trim
 * Trim a video clip
 */
router.post('/trim', async (req, res, next) => {
  try {
    const { videoId, startTime, duration } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }

    validateTimestamp(startTime);
    validateDuration(duration);

    const inputPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(inputPath))) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Generate output filename
    const outputFilename = `trimmed-${Date.now()}-${videoId}`;
    const outputPath = path.join(UPLOADS_DIR, outputFilename);

    // Trim video
    await trimVideo(inputPath, outputPath, startTime, duration);

    // Get output video info
    const info = await getVideoInfo(outputPath);

    res.json({
      id: outputFilename,
      filename: outputFilename,
      path: `/uploads/${outputFilename}`,
      duration: info.duration,
      trimmed: true,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/video/split
 * Split video at timestamp
 */
router.post('/split', async (req, res, next) => {
  try {
    const { videoId, splitTime } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }

    validateTimestamp(splitTime);

    const inputPath = path.join(UPLOADS_DIR, videoId);
    if (!(await fileExists(inputPath))) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Generate output filenames
    const timestamp = Date.now();
    const outputFilename1 = `split-${timestamp}-1-${videoId}`;
    const outputFilename2 = `split-${timestamp}-2-${videoId}`;
    const outputPath1 = path.join(UPLOADS_DIR, outputFilename1);
    const outputPath2 = path.join(UPLOADS_DIR, outputFilename2);

    // Split video
    await splitVideo(inputPath, outputPath1, outputPath2, splitTime);

    // Get info for both clips
    const info1 = await getVideoInfo(outputPath1);
    const info2 = await getVideoInfo(outputPath2);

    res.json({
      firstClip: {
        id: outputFilename1,
        filename: outputFilename1,
        path: `/uploads/${outputFilename1}`,
        duration: info1.duration,
      },
      secondClip: {
        id: outputFilename2,
        filename: outputFilename2,
        path: `/uploads/${outputFilename2}`,
        duration: info2.duration,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
