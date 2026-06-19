import './src/server/config'; // load env before anything reads process.env
import { validateEnv } from './src/server/env';
import { initSeedCore, isServerLocked } from './src/server/seed-core';
import { syncFts } from './src/server/db';
import { startServer } from './src/server/app';
import { assertMamaIdentity } from './src/server/mama-identity';

// ─── Startup sequence ───────────────────────────────────────────────────────
validateEnv();
initSeedCore();

if (!isServerLocked()) {
  console.log('[MAMA] ' + assertMamaIdentity('ACTIVE').replace(/\n/g, '\n[MAMA] '));
} else {
  console.log('[MAMA] Seed-core integrity FAILED — identity assertion withheld until lock is resolved.');
}

syncFts().catch(e => console.error('[VFS] FTS5 sync failed:', e));

startServer();
