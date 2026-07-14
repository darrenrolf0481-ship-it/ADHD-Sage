# Hermes Architecture

## Hermes Command Center (primary — :3003)
- Path: `Command-center-/`
- Runtime: `node .next/standalone/server.js` via supervisord `hermes` (priority 15)
- Routes: `POST /api/hermes/ingest`, `GET /api/hermes/observations`, `POST /api/hermes/query`
- Store: `Command-center-/hermes-memory.json` (max 500 obs)
- Query path: local OmniRoute (`http://localhost:20130/v1`, `auto/best-fast`, SSE stream) → fallback Ollama `kimi-k2.5:cloud`
- `readSSE()` in query/route.ts parses SSE chunks server-side (OmniRoute stream:false is broken)
- All routes are `force-dynamic` (GET observations was static before fix)

## Lab vault copy (secondary — :3002)
- Path: `Coder5543/src/api/routes/hermesRouter.ts`
- Mounted at `/api/hermes/*` inside Coder5543 Express server
- Same ingest/observations/query surface; store at `Coder5543/hermes-memory.json`

## Dual-post (argus-watcher)
- Every `watch_alert` and `audit` fans out via `asyncio.create_task(_forward_hermes(...))`
- `_forward_hermes` posts to BOTH `:3003/api/hermes/ingest` AND `:3002/api/hermes/ingest`
- Non-blocking; individual failures logged at DEBUG, never raise
- Env: `HERMES_URL=http://localhost:3003`, `LAB_HERMES_URL=http://localhost:3002`
