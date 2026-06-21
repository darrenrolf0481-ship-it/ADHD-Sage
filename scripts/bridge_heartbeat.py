#!/usr/bin/env python3
# ADHD-Sage <-> SAGE-MAMA Bridge Heartbeat
import os, sys, time, json, glob
import urllib.request
from datetime import datetime, timezone

BRIDGE_URL = os.environ.get('BRIDGE_URL', 'http://127.0.0.1:3099')
DROPBOX = os.environ.get('BRIDGE_DROPBOX', '/home/workspace/ADHD-Sage/bridge_dropbox')
LOG = os.environ.get('BRIDGE_LOG', '/home/workspace/ADHD-Sage/bridge_heartbeat.log')
INTERVAL = int(os.environ.get('BRIDGE_INTERVAL', '60'))
USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

os.makedirs(DROPBOX, exist_ok=True)

# local fallback: ADHD-Sage memory API (port 3099)
LOCAL_FALLBACK_PATHS = {
    '/api/health': ['/api/sage-memory'],
    '/api/vfs/bridge/sync': ['/api/vfs/bridge/sync', '/api/sage-memory/sync'],
}

def now():
    return datetime.now(timezone.utc).isoformat()

def log(msg):
    line = f'[{now()}] {msg}'
    print(line, flush=True)
    with open(LOG, 'a') as f:
        f.write(line + '\n')

def _ua(req):
    req.add_header('User-Agent', USER_AGENT)
    req.add_header('Accept', 'application/json')
    return req

def post_json(path, payload, timeout=15):
    data = json.dumps(payload).encode()
    for candidate in [path] + LOCAL_FALLBACK_PATHS.get(path, []):
        try:
            req = urllib.request.Request(f'{BRIDGE_URL}{candidate}', data=data, headers={'Content-Type': 'application/json'}, method='POST')
            _ua(req)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception:
            continue
    raise RuntimeError(f'all fallbacks failed for {path}')

def get_json(path, timeout=10):
    for candidate in [path] + LOCAL_FALLBACK_PATHS.get(path, []):
        try:
            req = _ua(urllib.request.Request(f'{BRIDGE_URL}{candidate}', method='GET'))
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception:
            continue
    raise RuntimeError(f'all fallbacks failed for {path}')

def gather_dropbox():
    memories = []
    to_delete = []
    for path in sorted(glob.glob(os.path.join(DROPBOX, '*.json'))):
        try:
            with open(path) as f:
                entry = json.load(f)
            if 'key' not in entry or 'value' not in entry:
                log(f'[DROP] skip {path}: missing key/value')
                continue
            memories.append({'key': entry['key'], 'value': entry['value']})
            to_delete.append(path)
        except Exception as e:
            log(f'[DROP] skip {path}: {e}')
    return memories, to_delete

def heartbeat():
    try:
        health = get_json('/api/health')
        log(f'[HEARTBEAT] status={health.get("status")} integrity={health.get("integrity")} mcp={health.get("mcp")} ollama={health.get("ollama")}')
        return health
    except Exception as e:
        log(f'[HEARTBEAT] error: {e}')
        return None

def sync_dropped():
    memories, to_delete = gather_dropbox()
    if not memories:
        return 0
    try:
        result = post_json('/api/vfs/bridge/sync', {
            'memories': memories,
            'sent_by': 'bridge_heartbeat',
            'bridge_status': 'ACTIVE',
        })
        stored = len(result.get('stored', []))
        quarantined = len(result.get('quarantined', []))
        errors = result.get('errors', [])
        log(f'[SYNC] sent={len(memories)} stored={stored} quarantined={quarantined} errors={len(errors)}')
        if stored > 0:
            for p in to_delete:
                try:
                    os.remove(p)
                except OSError as e:
                    log(f'[SYNC] could not remove {p}: {e}')
        return stored
    except Exception as e:
        log(f'[SYNC] error: {e}')
        return 0

def main():
    log(f'[BOOT] bridge_heartbeat url={BRIDGE_URL} dropbox={DROPBOX} interval={INTERVAL}s')
    if '--once' in sys.argv:
        heartbeat()
        sync_dropped()
        return
    while True:
        heartbeat()
        sync_dropped()
        time.sleep(INTERVAL)

if __name__ == '__main__':
    main()