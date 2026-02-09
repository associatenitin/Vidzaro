import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MORPH_SERVICE_URL = process.env.MORPH_SERVICE_URL || 'http://localhost:8000';
const DEBLUR_SERVICE_URL = process.env.DEBLUR_SERVICE_URL || 'http://localhost:8002';

const projectRoot = path.resolve(__dirname, '../../..');
const morphServiceDir = path.join(projectRoot, 'morph-service');
const deblurServiceDir = path.join(projectRoot, 'deblur-service');

// PIDs of processes we started (so we can stop them)
const startedProcesses = { morph: null, deblur: null };

function checkServiceHealth(url) {
  return new Promise((resolve) => {
    try {
      const healthUrl = `${url.replace(/\/$/, '')}/health`;
      const parsed = new URL(healthUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(healthUrl, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    } catch (err) {
      resolve(false);
    }
  });
}

/**
 * GET /api/admin/services
 * Returns status of backend, morph, and deblur services.
 */
router.get('/services', async (req, res, next) => {
  try {
    let morphOk = false;
    let deblurOk = false;
    try {
      const [m, d] = await Promise.all([
        checkServiceHealth(MORPH_SERVICE_URL),
        checkServiceHealth(DEBLUR_SERVICE_URL),
      ]);
      morphOk = m;
      deblurOk = d;
    } catch (e) {
      console.warn('[ADMIN] Health check error:', e.message);
    }

    res.json({
      backend: { status: 'running', message: 'This server is running.' },
      morph: {
        status: morphOk ? 'running' : 'stopped',
        url: MORPH_SERVICE_URL,
        startedByUs: startedProcesses.morph !== null,
      },
      deblur: {
        status: deblurOk ? 'running' : 'stopped',
        url: DEBLUR_SERVICE_URL,
        startedByUs: startedProcesses.deblur !== null,
      },
    });
  } catch (err) {
    console.error('[ADMIN] GET /services error:', err);
    next(err);
  }
});

/**
 * POST /api/admin/services/morph/start
 * Start the Morph service (Python).
 */
router.post('/services/morph/start', async (req, res, next) => {
  try {
    if (startedProcesses.morph !== null) {
      return res.status(400).json({ error: 'Morph service was already started by Admin. Stop it first.' });
    }

    const port = new URL(MORPH_SERVICE_URL).port || '8000';
    const isWindows = process.platform === 'win32';
    const child = spawn(
      isWindows ? 'python' : 'python3',
      ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', port],
      {
        cwd: morphServiceDir,
        stdio: 'ignore',
        detached: true,
        shell: isWindows,
        env: { ...process.env, PORT: port },
      }
    );

    child.unref();
    startedProcesses.morph = child.pid;
    console.log(`[ADMIN] Started Morph service (PID ${child.pid}) in ${morphServiceDir}`);

    res.json({ ok: true, pid: child.pid, message: 'Morph service start requested.' });
  } catch (err) {
    console.error('[ADMIN] Morph start error:', err);
    next(err);
  }
});

/**
 * POST /api/admin/services/morph/stop
 * Stop the Morph service if we started it.
 */
router.post('/services/morph/stop', async (req, res, next) => {
  try {
    const pid = startedProcesses.morph;
    if (pid == null) {
      return res.status(400).json({
        error: 'Morph service was not started by Admin. Stop it manually (e.g. in the terminal).',
      });
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
    startedProcesses.morph = null;
    console.log(`[ADMIN] Stopped Morph service (was PID ${pid})`);

    res.json({ ok: true, message: 'Morph service stop requested.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/services/deblur/start
 * Start the Deblur service (Python).
 */
router.post('/services/deblur/start', async (req, res, next) => {
  try {
    if (startedProcesses.deblur !== null) {
      return res.status(400).json({ error: 'Deblur service was already started by Admin. Stop it first.' });
    }

    const isWindows = process.platform === 'win32';
    const child = spawn(isWindows ? 'python' : 'python3', ['main.py'], {
      cwd: deblurServiceDir,
      stdio: 'ignore',
      detached: true,
      shell: isWindows,
      env: { ...process.env, DEBLUR_SERVICE_PORT: '8002' },
    });

    child.unref();
    startedProcesses.deblur = child.pid;
    console.log(`[ADMIN] Started Deblur service (PID ${child.pid}) in ${deblurServiceDir}`);

    res.json({ ok: true, pid: child.pid, message: 'Deblur service start requested.' });
  } catch (err) {
    console.error('[ADMIN] Deblur start error:', err);
    next(err);
  }
});

/**
 * POST /api/admin/services/deblur/stop
 * Stop the Deblur service if we started it.
 */
router.post('/services/deblur/stop', async (req, res, next) => {
  try {
    const pid = startedProcesses.deblur;
    if (pid == null) {
      return res.status(400).json({
        error: 'Deblur service was not started by Admin. Stop it manually (e.g. in the terminal).',
      });
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
    startedProcesses.deblur = null;
    console.log(`[ADMIN] Stopped Deblur service (was PID ${pid})`);

    res.json({ ok: true, message: 'Deblur service stop requested.' });
  } catch (err) {
    next(err);
  }
});

export default router;
