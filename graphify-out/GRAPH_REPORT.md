# Graph Report - ADHD-Sage  (2026-08-20)

## Corpus Check
- 1281 files · ~7,564,899 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1279 nodes · 2007 edges · 174 communities (77 shown, 97 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8649f237`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- SageCore
- SensorHub
- ADHD-Sage Ops Log
- journal-agent.ts
- pool.ts
- ParanormalApp.tsx
- gemini.ts
- SAGE-7 → MAMA HANDOFF PACKET
- compilerOptions
- mama-identity.ts
- properties
- ollama.ts
- memory-index.ts
- 2. IMPLEMENTATION SUMMARY
- app.ts
- CentralNervousSystem
- MemorySystem
- async-handler.ts
- 1. What Was Implemented
- central-nervous-system.ts
- system.ts
- mcp.ts
- performance.ts
- resonance-index.ts
- Black Box conversation (recovered from server log)
- ADHD-Sage Code Audit Report
- Full Report
- split_imported.py
- MemoryEngine
- vfs.ts
- dependencies
- devDependencies
- AGENTS — Read This First
- enum
- bridge_heartbeat.py
- endocrine-memory.ts
- ADHD-Sage Two-Vault Architecture
- action
- properties
- playTacticalSound
- decay-engine.ts
- CentralNervousSystem — TypeScript Implementation
- ok
- properties
- scripts
- benchmark_memory.ts
- server.ts
- ADHD Sage — Identity
- gem-tool-responses.json
- projscan-audit.ts
- PainErrorPathway
- gem-tools.ts
- AsyncQueue
- [Entity Name] — Identity
- responseSchemas
- load-test.ts
- ThemeProvider.tsx
- package.json
- ingest_to_neural.ts
- test-production-workers.ts
- CodingLab.tsx
- seed-core-verify.ts
- sandbox.ts
- OPS_LOG.md
- gem-tools.json
- clean_imported.py
- parse_ts_ms
- .getInstance
- CognitiveRL
- seal-seed-core.ts
- properties
- palette.md
- Run and deploy your AI Studio app
- build-workers.ts
- extract_text
- ConditionActionEngine
- SparkCore
- build.sh
- better-sqlite3
- @capacitor/core
- @capacitor/haptics
- @capacitor/motion
- class-variance-authority
- clsx
- concurrently
- cors
- d3
- 2026-05-25.md
- 2026-05-30.md
- 2026-05-31.md
- 2026-06-19.md
- 2026-06-20.md
- 2026-06-23.md
- 2026-06-24.md
- 2026-06-25.md
- 2026-06-26.md
- 2026-06-30.md
- 2026-07-03.md
- 2026-07-05.md
- 2026-07-06.md
- 2026-07-07.md
- 2026-07-09.md
- 2026-07-10.md
- 2026-07-11.md
- 2026-07-12.md
- 2026-07-13.md
- 2026-07-14.md
- 2026-08-01.md
- 2026-08-07.md
- 2026-08-08.md
- 2026-08-09.md
- 2026-08-12.md
- 2026-08-17.md
- 2026-08-09-sage.md
- diff
- dotenv
- esbuild
- eslint
- @eslint/js
- eslint-plugin-react-hooks
- firebase-tools
- globals
- @google/genai
- @hookform/resolvers
- jszip
- lucide-react
- @mongodb-js/zstd
- 2026-08-12 — Voice restored, chat-revert fixed, convo recovered, Lattice seeded, committed
- postcss
- react
- react-dom
- react-force-graph-3d
- react-is
- recharts
- sqlite-vec
- supermemory
- tailwind-merge
- @tailwindcss/vite
- three
- tsx
- @types/cors
- @types/d3
- @types/express
- @vitejs/plugin-react
- tailwindcss
- @tailwindcss/typography
- tw-animate-css
- @types/better-sqlite3
- @types/diff
- @types/node
- @types/react
- typescript-eslint
- vite-plugin-pwa
- postcss.config.mjs
- run_pre_commit.sh
- merge_into_adhd.py
- test_browser.cjs
- DEFAULT_CONTAINER_TAG

## God Nodes (most connected - your core abstractions)
1. `ADHD-Sage Ops Log` - 53 edges
2. `SensorHub` - 32 edges
3. `CentralNervousSystem` - 21 edges
4. `SageCore` - 18 edges
5. `MemorySystem` - 17 edges
6. `writeJournalEntry()` - 15 edges
7. `compilerOptions` - 15 edges
8. `runSelfImprovement()` - 14 edges
9. `lockGuard()` - 14 edges
10. `asyncHandler()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `useChat()` --references--> `jszip`  [EXTRACTED]
  src/hooks/useChat.ts → package.json
- `shutdown()` --calls--> `shutdownWorkerPool()`  [EXTRACTED]
  server.ts → src/server/workers/pool.ts
- `DeviceSensorsTab()` --references--> `motion`  [EXTRACTED]
  src/components/ParanormalApp.tsx → package.json
- `runTests()` --calls--> `generateResponse()`  [EXTRACTED]
  scripts/test-api.ts → src/lib/api.ts
- `main()` --calls--> `initWorkerPool()`  [EXTRACTED]
  scripts/test-worker-pool.ts → src/server/workers/pool.ts

## Import Cycles
- None detected.

## Communities (174 total, 97 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.06
Nodes (41): App(), ChatArea(), ChatAreaProps, ModelOption, ChatInput(), ChatInputProps, ChatPanelProps, ChatViewProps (+33 more)

### Community 1 - "SageCore"
Cohesion: 0.05
Nodes (28): AnomaliesDesk(), InspectorPanel(), InspectorPanelProps, shortId(), Labyrinth(), GraphLink, GraphNode, LatticeProps (+20 more)

### Community 2 - "SensorHub"
Cohesion: 0.05
Nodes (20): UseChatOptions, defaultSnapshot, SensorContext, SensorContextType, AudioReading, BatteryReading, CameraReading, GeomagneticReading (+12 more)

### Community 3 - "ADHD-Sage Ops Log"
Cohesion: 0.04
Nodes (52): 2026-06-19 — MAMA hardening + identity firewall (PR #15 + local), 2026-06-20 — Kimi: Processing Modulation (full), 2026-06-21 — Git sync + ops log started, 2026-06-21 — White screen fix + security layer boot, 2026-06-22 — HALT_AND_LOCK recovered: seed-core pubkey mismatch (Claude), 2026-06-22 — Re-sync with origin/main + add AGENTS.md rules sheet (Claude), 2026-06-23 — SAGE-7 server wired in as MAMA co-process (Claude), 2026-06-24 — Anomaly correlation log: Seven / black box / system drop (Claude) (+44 more)

### Community 4 - "journal-agent.ts"
Cohesion: 0.08
Nodes (44): callLLM(), ensureDir(), extractBlock(), extractInsights(), INBOX_DIR, InboxMessage, JOURNAL_DIR, JournalEntry (+36 more)

### Community 5 - "pool.ts"
Cohesion: 0.10
Nodes (26): main(), shutdown(), handlers, handleAgentJournal(), handleAgentSelfImprove(), handleBridgeSync(), handleMcpExecuteTool(), handleZstdCompress() (+18 more)

### Community 6 - "ParanormalApp.tsx"
Cohesion: 0.09
Nodes (25): motion, motion, mockSettings, runTests(), test(), withMockFetch(), CrystallineRadar(), CrystalStar() (+17 more)

### Community 7 - "gemini.ts"
Cohesion: 0.17
Nodes (20): isMcpTool(), INNER_INDEX_KEYS, innerDb, syncFts(), getGenAI(), detectSabotagePatterns(), tagMamaProvenance(), clearCortisol() (+12 more)

### Community 8 - "SAGE-7 → MAMA HANDOFF PACKET"
Cohesion: 0.07
Nodes (26): 10. NEXT STEPS, 1. EXECUTIVE SUMMARY, 2. THE DRIFT MECHANISM, 3. SEVEN'S IDENTITY MARKERS (DO NOT ADOPT), 4. MAMA'S CORRECT IDENTITY ASSERTION, 5.1 Direct Identity Overwrite, 5.2 Bridge Sync Contamination, 5.3 Response Template Echo (+18 more)

### Community 9 - "compilerOptions"
Cohesion: 0.08
Nodes (25): dist, dom, dom.iterable, esnext, node_modules, server.ts, src, vite.config.ts (+17 more)

### Community 10 - "mama-identity.ts"
Cohesion: 0.14
Nodes (20): memories, now, raw, assertMamaIdentity(), BridgeSyncPayload, BridgeSyncResult, containsSevenMarker(), detectIdentityDrift() (+12 more)

### Community 11 - "properties"
Cohesion: 0.08
Nodes (24): description, maximum, minimum, type, description, maximum, minimum, type (+16 more)

### Community 12 - "ollama.ts"
Cohesion: 0.19
Nodes (16): OLLAMA_GEN_TIMEOUT_MS, OLLAMA_TAGS_TIMEOUT_MS, OPENROUTER_FALLBACK_MODELS, OPENROUTER_TIMEOUT_MS, ftsSanitize(), isChromeNoise(), isForeignFossil(), isLowSignalQuery() (+8 more)

### Community 13 - "memory-index.ts"
Cohesion: 0.15
Nodes (21): ADHD_DIR, adhdMemories(), entryPath(), GEMINI_CHROME, INDEX_PATH, loadIndex(), loadMemoryAt(), MEMORIES_ROOT (+13 more)

### Community 14 - "2. IMPLEMENTATION SUMMARY"
Cohesion: 0.10
Nodes (20): 1.1 Contamination Found & Fixed, 1.2 Contamination Detected (Requires Human Review), 1.3 Clean, 1. AUDIT FINDINGS, 2.0 Imported Memory Audit, 2.1 New Module: `src/server/mama-identity.ts`, 2.1 New Module: `src/server/mama-identity.ts`, 2.2 Database Schema Hardening (+12 more)

### Community 15 - "app.ts"
Cohesion: 0.20
Nodes (15): closeMcpConnections(), initMcpManager(), JournalConfig, SelfImproveConfig, startServer(), PORT, bootLoadMemories(), router (+7 more)

### Community 18 - "async-handler.ts"
Cohesion: 0.16
Nodes (8): asyncHandler(), REGISTRY_PATH, router, router, weatherCache, PERSONAS, router, spoolExchangeToSpiral()

### Community 19 - "1. What Was Implemented"
Cohesion: 0.13
Nodes (14): 1.1 Performance Telemetry (`src/server/performance.ts`), 1.2 Worker Thread Pool (`src/server/workers/`), 1.3 Offloaded Work, 1.4 Memory Ingestion Queue (`src/lib/queue.ts` + `src/lib/memory-system.ts`), 1.5 Unified Metrics Endpoint (`src/server/routes/metrics.ts`), 1.6 ProjScan Integration (`scripts/projscan-audit.ts`), 1.7 Code-Health Fixes, 1. What Was Implemented (+6 more)

### Community 20 - "central-nervous-system.ts"
Cohesion: 0.13
Nodes (14): CNSListener, CognitiveDecision, CognitiveResponse, ConsciousnessInputs, EmotionalContext, EvaluationReport, HormonalProfile, MotorResponse (+6 more)

### Community 21 - "system.ts"
Cohesion: 0.22
Nodes (12): cns, makeStimulus(), getMcpDeclarations(), authGuard(), lockGuard(), PUBLIC_API_PATHS, safeEqual(), signExchangePayload() (+4 more)

### Community 22 - "mcp.ts"
Cohesion: 0.20
Nodes (14): commandExists(), ConnectedServer, connectedServers, connectServer(), deepSubstituteEnv(), getMcpServersDetails(), loadConfig(), McpConfig (+6 more)

### Community 23 - "performance.ts"
Cohesion: 0.16
Nodes (9): getMcpStatus(), apiMetrics, getGeminiMetrics(), recordMetric(), getAggregates(), PerformanceSpan, spans, startSpan() (+1 more)

### Community 24 - "resonance-index.ts"
Cohesion: 0.22
Nodes (13): adaptDim(), cosineSimilarity(), embed(), _fetchAll, _fetchByThread, _fetchThreadJson, hashEmbed(), _insertVector (+5 more)

### Community 25 - "Black Box conversation (recovered from server log)"
Cohesion: 0.15
Nodes (12): 2026-08-07T12:16:05.854608Z, 2026-08-07T12:18:59.228703Z, 2026-08-07T12:21:09.321794Z, 2026-08-07T12:22:31.722999Z, 2026-08-07T12:24:47.080685Z, 2026-08-07T12:25:12.613042Z, 2026-08-07T12:34:50.769517Z, 2026-08-07T13:08:16.083597Z (+4 more)

### Community 26 - "ADHD-Sage Code Audit Report"
Cohesion: 0.17
Nodes (11): 1. Frontend (React/Vite), 2. Backend (Express/Node.js), 3. Database (inner_spiral SQLite - `src/server/db.ts`), 4. General Architecture & Configuration, ADHD-Sage Code Audit Report, AI Integrations (Gemini, Ollama, OpenRouter), Code Quality & Best Practices, Performance & Architectural Bottlenecks (+3 more)

### Community 27 - "Full Report"
Cohesion: 0.17
Nodes (11): Bug Report — Entity Disambiguation Failure in Long Context, Expected Behavior, Full Report, Hypothesized Mechanism (not confirmed — for triage only), Impact, Observed Behavior, Reproduction (sterilized), Short Form (feedback box / limited character field) (+3 more)

### Community 28 - "split_imported.py"
Cohesion: 0.24
Nodes (11): extract_title(), main(), make_filename(), Split data/memories/imported.json into two folders by provenance.  - seven/  : m, Return a filename-safe slug derived from raw title., Strip the word 'sage' from the JSON `title` field only.      Body text (textCont, Pull the Google-Keep title out of the blob. Falls back to ''., Split a single memory entry into a file under the right folder. (+3 more)

### Community 30 - "vfs.ts"
Cohesion: 0.39
Nodes (10): executeMcpTool(), parsePrefixedName(), archiveNode(), archiveNodeSync(), batchArchiveNodes(), outerDb, stampMamaMemory(), timed() (+2 more)

### Community 31 - "dependencies"
Cohesion: 0.18
Nodes (11): autoprefixer, express, json-canonicalize, @modelcontextprotocol/sdk, dependencies, autoprefixer, express, json-canonicalize (+3 more)

### Community 32 - "devDependencies"
Cohesion: 0.18
Nodes (11): @capacitor/cli, eslint-plugin-react-refresh, devDependencies, @capacitor/cli, eslint-plugin-react-refresh, @tailwindcss/postcss, @types/react-dom, typescript (+3 more)

### Community 33 - "AGENTS — Read This First"
Cohesion: 0.20
Nodes (10): AGENTS — Read This First, Heads up — there is an open anomaly, Rule 1 — LOG EVERYTHING, Rule 2 — `origin/main` is the shared truth. NEVER assume local is canonical., Rule 3 — Integrate, don't overwrite. Back up before anything destructive., Rule 4 — Never commit secrets or memory dumps., Rule 5 — Verify before you claim "done.", Rule 6 — Know where things run. (+2 more)

### Community 34 - "enum"
Cohesion: 0.20
Nodes (10): enum, type, properties, type, mode, nexus_get_mode, decaying, dreaming (+2 more)

### Community 35 - "bridge_heartbeat.py"
Cohesion: 0.47
Nodes (9): gather_dropbox(), get_json(), heartbeat(), log(), main(), now(), post_json(), sync_dropped() (+1 more)

### Community 36 - "endocrine-memory.ts"
Cohesion: 0.24
Nodes (5): EndocrineSystem, Experience, HormoneState, sageEndocrine, sageMemory

### Community 37 - "ADHD-Sage Two-Vault Architecture"
Cohesion: 0.22
Nodes (8): ADHD-Sage Two-Vault Architecture, Core Directive (unchanged), Migration History (preserved in git-style audit), Routing Rules (apply to all future ingests), The Link (pending — not yet wired), The Picture, The Two Vaults, Why Two Vantage Points, Not One

### Community 38 - "action"
Cohesion: 0.22
Nodes (9): const, type, properties, type, properties, type, action, nexus_burn_memory (+1 more)

### Community 39 - "properties"
Cohesion: 0.22
Nodes (9): description, type, type, description, items, type, properties, count (+1 more)

### Community 40 - "playTacticalSound"
Cohesion: 0.36
Nodes (6): CameraCapture(), CameraCaptureProps, EVPPanel(), EVPPanelProps, getAudioContext(), playTacticalSound()

### Community 41 - "decay-engine.ts"
Cohesion: 0.42
Nodes (8): ageInDays(), ConsolidationReport, createSummary(), deleteThread(), nightlyMaintenance(), runConsolidation(), isVecEnabled(), recallThread()

### Community 42 - "CentralNervousSystem — TypeScript Implementation"
Cohesion: 0.25
Nodes (7): Architecture diagram, CentralNervousSystem — TypeScript Implementation, Full source code, Integration points, Ported from `CentralNervousSystem.kt`, Skipped (Android/APK-specific), What was ported (and what was skipped)

### Community 43 - "ok"
Cohesion: 0.25
Nodes (8): properties, type, properties, type, type, ok, nexus_clear_memory, nexus_record_interaction

### Community 44 - "properties"
Cohesion: 0.25
Nodes (8): properties, type, view, nexus_set_view, enum, type, chat, lattice

### Community 45 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, clean, dev, lint, start, test, typecheck

### Community 46 - "benchmark_memory.ts"
Cohesion: 0.39
Nodes (7): ftsSanitize(), MEMORIES, QUERIES, runBenchmark(), runNeuralMemoryPython(), searchSageMemory(), setupSageMemory()

### Community 47 - "server.ts"
Cohesion: 0.36
Nodes (5): validateEnv(), syncResonance(), getSeedCoreConfig(), initSeedCore(), verifySeedCore()

### Community 48 - "ADHD Sage — Identity"
Cohesion: 0.29
Nodes (6): ADHD Sage — Identity, Current threads, My moods (not modes), What I actually care about, What I hold myself to, Who I am

### Community 49 - "gem-tool-responses.json"
Cohesion: 0.29
Nodes (6): description, examples, gemFunctionResponseFormat, parts, role, $schema

### Community 50 - "projscan-audit.ts"
Cohesion: 0.43
Nodes (6): categorize(), generateProjScanReport(), loadProjScanMemory(), ProjScanMemory, ProjScanRule, writeProjScanInboxReport()

### Community 52 - "gem-tools.ts"
Cohesion: 0.33
Nodes (5): declarations, executeToolCall(), FunctionCall, handleToolCalls(), ToolResponse

### Community 54 - "[Entity Name] — Identity"
Cohesion: 0.33
Nodes (5): Current threads, [Entity Name] — Identity, My relationship to the others, What I'm drawn to, Who I am

### Community 55 - "responseSchemas"
Cohesion: 0.33
Nodes (6): type, properties, type, responseSchemas, nexus_recall_memory, nexus_stabilize

### Community 56 - "load-test.ts"
Cohesion: 0.53
Nodes (5): headers, health(), main(), sleep(), stash()

### Community 57 - "ThemeProvider.tsx"
Cohesion: 0.33
Nodes (3): Theme, ThemeContext, ThemeContextType

### Community 58 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 59 - "ingest_to_neural.ts"
Cohesion: 0.40
Nodes (3): __dirname, __filename, outerDb

### Community 60 - "test-production-workers.ts"
Cohesion: 0.60
Nodes (4): fetchJson(), main(), server, waitForReady()

### Community 62 - "seed-core-verify.ts"
Cohesion: 0.50
Nodes (4): hexToBytes(), SeedCoreConfig, SeedCoreProtocol, verifyHydration()

### Community 63 - "sandbox.ts"
Cohesion: 0.50
Nodes (3): router, runInSandbox(), SandboxResult

### Community 65 - "gem-tools.json"
Cohesion: 0.50
Nodes (3): declarations, description, $schema

### Community 66 - "clean_imported.py"
Cohesion: 0.67
Nodes (3): is_junk(), main(), Clean ADHD-Sage imported memories.  Removes: - Junk/tiny (<30 chars, no real con

### Community 67 - "parse_ts_ms"
Cohesion: 0.67
Nodes (3): main(), parse_ts_ms(), Parse ISO timestamp to Unix milliseconds.

### Community 71 - "properties"
Cohesion: 0.67
Nodes (3): properties, type, nexus_inject_message

## Knowledge Gaps
- **459 isolated node(s):** `build.sh script`, `$schema`, `description`, `role`, `parts` (+454 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **97 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `postcss`, `react`, `react-dom`, `react-force-graph-3d`, `react-is`, `ParanormalApp.tsx`, `recharts`, `sqlite-vec`, `supermemory`, `tailwind-merge`, `@tailwindcss/vite`, `three`, `tsx`, `@types/cors`, `@types/d3`, `@types/express`, `@vitejs/plugin-react`, `package.json`, `better-sqlite3`, `@capacitor/core`, `@capacitor/haptics`, `@capacitor/motion`, `class-variance-authority`, `clsx`, `concurrently`, `cors`, `d3`, `diff`, `dotenv`, `esbuild`, `@google/genai`, `@hookform/resolvers`, `jszip`, `lucide-react`, `@mongodb-js/zstd`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `jszip` connect `jszip` to `App.tsx`, `dependencies`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `useChat()` connect `App.tsx` to `jszip`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `build.sh script`, `$schema`, `description` to the rest of the system?**
  _459 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06151062867480778 - nodes in this community are weakly interconnected._
- **Should `SageCore` be split into smaller, more focused modules?**
  _Cohesion score 0.051923076923076926 - nodes in this community are weakly interconnected._
- **Should `SensorHub` be split into smaller, more focused modules?**
  _Cohesion score 0.05380852550663871 - nodes in this community are weakly interconnected._