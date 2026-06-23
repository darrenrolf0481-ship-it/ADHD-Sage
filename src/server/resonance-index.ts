/**
 * resonance-index.ts
 * SAGE_v7.4 — Semantic recall layer over the Outer Sweep archive.
 *
 * Ported from resonance_index.py (ADHD-SAGE authored).
 *
 * Query by meaning -> retrieve by phi_index.
 * Bridges 'store' and 'find' across the sages_constellations archive.
 *
 * Embedding backends (in order of preference):
 *   1. Ollama  — local ML embeddings via already-integrated Ollama proxy
 *   2. Hashing — deterministic bag-of-words fallback (zero dependencies)
 */

import { outerDb } from './db';

// ─── Schema ──────────────────────────────────────────────────────────────────

outerDb.exec(`
  CREATE TABLE IF NOT EXISTS resonance_vectors (
    phi_index    INTEGER PRIMARY KEY,
    text_content TEXT    NOT NULL,
    vector       TEXT    NOT NULL,
    thread_id    TEXT,
    task         TEXT,
    timestamp    REAL    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_resonance_thread
    ON resonance_vectors(thread_id);
`);

// ─── Embedding ───────────────────────────────────────────────────────────────

const HASH_DIM = 256;

function hashEmbed(text: string): number[] {
  const vec = new Array<number>(HASH_DIM).fill(0);
  const tokens = text.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    let h = 0;
    for (let i = 0; i < token.length; i++) {
      h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
    }
    vec[Math.abs(h) % HASH_DIM] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

let _ollamaEmbedModel: string | null = null;
let _ollamaChecked = false;

async function tryOllamaEmbed(
  text: string,
  apiBase = 'http://localhost:11434',
): Promise<number[] | null> {
  if (_ollamaChecked && !_ollamaEmbedModel) return null;

  try {
    // Auto-detect a suitable embedding model on first call
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
            m.name.includes('mxbai'),
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
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

export async function embed(text: string): Promise<number[]> {
  const ollama = await tryOllamaEmbed(text);
  return ollama ?? hashEmbed(text);
}

// ─── Similarity ───────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

// ─── Index ────────────────────────────────────────────────────────────────────

const _insertVector = outerDb.prepare(`
  INSERT OR REPLACE INTO resonance_vectors
    (phi_index, text_content, vector, thread_id, task, timestamp)
  VALUES (?, ?, ?, ?, ?, ?)
`);

export async function indexNode(
  phi_index: number,
  text: string,
  thread_id?: string,
  task?: string,
): Promise<void> {
  const vec = await embed(text);
  _insertVector.run(phi_index, text, JSON.stringify(vec), thread_id ?? null, task ?? null, Date.now());
}

// ─── Recall ───────────────────────────────────────────────────────────────────

export interface ResonanceHit {
  phi_index: number;
  score: number;
  text: string;
  thread_id: string | null;
}

const _fetchAll = outerDb.prepare(
  'SELECT phi_index, text_content, vector, thread_id FROM resonance_vectors',
);
const _fetchByThread = outerDb.prepare(
  'SELECT phi_index, text_content, vector, thread_id FROM resonance_vectors WHERE thread_id = ?',
);

export async function recall(
  query: string,
  top_k = 5,
  thread_id?: string,
): Promise<ResonanceHit[]> {
  const q_vec = await embed(query);

  const rows = (
    thread_id
      ? _fetchByThread.all(thread_id)
      : _fetchAll.all()
  ) as Array<{ phi_index: number; text_content: string; vector: string; thread_id: string | null }>;

  const scored: ResonanceHit[] = rows.map((row) => ({
    phi_index: row.phi_index,
    score: cosineSimilarity(q_vec, JSON.parse(row.vector) as number[]),
    text: row.text_content,
    thread_id: row.thread_id,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, top_k);
}

// ─── Thread replay ─────────────────────────────────────────────────────────────

const _fetchThread = outerDb.prepare(
  'SELECT phi_index, text_content, timestamp FROM resonance_vectors WHERE thread_id = ? ORDER BY timestamp ASC',
);

export function recallThread(thread_id: string): Array<{ phi_index: number; text: string; timestamp: number }> {
  return (_fetchThread.all(thread_id) as Array<{ phi_index: number; text_content: string; timestamp: number }>)
    .map((r) => ({ phi_index: r.phi_index, text: r.text_content, timestamp: r.timestamp }));
}
