import './src/server/config'; // load env before anything reads process.env
import { validateEnv } from './src/server/env';
import { initSeedCore, isServerLocked } from './src/server/seed-core';
import { syncFts } from './src/server/db';
import { startServer } from './src/server/app';
import { assertMamaIdentity } from './src/server/mama-identity';
import { initWorkerPool, shutdownWorkerPool } from './src/server/workers/pool';

// ─── Last-resort crash guards ───────────────────────────────────────────────
// A stray throw or rejected promise on the main thread would otherwise kill the
// whole server. During testing that meant one bad snippet took everything down.
// Log loudly and keep running. (Test code should go through /api/sandbox, which
// runs in a separate process — these guards just stop in-process glitches from
// being fatal.)
process.on('uncaughtException', (err) => {
  console.error('[FATAL-GUARD] uncaughtException — server kept alive:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL-GUARD] unhandledRejection — server kept alive:', reason);
});

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
