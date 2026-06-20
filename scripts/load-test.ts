/**
 * Load test: bulk-import 100 memories while polling /api/health.
 *
 * Mirrors the client-side MemorySystem.bulkStash behavior (4 concurrent batches)
 * but keeps a health poller running in parallel to verify the server stays
 * responsive under write pressure.
 */
import 'dotenv/config';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const TOKEN = process.env.API_BEARER_TOKEN || '';
const TOTAL = 100;
const CONCURRENCY = 4;

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
};
if (TOKEN) {
  headers['Authorization'] = `Bearer ${TOKEN}`;
}

async function health(): Promise<{ ok: boolean; ms: number; body?: unknown }> {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { headers });
    const ms = performance.now() - start;
    if (!res.ok) return { ok: false, ms };
    const body = await res.json();
    return { ok: true, ms, body };
  } catch (e) {
    return { ok: false, ms: performance.now() - start };
  }
}

async function stash(index: number): Promise<{ ok: boolean; ms: number }> {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}/api/vfs/inner/stash`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: `load-test memory #${index} at ${Date.now()}`,
        dopamine: 0.6 + Math.random() * 0.2,
        cortisol: 0.1,
        provenance: { source: 'load-test', batch: '100-bulk' },
      }),
    });
    const ms = performance.now() - start;
    return { ok: res.ok, ms };
  } catch (e) {
    return { ok: false, ms: performance.now() - start };
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`[load-test] BASE_URL=${BASE_URL} auth=${TOKEN ? 'yes' : 'no'}`);

  // Pre-flight health check
  const pre = await health();
  if (!pre.ok) {
    console.error('[load-test] Server not healthy before test', pre);
    process.exit(1);
  }
  console.log(`[load-test] pre-flight health OK (${pre.ms.toFixed(1)}ms)`);

  let healthChecks = 0;
  let healthFailures = 0;
  let totalHealthMs = 0;
  let maxHealthMs = 0;
  const healthLog: { t: number; ms: number }[] = [];
  let stopPoller = false;

  const poller = (async () => {
    while (!stopPoller) {
      const h = await health();
      healthChecks++;
      if (!h.ok) {
        healthFailures++;
      } else {
        totalHealthMs += h.ms;
        if (h.ms > maxHealthMs) maxHealthMs = h.ms;
        healthLog.push({ t: Date.now(), ms: h.ms });
      }
      await sleep(100);
    }
  })();

  const stashResults: { ok: boolean; ms: number }[] = [];
  const startAll = performance.now();

  for (let i = 0; i < TOTAL; i += CONCURRENCY) {
    const slice = Array.from({ length: Math.min(CONCURRENCY, TOTAL - i) }, (_, j) => i + j);
    const batch = await Promise.all(slice.map((idx) => stash(idx)));
    stashResults.push(...batch);
  }

  const totalMs = performance.now() - startAll;
  stopPoller = true;
  await poller;

  const okCount = stashResults.filter((r) => r.ok).length;
  const failCount = stashResults.length - okCount;
  const stashMs = stashResults.map((r) => r.ms);
  const avgStashMs = stashMs.reduce((a, b) => a + b, 0) / stashMs.length;
  const maxStashMs = Math.max(...stashMs);
  const avgHealthMs = healthChecks > healthFailures ? totalHealthMs / (healthChecks - healthFailures) : 0;

  // Count final inner spiral rows
  let innerCount = 0;
  try {
    const res = await fetch(`${BASE_URL}/api/vfs/inner`, { headers });
    if (res.ok) {
      const rows = await res.json();
      innerCount = rows.length;
    }
  } catch {
    /* ignore */
  }

  console.log('\n=== Load Test Summary ===');
  console.log(`bulk imports:     ${okCount}/${TOTAL} success, ${failCount} failed`);
  console.log(`total time:       ${totalMs.toFixed(1)}ms`);
  console.log(`throughput:       ${((TOTAL / totalMs) * 1000).toFixed(1)} writes/sec`);
  console.log(`avg stash latency:${avgStashMs.toFixed(1)}ms`);
  console.log(`max stash latency:${maxStashMs.toFixed(1)}ms`);
  console.log(`health polls:     ${healthChecks} total, ${healthFailures} failed`);
  console.log(`avg health latency:${avgHealthMs.toFixed(1)}ms`);
  console.log(`max health latency:${maxHealthMs.toFixed(1)}ms`);
  console.log(`inner spiral rows:${innerCount}`);

  if (failCount > 0 || healthFailures > 0) {
    console.log('\n[load-test] FAILED: errors detected');
    process.exit(1);
  }
  console.log('\n[load-test] PASSED');
}

main().catch((e) => {
  console.error('[load-test] error', e);
  process.exit(1);
});
