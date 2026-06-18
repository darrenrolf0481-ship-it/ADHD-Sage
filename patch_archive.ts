import { readFileSync, writeFileSync } from 'fs';

const archivePath = 'src/server/archive.ts';
let archiveContent = readFileSync(archivePath, 'utf8');

// The Python logic provided says:
// "Batch archive multiple nodes in one transaction. FIXED: N+1 eliminated."
// Let's add batchArchive to archive.ts

const batchArchiveCode = `
export async function batchArchiveNodes(nodes: Array<Record<string, unknown>>) {
  const existingRecords = outerDb.prepare('SELECT node_id FROM sages_constellations WHERE node_id IN (' + nodes.map(() => '?').join(',') + ')').all(...nodes.map(n => n.node_id)) as Array<{node_id: string}>;
  const existingIds = new Set(existingRecords.map(r => r.node_id));

  const toInsert = nodes.filter(n => !existingIds.has(n.node_id as string));
  if (toInsert.length === 0) return;

  const records = await Promise.all(toInsert.map(async node => {
    const blob = await compress(Buffer.from(JSON.stringify(node.data), 'utf8'));
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
}
`;

archiveContent += '\n' + batchArchiveCode;

writeFileSync(archivePath, archiveContent);
console.log('Patched archive.ts');
