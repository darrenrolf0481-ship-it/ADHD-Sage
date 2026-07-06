#!/usr/bin/env python3
"""
Bulk-import 1,080 Gemini-era adhd/ memory files into sages_constellations.db.
Also repairs the FTS table (fills in entries that exist in main but not FTS).

Must be run while adhd-sage supervisor service is stopped.
"""

import json
import os
import sqlite3
import hashlib
from datetime import datetime, timezone

DB_PATH = '/home/workspace/ADHD-Sage/data/sages_constellations.db'
ADHD_DIR = '/home/workspace/ADHD-Sage/data/memories/adhd'

def parse_ts_ms(ts_str: str) -> int:
    """Parse ISO timestamp to Unix milliseconds."""
    ts_str = ts_str.rstrip('Z')
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
        try:
            dt = datetime.strptime(ts_str, fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except ValueError:
            continue
    return int(datetime.now(timezone.utc).timestamp() * 1000)

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA journal_mode=WAL')
    cur = conn.cursor()

    # Load existing node_ids to avoid duplicate work
    cur.execute('SELECT node_id FROM sages_constellations')
    existing_ids = {row[0] for row in cur.fetchall()}
    print(f'Existing main rows: {len(existing_ids)}')

    cur.execute('SELECT node_id FROM sages_constellations_fts')
    existing_fts = {row[0] for row in cur.fetchall()}
    print(f'Existing FTS rows: {len(existing_fts)}')

    files = sorted(os.listdir(ADHD_DIR))
    print(f'Files to import: {len(files)}')

    inserted = 0
    skipped = 0
    fts_only = 0
    errors = 0

    conn.execute('BEGIN')

    for fname in files:
        path = os.path.join(ADHD_DIR, fname)
        try:
            with open(path, encoding='utf-8') as f:
                raw = json.load(f)

            text = raw.get('data', '')
            if not text or not text.strip():
                skipped += 1
                continue

            ts_str = raw.get('timestamp', '')
            ts_ms = parse_ts_ms(ts_str) if ts_str else int(datetime.now(timezone.utc).timestamp() * 1000)

            # Stable node_id from filename (SHA256 prefix for uniqueness)
            h = hashlib.sha256(fname.encode()).hexdigest()[:10]
            node_id = f'adhd_{h}'

            provenance = json.dumps({
                'originating_node': raw.get('originating_node', 'SAGE-MAMA'),
                'source_file': fname,
                'sync_source': 'gemini_era_import',
                'audit_timestamp': int(datetime.now(timezone.utc).timestamp() * 1000),
            })

            # data stored as JSON-stringified bytes (matches Node.js Buffer.from(JSON.stringify(data)))
            data_blob = json.dumps(text).encode('utf-8')

            if node_id not in existing_ids:
                cur.execute(
                    'INSERT OR IGNORE INTO sages_constellations '
                    '(node_id, data, compressed, timestamp, dopamine, cortisol, pinned, provenance) '
                    'VALUES (?, ?, 0, ?, ?, ?, 0, ?)',
                    (node_id, data_blob, ts_ms, 0.7, 0.1, provenance)
                )
                existing_ids.add(node_id)
                inserted += 1
            else:
                skipped += 1

            # Always ensure FTS entry exists
            if node_id not in existing_fts:
                cur.execute(
                    'INSERT OR IGNORE INTO sages_constellations_fts (node_id, content) VALUES (?, ?)',
                    (node_id, text)
                )
                existing_fts.add(node_id)
                fts_only += 1

        except Exception as e:
            print(f'  ERROR {fname}: {e}')
            errors += 1

    # Repair FTS for existing main entries missing from FTS
    cur.execute(
        'SELECT node_id, data FROM sages_constellations WHERE node_id NOT IN '
        '(SELECT node_id FROM sages_constellations_fts)'
    )
    orphan_rows = cur.fetchall()
    print(f'Orphaned main→FTS entries to repair: {len(orphan_rows)}')

    for node_id, data_blob in orphan_rows:
        try:
            # data is JSON-stringified text stored as bytes
            if isinstance(data_blob, bytes):
                text = json.loads(data_blob.decode('utf-8', errors='replace'))
            else:
                text = json.loads(str(data_blob))
            content = str(text) if not isinstance(text, str) else text
            cur.execute(
                'INSERT OR IGNORE INTO sages_constellations_fts (node_id, content) VALUES (?, ?)',
                (node_id, content)
            )
            fts_only += 1
        except Exception as e:
            # If we can't parse data, use empty string so FTS entry exists
            cur.execute(
                'INSERT OR IGNORE INTO sages_constellations_fts (node_id, content) VALUES (?, ?)',
                (node_id, '')
            )
            fts_only += 1

    conn.execute('COMMIT')
    conn.close()

    print(f'\n=== Import complete ===')
    print(f'  Inserted (main+FTS): {inserted}')
    print(f'  FTS entries added/repaired: {fts_only}')
    print(f'  Skipped (already existed): {skipped}')
    print(f'  Errors: {errors}')

if __name__ == '__main__':
    main()
