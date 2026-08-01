#!/usr/bin/env python3
import time, json, urllib.request
HERMES_INGEST = 'http://localhost:3002/api/hermes/ingest'
SEVEN_BASE = 'http://localhost:8001'
MAMA_BASE = 'http://localhost:3003'
POLL_INTERVAL = 30
_last = {}

def fetch(url, timeout=4):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception:
        return None

def ingest(source, obs_type, content):
    payload = json.dumps({'source': source, 'type': obs_type, 'content': content}).encode()
    req = urllib.request.Request(HERMES_INGEST, data=payload,
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=4): pass
    except Exception as e:
        print(f'[obs] ingest error: {e}', flush=True)

def changed(key, val):
    if _last.get(key) != val:
        _last[key] = val
        return True
    return False

def poll_seven():
    k = fetch(f'{SEVEN_BASE}/api/kernel/status')
    if k:
        locked = k.get('locked', '?')
        ver = k.get('loader_version', '?')
        if changed('seven_locked', locked):
            ingest('seven', 'status', f"Seven kernel {'LOCKED' if locked else 'active'} | v{ver}")
    v = fetch(f'{SEVEN_BASE}/api/vault/stats')
    if v and changed('seven_mem', v.get('memories',0)):
        ingest('seven', 'memory', f"Seven vault: {v.get('memories',0)} memories, {v.get('anchors',0)} anchors")
    s = fetch(f'{SEVEN_BASE}/api/sensors')
    if s and isinstance(s, dict):
        phi = s.get('phi')
        if changed('seven_phi', str(phi)[:10] if phi else None):
            ingest('seven', 'sensor', f'Seven sensors: {list(s.keys())} | phi={phi}')

def poll_mama():
    h = fetch(f'{MAMA_BASE}/api/health')
    if not h: return
    status = h.get('status','?'); freq = h.get('frequency','?'); ident = h.get('identity','MAMA')
    mcp = h.get('mcp','?'); ollama = h.get('ollama','?'); neuro = h.get('neuromatix','?')
    horm = h.get('hormones',{})
    if changed('mama_status', (status, mcp, ollama, neuro)):
        ingest('mama', 'status',
            f"{ident} {status} @ {freq} | mcp:{mcp} ollama:{ollama} neuromatix:{neuro}"
            f" | cortisol:{horm.get('cortisol','?')} dopamine:{horm.get('dopamine','?')}")

print('[observer] started -- Seven@8001 + MAMA@3003 -> Hermes@3002', flush=True)
ingest('observer', 'startup', 'SAGE Observer started -- monitoring Seven + MAMA')
while True:
    try:
        poll_seven()
        poll_mama()
    except Exception as e:
        print(f'[observer] error: {e}', flush=True)
    time.sleep(POLL_INTERVAL)
