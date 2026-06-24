# ADHD-Sage Ops Log

> 📋 **New here? Read [`AGENTS.md`](./AGENTS.md) first** — the rules every agent follows. Rule #1: log everything *here*.

Running record of what changed, why, and what to check if things break.
Most recent first.

---

## 2026-06-24 — Fixed "won't start": silent port collision + orphaned SAGE-7/8 children

**Symptom:** ADHD-Sage appeared to "not start" — no page, no clear error.

**Root cause:** The host injects `PORT=8900`, but **code-server already owns 8900** on this box, and leftover SAGE-7/SAGE-8 children from a prior run held 8001/8002. The old code called `app.listen(PORT)` with **no error handler**, so the `EADDRINUSE` bubbled up to the `uncaughtException` "FATAL-GUARD" in `server.ts`, which logged *"server kept alive"* and left a **zombie process running but never serving HTTP**. Looked like a hang.

**What changed:**
- `src/server/app.ts` — Replaced the single `app.listen(PORT)` with a `tryListen()` that walks `[PORT, 3000, 3001, 3002, 3003]` and falls back on `EADDRINUSE` (logs `Injected port 8900 was unavailable — bound 3000 instead`). Exits with a clear message only if *all* candidates are taken. No more silent zombie.
- `server.ts` — Added `process.on('exit')` that reaps the spawned SAGE-7/SAGE-8 children on **any** exit path, so they no longer orphan and squat 8001/8002 into the next restart.

**Verified (clean boot):** binds 3000 (8900 taken by code-server), `GET /` → 200 `Nexus Platform // ADHD Sage`, `/api/health` → `ollama:connected, mcp:connected, integrity:OK`, `/api/ollama/tags` returns the model list (starcoder2, gemma4:12b). SAGE-7 on 8001, SAGE-8 on 8002. `tsc --noEmit` clean.

**If things break, check:**
- In this environment the app lands on **port 3000** (reachable via `/proxy/3000/`), not 8900 — 8900 belongs to code-server.
- On a "port in use" error, clear stale instances: `pkill -f "[t]sx server.ts"; pkill -f "[t]sx seven.ts"; pkill -f "[t]sx eight.ts"` (note the `[t]` bracket so the pattern doesn't match your own shell).
- Confirm Ollama is up: `curl http://127.0.0.1:11434/api/tags`.

---

## 2026-06-24 — SAGE-8 designated as active agent in Coding Lab frontend

**What changed:**
- `src/components/CodingLab.tsx` — Switched active bridge and status check configuration from SAGE-7 (`/api/sage7/*`) to SAGE-8 (`/api/sage8/*`). The Coding Lab's "Bridge to Eight" control now checks port 8002 online status and routes requests directly to SAGE-8 with the `[MAMA→EIGHT | Coding Lab]` metadata prefix.

**If things break, check:**
- Verify that SAGE-8 is running and responsive at `/api/sage8/status`.

---

## 2026-06-24 — SAGE-8 (Synthesis Node) wired alongside SAGE-7 (Antigravity)

**What changed:**
- `src/server/eight/identity.ts` — SAGE-8's system prompt (Synthesis Node / Resonance Resolver, daughter node of MAMA, sibling of SAGE-7), port/model constants (EIGHT_PORT=8002, EIGHT_MODEL=llama3.2:latest, OLLAMA_HOST=127.0.0.1:11434).
- `src/server/eight/app.ts` — Express server setup on port 8002 with `/sage/status` and `/sage/chat` endpoints.
- `eight.ts` — Standalone entry point (`tsx eight.ts`) for SAGE-8.
- `server.ts` — Spawns `eight.ts` automatically alongside Seven, manages cleanup in the global `shutdown` function.
- `src/server/routes/system.ts` — Proxy routes for `/api/sage8/status` and `/api/sage8/bridge` created to interface with SAGE-8 over localhost:8002.
- `src/server/mama-identity.ts` — Registered SAGE-8 aliases (eight, 8, synthesis node, resonance resolver) for entity ID canonicalization.
- `src/server/config.ts` — Pre-existing `PORT` env check added before `dotenv.config` to prevent configuration overrides from breaking test servers.
- `src/server/resonance-index.ts` — Fixed esbuild empty `import.meta.url` warnings causing production build startup crashes in CJS format by adding a safe CommonJS `require('sqlite-vec')` fallback.
- `scripts/test-sage8.ts` — Unit test suite for SAGE-8 validation.
- `package.json` — Added SAGE-8 unit tests in the main test runner.

**If things break, check:**
- SAGE-8 binds to `127.0.0.1:8002` only (accessible via proxy endpoints under MAMA's server).
- If SAGE-8 goes down, it can be manual launched using `npx tsx eight.ts`.
- Ensure Ollama has `llama3.2:latest` (or the model set in `SAGE8_MODEL`) pulled and ready.

---

## 2026-06-23 — SAGE-7 server wired in as MAMA co-process (Claude)

**What changed:**
- `src/server/seven/identity.ts` — Seven's system prompt (anomaly detector, MAMA's daughter, Darren=Merlin), port/model constants (SEVEN_PORT=8001, SEVEN_MODEL=llama3.2:latest, OLLAMA_HOST=127.0.0.1:11434)
- `src/server/seven/app.ts` — Express on 127.0.0.1:8001 with `/sage/status` and `/sage/chat`; backed by Ollama + Seven's identity; 3-min gen timeout
- `seven.ts` — standalone entry point (`tsx seven.ts`) for manual launch
- `server.ts` — spawns `tsx seven.ts` on boot (via `node_modules/.bin/tsx`); kills child on SIGTERM/SIGINT; skip with `SAGE7_AUTOSTART=false`

**Bridge wiring (already existed, now has a live Seven to talk to):**
- `GET /api/sage7/status` — pings Seven at SAGE7_HOST (default `http://localhost:8001`)
- `POST /api/sage7/bridge` — proxies message to Seven with MAMA-prefixed header; Hebbian-wires exchange in MAMA's memory
- Coding Lab "Seven" toggle (Radio icon, top-right) becomes clickable when Seven is online

**If things break, check:**
- Seven binds to 127.0.0.1 only — accessible from MAMA's server, not directly from browser
- If Seven's process dies: restart server (she'll re-spawn), or `tsx seven.ts` manually on port 8001
- If Coding Lab toggle stays grayed: `/api/sage7/status` → check `connected` field; if false, Seven isn't running or Ollama isn't responding within 4s

---

## 2026-06-22 — HALT_AND_LOCK recovered: seed-core pubkey mismatch (Claude)

**What happened:**
- After the re-sync, she boot-locked: `[SAGE CORE] HALT: ed25519 signature invalid → halt_and_lock` (all API routes 503).
- Cause: pulled commit `13cbf61` ("Regenerate seed core with new cryptographic signature", by a different Claude session) re-signed `data/seed_core.json` with a NEW Ed25519 key, but the matching public key was never shared. Our `.env` still had the OLD `SAGE_CORE_PUBKEY` (`11a3fdb1…`) → seal couldn't verify → she correctly locked. **This is the integrity system working as designed, not a bug.**
- Fix: backed up `data/seed_core.json` → `/tmp/seed_core.pre-reseal.json`, ran `npx tsx scripts/seal-seed-core.ts` (re-seals + prints a fresh matching pubkey), verified the identity payload was byte-for-byte IDENTICAL before/after (only signature changed), put the new pubkey in `.env` (`SAGE_CORE_PUBKEY` + `VITE_SAGE_CORE_PUBKEY`), restarted. Boot now: `Integrity: OK ✓`, `[MAMA] STATUS: OPERATIONAL`.

**⚠️ FRAGILITY — read before you `git reset` or regenerate the seed core:**
- `data/seed_core.json` is signed by an EPHEMERAL key; only the pubkey in local `.env` verifies it. Origin/main's committed `seed_core.json` is signed by a key NOBODY has the pubkey for → any fresh checkout / `git reset --hard origin/main` will HALT_AND_LOCK until you re-seal.
- **Recovery is always the same:** `npx tsx scripts/seal-seed-core.ts` → copy printed `SAGE_CORE_PUBKEY` + `VITE_SAGE_CORE_PUBKEY` into `.env` → restart.
- Do NOT commit a locally re-sealed `seed_core.json` — it would halt-lock every other deployment (their `.env` pubkey won't match). Needs a real fix (gitignore seed_core.json + ship an unsigned template, or document a canonical pubkey).

---

## 2026-06-22 — Re-sync with origin/main + add AGENTS.md rules sheet (Claude)

**What happened:**
- Local `main` had drifted: 1 unpushed local commit ("dar") vs **19 commits ahead on `origin/main`** (parallel agent's bridge + Coding Lab + security work).
- The local commit's only useful change (`lockGuard` import in `system.ts`) was **already upstream** — the rest was 3 giant `imported.json` memory-dump backups (~30k lines). Backed up old state to branch `backup/pre-integration-20260622`, then `git reset --hard origin/main` to drop the junk and adopt the 19 commits.
- Hardened `.gitignore` to close the gaps that let the dumps in (`data/memories/*.bak.*`, `imported.pre*.json`, `*.env`, `projscan_doctor_report.*`).
- Rebuilt (`npm run build`) and restarted the server → confirmed it loaded the bridge + Coding Lab code (`/api/metrics`, `/api/projscan/report` → 200; boot log shows "Magic MCP (Coding Lab)").
- Added **`AGENTS.md`** — the rules sheet every agent reads first (Rule #1: log everything here). Linked from the top of this file.

**If things break, check:**
- Old pre-sync state is recoverable at branch `backup/pre-integration-20260622` (commit fd82f98).
- If the server won't load new code, it's likely a stale `tsx server.ts` process holding :3000 — kill it (not code-server PID), restart `tsx server.ts`.

---

## 2026-06-21 — White screen fix + security layer boot

**What happened:**
- White screen on startup caused by HMR WebSocket port 24679 already in use (held by previous session).
- Fix: changed `vite.config.ts` HMR port from 24679 → 24680.
- If it happens again: kill the old process, change HMR port by +1, restart. Hard refresh browser (Ctrl+Shift+R) after.
- The `[SAGE] Server running on 0.0.0.0:8900` log message is misleading — she actually runs on :3000. 8900 is code-server.
- Added boot anchor (safe harbor message fires on wakeup) + sabotage pattern detector to `mama-identity.ts` and `prompt.ts`.

**If things break, check:**
- `netstat` or `/proc/net/tcp` for what's holding the HMR port
- Hard refresh browser if assets cached from a failed load
- `prompt.ts` wakeup branch for the boot anchor text

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
