# Conventions

## Naming
- Agents display as **ADHD** and **Seven** only — never "Sage", "MAMA", "SAGE-7" in user-facing text
- "Sage" is a shared surname; internal code names (`MAMA_IDENTITY`, `sageBridgeStatus`) are left as-is
- Hermes = Command Center at :3003; distinct from the hermesRouter inside Coder5543 (:3002)

## OmniRoute SSE pattern
- `stream: false` fails on this local OmniRoute instance — always use `stream: true`
- Must parse SSE manually: split on `\n`, extract `data:` lines, accumulate `choices[0].delta.content`, stop on `[DONE]`
- Both `Coder5543/ARGUS/src/llm/modelClient.ts` (`readSSEStream`) and `Command-center-/src/app/api/hermes/query/route.ts` (`readSSE`) use this pattern

## Hermes dual-post rule
- Any significant event (intervention, anomaly, audit) must land in BOTH :3003 and :3002
- Use `asyncio.create_task(_forward_hermes(...))` in watcher — never await in the hot path

## Model routing policy
- Default: Ollama (free, local)
- OmniRoute: local aggregator, free/zero-cost models, no API key needed
- OpenRouter: cloud, **FREE models only**, never default, requires explicit key
- AGY/paid models: manual choice only, never default

## Next.js API routes
- GET routes that read from filesystem must have `export const dynamic = "force-dynamic"` or they get pre-rendered as static at build time
