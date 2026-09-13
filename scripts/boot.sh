#!/bin/bash
# ADHD-Sage boot: Sage (watchdog) + Spiral grafter-loop + agy token check
# Called from ~/.bashrc on shell login; idempotent via pgrep guards.
set -euo pipefail
HERMES_NODE=/root/.hermes/node/bin/node
HERMES_NPX=/root/.hermes/node/bin/npx
SAGE_DIR=/root/ADHD-Sage
SPIRAL_DIR=/root/Spiral

# Sage watchdog: only if not already running
if ! pgrep -af "sage-watchdog.sh" >/dev/null 2>&1; then
  if [ -x "$SAGE_DIR/sage-watchdog.sh" ]; then
    setsid bash "$SAGE_DIR/sage-watchdog.sh" >/dev/null 2>&1 &
    echo "[boot] Sage watchdog started pid $!" >&2
  else
    echo "[boot] WARN: $SAGE_DIR/sage-watchdog.sh missing/exec" >&2
  fi
else
  echo "[boot] Sage watchdog already running" >&2
fi

# Spiral grafter: only if not already running
if ! pgrep -af "grafter-loop.sh" >/dev/null 2>&1; then
  if [ -x /root/.spiral/grafter-loop.sh ]; then
    setsid bash /root/.spiral/grafter-loop.sh >/dev/null 2>&1 &
    echo "[boot] Spiral grafter started pid $!" >&2
  else
    echo "[boot] WARN: /root/.spiral/grafter-loop.sh missing" >&2
  fi
else
  echo "[boot] Spiral grafter already running" >&2
fi

# agy token hint
if [ ! -f "$HOME/.gemini/antigravity-cli/antigravity-oauth-token" ]; then
  echo "[boot] WARN: agy token missing — run 'agy --print hello' to auth" >&2
fi
