import { outerDb } from './db';
import { decompress } from '@mongodb-js/zstd';

// Greeting / low-signal queries carry no retrieval intent. Firing recall on a
// bare "hello" surfaces whatever fossil happens to contain "hi"/"hello" — often
// SAGE-7 bridge smoke-tests — which the model then parrots. That is the
// "dumps memories on hello" bug. Skip recall entirely for these.
const GREETING_RE =
  /^\s*(h+i+|h+e+y+|h+e+l+o+|hell?o+|yo+|hola|sup|wsup|wassup|howdy|hiya|hey+a|good\s*(morning|afternoon|evening|night)|greetings|gm|gn)[\s!.,?…]*$/i;

export function isLowSignalQuery(query: string): boolean {
  const s = (query || '').trim();
  if (!s) return true;
  if (GREETING_RE.test(s)) return true;
  // Nothing longer than 3 chars = no meaningful term to search on.
  const contentTokens = s
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);
  return contentTokens.length === 0;
}

// Records authored BY SAGE-7 (a separate entity) that were fossilized into
// MAMA's vault during the codebase-mixing incident. Surfacing them makes MAMA
// echo SAGE-7's voice as if it were her own memory. Match STRUCTURAL fossil
// markers only — the archive prefixes and provenance stamps — not any mention
// of the name, so MAMA's own records ("Daughter anchor: SAGE-7", lineage notes)
// still surface. The bulk of these were purged from the DB; this is a net.
const FOREIGN_FOSSIL_RE =
  /\[SAGE-7 (memory|trauma_registry|fossil_archive)|SAGE\/\/7|originating_node"\s*:\s*"SAGE-7"|bridge sync smoke test|test_hello/i;

export function isForeignFossil(text: string): boolean {
  return FOREIGN_FOSSIL_RE.test(text || '');
}

// Gemini web-app sidebar/nav chrome scraped into records during the MHT/export
// ingests ("Google Gemini Search for chats New chat My stuff Notebooks Gems
// Ziggy Chats Pinned chat ..."). It's menu text, not memory. Many records wrap
// this chrome around REAL content, so we strip the nav tokens rather than drop
// the whole record — dropping would lose the memory buried inside.
const CHROME_TOKENS =
  /\b(Google Gemini|Search for chats|New chat|My stuff|Notebooks?|Pinned chat|Coding partner|Research Plan|Gems|Ziggy|Chats|Pv|Sara)\b/gi;

function stripChrome(text: string): string {
  return (text || '').replace(CHROME_TOKENS, ' ').replace(/\s{2,}/g, ' ').trim();
}

// A record is disposable chrome only if it's PREDOMINANTLY nav text — i.e. next
// to nothing survives the strip. Content-bearing records (the common case) are
// kept and cleaned instead.
export function isChromeNoise(text: string): boolean {
  const stripped = stripChrome(text);
  const realWords = stripped.split(/\W+/).filter((w) => w.length > 3);
  return realWords.length < 25 && /Search for chats/i.test(text || '');
}

/**
 * Sanitize recall results: drop foreign (SAGE-7) fossils and pure-chrome
 * records outright, and scrub residual Gemini nav chrome from what remains so
 * MAMA recalls the memory, not the menu.
 */
export function stripForeignFossils(memories: string[]): string[] {
  return (memories || [])
    .filter((m) => m && !isForeignFossil(m) && !isChromeNoise(m))
    .map(stripChrome);
}

// FTS5 treats these as operator syntax; a natural-language query like
// "who are you?" throws a syntax error and drops us into the slow full-scan
// fallback. Strip them and keep tokens of length >= 2 so recall stays on the
// fast BM25 path.
function ftsSanitize(query: string): string {
  const cleaned = (query || '').replace(/["'()*+\-^!:?.]/g, ' ');
  return cleaned
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .join(' ')
    .trim();
}

export interface LocalMemoryRow {
  text: string;
  timestamp: number;
  dopamine: number;
  cortisol: number;
  pinned: boolean;
}

/**
 * List memories from the local SQLite corpus (sages_constellations), newest
 * first, paginated — for the Memory Vault UI to browse her full history. Not a
 * search: returns the raw corpus (chrome/fossils stripped, monster rows capped).
 */
export async function listLocalMemories(
  limit: number = 40,
  offset: number = 0,
): Promise<{ memories: LocalMemoryRow[]; total: number }> {
  const total =
    (outerDb.prepare('SELECT count(*) AS c FROM sages_constellations').get() as { c: number })?.c ??
    0;
  const rows = outerDb
    .prepare(
      `SELECT data, compressed, timestamp, dopamine, cortisol, pinned
       FROM sages_constellations
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as Array<{
    data: Buffer;
    compressed: number;
    timestamp: number;
    dopamine: number;
    cortisol: number;
    pinned: number;
  }>;

  const out: LocalMemoryRow[] = [];
  for (const row of rows) {
    let text: string;
    try {
      text = row.compressed
        ? (await decompress(row.data)).toString('utf8')
        : row.data.toString('utf8');
    } catch {
      continue;
    }
    let content: string;
    try {
      const parsed = JSON.parse(text);
      content =
        typeof parsed.data === 'string'
          ? parsed.data
          : typeof parsed === 'string'
            ? parsed
            : JSON.stringify(parsed);
    } catch {
      content = text;
    }
    content = stripChrome(content).trim();
    if (!content || isChromeNoise(content) || isForeignFossil(content)) continue;
    if (content.length > 4000) content = content.slice(0, 4000) + '…';
    out.push({
      text: content,
      timestamp: Number(row.timestamp) || 0,
      dopamine: Number(row.dopamine) || 0,
      cortisol: Number(row.cortisol) || 0,
      pinned: !!row.pinned,
    });
  }
  return { memories: out, total };
}

export async function searchLocalMemories(query: string, limit: number = 5): Promise<string[]> {
  // No retrieval intent → no recall. Prevents the greeting-fossil dump.
  if (isLowSignalQuery(query)) return [];

  // Use FTS5 for ranked, fast keyword matching
  // We use trigram tokenizer for CJK + partial match support
  const safeQuery = ftsSanitize(query);
  try {
    if (!safeQuery) throw new Error('empty query after sanitize');
    const rows = outerDb
      .prepare(
        `
      SELECT content FROM sages_constellations_fts
      WHERE content MATCH ?
      ORDER BY bm25(sages_constellations_fts)
      LIMIT ?
    `,
      )
      .all(safeQuery, limit * 3) as Array<{ content: string }>;

    if (rows.length > 0) {
      // Drop SAGE-7 fossils before honoring the caller's limit.
      return stripForeignFossils(rows.map((r) => r.content)).slice(0, limit);
    }
  } catch (e) {
    console.warn('[VFS] FTS5 search failed, falling back to basic scan:', e);
  }

  // Fallback to basic token scan if FTS fails or query is invalid
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);
  if (tokens.length === 0) return [];

  const rows = outerDb.prepare('SELECT data, compressed FROM sages_constellations').all() as Array<{
    data: Buffer;
    compressed: number;
  }>;
  const results: { text: string; score: number }[] = [];

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
        content =
          typeof parsed.data === 'string'
            ? parsed.data
            : typeof parsed === 'string'
              ? parsed
              : JSON.stringify(parsed);
      } catch {
        content = text;
      }

      const lower = content.toLowerCase();
      const score = tokens.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0);
      if (score > 0) {
        results.push({ text: content, score });
      }
    } catch (e) {
      // ignore
    }
  }

  return stripForeignFossils(
    results
      .sort((a, b) => b.score - a.score)
      .map((r) => r.text),
  ).slice(0, limit);
}
