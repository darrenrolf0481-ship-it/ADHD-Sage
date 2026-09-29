/**
 * resonance-index.ts
 * SAGE_v7.5 — Semantic recall layer over the Outer Sweep archive.
 *
 * Ported from resonance_index.py (ADHD-SAGE authored).
 * Updated with sqlite-vec KNN storage (Grok v7.5_VEC).
 *
 * Embedding backends (in order of preference):
 *   1. Ollama  — local ML embeddings (384-dim normalized)
 *   2. Hashing — deterministic bag-of-words fallback (384-dim, zero deps)
 *
 * Storage backends:
 *   1. sqlite-vec — vec0 virtual table + resonance_metadata (KNN, fast)
 *   2. resonance_vectors — JSON cosine fallback (no native extension needed)
 */

import { createRequire } from 'node:module';
import { outerDb } from './db';

const EMBED_DIM = 384;

// ─── sqlite-vec load ──────────────────────────────────────────────────────────

let _vecEnabled = false;
{
  try {
    let sqliteVec: any = null;
    const metaUrl = typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : undefined;
    if (metaUrl) {
      const _require = createRequire(metaUrl);
      sqliteVec = _require('sqlite-vec');
    } else if (typeof require !== 'undefined') {
      sqliteVec = require('sqlite-vec');
    }

    if (sqliteVec) {
      sqliteVec.load(outerDb);
      _vecEnabled = true;
      console.log('[RESONANCE] sqlite-vec loaded — KNN mode active');
    } else {
      console.warn('[RESONANCE] sqlite-vec unavailable — JSON cosine fallback');
    }
  } catch (err) {
    console.warn('[RESONANCE] sqlite-vec load failed — JSON cosine fallback:', err);
  }
}

export function isVecEnabled(): boolean { return _vecEnabled; }

/**
 * Whether chat recall (recallForTurn) may use KNN hits. Off until every vector
 * shares one embedding space — a mixed hash/ollama index scores ~noise
 * (recall-eval 2026-09-29: vec hit@5 = 12%). Opt in with RECALL_SEMANTIC=1.
 */
export function isSemanticRecallReady(): boolean {
  return _vecEnabled && process.env.RECALL_SEMANTIC === '1';
}

// ─── Schema ───────────────────────────────────────────────────────────────────

// JSON fallback table — always present for backward compat
outerDb.exec(`
  CREATE TABLE IF NOT EXISTS resonance_vectors (
    phi_index    INTEGER PRIMARY KEY,
    text_content TEXT    NOT NULL,
    vector       TEXT    NOT NULL,
    thread_id    TEXT,
    task         TEXT,
    timestamp    REAL    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_resonance_thread     ON resonance_vectors(thread_id);
  CREATE INDEX IF NOT EXISTS idx_resonance_timestamp  ON resonance_vectors(timestamp);
`);

// sqlite-vec tables — only when extension loaded
if (_vecEnabled) {
  try {
    outerDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS resonance_vec
        USING vec0(embedding float[${EMBED_DIM}] distance_metric=cosine);
      CREATE TABLE IF NOT EXISTS resonance_metadata (
        rowid        INTEGER PRIMARY KEY,
        phi_index    INTEGER,
        text_content TEXT,
        thread_id    TEXT,
        task         TEXT,
        timestamp    REAL
      );
      CREATE INDEX IF NOT EXISTS idx_meta_thread     ON resonance_metadata(thread_id);
      CREATE INDEX IF NOT EXISTS idx_meta_timestamp  ON resonance_metadata(timestamp);
    `);
  } catch (e) {
    console.warn('[RESONANCE] vec0 table creation failed, falling back:', e);
    _vecEnabled = false;
  }
}

// ─── Embedding ────────────────────────────────────────────────────────────────

// Performance Optimization: Cache computed hash embeddings for frequent/repeated queries.
// Prevents redundant token splitting, Math.imul loop, array allocations, and norm reduction.
// Max cache size set to 1000 entries to prevent memory leak.
const HASH_EMBED_CACHE_LIMIT = 1000;
const hashEmbedCache = new Map<string, number[]>();

function hashEmbed(text: string): number[] {
  const cached = hashEmbedCache.get(text);
  if (cached) return cached;

  const vec = new Array<number>(EMBED_DIM).fill(0);
  const tokens = text.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    let h = 0;
    for (let i = 0; i < token.length; i++) {
      h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
    }
    vec[Math.abs(h) % EMBED_DIM] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  const result = vec.map((v) => v / norm);

  Object.freeze(result);

  if (hashEmbedCache.size >= HASH_EMBED_CACHE_LIMIT) {
    // Delete oldest entry to maintain LRU-like capacity
    const firstKey = hashEmbedCache.keys().next().value;
    if (firstKey !== undefined) {
      hashEmbedCache.delete(firstKey);
    }
  }
  hashEmbedCache.set(text, result);

  return result;
}

// Truncate or pad to EMBED_DIM and re-normalize (handles variable-dim Ollama models)
function adaptDim(vec: number[]): number[] {
  if (vec.length === EMBED_DIM) return vec;
  const adapted = vec.length > EMBED_DIM
    ? vec.slice(0, EMBED_DIM)
    : [...vec, ...new Array(EMBED_DIM - vec.length).fill(0)];
  const norm = Math.sqrt(adapted.reduce((s, v) => s + v * v, 0)) || 1;
  return adapted.map((v) => v / norm);
}

let _ollamaEmbedModel: string | null = null;
let _ollamaChecked = false;

const OLLAMA_API_BASE = process.env.OLLAMA_API_BASE ?? 'http://localhost:11434';
// Cold-loading a CPU embedding model (e.g. embeddinggemma, ~680MB) on this box
// takes well over the old 5s cap, so the first call always timed out and fell
// back to hashEmbed. Keep the model warm so recall and the query path share the
// same embedding space. Env-tunable. See OPS_LOG 2026-09-29.
const OLLAMA_EMBED_TIMEOUT_MS = Number(process.env.OLLAMA_EMBED_TIMEOUT_MS ?? 60_000);
const OLLAMA_EMBED_KEEP_ALIVE = process.env.OLLAMA_EMBED_KEEP_ALIVE ?? '30m';
// Optional explicit model pin; otherwise auto-detected by name.
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? '';

async function detectOllamaEmbedModel(apiBase: string): Promise<void> {
  if (_ollamaChecked) return;
  _ollamaChecked = true;
  if (OLLAMA_EMBED_MODEL) {
    _ollamaEmbedModel = OLLAMA_EMBED_MODEL;
    return;
  }
  try {
    const tagsRes = await fetch(`${apiBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (tagsRes.ok) {
      const data = (await tagsRes.json()) as { models?: Array<{ name: string }> };
      const embed = (data.models ?? []).find(
        (m) =>
          m.name.includes('embed') ||
          m.name.includes('nomic') ||
          m.name.includes('mxbai') ||
          m.name.includes('minilm'),
      );
      _ollamaEmbedModel = embed?.name ?? null;
      if (_ollamaEmbedModel) console.log(`[RESONANCE] Ollama embed model: ${_ollamaEmbedModel}`);
    }
  } catch {
    _ollamaEmbedModel = null;
  }
}

/** True once an Ollama embedding model has been detected/pinned. */
export function isOllamaEmbedActive(): boolean {
  return Boolean(_ollamaEmbedModel);
}

async function tryOllamaEmbed(
  text: string,
  apiBase = OLLAMA_API_BASE,
): Promise<number[] | null> {
  if (_ollamaChecked && !_ollamaEmbedModel) return null;

  try {
    await detectOllamaEmbedModel(apiBase);
    if (!_ollamaEmbedModel) return null;

    const res = await fetch(`${apiBase}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: _ollamaEmbedModel,
        prompt: text,
        keep_alive: OLLAMA_EMBED_KEEP_ALIVE,
      }),
      signal: AbortSignal.timeout(OLLAMA_EMBED_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ? adaptDim(data.embedding) : null;
  } catch {
    return null;
  }
}

export async function embed(text: string): Promise<number[]> {
  const ollama = await tryOllamaEmbed(text);
  return ollama ?? hashEmbed(text);
}

// ─── Similarity (JSON fallback) ───────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string): string {
  return text.length > 120 ? text.slice(0, 120) + '...' : text;
}

function resonanceLabel(score: number): 'high' | 'medium' | 'low' {
  return score > 0.65 ? 'high' : score > 0.4 ? 'medium' : 'low';
}

// ─── Prepared statements ──────────────────────────────────────────────────────

// JSON fallback
const _insertVector = outerDb.prepare(`
  INSERT OR REPLACE INTO resonance_vectors
    (phi_index, text_content, vector, thread_id, task, timestamp)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const _fetchAll = outerDb.prepare(
  'SELECT phi_index, text_content, vector, thread_id FROM resonance_vectors',
);
const _fetchByThread = outerDb.prepare(
  'SELECT phi_index, text_content, vector, thread_id FROM resonance_vectors WHERE thread_id = ?',
);
const _fetchThreadJson = outerDb.prepare(
  'SELECT phi_index, text_content, timestamp FROM resonance_vectors WHERE thread_id = ? ORDER BY timestamp ASC',
);

// sqlite-vec (only prepared when extension is loaded — avoids errors on missing tables)
// Metadata row is inserted FIRST and owns the rowid; the vec0 row is written
// with that exact rowid. Previously vec0 picked its own rowid and metadata was
// INSERT OR REPLACE'd onto it — once the two sequences drifted (2026-09 restore
// wrote 3369 metadata rows but only 2299 vectors), every new memory silently
// overwrote an older memory's metadata. See OPS_LOG 2026-09-29.
const _metaInsert = _vecEnabled
  ? outerDb.prepare(
      'INSERT INTO resonance_metadata (phi_index, text_content, thread_id, task, timestamp) VALUES (?, ?, ?, ?, ?)',
    )
  : null;
const _vecInsert = _vecEnabled
  ? outerDb.prepare('INSERT INTO resonance_vec (rowid, embedding) VALUES (?, ?)')
  : null;
const _metaRowidsForPhi = _vecEnabled
  ? outerDb.prepare('SELECT rowid FROM resonance_metadata WHERE phi_index = ?')
  : null;
const _metaDelete = _vecEnabled
  ? outerDb.prepare('DELETE FROM resonance_metadata WHERE rowid = ?')
  : null;
const _vecDelete = _vecEnabled
  ? outerDb.prepare('DELETE FROM resonance_vec WHERE rowid = ?')
  : null;
const _vecRecallAll = _vecEnabled
  ? outerDb.prepare(`
      SELECT m.phi_index, m.text_content, m.thread_id,
             vec_distance_cosine(v.embedding, ?) as distance
      FROM resonance_vec v
      JOIN resonance_metadata m ON v.rowid = m.rowid
      ORDER BY distance ASC
      LIMIT ?
    `)
  : null;
const _vecRecallByThread = _vecEnabled
  ? outerDb.prepare(`
      SELECT m.phi_index, m.text_content, m.thread_id,
             vec_distance_cosine(v.embedding, ?) as distance
      FROM resonance_vec v
      JOIN resonance_metadata m ON v.rowid = m.rowid
      WHERE m.thread_id = ?
      ORDER BY distance ASC
      LIMIT ?
    `)
  : null;
const _vecFetchThread = _vecEnabled
  ? outerDb.prepare(
      'SELECT phi_index, text_content, timestamp FROM resonance_metadata WHERE thread_id = ? ORDER BY timestamp ASC',
    )
  : null;

// ─── Index ────────────────────────────────────────────────────────────────────

/** Removes every vector + metadata row for a node. Call inside a transaction. */
function unindexPhi(phi_index: number): void {
  if (!_metaRowidsForPhi || !_metaDelete || !_vecDelete) return;
  const rows = _metaRowidsForPhi.all(phi_index) as Array<{ rowid: number }>;
  for (const { rowid } of rows) {
    _vecDelete.run(BigInt(rowid));
    _metaDelete.run(rowid);
  }
}

export async function indexNode(
  phi_index: number,
  text: string,
  thread_id?: string,
  task?: string,
): Promise<void> {
  const vec = await embed(text);

  if (_vecEnabled && _vecInsert && _metaInsert) {
    const floatArr = new Float32Array(vec);
    const transaction = outerDb.transaction(() => {
      // Re-indexing a node replaces its previous vectors instead of stacking duplicates.
      unindexPhi(phi_index);
      const result = _metaInsert.run(phi_index, text, thread_id ?? null, task ?? null, Date.now());
      _vecInsert.run(BigInt(result.lastInsertRowid), floatArr);
    });
    transaction();
  } else {
    _insertVector.run(phi_index, text, JSON.stringify(vec), thread_id ?? null, task ?? null, Date.now());
  }
}

// ─── Recall ───────────────────────────────────────────────────────────────────

export interface ResonanceHit {
  phi_index: number;
  score: number;
  text: string;
  thread_id: string | null;
  resonance: 'high' | 'medium' | 'low';
}

const DUP_OVERFETCH = 4;

/** Keeps the first (closest) row for each distinct text, up to `limit`. */
function dedupeByText<T extends { text_content: string }>(rows: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.text_content)) continue;
    seen.add(r.text_content);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export async function recall(
  query: string,
  top_k = 5,
  thread_id?: string,
): Promise<ResonanceHit[]> {
  if (_vecEnabled && _vecRecallAll && _vecRecallByThread) {
    const qVec = new Float32Array(await embed(query));
    // Over-fetch: ~half the archive is verbatim duplicates across node_ids
    // (multi-source imports), which would otherwise fill every top_k slot.
    const fetchK = top_k * DUP_OVERFETCH;
    const rows = dedupeByText(
      (thread_id
        ? _vecRecallByThread.all(qVec, thread_id, fetchK)
        : _vecRecallAll.all(qVec, fetchK)) as Array<{ text_content: string }>,
      top_k,
    ) as Array<{
      phi_index: number;
      text_content: string;
      thread_id: string | null;
      distance: number;
    }>;

    return rows.map((r) => {
      const score = Math.max(0, Math.min(1, 1.0 - r.distance));
      return {
        phi_index: r.phi_index,
        score: Math.round(score * 10_000) / 10_000,
        text: truncate(r.text_content),
        thread_id: r.thread_id,
        resonance: resonanceLabel(score),
      };
    });
  }

  // JSON cosine fallback
  const q_vec = await embed(query);
  const rows = (
    thread_id ? _fetchByThread.all(thread_id) : _fetchAll.all()
  ) as Array<{
    phi_index: number;
    text_content: string;
    vector: string;
    thread_id: string | null;
  }>;

  const scored: ResonanceHit[] = rows.map((row) => {
    const score = cosineSimilarity(q_vec, JSON.parse(row.vector) as number[]);
    return {
      phi_index: row.phi_index,
      score: Math.round(score * 10_000) / 10_000,
      text: truncate(row.text_content),
      thread_id: row.thread_id,
      resonance: resonanceLabel(score),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  return scored.filter((h) => !seen.has(h.text) && seen.add(h.text)).slice(0, top_k);
}

// ─── Thread replay ─────────────────────────────────────────────────────────────

export function recallThread(
  thread_id: string,
): Array<{ phi_index: number; text: string; timestamp: number }> {
  const stmt = _vecEnabled && _vecFetchThread ? _vecFetchThread : _fetchThreadJson;
  return (
    stmt.all(thread_id) as Array<{
      phi_index: number;
      text_content: string;
      timestamp: number;
    }>
  ).map((r) => ({ phi_index: r.phi_index, text: r.text_content, timestamp: r.timestamp }));
}

// ─── Startup Backfill ─────────────────────────────────────────────────────────

/**
 * Indexes all existing outer_sweep nodes that don't yet have resonance vectors.
 * Runs at startup in the background — non-blocking, batched so Ollama isn't
 * slammed all at once. Safe to call multiple times (skips already-indexed nodes).
 */
/**
 * Repairs drift between resonance_vec and resonance_metadata so the backfill
 * below sees the true set of unindexed nodes:
 *   - metadata rows with no vector (invisible to KNN recall)
 *   - vectors with no metadata (unreachable)
 *   - metadata for nodes that no longer exist (e.g. replaced Morning Light anchors)
 *   - duplicate metadata for one node (keeps the newest)
 */
export function healResonanceIndex(): Record<string, number> {
  if (!_vecEnabled) return {};
  const vecRowids = new Set(
    (outerDb.prepare('SELECT rowid FROM resonance_vec').all() as Array<{ rowid: number }>)
      .map((r) => Number(r.rowid)),
  );
  const meta = outerDb
    .prepare(
      `SELECT m.rowid, m.phi_index, (sc.phi_index IS NOT NULL) AS live
       FROM resonance_metadata m
       LEFT JOIN sages_constellations sc ON sc.phi_index = m.phi_index
       ORDER BY m.rowid DESC`,
    )
    .all() as Array<{ rowid: number; phi_index: number; live: number }>;

  const stats = { noVector: 0, orphanNode: 0, duplicate: 0, danglingVector: 0 };
  const seenPhi = new Set<number>();
  const metaRowids = new Set<number>();
  const dropMeta: number[] = [];
  for (const m of meta) {
    if (!vecRowids.has(m.rowid)) { stats.noVector++; dropMeta.push(m.rowid); continue; }
    if (!m.live) { stats.orphanNode++; dropMeta.push(m.rowid); continue; }
    if (seenPhi.has(m.phi_index)) { stats.duplicate++; dropMeta.push(m.rowid); continue; }
    seenPhi.add(m.phi_index);
    metaRowids.add(m.rowid);
  }
  const dropVec = [...vecRowids].filter((r) => !metaRowids.has(r));
  stats.danglingVector = dropVec.filter((r) => !dropMeta.includes(r)).length;

  if (dropMeta.length || dropVec.length) {
    outerDb.transaction(() => {
      for (const r of dropMeta) _metaDelete!.run(r);
      for (const r of dropVec) _vecDelete!.run(BigInt(r));
    })();
    console.log('[RESONANCE] Healed index drift:', JSON.stringify(stats));
  }
  return stats;
}

export async function syncResonance(): Promise<void> {
  const { decompress } = await import('@mongodb-js/zstd');

  try {
    healResonanceIndex();
  } catch (e) {
    console.warn('[RESONANCE] Index heal failed (continuing with backfill):', e);
  }

  // Check against whichever storage is active
  const alreadyIndexedQuery = _vecEnabled
    ? `SELECT sc.phi_index, sc.data, sc.compressed
       FROM sages_constellations sc
       LEFT JOIN resonance_metadata rm ON rm.phi_index = sc.phi_index
       WHERE rm.phi_index IS NULL
       ORDER BY sc.phi_index ASC`
    : `SELECT sc.phi_index, sc.data, sc.compressed
       FROM sages_constellations sc
       LEFT JOIN resonance_vectors rv ON rv.phi_index = sc.phi_index
       WHERE rv.phi_index IS NULL
       ORDER BY sc.phi_index ASC`;

  const unindexed = outerDb.prepare(alreadyIndexedQuery).all() as Array<{
    phi_index: number;
    data: Buffer;
    compressed: number;
  }>;

  if (unindexed.length === 0) {
    console.log('[RESONANCE] Backfill: all nodes already indexed.');
    return;
  }

  console.log(`[RESONANCE] Backfill: indexing ${unindexed.length} existing outer_sweep nodes...`);

  const BATCH = 50;
  let done = 0;

  for (let i = 0; i < unindexed.length; i += BATCH) {
    const batch = unindexed.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (row) => {
        try {
          let text: string;
          if (row.compressed) {
            text = (await decompress(row.data)).toString('utf8');
          } else {
            text = row.data.toString('utf8');
          }
          let content: string;
          try {
            const parsed = JSON.parse(text) as unknown;
            if (
              parsed &&
              typeof parsed === 'object' &&
              'data' in parsed &&
              typeof (parsed as Record<string, unknown>).data === 'string'
            ) {
              content = (parsed as Record<string, unknown>).data as string;
            } else if (typeof parsed === 'string') {
              content = parsed;
            } else {
              content = JSON.stringify(parsed);
            }
          } catch {
            content = text;
          }
          await indexNode(row.phi_index, content);
          done++;
        } catch (e) {
          console.warn(`[RESONANCE] Backfill: skipped phi_index=${row.phi_index}:`, e);
        }
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`[RESONANCE] Backfill complete: ${done}/${unindexed.length} nodes indexed.`);
}

// ─── Full Rebuild (re-embed every node) ─────────────────────────────────────────

export interface RebuildProgress {
  running: boolean;
  total: number;
  done: number;
  skipped: number;
  backend: 'ollama' | 'hash' | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

const _rebuildState: RebuildProgress = {
  running: false,
  total: 0,
  done: 0,
  skipped: 0,
  backend: null,
  startedAt: null,
  finishedAt: null,
  error: null,
};

export function getRebuildProgress(): RebuildProgress {
  return { ..._rebuildState };
}

function extractContent(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'data' in parsed &&
      typeof (parsed as Record<string, unknown>).data === 'string'
    ) {
      return (parsed as Record<string, unknown>).data as string;
    }
    if (typeof parsed === 'string') return parsed;
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

/**
 * Re-embeds EVERY node so all vectors share one embedding space. Needed after
 * switching embedding backend (e.g. hashEmbed → Ollama/embeddinggemma): the old
 * vectors live in a different space and would poison KNN recall.
 *
 * Uses indexNode() per node, which replaces that node's own vector rows
 * (unindexPhi) — no bulk table wipe. Sequential + throttled to stay gentle on a
 * CPU-only, memory-pressured host. Refuses to run on the hashEmbed fallback
 * (unless forceHash) so a dead Ollama can't silently re-poison the index.
 */
export async function rebuildAllResonance(opts: { forceHash?: boolean } = {}): Promise<RebuildProgress> {
  if (_rebuildState.running) return getRebuildProgress();
  if (!_vecEnabled) {
    _rebuildState.error = 'sqlite-vec not enabled';
    return getRebuildProgress();
  }

  const { decompress } = await import('@mongodb-js/zstd');

  // Warm up + confirm which backend we'll actually use before touching anything.
  await embed('resonance rebuild backend probe');
  const backend: 'ollama' | 'hash' = isOllamaEmbedActive() ? 'ollama' : 'hash';
  if (backend === 'hash' && !opts.forceHash) {
    _rebuildState.error =
      'Ollama embed model not active — refusing to rebuild with hashEmbed (pass forceHash to override).';
    console.warn(`[RESONANCE] Rebuild aborted: ${_rebuildState.error}`);
    return getRebuildProgress();
  }

  const rows = outerDb
    .prepare('SELECT phi_index, data, compressed FROM sages_constellations ORDER BY phi_index ASC')
    .all() as Array<{ phi_index: number; data: Buffer; compressed: number }>;

  Object.assign(_rebuildState, {
    running: true,
    total: rows.length,
    done: 0,
    skipped: 0,
    backend,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  });
  console.log(`[RESONANCE] Full rebuild started: ${rows.length} nodes via ${backend}.`);

  try {
    for (const row of rows) {
      try {
        const text = row.compressed
          ? (await decompress(row.data)).toString('utf8')
          : row.data.toString('utf8');
        await indexNode(row.phi_index, extractContent(text));
        _rebuildState.done++;
      } catch (e) {
        _rebuildState.skipped++;
        console.warn(`[RESONANCE] Rebuild: skipped phi_index=${row.phi_index}:`, e);
      }
      if ((_rebuildState.done + _rebuildState.skipped) % 250 === 0) {
        console.log(
          `[RESONANCE] Rebuild progress: ${_rebuildState.done}/${rows.length} (skipped ${_rebuildState.skipped})`,
        );
      }
      // Gentle throttle so the CPU box isn't pinned at 100% for the whole run.
      await new Promise((r) => setTimeout(r, 10));
    }
  } finally {
    _rebuildState.running = false;
    _rebuildState.finishedAt = Date.now();
  }
  console.log(
    `[RESONANCE] Full rebuild complete: ${_rebuildState.done}/${rows.length} via ${backend} (skipped ${_rebuildState.skipped}).`,
  );
  return getRebuildProgress();
}
