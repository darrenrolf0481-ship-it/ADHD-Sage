/**
 * Dedup verbatim-duplicate memory nodes in the Outer Sweep archive.
 *
 *   npx tsx scripts/dedup-archive.ts            # dry run (report only)
 *   npx tsx scripts/dedup-archive.ts --apply    # delete duplicates
 *
 * Two nodes are duplicates when their FTS text is identical (the same memory
 * imported more than once: raw vs JSON-quoted, phi_ vs adhd_ import passes).
 * One survivor is kept per group: pinned first, then highest dopamine, then
 * oldest timestamp. The survivor inherits the group's max dopamine.
 *
 * Every removed node is recorded in `archive_dedup_log` (node_id, kept_node_id,
 * provenance, timestamp, data), so nothing is lost without the .bak.
 * Removal clears: sages_constellations, sages_constellations_fts,
 * resonance_metadata and its resonance_vec row.
 *
 * Back up first: sqlite3 data/sages_constellations.db ".backup <file>"
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const APPLY = process.argv.includes('--apply');
const db = new Database('data/sages_constellations.db');
db.pragma('busy_timeout = 10000');
sqliteVec.load(db);

interface Row {
  phi_index: number;
  node_id: string;
  content: string;
  pinned: number;
  dopamine: number;
  timestamp: number;
  provenance: string | null;
  data: Buffer;
}

const rows = db
  .prepare(
    `SELECT s.phi_index, s.node_id, f.content, s.pinned, s.dopamine, s.timestamp, s.provenance, s.data
       FROM sages_constellations s
       JOIN sages_constellations_fts f ON f.node_id = s.node_id
      WHERE f.content IN (SELECT content FROM sages_constellations_fts GROUP BY content HAVING COUNT(*) > 1)`,
  )
  .all() as Row[];

const groups = new Map<string, Row[]>();
for (const r of rows) {
  const g = groups.get(r.content);
  if (g) g.push(r);
  else groups.set(r.content, [r]);
}

const plan: Array<{ keep: Row; drop: Row[]; maxDopamine: number }> = [];
for (const g of groups.values()) {
  g.sort(
    (a, b) =>
      b.pinned - a.pinned ||
      b.dopamine - a.dopamine ||
      a.timestamp - b.timestamp ||
      a.phi_index - b.phi_index,
  );
  const [keep, ...drop] = g;
  plan.push({ keep, drop, maxDopamine: Math.max(...g.map((r) => r.dopamine)) });
}

const total = db.prepare('SELECT COUNT(*) AS c FROM sages_constellations').get() as { c: number };
const dropCount = plan.reduce((n, p) => n + p.drop.length, 0);
console.log(`archive nodes: ${total.c}`);
console.log(`duplicate groups: ${plan.length}, nodes to remove: ${dropCount}, after: ${total.c - dropCount}`);
for (const p of [...plan].sort((a, b) => b.drop.length - a.drop.length).slice(0, 5)) {
  console.log(`  ${p.drop.length + 1}x keep ${p.keep.node_id}: ${p.keep.content.slice(0, 70).replace(/\s+/g, ' ')}`);
}

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to delete.');
  process.exit(0);
}

db.exec(`CREATE TABLE IF NOT EXISTS archive_dedup_log (
  node_id      TEXT PRIMARY KEY,
  kept_node_id TEXT NOT NULL,
  provenance   TEXT,
  timestamp    INTEGER,
  data         BLOB,
  removed_at   INTEGER NOT NULL
)`);

const logRemoved = db.prepare(
  'INSERT OR REPLACE INTO archive_dedup_log (node_id, kept_node_id, provenance, timestamp, data, removed_at) VALUES (?, ?, ?, ?, ?, ?)',
);
const metaRowids = db.prepare('SELECT rowid FROM resonance_metadata WHERE phi_index = ?');
const delVec = db.prepare('DELETE FROM resonance_vec WHERE rowid = ?');
const delMeta = db.prepare('DELETE FROM resonance_metadata WHERE rowid = ?');
const delFts = db.prepare('DELETE FROM sages_constellations_fts WHERE node_id = ?');
const delNode = db.prepare('DELETE FROM sages_constellations WHERE phi_index = ?');
const setDopamine = db.prepare('UPDATE sages_constellations SET dopamine = ? WHERE phi_index = ?');

const now = Date.now();
let removed = 0;
db.transaction(() => {
  for (const { keep, drop, maxDopamine } of plan) {
    if (maxDopamine > keep.dopamine) setDopamine.run(maxDopamine, keep.phi_index);
    for (const r of drop) {
      logRemoved.run(r.node_id, keep.node_id, r.provenance, r.timestamp, r.data, now);
      for (const { rowid } of metaRowids.all(r.phi_index) as Array<{ rowid: number }>) {
        delVec.run(BigInt(rowid));
        delMeta.run(rowid);
      }
      delFts.run(r.node_id);
      delNode.run(r.phi_index);
      removed++;
    }
  }
})();

const after = db.prepare('SELECT COUNT(*) AS c FROM sages_constellations').get() as { c: number };
const fts = db.prepare('SELECT COUNT(*) AS c FROM sages_constellations_fts').get() as { c: number };
const meta = db.prepare('SELECT COUNT(*) AS c FROM resonance_metadata').get() as { c: number };
console.log(`\nremoved ${removed}. archive=${after.c} fts=${fts.c} vectors=${meta.c}`);
