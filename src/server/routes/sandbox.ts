import { Router } from 'express';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { runInSandbox } from '../sandbox';

const router = Router();

/**
 * POST /api/sandbox/run
 * Body: { code: string, timeoutMs?: number }
 *
 * Runs a JS snippet in an isolated child process and returns
 * { stdout, stderr, exitCode, timedOut, durationMs }. The snippet can crash,
 * hang, or call process.exit without affecting this server.
 *
 * Disabled by default: it executes arbitrary code with the server's host
 * access, so it must be explicitly enabled with SAGE_ENABLE_SANDBOX=true. (It
 * is crash-isolated, but it is NOT a capability sandbox.)
 */
router.post(
  '/run',
  lockGuard,
  asyncHandler(async (req, res) => {
    if (process.env.SAGE_ENABLE_SANDBOX !== 'true') {
      res.status(403).json({
        error:
          'Sandbox is disabled. Set SAGE_ENABLE_SANDBOX=true to allow running test code in an isolated process.',
      });
      return;
    }

    const { code, timeoutMs } = req.body as { code?: string; timeoutMs?: number };
    if (typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'code (string) required' });
      return;
    }

    const result = await runInSandbox(code, { timeoutMs });
    res.json(result);
  }),
);

export default router;
