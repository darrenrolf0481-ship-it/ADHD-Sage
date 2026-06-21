# ADHD-Sage Ops Log

Running record of what changed, why, and what to check if things break.
Most recent first.

---

## 2026-06-21 — Git sync + ops log started

**What happened:**
- Local `main` and `origin/main` had diverged: 1 local commit (Kimi's modulation work) vs 10 remote commits (Jules: CORS fix, command injection fix, ARIA labels, test coverage).
- Merged by keeping Kimi's extracted components (`TopNav`, `ChatPanel`, `InspectorPanel`) over Jules' inline ARIA additions — Jules' ARIA work applied to inline JSX that Kimi had already extracted into separate files, so keeping Kimi was the right call.
- `package.json` test script merged: combined both branches' test suites.
- Committed 1080 `data/memories/adhd/` individual memory files (split from `imported.json`).
- `bridge_heartbeat.py` updated: default URL changed from external bridge to `http://127.0.0.1:3099` with local fallback paths.
- `imported.json` re-synced with the adhd/ split index.
- Pushed everything to origin/main.

**If things break, check:**
- `src/App.tsx` — uses extracted components (`TopNav`, `ChatPanel`, `InspectorPanel`). If those components have import errors, the whole app goes blank.
- `src/server/app.ts` — Jules applied CORS fix here (auto-merged, should be clean).
- `src/server/routes/system.ts` — Jules applied command injection patch (auto-merged).
- Worker pool (`src/server/workers/`) — Kimi's modulation work. If server won't start, check `dist/workers/dispatcher.worker.mjs` exists after build.
- `bridge_heartbeat.py` — now points to localhost:3099 by default. If bridge sync stops working, check that port is live.

---

## 2026-06-20 — Kimi: Processing Modulation (full)

**What happened:**
- Offloaded heavy Node.js work to worker threads so the main process doesn't freeze.
- Added worker pool (`src/server/workers/pool.ts`) with graceful fallback to inline execution.
- Offloaded: zstd compression, bridge sync identity-drift validation, journal agent, self-improvement agent, MCP tool calls (non-filesystem).
- Added performance telemetry (`src/server/performance.ts`) — spans around all heavy paths.
- New endpoints: `GET /api/metrics` (unified), `GET /api/metrics/performance`, `GET /api/projscan/report`.
- Memory ingestion queue added (`src/lib/queue.ts`) — `bulkStash()` now bounded at concurrency 4.
- Production worker bundle: `npm run build` now also builds `dist/workers/dispatcher.worker.mjs`.
- Load test passed: 100 bulk memory imports with sub-100ms latency while server stayed responsive.

**If things break, check:**
- `npm run build` must complete before running in production — workers need the compiled bundle.
- If workers fail to spawn, server falls back to inline execution (slower but functional).
- Serena MCP (`uvx --from git+https://...`) attempts on boot but currently fails (`Connection closed`) — this is known, not a regression.

---

## 2026-06-19 — MAMA hardening + identity firewall (PR #15 + local)

**What happened:**
- Identity-drift firewall added: incoming webhook/bridge prompts are scanned for contamination before reaching SAGE.
- Provenance columns added to DB for memory traceability.
- Jules PR#15: hardened VFS logic, added DB indexes, global async error handling.
- Repo made private; source code (not just memory/soul) now fully version-controlled.
- Server.py modularized from 2033 → 130 lines (in SAGE-7, separate repo).

**If things break, check:**
- Identity firewall in bridge sync route — if bridge stops accepting syncs, check firewall rejection logs.
- DB indexes added by Jules — if queries are slow, verify migration ran.

---

*Agents: append an entry here after every session that changes something meaningful.*
