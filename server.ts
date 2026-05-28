import './src/server/config'; // load env before anything reads process.env
import { validateEnv } from './src/server/env';
import { initSeedCore } from './src/server/seed-core';
import { syncFts } from './src/server/db';
import { startServer } from './src/server/app';

// ─── Startup sequence ───────────────────────────────────────────────────────
validateEnv();
initSeedCore();
syncFts().catch(e => console.error('[VFS] FTS5 sync failed:', e));

startServer();
