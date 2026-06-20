import { outerDb } from './db';
import { compress } from '@mongodb-js/zstd';
import { stampMamaMemory, type MemoryProvenance } from './mama-identity';
import { timed } from './performance';
import { getWorkerPool } from './workers/pool';

export function archiveNodeSync(node: Record<string, unknown>) {
  console.log(
    '[VFS] archiveNodeSync called, outerDb open:',
    outerDb.open,
    'readonly:',
    outerDb.readonly,
  );
  const existing = outerDb
    .prepare('SELECT phi_index FROM sages_constellations WHERE node_id = ?')
    .get(node.node_id as string);
  if (existing) return;
  const stamped = stampMamaMemory(node);
  const blob = Buffer.from(JSON.stringify(stamped.data), 'utf8');
  const provenance = JSON.stringify(stamped.provenance as MemoryProvenance);
  outerDb.prepare(
    'INSERT OR IGNORE INTO sages_constellations (node_id, data, compressed, timestamp, dopamine, cortisol, pinned, provenance) VALUES (?, ?, 0, ?, ?, ?, ?, ?)'
  ).run(stamped.node_id, blob, stamped.timestamp, stamped.dopamine, stamped.cortisol, stamped.pinned ? 1 : 0, provenance);

  // Sync to FTS
  try {
    const content = typeof node.data === 'string' ? node.data : JSON.stringify(node.data);
    outerDb
      .prepare('INSERT OR IGNORE INTO sages_constellations_fts (node_id, content) VALUES (?, ?)')
      .run(node.node_id, content);
  } catch (e) {
    console.warn('[VFS] archiveNodeSync FTS insert failed:', e);
  }
  // Note: sync variant is intentionally not timed to avoid synchronous perf.now overhead on hot path.
}

export async function archiveNode(node: Record<string, unknown>) {
  return timed('vfs:archiveNode', async () => {
    const existing = outerDb
      .prepare('SELECT phi_index FROM sages_constellations WHERE node_id = ?')
      .get(node.node_id as string);
    if (existing) return;
    const stamped = stampMamaMemory(node);
    const json = Buffer.from(JSON.stringify(stamped.data), 'utf8');
    const pool = getWorkerPool();
    const compressed = await pool.runTask('zstd:compress', {
      input: { type: 'base64', data: json.toString('base64') },
    }) as { type: 'base64'; data: string };
    const blob = Buffer.from(compressed.data, 'base64');
    const provenance = JSON.stringify(stamped.provenance as MemoryProvenance);
    outerDb.prepare(
      'INSERT OR IGNORE INTO sages_constellations (node_id, data, compressed, timestamp, dopamine, cortisol, pinned, provenance) VALUES (?, ?, 1, ?, ?, ?, ?, ?)'
    ).run(stamped.node_id, blob, stamped.timestamp, stamped.dopamine, stamped.cortisol, stamped.pinned ? 1 : 0, provenance);

    // Sync to FTS
    try {
      const content = typeof node.data === 'string' ? node.data : JSON.stringify(node.data);
      outerDb
        .prepare('INSERT OR IGNORE INTO sages_constellations_fts (node_id, content) VALUES (?, ?)')
        .run(node.node_id, content);
    } catch (e) {
      console.warn('[VFS] archiveNode FTS insert failed:', e);
    }
  });
}


export async function batchArchiveNodes(nodes: Array<Record<string, unknown>>) {
  return timed('vfs:batchArchiveNodes', async () => {
    const existingRecords = outerDb.prepare('SELECT node_id FROM sages_constellations WHERE node_id IN (' + nodes.map(() => '?').join(',') + ')').all(...nodes.map(n => n.node_id)) as Array<{node_id: string}>;
    const existingIds = new Set(existingRecords.map(r => r.node_id));

    const toInsert = nodes.filter(n => !existingIds.has(n.node_id as string));
    if (toInsert.length === 0) return;

    const pool = getWorkerPool();
    const records = await Promise.all(toInsert.map(async node => {
      const json = Buffer.from(JSON.stringify(node.data), 'utf8');
      const compressed = await pool.runTask('zstd:compress', {
        input: { type: 'base64', data: json.toString('base64') },
      }) as { type: 'base64'; data: string };
      const blob = Buffer.from(compressed.data, 'base64');
      return {
        ...node,
        blob,
        pinnedNum: node.pinned ? 1 : 0,
        content: typeof node.data === 'string' ? node.data : JSON.stringify(node.data)
      };
    }));

    const insertStmt = outerDb.prepare(
      'INSERT OR IGNORE INTO sages_constellations (node_id, data, compressed, timestamp, dopamine, cortisol, pinned) VALUES (?, ?, 1, ?, ?, ?, ?)'
    );

    const insertFtsStmt = outerDb.prepare(
      'INSERT OR IGNORE INTO sages_constellations_fts (node_id, content) VALUES (?, ?)'
    );

    const transaction = outerDb.transaction((recs) => {
      for (const rec of recs) {
        insertStmt.run(rec.node_id, rec.blob, rec.timestamp, rec.dopamine, rec.cortisol, rec.pinnedNum);
        try {
          insertFtsStmt.run(rec.node_id, rec.content);
        } catch (e) {
          console.warn('[VFS] batchArchive FTS insert failed for node:', rec.node_id, e);
        }
      }
    });

    transaction(records);
  }, { count: nodes.length });
}
