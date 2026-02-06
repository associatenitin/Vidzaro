import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  UPLOADS_DIR,
  ensureDirectories,
  generateUniqueFilename,
} from '../utils/fileHandler.js';
import { getMediaInfo } from '../services/ffmpegService.js';
import { convertRecording } from '../services/ffmpegService.js';

await ensureDirectories();

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.webm`),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

/**
 * POST /api/recordings/finalize
 * Accepts WebM recording + optional trim/format. Returns asset object.
 * Body (form): trimStart, trimEnd, format (mp4|webm|mkv), fps, width, height, bitrate
 */
router.post('/finalize', upload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const trimStart = parseFloat(req.body.trimStart) || 0;
    const trimEnd = req.body.trimEnd !== undefined && req.body.trimEnd !== '' ? parseFloat(req.body.trimEnd) : undefined;
    const format = (req.body.format || 'mp4').toLowerCase();
    const fps = req.body.fps ? parseInt(req.body.fps, 10) : undefined;
    const width = req.body.width ? parseInt(req.body.width, 10) : undefined;
    const height = req.body.height ? parseInt(req.body.height, 10) : undefined;
    const bitrate = req.body.bitrate ? parseInt(req.body.bitrate, 10) : undefined;

    const inputPath = req.file.path;
    const ext = format === 'mkv' ? '.mkv' : format === 'webm' ? '.webm' : '.mp4';
    const outputFilename = generateUniqueFilename(`recording${ext}`);
    const outputPath = path.join(UPLOADS_DIR, outputFilename);

    let finalPath = inputPath;
    let finalFilename = req.file.filename;

    const needsConvert = format !== 'webm' || (trimEnd != null && trimEnd > trimStart) || trimStart > 0;

    if (needsConvert) {
      await convertRecording(inputPath, outputPath, {
        format,
        fps,
        width,
        height,
        videoBitrate: bitrate,
        trimStart,
        trimEnd,
      });
      await fs.unlink(inputPath).catch(() => {});
      finalPath = outputPath;
      finalFilename = outputFilename;
    }

    const fileType = 'video';
    const mediaInfo = await getMediaInfo(finalPath, fileType);

    const response = {
      id: uuidv4(),
      filename: finalFilename,
      originalName: req.file.originalname || `recording.${format}`,
      path: `/uploads/${finalFilename}`,
      size: (await fs.stat(finalPath)).size,
      type: fileType,
      uploadedAt: new Date().toISOString(),
      duration: mediaInfo.duration || 0,
      resolution: {
        width: mediaInfo.video?.width || 0,
        height: mediaInfo.video?.height || 0,
      },
      codec: mediaInfo.video?.codec || 'unknown',
    };

    res.json(response);
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    next(error);
  }
});

export default router;
