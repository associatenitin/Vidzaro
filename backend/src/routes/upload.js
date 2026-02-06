import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { 
  UPLOADS_DIR, 
  ensureDirectories, 
  generateUniqueFilename 
} from '../utils/fileHandler.js';
import { validateMediaFile, getFileType } from '../utils/validation.js';
import { getMediaInfo } from '../services/ffmpegService.js';

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
 * Upload a media file (video, image, or audio)
 */
router.post('/', upload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file (supports video, image, and audio)
    validateMediaFile(req.file);

    // Determine file type
    const fileType = getFileType(req.file);

    // Get media metadata
    const mediaInfo = await getMediaInfo(req.file.path, fileType);

    // Build response based on file type
    const response = {
      id: uuidv4(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      size: req.file.size,
      type: fileType,
      uploadedAt: new Date().toISOString(),
    };

    if (fileType === 'image') {
      // For images, set default duration and get dimensions
      response.duration = 5; // Default 5 seconds for images
      response.resolution = mediaInfo.resolution || { width: 0, height: 0 };
      response.codec = mediaInfo.codec || 'unknown';
    } else if (fileType === 'audio') {
      // For audio files
      response.duration = mediaInfo.duration || 0;
      response.codec = mediaInfo.audio?.codec || 'unknown';
    } else {
      // For video files
      response.duration = mediaInfo.duration || 0;
      response.resolution = {
        width: mediaInfo.video?.width || 0,
        height: mediaInfo.video?.height || 0,
      };
      response.codec = mediaInfo.video?.codec || 'unknown';
    }

    res.json(response);
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
