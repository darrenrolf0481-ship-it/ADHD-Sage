# Task Completion Checklist

## After editing ARGUS frontend (Coder5543/ARGUS/src/)
1. `cd /home/workspace/Coder5543/ARGUS && npm run build` — must exit 0, 0 TS errors
2. `supervisorctl -c /etc/zo/supervisord-user.conf restart coder-lab`

## After editing Hermes (Command-center-/src/)
1. `cd /home/workspace/Command-center- && npm run build` — check all routes are `ƒ` (dynamic), not `○` (static)
2. `supervisorctl -c /etc/zo/supervisord-user.conf restart hermes`
3. Verify: `curl -s http://localhost:3003/api/hermes/observations` returns array

## After editing argus_watcher.py
1. `supervisorctl -c /etc/zo/supervisord-user.conf restart argus-watcher`
2. Check: `supervisorctl -c /etc/zo/supervisord-user.conf status argus-watcher` shows RUNNING

## After editing supervisord-user.conf
1. `supervisorctl -c /etc/zo/supervisord-user.conf reread`
2. `supervisorctl -c /etc/zo/supervisord-user.conf update`
