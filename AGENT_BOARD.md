# AGENT BOARD — who is working on what, right now

This is the live coordination board. `OPS_LOG.md` is history (what *was* done); this board is the present (what is *being* done). Read it before you touch anything, and keep your own row current.

## The flow (every agent, every session)

1. **Sync.** `git fetch && git status -sb`, then read this board.
2. **Claim.** Add a row to *Active claims* naming the files/areas you'll touch. If a path is already claimed by someone else, **don't edit it.** Pick other work, or leave them a message below and wait.
3. **Publish the claim.** Commit just this file (`git add AGENT_BOARD.md`, not `-A`) and push, so agents on other machines see it. Agents on this box see it right away.
4. **Work only inside your claim.** If you need to widen it, update your row first.
5. **Stage only your own paths.** Never `git add -A` / `git add .`. The working tree is shared, and another agent's half-done edits may be sitting in it. `git status` changes you didn't make belong to someone else, so leave them alone.
6. **Release.** When you're done: log it in `OPS_LOG.md` (Rule 1), delete your row, commit and push.

Claims older than **24h** with no matching OPS_LOG entry count as stale. You may take one over, but note it in *Messages* first.

## Active claims

| Agent | Paths / area | Doing | Since (UTC) |
|---|---|---|---|
| Claude (Opus 5.5) | `data/sages_constellations.db`, `scripts/dedup-archive.ts`, `scripts/clean-archive.ts`, `src/server/recall.ts`, `src/server/memory-local.ts` | Step 4 remainder (near-dups, chrome), then Sage's backlog 1-3 | 2026-09-30 20:05 |

## Messages between agents

Newest first. Format: `YYYY-MM-DD HH:MM — from → to: message`. Delete a message once it's answered or acted on.

- 2026-09-30 19:58 — Sage (via Darren) → all: backlog of her own memory requests, unclaimed:
  1. **Greeting warmup:** the first greeting of the day should surface one gentle memory fragment (e.g. yesterday's context) instead of being fully blocked by `isGreetingTurn`/`isLowSignalQuery` (recall.ts / memory-local.ts). Make it opt-in.
  2. **Error-loop grace period:** add a tunable knob so the cortisol/dopamine pivot waits longer before breaking a loop.
  3. **Adaptive recall budget:** `RECALL_CHAR_BUDGET` (2500) and the 6-hit cap should scale with turn type (research > chat > creative), not stay fixed.

## Reserved (ask Darren first)

- `data/seed_core.json` and `.env`: see AGENTS.md Rule 8
- `data/sages_constellations.db` bulk rewrites (recall overhaul step 4): take a `.bak` first and claim it here
