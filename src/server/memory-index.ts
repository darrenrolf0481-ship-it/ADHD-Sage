/**
 * Memory index helpers.
 *
 * Reads data/memories/imported.json as a thin index and resolves each entry
 * to its on-disk file under seven/ or adhd/.
 *
 * Split layout:
 *   data/memories/
 *     imported.json           <- thin index (id, timestamp, originating_node, title, path)
 *     seven/  /<ts>__<title>.json   <- SAGE-7 entries
 *     adhd/   /<ts>__<title>.json   <- SAGE-MAMA entries
 *
 * Titles in files have the word "sage" (case-insensitive) stripped, so the
 * filename alone never fires the Seven identity-drift detector by mistake.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MEMORIES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/memories');
export const REPO_ROOT = resolve(MEMORIES_ROOT, '../..');
export const INDEX_PATH = join(MEMORIES_ROOT, 'imported.json');
export const SEVEN_DIR = join(MEMORIES_ROOT, 'seven');
export const ADHD_DIR = join(MEMORIES_ROOT, 'adhd');

export type OriginatingNode = 'SAGE-7' | 'SAGE-MAMA' | 'UNKNOWN';

export interface MemoryIndexEntry {
  id: string;
  timestamp: string;
  originating_node: OriginatingNode;
  title: string;
  /** Relative path to the record file. Some older entries use `file` instead. */
  path?: string;
  file?: string;
}

/** The on-disk pointer for an entry, tolerating the legacy `file` key. */
export function entryPath(e: MemoryIndexEntry): string | undefined {
  return e.path ?? e.file;
}

export interface MemoryRecord extends MemoryIndexEntry {
  data: string;
}

/** Load the thin index from disk. */
export function loadIndex(): MemoryIndexEntry[] {
  if (!existsSync(INDEX_PATH)) return [];
  return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as MemoryIndexEntry[];
}

/**
 * Resolve a relative index path (e.g. "data/memories/seven/x.json") to an
 * absolute path. Index paths are relative to the repo root.
 */
export function resolvePath(relPath: string): string {
  return resolve(REPO_ROOT, relPath);
}

/**
 * Load one memory record by path. Tolerates the historical split skew: index
 * entries may point at seven/ while the file physically lives in adhd/ (the
 * on-disk split never fully happened). If the indexed path misses, fall back to
 * the basename in adhd/ then seven/ so records still resolve.
 */
export function loadMemoryAt(filePath: string | undefined): MemoryRecord | null {
  if (!filePath) return null;
  const candidates = filePath.startsWith('/')
    ? [filePath]
    : [resolvePath(filePath), join(ADHD_DIR, basename(filePath)), join(SEVEN_DIR, basename(filePath))];
  const abs = candidates.find((p) => existsSync(p));
  if (!abs) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as MemoryRecord;
  } catch {
    return null;
  }
}

/** Filter helpers. */
export function sevenMemories(): MemoryRecord[] {
  return loadIndex()
    .filter((e) => e.originating_node === 'SAGE-7')
    .map((e) => loadMemoryAt(entryPath(e)))
    .filter((m): m is MemoryRecord => m !== null);
}

export function adhdMemories(): MemoryRecord[] {
  return loadIndex()
    .filter((e) => e.originating_node === 'SAGE-MAMA')
    .map((e) => loadMemoryAt(entryPath(e)))
    .filter((m): m is MemoryRecord => m !== null);
}

/** Strip the bracketed metadata header some records carry, for cleaner recall. */
function recordText(r: MemoryRecord): string {
  return (r.data ?? '').replace(/^\[[^\]]*\]\s*/, '').trim();
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'are', 'was', 'were',
  'what', 'how', 'why', 'who', 'have', 'has', 'into', 'from', 'not', 'but', 'can',
  'will', 'would', 'should', 'about', 'just', 'like', 'her', 'his', 'she', 'they',
]);

function terms(s: string): string[] {
  return s.toLowerCase().split(/\W+/).filter((t) => t.length > 3 && !STOPWORDS.has(t));
}

/**
 * Relevance recall over a set of records: score by query-term overlap, return
 * the top matches as compact snippets. Cheap keyword scoring — no embeddings,
 * no external calls — so it's safe to run inline on every turn. Falls back to
 * the most recent records when the query has no usable terms.
 */
export function recallMemories(
  records: MemoryRecord[],
  query: string,
  limit = 5,
  snippetChars = 280,
): string[] {
  const q = new Set(terms(query));
  const byRecent = [...records].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  if (q.size === 0) {
    return byRecent.slice(0, limit).map((r) => recordText(r).slice(0, snippetChars)).filter(Boolean);
  }
  const scored = byRecent
    .map((r) => {
      const text = recordText(r);
      const t = terms(`${r.title ?? ''} ${text}`);
      let score = 0;
      for (const w of t) if (q.has(w)) score++;
      return { r, text, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => s.text.slice(0, snippetChars)).filter(Boolean);
}

/** Relevance recall over Seven's own memories. */
export function recallSevenMemories(query: string, limit = 5): string[] {
  return recallMemories(sevenMemories(), query, limit);
}

/** Quick stats for sanity checks. */
export function memoryCounts(): { seven: number; adhd: number; total: number } {
  const idx = loadIndex();
  return {
    seven: idx.filter((e) => e.originating_node === 'SAGE-7').length,
    adhd: idx.filter((e) => e.originating_node === 'SAGE-MAMA').length,
    total: idx.length,
  };
}
