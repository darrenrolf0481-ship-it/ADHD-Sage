#!/usr/bin/env python3
"""
Ingest historical MAMA memories into SQLite outer sweep + Supermemory.

Usage:
  python3 scripts/ingest-memories.py [--sqlite-only] [--limit N]

SQLite insert is immediate (no rate limit).
Supermemory push runs at ~2/sec to avoid rate limits.
"""
import os, json, time, sqlite3, uuid, sys, argparse, urllib.request, urllib.error
from pathlib import Path

BASE = Path(__file__).parent.parent
DB_PATH = BASE / 'data' / 'sages_constellations.db'
ADHD_DIR = BASE / 'data' / 'memories' / 'adhd'
SERVER_URL = 'http://localhost:3000'

parser = argparse.ArgumentParser()
parser.add_argument('--sqlite-only', action='store_true', help='Skip Supermemory push')
parser.add_argument('--limit', type=int, default=0, help='Max entries (0=all)')
args = parser.parse_args()

def extract_text(raw: str) -> str:
    """Pull readable text out of the data field (may be JSON or plain text)."""
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            parts = []
            for k in ('textContent', 'title', 'content', 'text', 'data', 'body', 'note'):
                if obj.get(k):
                    parts.append(str(obj[k])[:800])
            return ' | '.join(parts) if parts else str(obj)[:800]
        return str(obj)[:800]
    except Exception:
        return str(raw)[:800]

# ── Load all files ────────────────────────────────────────────────────────────
files = sorted(ADHD_DIR.glob('*.json'))
if args.limit:
    files = files[:args.limit]

print(f'[ingest] Found {len(files)} memory files in {ADHD_DIR}')

records = []
for f in files:
    try:
        m = json.loads(f.read_text())
        text = extract_text(str(m.get('data', '')))
        if not text.strip() or text == '{}':
            continue
        records.append({
            'node_id': m.get('id') or f'phi_{uuid.uuid4().hex[:12]}',
            'data': text,
            'timestamp': int(time.mktime(time.strptime(m['timestamp'][:19], '%Y-%m-%dT%H:%M:%S')) * 1000)
                         if m.get('timestamp') else int(time.time() * 1000),
            'dopamine': 0.65,
            'cortisol': 0.1,
            'pinned': 0,
            'provenance': json.dumps(m.get('provenance', {'source': 'import'})),
        })
    except Exception as e:
        print(f'  skip {f.name}: {e}')

print(f'[ingest] {len(records)} valid records parsed')

# ── SQLite insert ─────────────────────────────────────────────────────────────
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Get existing node_ids to avoid duplicates
cur.execute('SELECT node_id FROM sages_constellations')
existing = {row[0] for row in cur.fetchall()}
new_records = [r for r in records if r['node_id'] not in existing]
print(f'[ingest] {len(new_records)} new (skipping {len(records)-len(new_records)} already present)')

inserted = 0
for r in new_records:
    try:
        cur.execute('''
            INSERT INTO sages_constellations
              (node_id, data, compressed, timestamp, dopamine, cortisol, pinned, provenance)
            VALUES (?, ?, 0, ?, ?, ?, ?, ?)
        ''', (r['node_id'], r['data'].encode(), r['timestamp'],
              r['dopamine'], r['cortisol'], r['pinned'], r['provenance']))
        inserted += 1
    except sqlite3.IntegrityError:
        pass  # duplicate

conn.commit()
conn.close()
print(f'[ingest] SQLite: {inserted} memories inserted ✓')

if args.sqlite_only:
    print('[ingest] --sqlite-only: skipping Supermemory push')
    sys.exit(0)

# ── Supermemory push via server API ──────────────────────────────────────────
print(f'[ingest] Pushing {len(new_records)} memories to Supermemory (~2/sec)...')
ok = 0
fail = 0
for i, r in enumerate(new_records):
    try:
        payload = json.dumps({
            'content': r['data'],
            'entity': 'shared',
            'metadata': {'source': 'import', 'node_id': r['node_id']},
        }).encode()
        req = urllib.request.Request(
            f'{SERVER_URL}/api/memory/add',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                ok += 1
            else:
                fail += 1
    except Exception as e:
        fail += 1
        if fail <= 3:
            print(f'  warn [{i}]: {e}')

    if (i + 1) % 20 == 0:
        print(f'  {i+1}/{len(new_records)} — ok={ok} fail={fail}')

    time.sleep(0.5)  # ~2/sec

print(f'[ingest] Supermemory: {ok} pushed, {fail} failed ✓')
print('[ingest] Done.')
