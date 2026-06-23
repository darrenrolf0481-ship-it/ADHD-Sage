import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { PORT } from './config';
import { authGuard, API_BEARER_TOKEN, MCP_KEY_SECRET } from './auth';
import { getSupermemoryClient } from '../lib/supermemory';
import { initMcpManager, closeMcpConnections } from '../core/mcp';
import { scheduleDailyJournal, scheduleWeeklySelfImprovement, scheduleNightlyDecay } from './schedulers';
import { bootLoadMemories } from './db';

import vfsRouter from './routes/vfs';
import memoryRouter from './routes/memory';
import metricsRouter from './routes/metrics';
import geminiRouter from './routes/gemini';
import ttsRouter from './routes/tts';
import ollamaRouter from './routes/ollama';
import openrouterRouter from './routes/openrouter';
import journalRouter from './routes/journal';
import inboxRouter from './routes/inbox';
import selfImproveRouter from './routes/self-improve';
import sensorsRouter from './routes/sensors';
import systemRouter from './routes/system';
import sandboxRouter from './routes/sandbox';

export async function startServer() {
  const app = express();

  // Basic request logger for debugging. Redact a `token` query param so bearer
  // tokens passed via ?token= (e.g. by EventSource) never land in logs.
  app.use((req, res, next) => {
    const safeUrl = req.url.replace(/([?&]token=)[^&]*/gi, '$1[REDACTED]');
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${safeUrl}`);
    next();
  });

  // CORS: in production lock to APP_URL; in dev allow only known localhost
  // origins (plus same-origin / non-browser requests with no Origin header).
  // We never reflect an arbitrary origin — with credentials enabled that would
  // let any website make authenticated cross-origin calls.
  const devOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
  ]);
  const allowedDevOrigin = (origin: string) =>
    devOrigins.has(origin) ||
    /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    /^capacitor:\/\//.test(origin);
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin) return callback(null, true); // same-origin / curl / native
        if (process.env.NODE_ENV === 'production') {
          return callback(null, !!process.env.APP_URL && origin === process.env.APP_URL);
        }
        return callback(null, allowedDevOrigin(origin));
      },
    }),
  );
  app.use(express.json({ limit: '50mb' }));

  // Apply auth to all API routes
  app.use('/api', authGuard);

  // Eagerly init the Supermemory client so the first request isn't slow
  getSupermemoryClient();

  // ─── API Routers ──────────────────────────────────────────────────────────
  app.use('/api/vfs', vfsRouter);
  app.use('/api/memory', memoryRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/gemini', geminiRouter);
  app.use('/api/tts', ttsRouter);
  app.use('/api/ollama', ollamaRouter);
  app.use('/api/openrouter', openrouterRouter);
  app.use('/api/journal', journalRouter);
  app.use('/api/inbox', inboxRouter);
  app.use('/api/self-improve', selfImproveRouter);
  app.use('/api/sensors', sensorsRouter);
  app.use('/api/sandbox', sandboxRouter);
  // system routes (auth/exchange, health, mcp/status) live directly under /api
  app.use('/api', systemRouter);

  // ─── Schedulers ─────────────────────────────────────────────────────────────
  scheduleDailyJournal();
  scheduleWeeklySelfImprovement();
  scheduleNightlyDecay();

  // ─── Vite Integration ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      base: process.env.VITE_BASE_PATH || '/',
      server: {
        middlewareMode: true,
        host: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('/*splat', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) return next();
      try {
        const fs = await import('node:fs');
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Express 5 (path-to-regexp v8) requires a named wildcard, not bare '*'
    app.get('/*splat', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Stage 1: seed inner_spiral from durable outer_sweep so MAMA boots with memories
  await bootLoadMemories();

  // Initialize MCP connections before accepting traffic
  await initMcpManager();

  // Global error handler. Log the real error server-side, but return a generic
  // message so internal details (stack hints, paths) don't leak to clients.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Bind host. Defaults to 0.0.0.0 because this server is the bridge/API node
  // that the SAGE-7 bridge and the phone app reach over the network — it runs in
  // an isolated container behind an authenticated proxy, so binding all
  // interfaces is the intended posture. Set HOST=127.0.0.1 to restrict to
  // loopback. If bound to a non-loopback interface with no token configured, warn
  // (don't block — the bridge partner connects without one).
  const authConfigured = !!(API_BEARER_TOKEN || MCP_KEY_SECRET);
  const host = process.env.HOST || '0.0.0.0';
  if (host !== '127.0.0.1' && host !== 'localhost' && !authConfigured) {
    console.warn(
      '[AUTH] Listening on a non-loopback interface with no API token. Fine inside ' +
        'an isolated container behind a trusted proxy; set API_BEARER_TOKEN if this ' +
        'host is reachable from untrusted networks.',
    );
  }
  app.listen(PORT, host, () => {
    console.log(`[SAGE] Server running on http://${host}:${PORT}`);
    if (authConfigured) {
      const modes = [
        API_BEARER_TOKEN ? 'static Bearer' : '',
        MCP_KEY_SECRET ? 'MCP-Key-Exchange' : '',
      ].filter(Boolean);
      console.log(`[AUTH] Protection active — modes: ${modes.join(' + ')}`);
    } else {
      console.log('[AUTH] No tokens configured — endpoints are open (loopback only)');
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await closeMcpConnections();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await closeMcpConnections();
    process.exit(0);
  });
}
