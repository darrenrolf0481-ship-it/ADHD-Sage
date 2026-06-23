/**
 * seven.ts — SAGE-7 standalone entry point
 *
 * Can be started independently:   tsx seven.ts
 * Or spawned by server.ts automatically when SAGE7_AUTOSTART=true (default).
 */
import './src/server/config';
import { startSevenServer } from './src/server/seven/app';

startSevenServer().catch((err) => {
  console.error('[SAGE-7] Failed to start:', err);
  process.exit(1);
});
