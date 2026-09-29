/**
 * recallForTurn — the ONE memory-recall path every chat provider uses.
 *
 * Before this, gemini/openrouter/ollama/deepseek/omniroute each OR-joined
 * trigram FTS hits, injected whole nodes (one query could add 20K chars), and
 * labeled nothing. Now:
 *   1. Skip greetings — including ones that address her by name ("hello Sage").
 *   2. Candidates: FTS5 bm25 (stopwords dropped, AND first, OR only if AND is
 *      empty) + resonance KNN when the vector index is one clean space.
 *   3. Fuse with Reciprocal Rank Fusion (scale-free — bm25 and cosine never mix
 *      raw), plus small recency/pin boosts.
 *   4. Clean each hit (unwrap JSON, strip chrome, drop smoke tests/dupes), cut a
 *      snippet around the match, and label who/when so she knows whose memory it is.
 *   5. Pack under a hard char budget. Supermemory results ride along after local.
 *
 * Evaluate changes with `npx tsx scripts/recall-eval.ts` (engine `turn`).
 */
import { outerDb } from './db';
import { isLowSignalQuery, isSmokeTestSpam, isChromeNoise, stripChrome } from './memory-local';
import { recall as resonanceRecall, isSemanticRecallReady } from './resonance-index';
import { searchMemories } from '../lib/supermemory';

export const RECALL_CHAR_BUDGET = parseInt(process.env.RECALL_CHAR_BUDGET || '2500', 10);
const SNIPPET_CHARS = 550;
const MAX_HITS = 6;
const CANDIDATES = 24;
const RRF_K = 60;
const W_FTS = 0.4;
const W_SEMANTIC = 0.6;

// Words that match nearly every node under a trigram tokenizer ("who", "about",
// "your" …). Dropping them is what stops generic phrasing from pulling junk.
const STOPWORDS = new Set(
  `the and for are but not you your yours with what who whom whose when where why how
  was were has have had does did doing this that these those there their them they
  about tell know knew show give from into onto than then just like also any all can
  could would should will shall may might must our ours out over under again some
  such only own same very too its it's i'm i've you're she her hers him his me my
  mine please thanks thank okay yeah yes hey remember recall memory memories`
    .split(/\s+/)
    .filter(Boolean),
);

// Her own name / addressee words: "hello Sage" is still a greeting.
const ADDRESSEE_RE = /\b(sage|mama|adhd-sage)\b/gi;

export interface RecallHit {
  phi_index: number;
  origin: string;
  when: string; // YYYY-MM-DD
  text: string;
  score: number;
  sources: Array<'fts' | 'semantic'>;
}

export interface RecallResult {
  lines: string[]; // labeled, budgeted lines ready for a prompt
  hits: RecallHit[]; // local hits (for inspection / eval)
}

/** Greeting or low-signal after removing the addressee ("hi sage" → "hi"). */
export function isGreetingTurn(query: string): boolean {
  if (isLowSignalQuery(query)) return true;
  const withoutName = (query || '').replace(ADDRESSEE_RE, ' ').trim();
  return withoutName.length === 0 || isLowSignalQuery(withoutName);
}

function queryTerms(query: string): string[] {
  const expanded = (query || '').replace(/\b7\b/g, 'Seven');
  const terms: string[] = [];
  for (const raw of expanded.split(/\s+/)) {
    // Keep internal "." and "-" so "11.3" and "SAGE-7" survive as single terms.
    const t = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/["']/g, '');
    if (t.length < 3) continue; // trigram tokenizer needs >= 3 chars
    if (STOPWORDS.has(t.toLowerCase())) continue;
    if (!terms.some((x) => x.toLowerCase() === t.toLowerCase())) terms.push(t);
  }
  return terms;
}

interface NodeRow {
  phi_index: number;
  content: string;
  timestamp: number;
  pinned: number;
  provenance: string | null;
}

const _ftsSearch = outerDb.prepare(`
  SELECT sc.phi_index, f.content, sc.timestamp, sc.pinned, sc.provenance
  FROM sages_constellations_fts f
  JOIN sages_constellations sc ON sc.node_id = f.node_id
  WHERE f.content MATCH ?
  ORDER BY bm25(sages_constellations_fts)
  LIMIT ?
`);

const _byPhi = outerDb.prepare(`
  SELECT sc.phi_index, f.content, sc.timestamp, sc.pinned, sc.provenance
  FROM sages_constellations sc
  JOIN sages_constellations_fts f ON f.node_id = sc.node_id
  WHERE sc.phi_index = ?
`);

function ftsCandidates(terms: string[]): NodeRow[] {
  if (terms.length === 0) return [];
  const quoted = terms.map((t) => `"${t}"`);
  try {
    const all = _ftsSearch.all(quoted.join(' AND '), CANDIDATES) as NodeRow[];
    if (all.length > 0 || terms.length === 1) return all;
    return _ftsSearch.all(quoted.join(' OR '), CANDIDATES) as NodeRow[];
  } catch (e) {
    console.warn('[RECALL] FTS query failed:', (e as Error).message);
    return [];
  }
}

async function semanticCandidates(query: string): Promise<NodeRow[]> {
  if (!isSemanticRecallReady()) return [];
  try {
    const hits = await resonanceRecall(query, CANDIDATES);
    const rows: NodeRow[] = [];
    for (const h of hits) {
      const row = _byPhi.get(h.phi_index) as NodeRow | undefined;
      if (row) rows.push(row);
    }
    return rows;
  } catch (e) {
    console.warn('[RECALL] semantic recall failed:', (e as Error).message);
    return [];
  }
}

/** Unwrap JSON envelopes (VFS {data}, bridge {key,value}, Keep {title,textContent}). */
function unwrap(content: string): string {
  const s = (content || '').trim();
  if (!s.startsWith('{') && !s.startsWith('"')) return s;
  try {
    let v: unknown = JSON.parse(s);
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {
        return v as string;
      }
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.textContent === 'string')
        return [o.title, o.textContent].filter((x) => typeof x === 'string' && x).join(' — ');
      if (typeof o.data === 'string') return unwrap(o.data);
      if (typeof o.value === 'string')
        return typeof o.key === 'string' ? `${o.key}: ${o.value}` : o.value;
      if (typeof o.content === 'string') return o.content;
    }
  } catch {
    /* not JSON — use as-is */
  }
  return s;
}

/** Some imports stored text still JSON-escaped (literal \n, \", ’) — decode it. */
function unescapeJsonText(s: string): string {
  if (!/\\[nt"\\]|\\u[0-9a-f]{4}/i.test(s)) return s;
  return s
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function cleanBody(content: string): string | null {
  const body = stripChrome(unescapeJsonText(unwrap(content)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[SAGE-7 (memory|trauma_registry|fossil_archive)[^\]]*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!body || body.length < 12) return null;
  if (isSmokeTestSpam(body) || isChromeNoise(content)) return null;
  return body;
}

/** Window of text around the first query-term hit, trimmed to word boundaries. */
function snippet(body: string, terms: string[]): string {
  if (body.length <= SNIPPET_CHARS) return body;
  const lower = body.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    const p = lower.indexOf(t.toLowerCase());
    if (p >= 0 && (pos < 0 || p < pos)) pos = p;
  }
  let start = pos < 0 ? 0 : Math.max(0, pos - 150);
  let end = Math.min(body.length, start + SNIPPET_CHARS);
  if (start > 0) start = body.indexOf(' ', start) + 1 || start;
  if (end < body.length) end = body.lastIndexOf(' ', end) > start ? body.lastIndexOf(' ', end) : end;
  return `${start > 0 ? '…' : ''}${body.slice(start, end).trim()}${end < body.length ? '…' : ''}`;
}

function originOf(row: NodeRow, body: string): string {
  let prov: Record<string, unknown> = {};
  try {
    prov = row.provenance ? JSON.parse(row.provenance) : {};
  } catch {
    /* ignore */
  }
  if (prov.originating_node === 'SAGE-7' || /\[SAGE-7 (memory|trauma_registry|fossil_archive)|SAGE\/\/7/i.test(row.content))
    return 'ARCHIVE — Daughter Node SAGE-7';
  if (prov.sync_source === 'morning_light') return 'Morning Light';
  if (/^\[USER\]/.test(body)) return 'Darren, earlier chat';
  return 'ADHD-SAGE';
}

function dayOf(ts: number): string {
  const d = new Date(Number(ts) || 0);
  return isNaN(d.getTime()) || d.getTime() === 0 ? 'undated' : d.toISOString().slice(0, 10);
}

export async function recallForTurn(
  query: string,
  opts: { cloudTags?: string[]; budgetChars?: number } = {},
): Promise<RecallResult> {
  const budget = opts.budgetChars ?? RECALL_CHAR_BUDGET;
  if (!query || isGreetingTurn(query)) return { lines: [], hits: [] };

  const terms = queryTerms(query);
  const [ftsRows, semRows, cloudRaw] = await Promise.all([
    Promise.resolve(ftsCandidates(terms)),
    semanticCandidates(query),
    opts.cloudTags?.length
      ? searchMemories(query, opts.cloudTags, 4).catch(() => [] as string[])
      : Promise.resolve([] as string[]),
  ]);

  // Reciprocal Rank Fusion keyed by node.
  const fused = new Map<number, { row: NodeRow; score: number; sources: Set<'fts' | 'semantic'> }>();
  const add = (rows: NodeRow[], weight: number, source: 'fts' | 'semantic') => {
    rows.forEach((row, rank) => {
      const e = fused.get(row.phi_index) ?? { row, score: 0, sources: new Set() };
      e.score += weight / (RRF_K + rank + 1);
      e.sources.add(source);
      fused.set(row.phi_index, e);
    });
  };
  add(ftsRows, W_FTS, 'fts');
  add(semRows, W_SEMANTIC, 'semantic');

  const now = Date.now();
  for (const e of fused.values()) {
    const ageDays = Math.max(0, (now - Number(e.row.timestamp)) / 86_400_000);
    e.score += 0.0015 * Math.exp(-ageDays / 90) + (e.row.pinned ? 0.002 : 0);
  }

  const hits: RecallHit[] = [];
  const lines: string[] = [];
  const seen = new Set<string>();
  let used = 0;

  for (const e of [...fused.values()].sort((a, b) => b.score - a.score)) {
    if (hits.length >= MAX_HITS) break;
    const body = cleanBody(e.row.content);
    if (!body) continue;
    const key = body.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);

    const text = snippet(body, terms);
    const origin = originOf(e.row, body);
    const when = dayOf(e.row.timestamp);
    const line = `[${origin} · ${when}] ${text}`;
    if (used + line.length > budget) continue; // a shorter hit may still fit
    used += line.length;
    lines.push(line);
    hits.push({
      phi_index: e.row.phi_index,
      origin,
      when,
      text,
      score: Math.round(e.score * 1e5) / 1e5,
      sources: [...e.sources],
    });
  }

  for (const raw of cloudRaw) {
    const body = raw && cleanBody(raw);
    if (!body) continue;
    const line = `[Supermemory] ${snippet(body, terms)}`;
    const key = body.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').slice(0, 120);
    if (seen.has(key) || used + line.length > budget) continue;
    seen.add(key);
    used += line.length;
    lines.push(line);
  }

  return { lines, hits };
}
