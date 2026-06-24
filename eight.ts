/**
 * eight.ts — SAGE-8 standalone entry point
 *
 * Can be started independently:   tsx eight.ts
 * Or spawned by server.ts automatically when SAGE8_AUTOSTART=true (default).
 */
import './src/server/config';
import { startEightServer } from './src/server/eight/app';

startEightServer().catch((err) => {
  console.error('[SAGE-8] Failed to start:', err);
  process.exit(1);
});
