/**
 * Persistent LLM call log — data/logs/llm-calls.jsonl (gitignored).
 *
 * The in-memory spans in performance.ts/metrics.ts are wiped on every restart,
 * and the watchdog restarts her often, so they can't answer "which provider
 * times out, how often, since when". This file survives restarts.
 *
 * Two record kinds:
 *   kind:'request'  — one per chat request to /api/{gemini,openrouter,deepseek,omniroute,ollama}
 *   kind:'upstream' — one per swarmFetch attempt that failed, plus the final outcome
 *
 * Summarize with: npx tsx scripts/llm-call-report.ts [--hours 24]
 * Never logs prompt/response text or headers — sizes and timings only.
 */
import { appendFile, mkdirSync, renameSync, statSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';

export const CALL_LOG_PATH = 'data/logs/llm-calls.jsonl';
const MAX_BYTES = 5 * 1024 * 1024; // rotate to .1 past 5MB

let _dirReady = false;
let _writes = 0;

export function logCall(entry: Record<string, unknown>): void {
  try {
    if (!_dirReady) {
      mkdirSync('data/logs', { recursive: true });
      _dirReady = true;
    }
    // Cheap size check every 200 writes.
    if (++_writes % 200 === 0) {
      try {
        if (statSync(CALL_LOG_PATH).size > MAX_BYTES) renameSync(CALL_LOG_PATH, `${CALL_LOG_PATH}.1`);
      } catch {
        /* file may not exist yet */
      }
    }
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    appendFile(CALL_LOG_PATH, line, () => {}); // fire-and-forget; never block a request
  } catch {
    /* logging must never break a request */
  }
}

/** Classify a fetch failure: timeout (our abort) vs network vs other. */
export function errorKind(e: unknown): 'timeout' | 'network' | 'other' {
  const err = e as { name?: string; cause?: { code?: string }; message?: string };
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return 'timeout';
  const code = err?.cause?.code || '';
  if (/ECONN|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_SOCKET|ETIMEDOUT/.test(code)) return 'network';
  if (/fetch failed|socket|network/i.test(err?.message || '')) return 'network';
  return 'other';
}

/** Express middleware: one 'request' record per chat call, written when the response finishes. */
export function callLogMiddleware(provider: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();
    const started = Date.now();
    const body = (req.body || {}) as Record<string, unknown>;
    const reqChars = Number(req.headers['content-length']) || 0;
    const skipTools = !!body.skipTools;
    const model = typeof body.model === 'string' ? body.model : undefined;
    let done = false;
    const finish = (aborted: boolean) => {
      if (done) return;
      done = true;
      logCall({
        kind: 'request',
        provider,
        path: req.path,
        model,
        status: aborted ? 'client-aborted' : res.statusCode,
        ok: !aborted && res.statusCode < 400,
        ms: Date.now() - started,
        reqBytes: reqChars,
        skipTools,
      });
    };
    res.on('finish', () => finish(false));
    res.on('close', () => finish(!res.writableEnded));
    next();
  };
}
