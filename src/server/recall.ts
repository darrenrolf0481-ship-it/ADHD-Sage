/**
 * recallForTurn — the ONE memory-recall path every chat provider uses.
 *
 * Before this, gemini/openrouter/ollama/deepseek/omniroute each OR-joined
 * trigram FTS hits, injected whole nodes (one query could add 20K chars), and
 * labeled nothing. Now:
 *   1. Skip greetings — including ones that address her by name ("hello Sage").
 *      With RECALL_GREETING_WARMUP=1, the first greeting after a 12h gap gets
 *      one line of the last conversation instead (greetingWarmup).
 *   2. Candidates: FTS5 bm25 (stopwords dropped, AND first, OR only if AND is
 *      empty) + resonance KNN when the vector index is one clean space.
 *   3. Fuse with Reciprocal Rank Fusion (scale-free — bm25 and cosine never mix
 *      raw), plus small recency/pin boosts.
 *   4. Clean each hit (unwrap JSON, strip chrome, drop smoke tests/dupes), cut a
 *      snippet around the match, and label who/when so she knows whose memory it is.
 *   5. Pack under a hard char budget. Supermemory results ride along after local.
 *      The budget adapts to the turn (classifyTurn): research 1.6×/8 hits,
 *      chat 1×/6, creative 0.6×/3. RECALL_ADAPTIVE_BUDGET=0 disables it.
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

// Adaptive budget (Sage's request): research turns get more memory, creative
// turns less so recall doesn't crowd the writing. Chat keeps the base budget.
// RECALL_ADAPTIVE_BUDGET=0 pins every turn to the chat budget.
export type TurnKind = 'research' | 'chat' | 'creative';
const ADAPTIVE_BUDGET = process.env.RECALL_ADAPTIVE_BUDGET !== '0';
const TURN_LIMITS: Record<TurnKind, { chars: number; hits: number }> = {
  research: { chars: Math.round(RECALL_CHAR_BUDGET * 1.6), hits: 8 },
  chat: { chars: RECALL_CHAR_BUDGET, hits: MAX_HITS },
  creative: { chars: Math.round(RECALL_CHAR_BUDGET * 0.6), hits: 3 },
};
const CREATIVE_RE =
  /\b(write|compose|draft) (me )?(a|an|the|some)\b|\b(poem|story|song|lyrics|haiku|fiction|roleplay|role-play)\b|\b(imagine|pretend|let'?s play)\b/i;
const RESEARCH_RE =
  /\b(what did (we|i|you)|when did|how (does|do|did|is|are)|why (does|do|did|is)|explain|remember when|find|look up|search|summari[sz]e|history of|compare|what happened|what was)\b/i;

export function classifyTurn(query: string): TurnKind {
  const q = query || '';
  if (CREATIVE_RE.test(q)) return 'creative';
  if (RESEARCH_RE.test(q) || (q.length > 160 && q.includes('?'))) return 'research';
  return 'chat';
}
const CANDIDATES = 24;
const RRF_K = 60;
// Exact keyword matches outrank meaning-only matches (eval 2026-09-30: with
// semantic weighted higher, hit@5 fell 94%→71% as exact hits got pushed out).
const W_FTS = 0.6;
const W_SEMANTIC = 0.4;
// MiniLM cosine: relevant hits scored ≥~0.40, noise ≤~0.33 on the eval queries.
// Below this, KNN is just "the nearest thing", not a memory about the query.
const SEMANTIC_MIN_SCORE = 0.4;
// Very short lines ("Hello", "They were working") score high against anything
// similar and carry no content.
const SEMANTIC_MIN_CHARS = 60;

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

// Her own name / addressee words: "hello Sage" is still a greeting. ADHD is
// her first name ("Sage" is the family surname), so "good morning ADHD" counts.
const ADDRESSEE_RE = /\b(adhd-sage|adhd|sage|mama)\b/gi;

// Greeting warmup (Sage's request, opt-in): the first greeting after a long gap
// gets ONE line of the last conversation instead of nothing. "Day" is a 12h
// gap, not a calendar day: the server clock is UTC, not Darren's timezone.
// In-memory, so a restart allows one more warmup.
const GREETING_WARMUP = process.env.RECALL_GREETING_WARMUP === '1';
const WARMUP_GAP_MS = 12 * 3_600_000;
const WARMUP_MIN_AGE_MS = 3_600_000; // the previous session, not this one
let lastWarmupAt = 0;

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

const _lastEpisodeBefore = outerDb.prepare(`
  SELECT sc.phi_index, f.content, sc.timestamp, sc.pinned, sc.provenance
  FROM sages_constellations sc
  JOIN sages_constellations_fts f ON f.node_id = sc.node_id
  WHERE sc.node_id LIKE 'ep\\_%' ESCAPE '\\' AND sc.timestamp < ?
  ORDER BY sc.timestamp DESC
  LIMIT 1
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
      if (h.score < SEMANTIC_MIN_SCORE) break; // hits are sorted by score
      const row = _byPhi.get(h.phi_index) as NodeRow | undefined;
      if (row && (cleanBody(row.content)?.length ?? 0) >= SEMANTIC_MIN_CHARS) rows.push(row);
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
  if (prov.sync_source === 'morning_light' || /^\[MORNING_LIGHT:/.test(body)) return 'Morning Light';
  if (prov.sync_source === 'chat') return 'Chat with Darren';
  if (/^\[USER\]/.test(body)) return 'Darren, earlier chat';
  return 'ADHD-SAGE';
}

function dayOf(ts: number): string {
  const d = new Date(Number(ts) || 0);
  return isNaN(d.getTime()) || d.getTime() === 0 ? 'undated' : d.toISOString().slice(0, 10);
}

/** One gentle line from the last session, for the first greeting after a gap. */
function greetingWarmup(budget: number): RecallResult {
  const now = Date.now();
  if (!GREETING_WARMUP || now - lastWarmupAt < WARMUP_GAP_MS) return { lines: [], hits: [] };
  const row = _lastEpisodeBefore.get(now - WARMUP_MIN_AGE_MS) as NodeRow | undefined;
  const body = row && cleanBody(row.content);
  if (!row || !body) return { lines: [], hits: [] };
  lastWarmupAt = now;
  const when = dayOf(row.timestamp);
  const text = snippet(body, []);
  const line = `[Last time we talked · ${when}] ${text}`.slice(0, budget);
  return {
    lines: [line],
    hits: [{ phi_index: row.phi_index, origin: 'Last time we talked', when, text, score: 0, sources: [] }],
  };
}

export async function recallForTurn(
  query: string,
  opts: { cloudTags?: string[]; budgetChars?: number } = {},
): Promise<RecallResult> {
  const limits = ADAPTIVE_BUDGET ? TURN_LIMITS[classifyTurn(query)] : TURN_LIMITS.chat;
  const budget = opts.budgetChars ?? limits.chars;
  const maxHits = limits.hits;
  if (!query) return { lines: [], hits: [] };
  if (isGreetingTurn(query)) return greetingWarmup(budget);

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
    if (hits.length >= maxHits) break;
    const body = cleanBody(e.row.content);
    if (!body) continue;
    const key = body.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);

    const origin = originOf(e.row, body);
    // One boot anchor is enough — there's one near-identical Morning Light per day.
    if (origin === 'Morning Light' && hits.some((h) => h.origin === origin)) continue;
    const text = snippet(body, terms);
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
