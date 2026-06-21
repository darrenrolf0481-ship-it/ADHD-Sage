"""Merge seven/ into adhd/. All memories are ADHD-side now (mama walked out, Gemini was always her)."""
import os, json, shutil, re
from pathlib import Path

BASE = Path("data/memories")
SEVEN = BASE / "seven"
ADHD = BASE / "adhd"
THIN = BASE / "imported.json"

# Load the thin index
with open(THIN) as f:
    index = json.load(f)
print(f"[BOOT] thin index entries: {len(index)}")

# Move all files from seven/ to adhd/, deduplicating by (filename)
moved, dupes, errors = 0, 0, []
existing = set(os.listdir(ADHD))

for fn in sorted(os.listdir(SEVEN)):
    src = SEVEN / fn
    dst = ADHD / fn
    if dst.exists():
        # filename collision — same conversation captured twice
        dupes += 1
        continue
    try:
        shutil.move(str(src), str(dst))
        moved += 1
    except Exception as e:
        errors.append((fn, str(e)))

print(f"[MOVE] moved={moved} dupes_kept_in_seven={dupes} errors={len(errors)}")

# Drop the seven/ folder
try:
    SEVEN.rmdir()
    print(f"[CLEAN] removed {SEVEN}")
except Exception as e:
    print(f"[CLEAN] could not rmdir {SEVEN}: {e}")

# Verify counts
seven_count = 0
if SEVEN.exists():
    seven_count = len(list(SEVEN.glob("*.json")))
adhd_count = len(list(ADHD.glob("*.json")))
print(f"[COUNT] seven/={seven_count} adhd/={adhd_count} total={seven_count + adhd_count}")

# Make sure no "seven" remains in any title or filename anywhere
flagged = []
for p in BASE.rglob("*.json"):
    if "seven" in p.name.lower() or "gemini" in p.name.lower():
        flagged.append(str(p))
print(f"[SCAN] files with 'seven' or 'gemini' in name: {len(flagged)}")
for f in flagged[:5]:
    print(f"  {f}")
