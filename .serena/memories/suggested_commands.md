# Suggested Commands

## Supervisor (all process management)
```
supervisorctl -c /etc/zo/supervisord-user.conf status
supervisorctl -c /etc/zo/supervisord-user.conf restart <name>
supervisorctl -c /etc/zo/supervisord-user.conf reread && supervisorctl -c /etc/zo/supervisord-user.conf update
```

## ARGUS frontend
```
cd /home/workspace/Coder5543/ARGUS && npm run build
supervisorctl -c /etc/zo/supervisord-user.conf restart coder-lab
```

## Hermes Command Center
```
cd /home/workspace/Command-center- && npm run build
supervisorctl -c /etc/zo/supervisord-user.conf restart hermes
```

## Test Hermes dual-post
```
curl -s -X POST http://localhost:3003/api/hermes/ingest -H "Content-Type: application/json" -d '{"source":"test","type":"ping","content":"..."}'
curl -s http://localhost:3003/api/hermes/observations | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))"
```

## OmniRoute test (streaming)
```
curl -s -X POST http://localhost:20130/v1/chat/completions -H "Content-Type: application/json" \
  -d '{"model":"auto/best-fast","messages":[{"role":"user","content":"ping"}],"stream":true}'
```
