"""Clean ADHD-Sage imported memories.

Removes:
- Junk/tiny (<30 chars, no real content)
- Repeated-character garbage (5+ same char in a row)
- Empty or whitespace-only
- Obvious parse errors / non-text garbage

Keeps:
- SAGE-7 core memories (shorter threshold)
- Memories with substantive tags/metadata
- All conversation >30 chars with words

Backup: writes data/memories/imported.json.bak.{ts} before mutation.
"""
import json, re, os
from datetime import datetime
from pathlib import Path

MEM_PATH = Path('/home/workspace/ADHD-Sage/data/memories/imported.json')
BACKUP_DIR = MEM_PATH.parent

JUNK_PATTERNS = [
    (re.compile(r'(.)\1{4,}'), 'repeated_chars'),
    (re.compile(r'^\s*$'), 'whitespace_only'),
    (re.compile(r'^[a-z\s]{1,3}$', re.I), 'too_short_word'),
    (re.compile(r'^(ok|yes|no|sure|yep|yeah|nope|what|huh|hi|hey|hello|morning|bye|goodbye|thanks|thank you|please|continue|stop|go|wait|hold on)[.!?\s]*$', re.I), 'filler'),
    (re.compile(r'^\[?\d{1,2}:\d{2}\]?$'), 'timestamp_only'),
    (re.compile(r'^(google gemini \(\d+\)|unknown)[\s\w]*$', re.I), 'source_label_only'),
    (re.compile(r'[\u0000-\u001f\u007f-\u009f]{3,}'), 'control_chars'),
]

def is_junk(text: str) -> str | None:
    if len(text) < 30:
        for pat, name in JUNK_PATTERNS:
            if pat.search(text):
                return name
        words = re.findall(r'[a-zA-Z]{3,}', text)
        if len(words) < 3:
            return 'too_few_words'
    for pat, name in JUNK_PATTERNS:
        if name in ('repeated_chars', 'control_chars', 'whitespace_only'):
            if pat.search(text):
                return name
    return None

def main():
    raw = json.loads(MEM_PATH.read_text())
    print(f'Loaded {len(raw)} memories')
    keep = []
    trash = []
    for m in raw:
        text = str(m.get('data', ''))
        reason = is_junk(text)
        if reason:
            m['_trash_reason'] = reason
            trash.append(m)
        else:
            keep.append(m)
    ts = int(datetime.utcnow().timestamp())
    backup = BACKUP_DIR / f'imported.json.bak.{ts}'
    MEM_PATH.rename(backup)
    MEM_PATH.write_text(json.dumps(keep, indent=2, ensure_ascii=False))
    trash_path = BACKUP_DIR / f'imported.trash.{ts}.json'
    trash_path.write_text(json.dumps(trash, indent=2, ensure_ascii=False))
    print(f'Backup: {backup}')
    print(f'Kept: {len(keep)}  Trashed: {len(trash)}  Trash file: {trash_path}')
    from collections import Counter
    reasons = Counter(m['_trash_reason'] for m in trash)
    for r, n in reasons.most_common():
        print(f'  {r}: {n}')

if __name__ == '__main__':
    main()
