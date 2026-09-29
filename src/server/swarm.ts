// ─── Swarm Uplink — Golden-Ratio Retry Wrapper ──────────────────────────────

import { logCall, errorKind } from './call-log';

/** Host + path only — query strings can carry API keys. */
function target(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

const PHI = 1.618;
const SWARM_JITTER_MS = 250;
const SWARM_MAX_TOTAL_MS = 60_000;
const SWARM_MAX_RETRIES = 3;

export async function swarmFetch(
  url: string,
  opts: RequestInit,
  timeoutMs: number,
  maxRetries: number = SWARM_MAX_RETRIES,
): Promise<Response> {
  // Backoff starts small and grows by φ. It must NEVER be the request timeout:
  // the old `delay = timeoutMs` meant a 25s-timeout call slept 25s before its
  // second attempt — one hiccup cost ~50s and read as a hard timeout.
  let delay = 500;
  let elapsed = 0;
  const started = Date.now();
  const where = target(url);
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const attemptStart = Date.now();
    attempts++;
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        if (attempt > 0)
          logCall({ kind: 'upstream', target: where, outcome: 'recovered', attempts: attempt + 1, ms: Date.now() - started });
        return res;
      }
      logCall({ kind: 'upstream', target: where, outcome: 'attempt-failed', attempt: attempt + 1, error: 'status', status: res.status, ms: Date.now() - attemptStart, timeoutMs });
      // Non-2xx: fall through to retry
      const isLocalOptional = url.includes('127.0.0.1') || url.includes('localhost');
      if (!isLocalOptional || attempt === SWARM_MAX_RETRIES) {
        console.warn(`[SWARM] attempt ${attempt + 1} non-ok ${res.status} from ${url}`);
      }
    } catch (e) {
      clearTimeout(timer);
      logCall({ kind: 'upstream', target: where, outcome: 'attempt-failed', attempt: attempt + 1, error: errorKind(e), ms: Date.now() - attemptStart, timeoutMs });
      // Quiet warnings for common local optional services
      const isLocalOptional = url.includes('127.0.0.1') || url.includes('localhost');
      if (isLocalOptional) {
        // No log for first few attempts of local services to avoid clutter
        if (attempt === SWARM_MAX_RETRIES) {
          console.log(`[SWARM] Local service at ${url} unavailable (skipping)`);
        }
      } else {
        console.warn(`[SWARM] attempt ${attempt + 1} failed (timeout or network) → ${url}`);
      }
    }
    if (attempt === maxRetries || elapsed >= SWARM_MAX_TOTAL_MS) break;
    const jittered = delay + Math.random() * SWARM_JITTER_MS;
    await new Promise((r) => setTimeout(r, jittered));
    elapsed += jittered;
    delay = Math.min(delay * PHI, SWARM_MAX_TOTAL_MS - elapsed); // 500ms → 805ms → 1.3s → …
  }

  // Node 13: The Void — Defer & Log
  logCall({ kind: 'upstream', target: where, outcome: 'exhausted', attempts, ms: Date.now() - started });
  console.warn(`[SWARM] All retries exhausted → Node 13 (The Void). URL: ${url}`);
  throw new Error(
    `Swarm uplink failed: ${url} unreachable after ${maxRetries} retries (Node 13 / Defer & Log)`,
  );
}
