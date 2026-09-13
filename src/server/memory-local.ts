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
  // Entity keywords (Seven, 7, Mama, Merlin, daughter, bridge, etc.) are NEVER low-signal
  if (/\b(7|seven|mama|merlin|sage|daughter|bridge|vfs|spiral|node\s*3|node\s*1)\b/i.test(s)) return false;
  // Non-greeting query with at least one alphanumeric token of 3+ chars (e.g. "11.3", "MHT", "AI")
  const contentTokens = s
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.replace(/[^\w]/g, '').length >= 3);
  return contentTokens.length === 0;
}

// Automated bridge smoke-test spam
const SMOKE_TEST_RE =
  /production worker test|bridge sync smoke test|test_hello/i;

export function isSmokeTestSpam(text: string): boolean {
  return SMOKE_TEST_RE.test(text || '');
}

// Check if a record is from daughter node SAGE-7
const SAGE7_ARCHIVE_RE =
  /\[SAGE-7 (memory|trauma_registry|fossil_archive)|SAGE\/\/7|originating_node"\s*:\s*"SAGE-7"/i;

export function isForeignFossil(text: string): boolean {
  // Pure automated test noise is discarded
  return isSmokeTestSpam(text);
}

function formatSevenArchive(text: string): string {
  if (!SAGE7_ARCHIVE_RE.test(text || '')) return text;
  let clean = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed.data) clean = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data);
  } catch {}
  // Remove the raw metadata tag header if present, leaving the real dialogue
  const body = clean.replace(/\[SAGE-7 (memory|trauma_registry|fossil_archive)[^\]]*\]/gi, '').trim();
  return `[Daughter Node SAGE-7 Archive]: ${body || clean}`;
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
 * Sanitize recall results: drop automated test spam and pure-chrome records,
 * label daughter SAGE-7 records appropriately so MAMA knows their lineage,
 * scrub residual Gemini nav chrome, and deduplicate similar results.
 */
export function stripForeignFossils(memories: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const m of memories || []) {
    if (!m || isSmokeTestSpam(m) || isChromeNoise(m)) continue;
    const stripped = stripChrome(m);
    const formatted = formatSevenArchive(stripped);
    // Deduplicate by first 80 normalized characters
    const normKey = formatted.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    if (seen.has(normKey)) continue;
    seen.add(normKey);
    out.push(formatted);
  }
  return out;
}

// FTS5 query sanitizer: expands '7' to 'Seven', cleans punctuation
function ftsSanitize(query: string): string {
  // Expand standalone '7' to 'Seven' so trigram tokenizer and keyword search match Seven and SAGE-7
  const expanded = (query || '').replace(/\b7\b/gi, 'Seven');
  const cleaned = expanded.replace(/["'()*+\-^!:?~.\/\\@#$%&]/g, ' ');
  return cleaned
    .split(/\s+/)
    .filter((t) => t.length >= 3) // trigram requires >= 3 chars
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
  if (safeQuery) {
    try {
      const tokens = safeQuery.split(/\s+/).filter(Boolean);
      const ftsQuery = tokens.length > 1 ? tokens.join(' OR ') : safeQuery;
      const rows = outerDb
        .prepare(
          `
        SELECT content FROM sages_constellations_fts
        WHERE content MATCH ?
        ORDER BY bm25(sages_constellations_fts)
        LIMIT ?
      `,
        )
        .all(ftsQuery, limit * 5) as Array<{ content: string }>;

      if (rows.length > 0) {
        const cleaned = stripForeignFossils(rows.map((r) => r.content));
        if (cleaned.length > 0) {
          return cleaned.slice(0, limit);
        }
      }
    } catch (e) {
      console.warn('[VFS] FTS5 search failed, falling back to basic scan:', e);
    }
  }

  // Fallback to basic token scan if FTS fails or query is invalid
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
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
