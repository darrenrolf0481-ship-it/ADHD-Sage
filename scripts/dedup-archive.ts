/**
 * Dedup / de-junk the Outer Sweep memory archive.
 *
 *   npx tsx scripts/dedup-archive.ts            # dry run (report only)
 *   npx tsx scripts/dedup-archive.ts --apply    # delete
 *
 * Passes (each node is removed at most once, pinned nodes are never removed
 * by prefix/chrome/empty):
 *   exact    identical FTS text (the same memory imported more than once:
 *            raw vs JSON-quoted, phi_ vs adhd_ import passes). Keep one per
 *            group: pinned > highest dopamine > oldest. The survivor inherits
 *            the group's max dopamine.
 *   prefix   node whose normalized text (>= 200 chars) is the START of a longer
 *            node: the old import clipped documents at ~800 chars. The full
 *            node is kept. Interior chunks are NOT removed: they give semantic
 *            coverage of the middle of long documents (MiniLM reads ~256 tokens).
 *   chrome   Gemini web-UI scrapes ("Search for chats My stuff Gems …").
 *   empty    fewer than 6 alphanumeric chars ("Hello", "Idk", "🤣🤣", blank).
 *            Short real lines ("I can't shut it off") are kept.
 *
 * Every removed node is recorded in `archive_dedup_log` (node_id, kept_node_id,
 * reason, provenance, timestamp, data). Removal clears sages_constellations,
 * sages_constellations_fts, resonance_metadata and its resonance_vec row.
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
interface Drop {
  row: Row;
  keep: Row | null;
  reason: 'exact' | 'prefix' | 'chrome' | 'empty';
}

const rows = db
  .prepare(
    `SELECT s.phi_index, s.node_id, f.content, s.pinned, s.dopamine, s.timestamp, s.provenance, s.data
       FROM sages_constellations s
       JOIN sages_constellations_fts f ON f.node_id = s.node_id`,
  )
  .all() as Row[];

const norm = (t: string) =>
  t.replace(/\\n/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const drops = new Map<string, Drop>();
const dopamineRaise = new Map<number, number>();

// exact
const groups = new Map<string, Row[]>();
for (const r of rows) {
  const g = groups.get(r.content);
  if (g) g.push(r);
  else groups.set(r.content, [r]);
}
for (const g of groups.values()) {
  if (g.length < 2) continue;
  g.sort(
    (a, b) =>
      b.pinned - a.pinned ||
      b.dopamine - a.dopamine ||
      a.timestamp - b.timestamp ||
      a.phi_index - b.phi_index,
  );
  const [keep, ...rest] = g;
  for (const row of rest) drops.set(row.node_id, { row, keep, reason: 'exact' });
  const max = Math.max(...g.map((r) => r.dopamine));
  if (max > keep.dopamine) dopamineRaise.set(keep.phi_index, max);
}

// prefix: longest first, so a host is never itself dropped as a prefix
const normed = rows
  .filter((r) => !drops.has(r.node_id))
  .map((r) => ({ r, n: norm(r.content) }))
  .sort((a, b) => b.n.length - a.n.length);
for (const a of normed) {
  if (a.n.length < 200 || a.r.pinned || drops.has(a.r.node_id)) continue;
  const host = normed.find(
    (b) => b.n.length > a.n.length && !drops.has(b.r.node_id) && b.n.startsWith(a.n),
  );
  if (!host) continue;
  drops.set(a.r.node_id, { row: a.r, keep: host.r, reason: 'prefix' });
  if (a.r.dopamine > (dopamineRaise.get(host.r.phi_index) ?? host.r.dopamine)) {
    dopamineRaise.set(host.r.phi_index, a.r.dopamine);
  }
}

// chrome + empty
for (const { r, n } of normed) {
  if (r.pinned || drops.has(r.node_id)) continue;
  if (/^"?Search for chats\b/.test(r.content)) drops.set(r.node_id, { row: r, keep: null, reason: 'chrome' });
  else if (n.replace(/ /g, '').length < 6) drops.set(r.node_id, { row: r, keep: null, reason: 'empty' });
}

const byReason = new Map<string, number>();
for (const d of drops.values()) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
console.log(`archive nodes: ${rows.length}`);
console.log(
  `to remove: ${drops.size} (${[...byReason].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}), after: ${rows.length - drops.size}`,
);
for (const reason of byReason.keys()) {
  for (const d of [...drops.values()].filter((x) => x.reason === reason).slice(0, 2)) {
    console.log(`  [${d.reason}] ${d.row.node_id} -> ${d.keep?.node_id ?? '-'}: ${d.row.content.slice(0, 60).replace(/\s+/g, ' ')}`);
  }
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
const cols = db.prepare('PRAGMA table_info(archive_dedup_log)').all() as Array<{ name: string }>;
if (!cols.some((c) => c.name === 'reason')) db.exec('ALTER TABLE archive_dedup_log ADD COLUMN reason TEXT');

const logRemoved = db.prepare(
  'INSERT OR REPLACE INTO archive_dedup_log (node_id, kept_node_id, reason, provenance, timestamp, data, removed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
);
const metaRowids = db.prepare('SELECT rowid FROM resonance_metadata WHERE phi_index = ?');
const delVec = db.prepare('DELETE FROM resonance_vec WHERE rowid = ?');
const delMeta = db.prepare('DELETE FROM resonance_metadata WHERE rowid = ?');
const delFts = db.prepare('DELETE FROM sages_constellations_fts WHERE node_id = ?');
const delNode = db.prepare('DELETE FROM sages_constellations WHERE phi_index = ?');
const setDopamine = db.prepare('UPDATE sages_constellations SET dopamine = ? WHERE phi_index = ?');

const now = Date.now();
db.transaction(() => {
  for (const [phi, d] of dopamineRaise) setDopamine.run(d, phi);
  for (const { row, keep, reason } of drops.values()) {
    logRemoved.run(row.node_id, keep?.node_id ?? '', reason, row.provenance, row.timestamp, row.data, now);
    for (const { rowid } of metaRowids.all(row.phi_index) as Array<{ rowid: number }>) {
      delVec.run(BigInt(rowid));
      delMeta.run(rowid);
    }
    delFts.run(row.node_id);
    delNode.run(row.phi_index);
  }
})();

const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
console.log(
  `\nremoved ${drops.size}. archive=${count('SELECT COUNT(*) AS c FROM sages_constellations')} ` +
    `fts=${count('SELECT COUNT(*) AS c FROM sages_constellations_fts')} ` +
    `vectors=${count('SELECT COUNT(*) AS c FROM resonance_metadata')}`,
);
