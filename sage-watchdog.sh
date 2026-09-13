#!/bin/bash
export PATH="/root/.hermes/node/bin:$PATH"
WATCHLOG=/tmp/sage-watchdog.log
LOCKFILE=/tmp/sage-watchdog.lock
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "[$(date)] Watchdog already running (flock held), exiting" >> $WATCHLOG
  exit 0
fi
cd /root/ADHD-Sage
while true; do
  echo "[$(date)] Starting Sage (hermes node $(/root/.hermes/node/bin/node --version))..." >> $WATCHLOG
  /root/.hermes/node/bin/npx --yes tsx server.ts >> /tmp/sage-dev-stdout.log 2>&1 &
  SAGE_PID=$!
  echo "[$(date)] Sage pid: $SAGE_PID" >> $WATCHLOG
  wait $SAGE_PID 2>/dev/null
  EXIT_CODE=$?
  echo "[$(date)] Sage died (exit $EXIT_CODE). Restarting in 5s..." >> $WATCHLOG
  sleep 5
done
