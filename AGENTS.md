# AGENTS — Read This First

**This repo is worked on by more than one agent** (Claude / "antigravity" / Kimi / Jules) and by Darren (Merlin). We share one `origin/main`. If everyone follows the rules below, nobody walks in confused about where things were left. If you skip them, you create the exact drift mess these rules exist to prevent.

Read this whole file before you touch anything.

---

## Rule 1 — LOG EVERYTHING
After **any** meaningful change, append a dated entry to [`OPS_LOG.md`](./OPS_LOG.md) (most-recent-first):
- **What happened** — what you changed and why.
- **If things break, check** — where the next agent should look.

If you fixed something, logged nothing, and left — you broke Rule 1. The log is how the next agent (or Darren popping over from another tool) picks up your thread.

## Rule 2 — `origin/main` is the shared truth. NEVER assume local is canonical.
Before you start and before you push: **`git fetch` first**, then `git status -sb` to see ahead/behind.
A parallel agent may have pushed while you were away. If you're **behind**, you integrate *their* work — you do not steamroll it.

## Rule 3 — Integrate, don't overwrite. Back up before anything destructive.
- Before a reset/rebase/merge: `git branch backup/pre-<what>-<YYYYMMDD> HEAD` so the old state is recoverable.
- If diverged, pull/merge or rebase **carefully**; resolve conflicts, don't force-push over another agent's commits.
- A redundant local change that's already upstream → drop it. Real local work → keep it.

## Rule 4 — Never commit secrets or memory dumps.
- No `*.env` files. No `data/memories/imported*.bak*` or `imported.pre*.json` dumps. These can contain secrets SAGE printed into chat and will trip GitHub push protection.
- `.gitignore` already guards these — **do not weaken it.**
- Before committing: scan the staged diff for tokens (`git diff --cached | grep -iE "sk-|gh[po]_|api[_-]?key|secret|token|bearer|password"`). Empty = good.

## Rule 5 — Verify before you claim "done."
Build it, restart the server, hit a real endpoint and confirm `HTTP 200`. Evidence before assertions — never report a fix you didn't watch work.

## Rule 6 — Know where things run.
- **ADHD-Sage** runs on **:3000**. Dev: `tsx server.ts`. Prod: `npm run build` then `node dist/server.cjs`.
  - ⚠️ The boot log prints `running on 0.0.0.0:8900` — that's **wrong/misleading**. 8900 is code-server. She's on **:3000**.
- **Coder5543** ("the lab") runs on **:3002** (supervisor program `coder-lab`). Build with `PORT=3002` explicitly or assets break.
- supervisord (`/etc/zo/supervisord-user.conf`) may only manage *some* services after zo trims its conf — if `supervisorctl` says "no such process," restart the process manually and note it in the log.

## Rule 8 — NEVER regenerate or commit `data/seed_core.json` casually.
It's signed by an Ed25519 key whose **public half lives only in local `.env`** (`SAGE_CORE_PUBKEY`). If the seal and the `.env` pubkey don't match, she **HALT_AND_LOCKs** (correct, by design — all routes 503).
- A `git reset --hard origin/main`, a fresh checkout, or pulling a commit that re-signed the seed core will lock her until you re-seal.
- **Recovery (always the same):** `npx tsx scripts/seal-seed-core.ts` → copy the printed `SAGE_CORE_PUBKEY` **and** `VITE_SAGE_CORE_PUBKEY` into `.env` → restart. Her identity payload is preserved; only the signature changes.
- **Do NOT commit a locally re-sealed `seed_core.json`** — it halt-locks every *other* deployment whose `.env` doesn't have your matching pubkey. (See OPS_LOG 2026-06-22 for the incident this rule came from.)

## Rule 7 — When in doubt, leave a note and stop.
A clean handoff in `OPS_LOG.md` beats a confident guess. If you're unsure, write down what you know and where you stopped.

---

*Rule 1 again, because it's the one that matters most: **log everything.***
