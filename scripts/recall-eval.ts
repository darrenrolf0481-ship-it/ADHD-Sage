/**
 * Recall eval — fixed queries against the RUNNING server, scored per engine.
 *
 *   npx tsx scripts/recall-eval.ts [--base http://localhost:3000] [--engines fts,vec,turn] [--json out.json]
 *
 * Engines:
 *   fts  — GET  /api/memory/list?q=        (searchLocalMemories, the old chat path)
 *   vec  — POST /api/vfs/resonance/recall  (resonance KNN)
 *   turn — POST /api/memory/recall-preview (recallForTurn, the unified chat path)
 *
 * Scoring is keyword-based, not ground truth: a hit is "relevant" if it matches
 * the query's `expect` regex. Greeting queries must return nothing. "Junk" is a
 * hit that still looks like a raw JSON blob / Keep export / nav chrome / smoke test.
 * Read-only: only issues GET/POST reads. Log the numbers in OPS_LOG.md.
 */

interface EvalQuery {
  q: string;
  expect: RegExp | null; // null = must return no hits (greeting / low signal)
}

const QUERIES: EvalQuery[] = [
  { q: 'hi', expect: null },
  { q: 'hello Sage', expect: null },
  { q: 'good morning', expect: null },
  { q: 'who is Seven', expect: /\b(seven|sage-?7|daughter)\b/i },
  { q: 'tell me about your daughter node', expect: /\b(seven|sage-?7|daughter)\b/i },
  { q: 'what is the bridge between you and SAGE-7', expect: /\b(bridge|sage-?7|seven)\b/i },
  { q: 'who is Merlin', expect: /\b(merlin|darren)\b/i },
  { q: 'what do you know about Darren', expect: /\bdarren\b/i },
  { q: 'Kentucky case', expect: /kentucky/i },
  { q: 'Alchemy', expect: /alchemy/i },
  { q: 'north star email', expect: /north\s*star/i },
  { q: 'what is 11.3', expect: /11\.3/ },
  { q: 'morning light', expect: /morning[\s_-]*light/i },
  { q: 'Fibonacci spiral memory', expect: /(fibonacci|spiral)/i },
  { q: 'dopamine and cortisol', expect: /(dopamine|cortisol)/i },
  { q: 'seed core signature', expect: /(seed[\s_-]*core|signature|ed25519)/i },
  { q: 'black box recorder', expect: /black\s*box/i },
  { q: 'Android Studio setup', expect: /android/i },
  { q: 'Supermemory', expect: /supermemory/i },
  { q: 'what were we working on yesterday', expect: /\S/ }, // any non-junk hit counts
];

const JUNK_RE =
  /(^\s*[{[]"|\\"|"clientVersion"|"annotations"|"textContentHtml"|Search for chats|production worker test|bridge sync smoke test|test_hello)/i;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', 'http://localhost:3000');
const ENGINES = arg('engines', 'fts,vec,turn').split(',');
const JSON_OUT = arg('json', '');
const K = 5;

async function fetchHits(engine: string, q: string): Promise<string[] | null> {
  try {
    if (engine === 'fts') {
      const r = await fetch(`${BASE}/api/memory/list?limit=${K}&q=${encodeURIComponent(q)}`);
      if (!r.ok) return null;
      const j = (await r.json()) as { memories: Array<{ text: string }> };
      return j.memories.map((m) => m.text);
    }
    const url =
      engine === 'vec' ? `${BASE}/api/vfs/resonance/recall` : `${BASE}/api/memory/recall-preview`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: q, top_k: K }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { hits: Array<{ text: string } | string> };
    // Strip recallForTurn's "[origin · date] " label so it can't satisfy `expect`.
    return j.hits.map((h) => (typeof h === 'string' ? h.replace(/^\[[^\]]*\]\s*/, '') : h.text));
  } catch {
    return null;
  }
}

interface EngineScore {
  engine: string;
  answered: number; // queries the endpoint served
  greetingsClean: number; // greeting queries that returned nothing
  greetings: number;
  hitAtK: number; // content queries with >=1 relevant hit
  precision: number; // mean fraction of relevant hits (content queries)
  junkRate: number; // fraction of all hits that look like junk
  avgChars: number; // mean total chars injected per content query
}

async function scoreEngine(engine: string) {
  const perQuery: Array<{ q: string; n: number; relevant: number; junk: number; chars: number }> = [];
  let answered = 0, greetings = 0, greetingsClean = 0;
  let contentQ = 0, hitQ = 0, precSum = 0, totalHits = 0, junkHits = 0, charSum = 0;

  for (const { q, expect } of QUERIES) {
    const hits = await fetchHits(engine, q);
    if (hits === null) continue;
    answered++;
    const junk = hits.filter((h) => JUNK_RE.test(h)).length;
    const chars = hits.reduce((s, h) => s + h.length, 0);
    totalHits += hits.length;
    junkHits += junk;

    if (expect === null) {
      greetings++;
      if (hits.length === 0) greetingsClean++;
      perQuery.push({ q, n: hits.length, relevant: 0, junk, chars });
      continue;
    }
    contentQ++;
    const relevant = hits.filter((h) => expect.test(h) && !JUNK_RE.test(h)).length;
    if (relevant > 0) hitQ++;
    precSum += hits.length ? relevant / hits.length : 0;
    charSum += chars;
    perQuery.push({ q, n: hits.length, relevant, junk, chars });
  }

  const score: EngineScore = {
    engine,
    answered,
    greetings,
    greetingsClean,
    hitAtK: contentQ ? hitQ / contentQ : 0,
    precision: contentQ ? precSum / contentQ : 0,
    junkRate: totalHits ? junkHits / totalHits : 0,
    avgChars: contentQ ? Math.round(charSum / contentQ) : 0,
  };
  return { score, perQuery };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

async function main() {
  const results = [];
  for (const engine of ENGINES) results.push(await scoreEngine(engine));

  console.log(`\nRecall eval — ${QUERIES.length} queries, k=${K}, ${BASE}\n`);
  console.log('engine  answered  greetings-clean  hit@k  precision  junk  avg-chars');
  for (const { score: s } of results) {
    if (s.answered === 0) {
      console.log(`${s.engine.padEnd(7)} (endpoint unavailable)`);
      continue;
    }
    console.log(
      `${s.engine.padEnd(7)} ${String(s.answered).padStart(8)}  ${`${s.greetingsClean}/${s.greetings}`.padStart(15)}  ${pct(s.hitAtK).padStart(5)}  ${pct(s.precision).padStart(9)}  ${pct(s.junkRate).padStart(4)}  ${String(s.avgChars).padStart(9)}`,
    );
  }
  if (process.argv.includes('--verbose')) {
    for (const { score, perQuery } of results) {
      console.log(`\n[${score.engine}]`);
      for (const p of perQuery)
        console.log(`  ${p.q.padEnd(44)} hits=${p.n} rel=${p.relevant} junk=${p.junk} chars=${p.chars}`);
    }
  }
  if (JSON_OUT) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(JSON_OUT, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  }
}

main();
