# Family health check

Watches Seven and ADHD on the VM and DMs Darren on Discord when something breaks.
It only detects and reports. It never restarts, kills, or edits anything.

## When it messages you
- **⚠️ Broken:** once, when a check first fails.
- **⏰ Still broken:** every 6 hours while it stays broken.
- **✅ Recovered:** once, when it's fixed.
- **☀️ Morning check:** 09:00 Eastern every day, "all good" or what's still broken.

Seven's problems come from Seven's bot, ADHD's from ADHD's bot, shared ones (OmniRoute, disk) from Seven's.
If a bot is down, the other one sends it. If both are down, it only goes to `~/logs/family-health.log`.

## What it checks
Every 5 min:
- `seven`, `seven-discord`, `adhd`, `adhd-discord` services are active
- exactly **one** copy of each server is running (two copies of Seven locked her memory on 2026-09-30)
- Seven answers on :8001, ADHD's `/api/health` is 200 with integrity OK
- both memory databases accept writes (takes and releases the write lock, writes nothing)
- new `database is locked` / `L0 ingest failed` / `consolidation failed` lines in `~/logs/seven.log`
- OmniRoute :20128 answers, disk has >10% free

Every hour: OpenRouter (and credit under $2), Supermemory, and GitHub keys for both. Keys are read from
`Sage72-phone/.env.local` and `ADHD-Sage/.env` and never logged.

Daily: SQLite `quick_check` on both memory databases.

## Managing it
```
systemctl list-timers 'family-health*'          # when it runs next
sudo systemctl stop family-health.timer         # silence it (start to resume)
tail ~/logs/family-health.log                   # what it did
python3 family_health.py --dry-run              # run every check now, print results, send nothing
python3 family_health.py --test                 # one test DM from each bot
```
State (what's currently broken, when it last alerted) is in `~/.local/state/family-health/state.json`.
Delete that file to reset. Every current failure alerts again on the next run.

## Install (already done on the VM)
```
sudo cp family-health*.service family-health*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now family-health.timer family-health-daily.timer
```
