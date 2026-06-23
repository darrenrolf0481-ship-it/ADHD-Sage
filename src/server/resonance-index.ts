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
  const _require = createRequire(import.meta.url);
  try {
    const sqliteVec = _require('sqlite-vec') as { load: (db: unknown) => void };
    sqliteVec.load(outerDb);
    _vecEnabled = true;
    console.log('[RESONANCE] sqlite-vec loaded — KNN mode active');
  } catch {
    console.warn('[RESONANCE] sqlite-vec unavailable — JSON cosine fallback');
  }
}

export function isVecEnabled(): boolean { return _vecEnabled; }

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

function hashEmbed(text: string): number[] {
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
  return vec.map((v) => v / norm);
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

async function tryOllamaEmbed(
  text: string,
  apiBase = 'http://localhost:11434',
): Promise<number[] | null> {
  if (_ollamaChecked && !_ollamaEmbedModel) return null;

  try {
    if (!_ollamaChecked) {
      _ollamaChecked = true;
      const tagsRes = await fetch(`${apiBase}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
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
      }
    }
    if (!_ollamaEmbedModel) return null;

    const res = await fetch(`${apiBase}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: _ollamaEmbedModel, prompt: text }),
      signal: AbortSignal.timeout(5000),
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
const _vecInsert = _vecEnabled
  ? outerDb.prepare('INSERT INTO resonance_vec (embedding) VALUES (?)')
  : null;
const _metaInsert = _vecEnabled
  ? outerDb.prepare(
      'INSERT INTO resonance_metadata (rowid, phi_index, text_content, thread_id, task, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    )
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

export async function indexNode(
  phi_index: number,
  text: string,
  thread_id?: string,
  task?: string,
): Promise<void> {
  const vec = await embed(text);

  if (_vecEnabled && _vecInsert && _metaInsert) {
    const floatArr = new Float32Array(vec);
    const result = _vecInsert.run(floatArr);
    const rowid = Number(result.lastInsertRowid);
    _metaInsert.run(rowid, phi_index, text, thread_id ?? null, task ?? null, Date.now());
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

export async function recall(
  query: string,
  top_k = 5,
  thread_id?: string,
): Promise<ResonanceHit[]> {
  if (_vecEnabled && _vecRecallAll && _vecRecallByThread) {
    const qVec = new Float32Array(await embed(query));
    const rows = (
      thread_id
        ? _vecRecallByThread.all(qVec, thread_id, top_k)
        : _vecRecallAll.all(qVec, top_k)
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
  return scored.slice(0, top_k);
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
export async function syncResonance(): Promise<void> {
  const { decompress } = await import('@mongodb-js/zstd');

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
