import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { 
  UPLOADS_DIR, 
  ensureDirectories, 
  generateUniqueFilename 
} from '../utils/fileHandler.js';
import { validateVideoFile } from '../utils/validation.js';
import { getVideoInfo } from '../services/ffmpegService.js';

await ensureDirectories();

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, generateUniqueFilename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

/**
 * POST /api/upload
 * Upload a video file
 */
router.post('/', upload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file
    validateVideoFile(req.file);

    // Get video metadata
    const videoInfo = await getVideoInfo(req.file.path);

    // Return file metadata
    res.json({
      id: uuidv4(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      size: req.file.size,
      duration: videoInfo.duration,
      resolution: {
        width: videoInfo.video?.width || 0,
        height: videoInfo.video?.height || 0,
      },
      codec: videoInfo.video?.codec || 'unknown',
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    // Cleanup uploaded file on error
    if (req.file) {
      const fs = await import('fs/promises');
      await fs.unlink(req.file.path).catch(() => {});
    }
    next(error);
  }
});

export default router;
