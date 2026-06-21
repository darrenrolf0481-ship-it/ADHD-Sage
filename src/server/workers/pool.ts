/**
 * Worker thread pool for offloading CPU/blocking work from the main thread.
 *
 * In development, workers are TypeScript ESM modules launched via tsx.
 * In production, workers are pre-bundled to `dist/workers/*.mjs` and launched
 * directly by Node.
 *
 * The pool keeps a fixed set of generic workers alive and dispatches tasks by
 * `kind`; each worker imports the task dispatcher and routes to the right handler.
 */

import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { availableParallelism } from 'node:os';
import type { WorkerTask, WorkerResult, WorkerTaskKind } from './types';

// Inline fallback handlers for environments where worker threads are unavailable
// or where worker entry paths cannot be resolved.
import { handleZstdCompress, handleZstdDecompress } from './handlers/zstd.ts';
import { handleBridgeSync } from './handlers/bridge-sync.ts';
import { handleAgentJournal, handleAgentSelfImprove } from './handlers/agent.ts';
import { handleMcpExecuteTool } from './handlers/mcp-tool.ts';

function resolveWorkerEntry(): { path: string; execArgv: string[] } | null {
  // Production: pre-bundled workers live next to the server bundle.
  // process.argv[1] is e.g. dist/server.cjs, so workers are in dist/workers/.
  const serverDir = process.argv[1] ? dirname(process.argv[1]) : process.cwd();
  const prodPath = join(serverDir, 'workers', 'dispatcher.worker.mjs');
  if (existsSync(prodPath)) {
    return { path: prodPath, execArgv: [] };
  }

  // Development: source TypeScript workers launched via tsx.
  // We use Error().stack to get this file's directory without relying on import.meta.url,
  // which is stripped in CJS bundles.
  const stack = new Error().stack || '';
  const match = stack.match(/(?:file:\/\/\/|\s\()([^\s)]+\/pool\.ts)/);
  if (match) {
    const filePath = match[1].replace('file://', '');
    const devPath = join(dirname(filePath), 'dispatcher.worker.ts');
    if (existsSync(devPath)) {
      return { path: devPath, execArgv: ['--import', 'tsx'] };
    }
  }

  return null;
}

export interface WorkerPoolOptions {
  size?: number;
  idleTimeoutMs?: number;
}

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const inlineHandlers: Record<
  WorkerTaskKind,
  (payload: unknown) => Promise<unknown> | unknown
> = {
  'zstd:compress': handleZstdCompress,
  'zstd:decompress': handleZstdDecompress,
  'bridge:sync': handleBridgeSync,
  'agent:journal': handleAgentJournal,
  'agent:selfImprove': handleAgentSelfImprove,
  'mcp:executeTool': handleMcpExecuteTool,
};

class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: WorkerTask[] = [];
  private pending = new Map<string, PendingTask>();
  private busy = new Map<string, Worker>();
  private size: number;
  private taskTimeoutMs: number;
  private shutdown = false;
  private respawnCount = 0;
  private readonly maxRespawns = 10;
  private fallback = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.size = options.size ?? Math.max(1, availableParallelism() - 1);
    this.taskTimeoutMs = 300_000; // 5 minutes; LLM/MCP tasks can be slow
    try {
      this.spawnWorkers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[worker] Could not spawn workers (${msg}); falling back to inline execution.`);
      this.fallback = true;
    }
  }

  private spawnWorkers() {
    const entry = resolveWorkerEntry();
    if (!entry) {
      throw new Error('Could not resolve worker entry path');
    }
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(entry.path, {
        execArgv: entry.execArgv,
      });

      worker.on('message', (msg: WorkerResult) => this.onResult(msg));
      worker.on('error', (err) => this.onWorkerError(err));
      worker.on('exit', (code) => {
        if (code !== 0 && !this.shutdown) {
          console.error(`[worker] Worker exited with code ${code}; respawning...`);
          this.replaceWorker(worker);
        }
      });

      this.workers.push(worker);
      this.idle.push(worker);
    }
    console.log(`[worker] Pool ready — ${this.size} worker(s)`);
  }

  private replaceWorker(old: Worker) {
    if (this.shutdown) return;
    this.respawnCount++;
    if (this.respawnCount > this.maxRespawns) {
      console.error('[worker] Too many worker respawns; giving up.');
      return;
    }

    const idx = this.workers.indexOf(old);
    if (idx !== -1) this.workers.splice(idx, 1);
    const idleIdx = this.idle.indexOf(old);
    if (idleIdx !== -1) this.idle.splice(idleIdx, 1);

    const entry = resolveWorkerEntry();
    if (!entry) {
      console.error('[worker] Could not resolve worker entry path for replacement');
      return;
    }
    const worker = new Worker(entry.path, { execArgv: entry.execArgv });
    worker.on('message', (msg: WorkerResult) => this.onResult(msg));
    worker.on('error', (err) => this.onWorkerError(err));
    worker.on('exit', (code) => {
      if (code !== 0 && !this.shutdown) {
        console.error(`[worker] Replacement worker exited with code ${code}; respawning...`);
        this.replaceWorker(worker);
      }
    });
    this.workers.push(worker);
    this.idle.push(worker);
    this.pumpQueue();
  }

  private onResult(msg: WorkerResult) {
    const worker = this.busy.get(msg.id);
    this.busy.delete(msg.id);
    if (worker && !this.shutdown) {
      this.idle.push(worker);
      this.pumpQueue();
    }

    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (pending.timer) clearTimeout(pending.timer);

    if (msg.ok) {
      pending.resolve(msg.result);
    } else {
      pending.reject(new Error(msg.error || 'Worker task failed'));
    }
  }

  private onWorkerError(err: Error) {
    console.error('[worker] Worker error:', err);
  }

  private pumpQueue() {
    while (this.queue.length > 0 && this.idle.length > 0) {
      const task = this.queue.shift()!;
      const worker = this.idle.shift()!;
      this.busy.set(task.id, worker);
      worker.postMessage(task);
    }
  }

  runTask(kind: WorkerTaskKind, payload: unknown): Promise<unknown> {
    if (this.shutdown) {
      return Promise.reject(new Error('Worker pool is shutting down'));
    }

    if (this.fallback) {
      const handler = inlineHandlers[kind];
      if (!handler) return Promise.reject(new Error(`Unknown task kind: ${kind}`));
      return Promise.resolve(handler(payload));
    }

    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const task: WorkerTask = { id, kind, payload };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Worker task ${kind} timed out after ${this.taskTimeoutMs}ms`));
      }, this.taskTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.queue.push(task);
      this.pumpQueue();
    });
  }

  isFallback(): boolean {
    return this.fallback;
  }

  getStats() {
    return {
      size: this.size,
      idle: this.idle.length,
      busy: this.busy.size,
      queued: this.queue.length,
      pending: this.pending.size,
      fallback: this.fallback,
      respawns: this.respawnCount,
    };
  }

  terminate(): Promise<void> {
    this.shutdown = true;
    // Reject any still-pending tasks
    for (const [id, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error('Worker pool terminated'));
      this.pending.delete(id);
    }
    if (this.fallback) return Promise.resolve();
    return Promise.all(this.workers.map((w) => w.terminate())).then(() => undefined);
  }
}

let pool: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!pool) {
    pool = new WorkerPool();
  }
  return pool;
}

export function initWorkerPool(): WorkerPool {
  return getWorkerPool();
}

export async function shutdownWorkerPool(): Promise<void> {
  if (pool) {
    await pool.terminate();
    pool = null;
  }
}
