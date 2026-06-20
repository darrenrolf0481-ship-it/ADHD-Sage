import './src/server/config'; // load env before anything reads process.env
import { validateEnv } from './src/server/env';
import { initSeedCore, isServerLocked } from './src/server/seed-core';
import { syncFts } from './src/server/db';
import { startServer } from './src/server/app';
import { assertMamaIdentity } from './src/server/mama-identity';
import { initWorkerPool, shutdownWorkerPool } from './src/server/workers/pool';

// ─── Startup sequence ───────────────────────────────────────────────────────
validateEnv();
initSeedCore();
initWorkerPool();

if (!isServerLocked()) {
  console.log('[MAMA] ' + assertMamaIdentity('ACTIVE').replace(/\n/g, '\n[MAMA] '));
} else {
  console.log('[MAMA] Seed-core integrity FAILED — identity assertion withheld until lock is resolved.');
}

syncFts().catch(e => console.error('[VFS] FTS5 sync failed:', e));

startServer();

// ─── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`[server] Received ${signal}, shutting down worker pool...`);
  await shutdownWorkerPool().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
