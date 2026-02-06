import express from 'express';
import { createShare, getShare, cleanupExpired } from '../services/shareService.js';

const router = express.Router();

/**
 * POST /api/shares
 * Body: { fileId: string, expiresIn: number | null } (expiresIn in hours)
 */
router.post('/', async (req, res, next) => {
  try {
    const { fileId, expiresIn } = req.body;
    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({ error: 'fileId is required' });
    }
    const expiresInHours = expiresIn != null ? Number(expiresIn) : null;
    const share = await createShare(fileId, expiresInHours);
    const baseUrl = req.protocol + '://' + req.get('host');
    res.json({
      id: share.id,
      url: `${baseUrl}/api/shares/${share.id}`,
      expiresAt: share.expiresAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shares/:id
 * Stream the file or 404 if expired/not found.
 */
router.get('/:id', async (req, res, next) => {
  try {
    await cleanupExpired();
    const share = await getShare(req.params.id);
    if (!share) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }
    res.download(share.path, share.filename, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (error) {
    next(error);
  }
});

export default router;
