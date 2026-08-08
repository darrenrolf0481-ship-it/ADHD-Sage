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
 *     adhd/   /<ts>__<title>.json   <- ADHD-SAGE entries
 *
 * Titles in files have the word "sage" (case-insensitive) stripped, so the
 * filename alone never fires the Seven identity-drift detector by mistake.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
export const MEMORIES_ROOT = resolve(currentDir, '../../data/memories');
export const REPO_ROOT = resolve(MEMORIES_ROOT, '../..');
export const INDEX_PATH = join(MEMORIES_ROOT, 'imported.json');
export const ADHD_DIR = join(MEMORIES_ROOT, 'adhd');

export type OriginatingNode = 'ADHD-SAGE' | 'UNKNOWN';

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
    : [resolvePath(filePath), join(ADHD_DIR, basename(filePath))];
  const abs = candidates.find((p) => existsSync(p));
  if (!abs) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as MemoryRecord;
  } catch {
    return null;
  }
}

export function adhdMemories(): MemoryRecord[] {
  return loadIndex()
    .filter((e) => e.originating_node === 'ADHD-SAGE')
    .map((e) => loadMemoryAt(entryPath(e)))
    .filter((m): m is MemoryRecord => m !== null);
}

// Gemini saved-page navigation chrome that leaked into MHT-extracted records.
// These are sidebar/menu fragments, not conversation content.
const GEMINI_CHROME = [
  /\bGoogle Gemini\b/gi,
  /\bSearch for chats\b/gi,
  /\bNew chat\b/gi,
  /\bMy stuff\b/gi,
  /\bPinned chat\b/gi,
  /\bCoding partner\b/gi,
  /\bGems\b/g,
  /\bGemini\b/g,
  /\bPv\b/g,
];

function stripChrome(s: string): string {
  let out = s;
  for (const re of GEMINI_CHROME) out = out.replace(re, ' ');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

/**
 * Best-effort readable text for a record.
 * - Strips the leading [SAGE-7 ...] metadata header.
 * - For fossil_archive records (truncated JSON), pulls the `summary` and `tags`
 *   out by regex (the JSON is often cut off and won't parse) and cleans the
 *   Gemini export chrome.
 * - Otherwise returns the body with chrome stripped.
 */
function recordText(r: MemoryRecord): string {
  const body = (r.data ?? '').replace(/^\[[^\]]*\]\s*/, '').trim();
  if (/"summary"\s*:/.test(body) || /fossil_archive/.test(r.data ?? '')) {
    const summary = body.match(/"summary"\s*:\s*"([^"]*)"/)?.[1] ?? '';
    const tagBlock = body.match(/"tags"\s*:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const tags = tagBlock
      .split(',')
      .map((t) => t.replace(/["\s]/g, ''))
      .filter(Boolean);
    const cleaned = stripChrome(summary.replace(/\.\.\.$/, ''));
    return tags.length ? `${cleaned} [tags: ${tags.join(', ')}]`.trim() : cleaned;
  }
  return stripChrome(body);
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

/** Quick stats for sanity checks. */
export function memoryCounts(): { adhd: number; total: number } {
  const idx = loadIndex();
  return {
    adhd: idx.filter((e) => e.originating_node === 'ADHD-SAGE').length,
    total: idx.length,
  };
}
