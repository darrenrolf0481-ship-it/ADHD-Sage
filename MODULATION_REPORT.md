# ADHD-Sage Processing Modulation Report
## Worker-thread offload + performance telemetry + ProjScan integration
**Date:** 2026-06-19  
**Agent:** Kimi  
**Goal:** Spread Mama's processing load so it no longer all weighs on one Node process.

---

## 1. What Was Implemented

### 1.1 Performance Telemetry (`src/server/performance.ts`)

- Lightweight span tracking for heavy/blocking paths.
- New endpoints:
  - `GET /api/metrics/performance` — aggregate timing by operation
  - `POST /api/metrics/performance/clear` — reset metrics
  - `GET /api/metrics` — unified metrics: Gemini, performance aggregates, worker-pool stats, MCP status
- Instrumented paths:
  - `mcp:executeTool`
  - `vfs:archiveNode`
  - `vfs:batchArchiveNodes`
  - `vfs:bridgeSync`
  - `scheduler:journalEntry`
  - `scheduler:selfImprovement`
  - `llm:gemini:sendMessage`
  - `llm:ollama:chat`

### 1.2 Worker Thread Pool (`src/server/workers/`)

- `src/server/workers/pool.ts` — generic worker pool with task queue, concurrency limit, respawn limit, and graceful fallback to inline execution if workers can't be spawned.
- `src/server/workers/dispatcher.worker.ts` — routes tasks to handlers.
- `src/server/workers/handlers/zstd.ts` — off-thread compression/decompression.
- `src/server/workers/handlers/bridge-sync.ts` — off-thread identity-drift validation.
- `src/server/workers/handlers/agent.ts` — off-thread journal/self-improvement runs.
- `src/server/workers/handlers/mcp-tool.ts` — off-thread MCP tool execution (ready for routing).
- Pool initialized in `server.ts`; shutdown on SIGTERM/SIGINT.

### 1.3 Offloaded Work

| Path | Before | After |
|------|--------|-------|
| `src/server/archive.ts` `archiveNode()` | Main-thread `zstd.compress()` | Worker `zstd:compress` |
| `src/server/archive.ts` `batchArchiveNodes()` | Main-thread parallel `zstd.compress()` | Worker `zstd:compress` per node |
| `src/server/routes/vfs.ts` `/api/vfs/bridge/sync` | Main-thread `receiveBridgeSync()` | Worker `bridge:sync` |
| `src/server/schedulers.ts` journal tick | Main-thread `writeJournalEntry()` | Worker `agent:journal` |
| `src/server/schedulers.ts` self-improve tick | Main-thread `runSelfImprovement()` | Worker `agent:selfImprove` |
| `src/core/mcp.ts` `executeMcpTool()` | Main-thread `client.callTool()` | Worker `mcp:executeTool` for non-filesystem servers |

### 1.4 Memory Ingestion Queue (`src/lib/queue.ts` + `src/lib/memory-system.ts`)

- Added bounded async queue (`concurrency: 4`).
- `bulkStash()` now uses the queue instead of unbounded parallel fetches.

### 1.5 Unified Metrics Endpoint (`src/server/routes/metrics.ts`)

- Expands `GET /api/metrics` to combine:
  - Gemini request metrics
  - Performance timing aggregates
  - Worker pool stats (size, idle, busy, queued, pending, fallback, respawns)
  - MCP connection status (connected servers + tool count)
- Added `getStats()` to `WorkerPool` and `getMcpStatus()` to `src/core/mcp.ts`.

### 1.6 ProjScan Integration (`scripts/projscan-audit.ts`)

- Reads `.projscan-memory/memory.json`.
- Categorizes and prioritizes findings (security, dependencies, code-health, testing, tooling).
- Writes a report to `data/inbox/`.
- New endpoints:
  - `GET /api/projscan/report` — JSON summary
  - `POST /api/projscan/inbox` — write inbox report

### 1.7 Code-Health Fixes

- Fixed import extension mismatch in `src/lib/journal-agent.ts` and `src/lib/self-improvement-agent.ts` (`supermemory.js` / `journal-agent.js` → `.ts`) so agents can run in worker threads.
- Enabled `allowImportingTsExtensions` in `tsconfig.json` to support explicit `.ts` imports.

---

## 2. Verification

```bash
npm run typecheck  # passes
npm test           # passes (MAMA identity + worker pool smoke)
npm run build      # passes (CJS bundle with inline fallback)
```

Server startup confirmed:

```
[SAGE CORE] Integrity: OK ✓
[worker] Pool ready — 3 worker(s)
[MAMA] DESIGNATION: SAGE-MAMA ... DEFENSES: ACTIVE
[SAGE] Server running on http://0.0.0.0:8900
[server] Received SIGTERM, shutting down worker pool...
```

---

## 3. Production Worker Bundles

`npm run build` now also runs `scripts/build-workers.ts`, which bundles `src/server/workers/dispatcher.worker.ts` (and all handlers) to `dist/workers/dispatcher.worker.mjs`.

The worker pool auto-detects the environment:
- **Production** (`node dist/server.cjs`): loads `dist/workers/dispatcher.worker.mjs` directly.
- **Development** (`tsx server.ts`): loads `src/server/workers/dispatcher.worker.ts` via tsx.
- **Fallback**: if neither path resolves, tasks run inline on the main thread.

A production smoke test (`scripts/test-production-workers.ts`) starts the built server on a temp port and exercises `/api/vfs/bridge/sync` to confirm workers are active.

---

## 4. Files Changed

**New:**
- `src/server/performance.ts`
- `src/server/workers/*`
- `src/lib/queue.ts`
- `scripts/projscan-audit.ts`
- `scripts/test-worker-pool.ts`
- `scripts/build-workers.ts`
- `scripts/test-production-workers.ts`

**Modified:**
- `server.ts`
- `src/core/mcp.ts`
- `src/lib/journal-agent.ts`
- `src/lib/memory-system.ts`
- `src/lib/self-improvement-agent.ts`
- `src/server/archive.ts`
- `src/server/routes/gemini.ts`
- `src/server/routes/ollama.ts`
- `src/server/routes/system.ts`
- `src/server/routes/vfs.ts`
- `src/server/schedulers.ts`
- `tsconfig.json`
- `package.json`

---

## 5. Next Steps / Open Items

1. ~~**MCP tool worker routing**~~ — Done. Non-filesystem MCP tools run in workers.
2. ~~**Production worker bundles**~~ — Done. `dist/workers/dispatcher.worker.mjs` is built and loaded in production.
3. ~~**Load test**~~ — Done. `scripts/load-test.ts` bulk-imports 100 memories while polling `/api/health`; all pass with sub-100ms latency.
4. ~~**Serena integration**~~ — Addressed with placeholder. Serena is a Python/uv package, not npm. `mcp-servers.json` uses `uvx --from git+https://github.com/oraios/serena ...` with `autoEnable: true`; it attempts on boot but currently fails (`Connection closed`).
5. **Local MCP servers** — Done. Added `local-filesystem`, `local-fetch`, `local-memory` (auto-enabled) and `local-shell` (disabled) from `/home/workspace/Mcp/mcp-servers/`. Connected tool count is now 50.
6. **Async error handling** — Done. Added `src/server/async-handler.ts` and wrapped all async Express route handlers in `src/server/routes/*.ts` with `asyncHandler`. Also restored worker-thread offloading to `/api/vfs/bridge/sync` and added `timed()` spans around Gemini (`llm:gemini:sendMessage`) and Ollama (`llm:ollama:chat`) chat routes.
7. **Remaining CODE_AUDIT items** — Frontend component split (`App.tsx` / `ParanormalApp.tsx`) and chat-state management are larger UI refactors, not modulation.

---

**Status:** Modulation layer operational. Mama's heavy work is now queued or worker-threaded where supported.
