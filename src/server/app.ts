import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { PORT } from './config';
import { authGuard, API_BEARER_TOKEN, MCP_KEY_SECRET } from './auth';
import { getSupermemoryClient } from '../lib/supermemory';
import { initMcpManager, closeMcpConnections } from '../core/mcp';
import { scheduleDailyJournal, scheduleWeeklySelfImprovement } from './schedulers';

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

export async function startServer() {
  const app = express();

  // Basic request logger for debugging
  app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
  });

  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.APP_URL : true
  }));
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
  // system routes (auth/exchange, health, mcp/status) live directly under /api
  app.use('/api', systemRouter);

  // ─── Schedulers ─────────────────────────────────────────────────────────────
  scheduleDailyJournal();
  scheduleWeeklySelfImprovement();

  // ─── Vite Integration ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: true,
        allowedHosts: true
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

  // Initialize MCP connections before accepting traffic
  await initMcpManager();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SAGE] Server running on http://0.0.0.0:${PORT}`);
    if (API_BEARER_TOKEN || MCP_KEY_SECRET) {
      const modes = [API_BEARER_TOKEN ? 'static Bearer' : '', MCP_KEY_SECRET ? 'MCP-Key-Exchange' : ''].filter(Boolean);
      console.log(`[AUTH] Protection active — modes: ${modes.join(' + ')}`);
    } else {
      console.log('[AUTH] No tokens configured — endpoints are open');
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
