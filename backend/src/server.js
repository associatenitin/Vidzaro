import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import uploadRoutes from './routes/upload.js';
import videoRoutes from './routes/video.js';
import exportRoutes from './routes/export.js';
import projectRoutes from './routes/projects.js';
import recordingRoutes from './routes/recordings.js';
import shareRoutes from './routes/shares.js';
import morphRoutes from './routes/morph.js';
import deblurRoutes from './routes/deblur.js';
import wanRoutes from './routes/wan.js';
import adminRoutes from './routes/admin.js';
import motionTrackingRoutes from './routes/motionTracking.js';
import { errorHandler } from './utils/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploaded videos and exports
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
app.use('/exports', express.static(path.join(__dirname, '../../exports')));
app.use('/thumbnails', express.static(path.join(__dirname, '../../thumbnails')));

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/morph', morphRoutes);
app.use('/api/deblur', deblurRoutes);
app.use('/api/wan', wanRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/motion-tracking', motionTrackingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Vidzaro API is running' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Vidzaro backend server running on http://localhost:${PORT}`);
});
