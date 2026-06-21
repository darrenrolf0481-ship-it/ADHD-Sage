"""Split data/memories/imported.json into two folders by provenance.

- seven/  : memories tagged SAGE-7  (the Seven-side / local Sage side)
- adhd/   : memories tagged SAGE-MAMA (the mama / ADHD-side)

Each entry becomes its own JSON file:
  seven/<timestamp>__<safe_title>.json
  adhd/<timestamp>__<safe_title>.json

The word "sage" (case-insensitive, whole-word) is stripped from the FILE TITLE
(the `title` field inside the JSON blob and the filename). The body text is
left untouched so the actual content is preserved.

After splitting, data/memories/imported.json is replaced with a thin index that
just points at each split file. A backup of the original is written first.

This script is idempotent: re-running it overwrites the split files but never
destroys the backup.
"""
from __future__ import annotations
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path("/home/workspace/ADHD-Sage")
MEM_DIR = ROOT / "data" / "memories"
SRC = MEM_DIR / "imported.json"
SEVEN_DIR = MEM_DIR / "seven"
ADHD_DIR = MEM_DIR / "adhd"
INDEX = SRC  # we overwrite imported.json with the thin index after backup

TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
SAGE_WORD_RE = re.compile(r"\bsage\b", re.IGNORECASE)
# Title field inside the embedded Google-Keep JSON blob
TITLE_RE = re.compile(r'"title"\s*:\s*"([^"]*)"')


def safe_title(raw: str) -> str:
    """Return a filename-safe slug derived from raw title."""
    # Strip SAGE word first (whole-word, case-insensitive)
    cleaned = SAGE_WORD_RE.sub("", raw or "")
    cleaned = cleaned.strip().strip('"').strip("'").strip()
    # Collapse whitespace to underscore
    cleaned = re.sub(r"\s+", "_", cleaned)
    # Keep alnum + underscore + dash, drop the rest
    cleaned = re.sub(r"[^A-Za-z0-9_\-]", "", cleaned)
    # Trim leading/trailing underscores/dashes
    cleaned = cleaned.strip("_-")
    if not cleaned:
        cleaned = "untitled"
    # Bound length to keep filenames reasonable
    return cleaned[:64]


def strip_sage_from_title_field(blob: str) -> str:
    """Strip the word 'sage' from the JSON `title` field only.

    Body text (textContent / textContentHtml) is intentionally left alone so
    the actual memory content is preserved.
    """
    def _sub(match: re.Match) -> str:
        title = match.group(1)
        cleaned = SAGE_WORD_RE.sub("", title)
        # Tidy extra whitespace introduced by stripping
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
        return f'"title":"{cleaned}"'

    return TITLE_RE.sub(_sub, blob)


def extract_title(blob: str) -> str:
    """Pull the Google-Keep title out of the blob. Falls back to ''."""
    m = TITLE_RE.search(blob)
    return m.group(1) if m else ""


def make_filename(timestamp: str, title: str, idx: int) -> str:
    ts = timestamp if timestamp else f"unknown_{idx:04d}"
    # Replace ':' so filenames are filesystem-safe
    ts_safe = ts.replace(":", "-")
    return f"{ts_safe}__{safe_title(title)}.json"


def split_entry(entry: dict, idx: int) -> dict:
    """Split a single memory entry into a file under the right folder."""
    prov = (entry.get("provenance") or {}).get("originating_node", "SAGE-MAMA")
    target_dir = SEVEN_DIR if prov == "SAGE-7" else ADHD_DIR

    timestamp = entry.get("timestamp", "")
    blob = entry.get("data", "")
    title = extract_title(blob)
    blob_clean = strip_sage_from_title_field(blob)

    fname = make_filename(timestamp, title, idx)
    out_path = target_dir / fname
    # Avoid collisions: append numeric suffix if file exists
    if out_path.exists():
        stem = out_path.stem
        n = 2
        while True:
            candidate = target_dir / f"{stem}__{n}.json"
            if not candidate.exists():
                out_path = candidate
                break
            n += 1

    file_record = {
        "timestamp": timestamp,
        "originating_node": prov,
        "title": re.sub(r"\s{2,}", " ", SAGE_WORD_RE.sub("", title)).strip(),
        "data": blob_clean,
        "provenance": entry.get("provenance", {}),
    }
    out_path.write_text(
        json.dumps(file_record, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return {
        "id": f"{prov.lower()}-{idx:05d}",
        "timestamp": timestamp,
        "originating_node": prov,
        "title": file_record["title"],
        "path": str(out_path.relative_to(ROOT)),
    }


def main() -> int:
    if not SRC.exists():
        print(f"[SPLIT] source not found: {SRC}")
        return 1

    SEVEN_DIR.mkdir(parents=True, exist_ok=True)
    ADHD_DIR.mkdir(parents=True, exist_ok=True)

    # Backup original
    ts = int(datetime.utcnow().timestamp())
    backup = MEM_DIR / f"imported.json.bak.{ts}"
    shutil.copy2(SRC, backup)
    print(f"[SPLIT] backup: {backup}")

    raw = json.loads(SRC.read_text(encoding="utf-8"))
    print(f"[SPLIT] loaded {len(raw)} memories")

    index: list[dict] = []
    counts = {"SAGE-7": 0, "SAGE-MAMA": 0, "UNKNOWN": 0}
    for i, entry in enumerate(raw):
        rec = split_entry(entry, i)
        index.append(rec)
        counts[rec["originating_node"]] = counts.get(rec["originating_node"], 0) + 1

    # Write thin index back to imported.json
    INDEX.write_text(
        json.dumps(index, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[SPLIT] index written: {INDEX} ({len(index)} entries)")
    print(f"[SPLIT] seven/: {counts.get('SAGE-7', 0)}  adhd/: {counts.get('SAGE-MAMA', 0)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
