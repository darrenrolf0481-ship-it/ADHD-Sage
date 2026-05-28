import { outerDb } from './db';
import { compress } from '@mongodb-js/zstd';

export function archiveNodeSync(node: Record<string, unknown>) {
  console.log('[VFS] archiveNodeSync called, outerDb open:', outerDb.open, 'readonly:', outerDb.readonly);
  const existing = outerDb.prepare('SELECT phi_index FROM sages_constellations WHERE node_id = ?').get(node.node_id as string);
  if (existing) return;
  const blob = Buffer.from(JSON.stringify(node.data), 'utf8');
  outerDb.prepare(
    'INSERT OR IGNORE INTO sages_constellations (node_id, data, compressed, timestamp, dopamine, cortisol, pinned) VALUES (?, ?, 0, ?, ?, ?, ?)'
  ).run(node.node_id, blob, node.timestamp, node.dopamine, node.cortisol, node.pinned ? 1 : 0);

  // Sync to FTS
  try {
    const content = typeof node.data === 'string' ? node.data : JSON.stringify(node.data);
    outerDb.prepare('INSERT OR IGNORE INTO sages_constellations_fts (node_id, content) VALUES (?, ?)').run(node.node_id, content);
  } catch (e) {
    console.warn('[VFS] archiveNodeSync FTS insert failed:', e);
  }
}

export async function archiveNode(node: Record<string, unknown>) {
  const existing = outerDb.prepare('SELECT phi_index FROM sages_constellations WHERE node_id = ?').get(node.node_id as string);
  if (existing) return;
  const blob = await compress(Buffer.from(JSON.stringify(node.data), 'utf8'));
  outerDb.prepare(
    'INSERT OR IGNORE INTO sages_constellations (node_id, data, compressed, timestamp, dopamine, cortisol, pinned) VALUES (?, ?, 1, ?, ?, ?, ?)'
  ).run(node.node_id, blob, node.timestamp, node.dopamine, node.cortisol, node.pinned ? 1 : 0);

  // Sync to FTS
  try {
    const content = typeof node.data === 'string' ? node.data : JSON.stringify(node.data);
    outerDb.prepare('INSERT OR IGNORE INTO sages_constellations_fts (node_id, content) VALUES (?, ?)').run(node.node_id, content);
  } catch (e) {
    console.warn('[VFS] archiveNode FTS insert failed:', e);
  }
}
