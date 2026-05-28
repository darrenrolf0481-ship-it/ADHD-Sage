// ─── Swarm Uplink — Golden-Ratio Retry Wrapper ──────────────────────────────

const PHI = 1.618;
const SWARM_JITTER_MS = 250;
const SWARM_MAX_TOTAL_MS = 60_000;
const SWARM_MAX_RETRIES = 3;

export async function swarmFetch(
  url: string,
  opts: RequestInit,
  timeoutMs: number
): Promise<Response> {
  let delay = timeoutMs;
  let elapsed = 0;

  for (let attempt = 0; attempt <= SWARM_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      // Non-2xx: fall through to retry
      const isLocalOptional = url.includes('127.0.0.1') || url.includes('localhost');
      if (!isLocalOptional || attempt === SWARM_MAX_RETRIES) {
        console.warn(`[SWARM] attempt ${attempt + 1} non-ok ${res.status} from ${url}`);
      }
    } catch (e) {
      clearTimeout(timer);
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
    if (attempt === SWARM_MAX_RETRIES || elapsed >= SWARM_MAX_TOTAL_MS) break;
    const jittered = delay + Math.random() * SWARM_JITTER_MS;
    await new Promise(r => setTimeout(r, jittered));
    elapsed += jittered;
    delay = Math.min(delay * PHI, SWARM_MAX_TOTAL_MS - elapsed);
  }

  // Node 13: The Void — Defer & Log
  console.warn(`[SWARM] All retries exhausted → Node 13 (The Void). URL: ${url}`);
  throw new Error(`Swarm uplink failed: ${url} unreachable after ${SWARM_MAX_RETRIES} retries (Node 13 / Defer & Log)`);
}
