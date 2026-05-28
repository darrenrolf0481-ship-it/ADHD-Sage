import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { decompress } from '@mongodb-js/zstd';

// ─── Fibonacci VFS v7.5 ─────────────────────────────────────────────────────

// inner_spiral: :memory: — clear_on_startup per spec
export const innerDb = new Database(':memory:');
innerDb.exec(`
  CREATE TABLE IF NOT EXISTS inner_spiral (
    phi_index INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id   TEXT    NOT NULL UNIQUE,
    data      TEXT    NOT NULL,
    timestamp INTEGER NOT NULL,
    dopamine  REAL    NOT NULL,
    cortisol  REAL    NOT NULL,
    pinned    INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS context_buffer (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
`);

// outer_sweep: file — durable, zstd-compressed blobs
mkdirSync('data', { recursive: true });
export const outerDb = new Database('data/sages_constellations.db');
outerDb.exec(`
  CREATE TABLE IF NOT EXISTS sages_constellations (
    phi_index   INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id     TEXT    NOT NULL UNIQUE,
    data        BLOB    NOT NULL,
    compressed  INTEGER NOT NULL DEFAULT 0,
    timestamp   INTEGER NOT NULL,
    dopamine    REAL    NOT NULL,
    cortisol    REAL    NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  -- FTS5 virtual table for fast ranked search
  CREATE VIRTUAL TABLE IF NOT EXISTS sages_constellations_fts USING fts5(
    node_id UNINDEXED,
    content,
    tokenize='trigram'
  );
`);

/** Synchronize FTS5 index from the main table if it's empty */
export async function syncFts() {
  const ftsCount = (outerDb.prepare('SELECT COUNT(*) as c FROM sages_constellations_fts').get() as { c: number }).c;
  if (ftsCount > 0) return; // already synced

  console.log('[VFS] Initializing FTS5 index...');
  const rows = outerDb.prepare('SELECT node_id, data, compressed FROM sages_constellations').all() as Array<{ node_id: string; data: Buffer; compressed: number }>;

  const insert = outerDb.prepare('INSERT INTO sages_constellations_fts (node_id, content) VALUES (?, ?)');
  const transaction = outerDb.transaction((items) => {
    for (const item of items) {
      insert.run(item.node_id, item.content);
    }
  });

  const toIndex: Array<{ node_id: string; content: string }> = [];
  for (const row of rows) {
    try {
      let text: string;
      if (row.compressed) {
        text = (await decompress(row.data)).toString('utf8');
      } else {
        text = row.data.toString('utf8');
      }
      let content: string;
      try {
        const parsed = JSON.parse(text);
        content = typeof parsed.data === 'string' ? parsed.data : (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
      } catch {
        content = text;
      }
      toIndex.push({ node_id: row.node_id, content });
    } catch (e) {
      // skip corrupt nodes
    }
  }
  transaction(toIndex);
  console.log(`[VFS] FTS5 index ready: ${toIndex.length} nodes indexed`);
}

// capacity_validator: 8 == 4 index_keys * 2 slots_per_index_key
export const INNER_CAPACITY = 8;
const INNER_INDEX_KEYS = [2, 3, 5, 8];
const SLOTS_PER_KEY = 2;
console.assert(
  INNER_CAPACITY === INNER_INDEX_KEYS.length * SLOTS_PER_KEY,
  '[VFS] capacity_validator FAILED: %d !== %d * %d',
  INNER_CAPACITY, INNER_INDEX_KEYS.length, SLOTS_PER_KEY
);
