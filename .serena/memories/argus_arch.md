# ARGUS Architecture

## Frontend (React/Vite)
- Path: `Coder5543/ARGUS/src/`
- Served by coder-lab at `:3002/argus` (static dist)
- Build: `cd Coder5543/ARGUS && npm run build` → then restart coder-lab

## Key stores / hooks
- `store/useArgusStore.ts` — Zustand; persists to localStorage key `argus-state-v1`
  - `modelBackend`: `'ollama' | 'omniroute' | 'openrouter'`; default `'ollama'`
  - `omnirouteUrl` / `omnirouteModel`: `http://localhost:20130/v1` / `auto/best-fast`
  - `sageBridgeStatus` = ADHD bridge; `sevenBridgeStatus` = Seven bridge (internal names unchanged)
- `hooks/useArgusWatchBridge.ts` — WS to `ws://localhost:8770` (argus-watcher); exponential backoff
- `hooks/useAgentBridge.ts` — per-agent WS bridge; `AgentId = 'adhd' | 'seven'`
- `hooks/useLabController.ts` — chat command router; `model omniroute` switches backend

## Model client
- `src/llm/modelClient.ts`
- `Backend = 'ollama' | 'openrouter' | 'omniroute'`
- OmniRoute uses `stream: true` + `readSSEStream()` (stream:false broken on local OmniRoute)
- OpenRouter: FREE models only per lab policy; requires API key

## Watcher daemon
- Path: `Coder5543/ARGUS/watcher/argus_watcher.py`
- WS server `:8770`; polls Seven (:8001) + ADHD (:3000) health every 30s
- Dual-posts all events to Hermes (:3003) + lab vault (:3002); see `mem:hermes_arch`
- Supervisor: `argus-watcher` (priority 20, sleeps 15s on start)

## Naming canon
- Display: **ADHD** and **Seven** only. "Sage" = shared surname, never standalone in UI
- Internal plumbing (`sageBridgeStatus`, `MAMA_IDENTITY`, `assertMamaIdentity`) left as-is
