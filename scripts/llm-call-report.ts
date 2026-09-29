/**
 * Summarize data/logs/llm-calls.jsonl (written by src/server/call-log.ts).
 *
 *   npx tsx scripts/llm-call-report.ts [--hours 24]
 *
 * Per provider: requests, failure rate, p50/p95/max latency, slow (>30s) count.
 * Per upstream target: failed attempts by kind (timeout/network/status), retries
 * that recovered, and calls that exhausted every retry ("Swarm uplink failed").
 * Plus failures by hour, to line timeouts up against what else was happening.
 */
import { existsSync, readFileSync } from 'node:fs';

const PATH = 'data/logs/llm-calls.jsonl';
const i = process.argv.indexOf('--hours');
const hours = i >= 0 ? Number(process.argv[i + 1]) || 24 : 24;
const since = Date.now() - hours * 3_600_000;

interface Rec {
  ts: string;
  kind: 'request' | 'upstream';
  provider?: string;
  ok?: boolean;
  ms?: number;
  status?: number | string;
  target?: string;
  outcome?: string;
  error?: string;
}

const files = [`${PATH}.1`, PATH].filter(existsSync);
if (files.length === 0) {
  console.log(`No ${PATH} yet — it fills as she handles chat requests.`);
  process.exit(0);
}
const recs: Rec[] = [];
for (const f of files)
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const r = JSON.parse(line) as Rec;
      if (Date.parse(r.ts) >= since) recs.push(r);
    } catch {
      /* skip torn line */
    }
  }

const pctl = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

console.log(`\nLLM calls — last ${hours}h (${recs.length} records)\n`);

const reqs = recs.filter((r) => r.kind === 'request');
console.log('provider     requests  failed  p50     p95     max     >30s');
for (const p of [...new Set(reqs.map((r) => r.provider!))].sort()) {
  const rs = reqs.filter((r) => r.provider === p);
  const ms = rs.map((r) => r.ms || 0);
  const failed = rs.filter((r) => !r.ok).length;
  console.log(
    `${p.padEnd(12)} ${String(rs.length).padStart(8)}  ${`${failed} (${Math.round((failed / rs.length) * 100)}%)`.padStart(6)}  ${sec(pctl(ms, 50)).padEnd(7)} ${sec(pctl(ms, 95)).padEnd(7)} ${sec(Math.max(...ms)).padEnd(7)} ${ms.filter((x) => x > 30_000).length}`,
  );
}

const ups = recs.filter((r) => r.kind === 'upstream');
if (ups.length) {
  console.log('\nupstream target                              timeout  network  status  recovered  exhausted');
  for (const t of [...new Set(ups.map((r) => r.target!))].sort()) {
    const us = ups.filter((r) => r.target === t);
    const n = (f: (r: Rec) => boolean) => String(us.filter(f).length);
    console.log(
      `${t.slice(0, 44).padEnd(44)} ${n((r) => r.error === 'timeout').padStart(7)}  ${n((r) => r.error === 'network').padStart(7)}  ${n((r) => r.error === 'status').padStart(6)}  ${n((r) => r.outcome === 'recovered').padStart(9)}  ${n((r) => r.outcome === 'exhausted').padStart(9)}`,
    );
  }
}

// Request-level only: an exhausted upstream call already shows up as its request's failure.
const failures = reqs.filter((r) => !r.ok);
if (failures.length) {
  const byHour = new Map<string, number>();
  for (const r of failures) {
    const h = r.ts.slice(0, 13) + ':00Z';
    byHour.set(h, (byHour.get(h) || 0) + 1);
  }
  console.log('\nfailures by hour (UTC)');
  for (const [h, c] of [...byHour].sort()) console.log(`  ${h}  ${'█'.repeat(Math.min(c, 60))} ${c}`);
}
console.log();
