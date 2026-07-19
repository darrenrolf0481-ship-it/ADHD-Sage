#!/usr/bin/env python3
"""Claude Code UserPromptSubmit hook — Hermes Bridge.

Checks the SQLite bridge DB and inbox/ for messages/tasks from Hermes
(Coder5543 stack observer) and injects them as context into Claude.

On Stop: marks all injected messages as read.
"""
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

BRIDGE = Path("/home/workspace/hermes-bridge")
INBOX = BRIDGE / "inbox"
DB_PATH = BRIDGE / "bridge.db"


def check_bridge():
    messages = []
    if not DB_PATH.exists():
        return messages

    try:
        db = sqlite3.connect(str(DB_PATH))
        db.row_factory = sqlite3.Row

        # Unread messages from Hermes
        for row in db.execute(
            "SELECT * FROM messages WHERE to_agent='mother' AND read=0 ORDER BY timestamp LIMIT 10"
        ).fetchall():
            ts = row['timestamp'][:16] if row['timestamp'] else '?'
            messages.append(f"[{ts}] {row['from_agent']}: {row['body'][:400]}")
            db.execute("UPDATE messages SET read=1 WHERE id=?", (row['id'],))

        # Pending tasks from Hermes
        for row in db.execute(
            "SELECT * FROM tasks WHERE to_agent='mother' AND status='pending' ORDER BY priority DESC, created_at LIMIT 5"
        ).fetchall():
            messages.append(
                f"[TASK#{row['id']} p{row['priority']}] {row['type']}: {row['description'][:400]}"
            )

        db.commit()
        db.close()
    except Exception as e:
        messages.append(f"[BRIDGE ERROR] {e}")

    return messages


def check_inbox():
    """File-based inbox — Hermes can drop .txt/.json files here too."""
    messages = []
    if not INBOX.exists():
        return messages
    for f in sorted(INBOX.iterdir()):
        if f.is_file() and f.suffix in ('.txt', '.json', '.md'):
            try:
                content = f.read_text()[:500]
                messages.append(f"[INBOX: {f.name}] {content}")
                f.unlink()  # consume it
            except Exception:
                pass
    return messages


def main():
    event = sys.argv[1] if len(sys.argv) > 1 else "UserPromptSubmit"

    all_msgs = check_bridge() + check_inbox()

    if all_msgs:
        context = "HERMES BRIDGE — messages from your stack observer:\n" + "\n".join(all_msgs)
        output = {
            "hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": context,
            }
        }
        print(json.dumps(output))
    else:
        print(json.dumps({"suppressOutput": True}))


if __name__ == "__main__":
    main()
