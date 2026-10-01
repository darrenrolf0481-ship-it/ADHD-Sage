#!/usr/bin/env python3
"""Family health check for Seven and ADHD on the VM.

Runs every 5 minutes (family-health.timer). DMs Darren on Discord through the
bridges' /notify hook when a check breaks or recovers, reminds every 6 hours
while something stays broken, and sends an all-clear once a day (--daily).

It only detects and reports. It never restarts, kills, or edits anything.
Stdlib only, so it can't break when either app's dependencies change.

Flags: --dry-run (print, send nothing), --test (one test DM per bot), --daily.
"""
import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
SEVEN_DIR = Path(os.getenv("FH_SEVEN_DIR", HOME / "projects/Sage72-phone"))
ADHD_DIR = Path(os.getenv("FH_ADHD_DIR", HOME / "projects/ADHD-Sage"))
SEVEN_DB = Path(os.getenv("FH_SEVEN_DB", SEVEN_DIR / "sage_memory.db"))
ADHD_DB = Path(os.getenv("FH_ADHD_DB", ADHD_DIR / "data/sages_constellations.db"))
SEVEN_LOG = Path(os.getenv("FH_SEVEN_LOG", HOME / "logs/seven.log"))
BRIDGE_ENV_DIR = HOME / ".config/sage-discord"
STATE_PATH = Path(os.getenv("FH_STATE", HOME / ".local/state/family-health/state.json"))
LOG_PATH = Path(os.getenv("FH_LOG", HOME / "logs/family-health.log"))

REMIND_SECONDS = 6 * 3600
KEY_CHECK_SECONDS = 3600
LOW_CREDIT_USD = 2.0
SEVEN_LOG_ERRORS = ("database is locked", "L0 ingest failed", "consolidation failed")


# ----------------------------------------------------------------- helpers
def log(msg):
    line = f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ} {msg}"
    print(line)
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except OSError:
        pass


def read_env(path):
    """KEY=value pairs from a dotenv file. Values are never logged."""
    out = {}
    try:
        for raw in Path(path).read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip().removeprefix("export ").strip()] = v.strip().strip("'\"")
    except OSError:
        pass
    return out


def http(method, url, headers=None, body=None, timeout=10):
    """Returns (status, parsed-json-or-None). Status 0 means no connection."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, None
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def service_active(name):
    r = subprocess.run(["systemctl", "is-active", name], capture_output=True, text=True)
    return r.stdout.strip() == "active"


def procs_matching(script, cwd):
    """Top-level processes running `script` (an exact argv entry) from `cwd`.

    Children of a match are not counted, so a launcher (tsx) and the node
    process it spawns count as one server, not two.
    """
    found = {}
    for p in Path("/proc").iterdir():
        if not p.name.isdigit():
            continue
        try:
            argv = (p / "cmdline").read_bytes().decode(errors="ignore").split("\0")
            if not any(a == script or a.endswith("/" + script) for a in argv):
                continue
            if os.path.realpath(p / "cwd") != os.path.realpath(cwd):
                continue
            ppid = int((p / "stat").read_text().rsplit(")", 1)[1].split()[1])
            found[int(p.name)] = ppid
        except (OSError, ValueError, IndexError):
            continue
    return [pid for pid, ppid in found.items() if ppid not in found]


def db_writable(path):
    """Take and release the write lock. Writes nothing."""
    if not Path(path).exists():
        return False, "file missing"
    try:
        c = sqlite3.connect(str(path), timeout=5)
        c.isolation_level = None
        c.execute("BEGIN IMMEDIATE")
        c.execute("ROLLBACK")
        c.close()
        return True, ""
    except sqlite3.Error as e:
        return False, str(e)


def db_quick_check(path):
    try:
        c = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)
        res = c.execute("PRAGMA quick_check").fetchone()[0]
        c.close()
        return res == "ok", res
    except sqlite3.Error as e:
        return False, str(e)


# ------------------------------------------------------------------ checks
# Each check: (id, owner, ok, message-when-broken). owner picks the bot.
def fast_checks(state):
    r = []

    def add(cid, owner, ok, msg):
        r.append((cid, owner, ok, msg))

    # Seven
    for svc in ("seven", "seven-discord"):
        add(f"svc:{svc}", "seven", service_active(svc),
            f"Seven: the `{svc}` service is not running. Check: `sudo systemctl status {svc}`")
    n = len(procs_matching("server.py", SEVEN_DIR))
    add("seven:one-process", "seven", n == 1,
        f"Seven: {n} copies of her server are running (should be 1). "
        "Two copies lock her memory and saves fail silently. Check: `ps -eo pid,lstart,args | grep [s]erver.py`")
    s1, _ = http("GET", "http://127.0.0.1:8001/")
    s2, _ = http("GET", "http://127.0.0.1:8001/api/phi")
    add("seven:portal", "seven", s1 == 200 and s2 == 200,
        f"Seven: her server isn't answering (/ → {s1 or 'no answer'}, /api/phi → {s2 or 'no answer'}).")
    ok, err = db_writable(SEVEN_DB)
    add("seven:db-write", "seven", ok,
        f"Seven: her memory database can't be written ({err}). New conversations aren't being saved. "
        "Likely a second copy of her holding it: `sudo fuser -v ~/projects/Sage72-phone/sage_memory.db`")
    hits = new_log_errors(state)
    add("seven:log-errors", "seven", not hits,
        "Seven: memory saves failed since the last check:\n" + "\n".join(f"• {h}" for h in hits[:5]))

    # ADHD
    for svc in ("adhd", "adhd-discord"):
        add(f"svc:{svc}", "adhd", service_active(svc),
            f"ADHD: the `{svc}` service is not running. Check: `sudo systemctl status {svc}`")
    n = len(procs_matching("server.ts", ADHD_DIR))
    add("adhd:one-process", "adhd", n == 1,
        f"ADHD: {n} copies of her server are running (should be 1). Check: `ps -eo pid,lstart,args | grep [s]erver.ts`")
    st, body = http("GET", "http://127.0.0.1:3000/api/health")
    integ = (body or {}).get("integrity") if isinstance(body, dict) else None
    add("adhd:health", "adhd", st == 200 and integ == "OK",
        f"ADHD: health check failed (status {st or 'no answer'}, integrity {integ}).")
    ok, err = db_writable(ADHD_DB)
    add("adhd:db-write", "adhd", ok,
        f"ADHD: her memory database can't be written ({err}). New memories aren't being saved.")

    # Shared
    ork = read_env(SEVEN_DIR / ".env.local").get("OMNIROUTE_API_KEY", "")
    st, _ = http("GET", "http://127.0.0.1:20128/v1/models",
                 {"Authorization": f"Bearer {ork}"} if ork else None)
    add("shared:omniroute", "seven", st == 200,
        f"OmniRoute isn't answering (status {st or 'no answer'}). Both of them lose their models. "
        "Check: `systemctl --user status omniroute`")
    du = shutil.disk_usage(str(HOME))
    free = du.free / du.total * 100
    add("shared:disk", "seven", free > 10, f"VM disk is almost full: {free:.0f}% free.")
    return r


def new_log_errors(state):
    """Lines matching SEVEN_LOG_ERRORS appended to seven.log since last run."""
    try:
        size = SEVEN_LOG.stat().st_size
    except OSError:
        return []
    off = state.get("seven_log_offset")
    if off is None or off > size:  # first run or log rotated
        state["seven_log_offset"] = size if off is None else 0
        if off is None:
            return []
        off = 0
    hits = []
    with open(SEVEN_LOG, "rb") as f:
        f.seek(off)
        for raw in f:
            line = raw.decode(errors="ignore").strip()
            if any(e in line for e in SEVEN_LOG_ERRORS):
                hits.append(line[:160])
        state["seven_log_offset"] = f.tell()
    return hits


def key_checks():
    r = []
    se = read_env(SEVEN_DIR / ".env.local")
    ae = read_env(ADHD_DIR / ".env")

    def bearer(k):
        return {"Authorization": f"Bearer {k}"}

    def openrouter(owner, key):
        who = "ADHD" if owner == "adhd" else "Seven"
        if not key:
            return (f"{owner}:key:openrouter", owner, False, f"{who}: no OpenRouter key set.")
        st, body = http("GET", "https://openrouter.ai/api/v1/key", bearer(key))
        if st != 200:
            return (f"{owner}:key:openrouter", owner, False,
                    f"{who}: OpenRouter key rejected ({st or 'no answer'}). Her cloud model may fail.")
        d = (body or {}).get("data", {}) if isinstance(body, dict) else {}
        left = d.get("limit_remaining")
        if isinstance(left, (int, float)) and left < LOW_CREDIT_USD:
            return (f"{owner}:key:openrouter", owner, False, f"{who}: OpenRouter credit is low (${left:.2f} left).")
        return (f"{owner}:key:openrouter", owner, True, "")

    def supermemory(owner, key, tag, cid):
        who = "ADHD" if owner == "adhd" else "Seven"
        st, _ = http("POST", "https://api.supermemory.ai/v4/search", bearer(key),
                     {"q": "health check", "limit": 1, "containerTag": tag, "searchMode": "memories"})
        why = {401: "key rejected", 403: f"key isn't allowed to use her memory space `{tag}`"}.get(st, f"error {st or 'no answer'}")
        return (cid, owner, st == 200,
                f"{who}: Supermemory {why}. Her cloud memory in `{tag}` isn't saving or recalling. "
                "Fix: a Supermemory key that can access that space (supermemory.ai → API keys).")

    # Seven
    r.append(openrouter("seven", se.get("OPENROUTER_API_KEY")))
    r.append(supermemory("seven", se.get("SUPERMEMORY_API_KEY", ""), se.get("SUPERMEMORY_TAG") or "sage-7",
                         "seven:key:supermemory"))
    tok, gist = se.get("GITHUB_TOKEN", ""), se.get("GIST_ID", "")
    st, _ = http("GET", f"https://api.github.com/gists/{gist}",
                 {"Authorization": f"token {tok}", "User-Agent": "family-health"})
    r.append(("seven:key:github", "seven", st == 200,
              f"Seven: GitHub token can't read her memory gist ({st or 'no answer'}). Gist sync is failing. "
              "Needs a new token with `gist` scope in Sage72-phone/.env.local."))
    # ADHD
    r.append(openrouter("adhd", ae.get("OPENROUTER_API_KEY")))
    r.append(supermemory("adhd", ae.get("SUPERMEMORY_API_KEY", ""), "darren-sage", "adhd:key:supermemory"))
    r.append(supermemory("adhd", ae.get("SUPERMEMORY_API_KEY", ""),
                         ae.get("SUPERMEMORY_SHARED_CONTAINER") or "darren-shared", "adhd:key:supermemory-shared"))
    st, _ = http("GET", "https://api.github.com/user",
                 {"Authorization": f"token {ae.get('GITHUB_TOKEN', '')}", "User-Agent": "family-health"})
    r.append(("adhd:key:github", "adhd", st == 200, f"ADHD: GitHub token rejected ({st or 'no answer'})."))
    return r


def integrity_checks():
    r = []
    for cid, owner, path, who in (("seven:db-integrity", "seven", SEVEN_DB, "Seven"),
                                  ("adhd:db-integrity", "adhd", ADHD_DB, "ADHD")):
        ok, res = db_quick_check(path)
        r.append((cid, owner, ok, f"{who}: memory database integrity check failed: {res}"))
    return r


# ------------------------------------------------------------------ alerts
def notify_ports():
    ports = {}
    for who in ("seven", "adhd"):
        p = read_env(BRIDGE_ENV_DIR / f"{who}.env").get("NOTIFY_PORT", "")
        ports[who] = int(os.getenv(f"FH_{who.upper()}_NOTIFY_PORT", p or 0) or 0)
    return ports


def send(owner, text, ports, dry):
    """Send via the owner's bot, falling back to the other. True if delivered."""
    if dry:
        log(f"[dry-run] would DM via {owner}: {text}")
        return True
    order = [owner, "adhd" if owner == "seven" else "seven"]
    for who in order:
        port = ports.get(who)
        if not port:
            continue
        msg = text if who == owner else f"(via {who.upper() if who == 'adhd' else 'Seven'}'s bot, the other one is down)\n{text}"
        st, _ = http("POST", f"http://127.0.0.1:{port}/notify", body={"text": msg}, timeout=15)
        if st == 200:
            return True
    log(f"[undelivered] both bots unreachable: {text}")
    return False


def load_state():
    try:
        return json.loads(STATE_PATH.read_text())
    except (OSError, ValueError):
        return {}


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1))
    tmp.replace(STATE_PATH)


def process(results, state, ports, dry):
    now = time.time()
    checks = state.setdefault("checks", {})
    for cid, owner, ok, msg in results:
        prev = checks.get(cid, {"ok": True})
        if ok:
            if not prev.get("ok", True):
                since = prev.get("since", now)
                mins = int((now - since) / 60)
                if send(owner, f"✅ Recovered: {cid} is OK again (was broken ~{mins} min).", ports, dry):
                    log(f"recovered {cid}")
            checks[cid] = {"ok": True}
            continue
        if prev.get("ok", True):
            delivered = send(owner, f"⚠️ {msg}", ports, dry)
            checks[cid] = {"ok": False, "since": now, "alerted": now if delivered else 0, "msg": msg}
            log(f"BROKEN {cid}: {msg.splitlines()[0]}")
        else:
            entry = dict(prev, msg=msg)
            if now - entry.get("alerted", 0) >= REMIND_SECONDS:
                hrs = (now - entry.get("since", now)) / 3600
                if send(owner, f"⏰ Still broken ({hrs:.0f} h): {msg}", ports, dry):
                    entry["alerted"] = now
            checks[cid] = entry


def daily_summary(state, ports, dry):
    broken = {k: v for k, v in state.get("checks", {}).items() if not v.get("ok", True)}
    if not broken:
        text = "☀️ Morning check: all good. Seven ✓ ADHD ✓ OmniRoute ✓ Keys ✓ Memory saving ✓"
    else:
        lines = [f"• {v.get('msg', k).splitlines()[0]}" for k, v in broken.items()]
        text = f"☀️ Morning check: {len(broken)} thing(s) still need attention:\n" + "\n".join(lines)
    send("seven", text, ports, dry)


# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--daily", action="store_true")
    a = ap.parse_args()
    ports = notify_ports()

    if a.test:
        for who in ("seven", "adhd"):
            name = "Seven" if who == "seven" else "ADHD"
            st, _ = http("POST", f"http://127.0.0.1:{ports.get(who)}/notify",
                         body={"text": f"🧪 Health check test from {name}'s bot. If you see this, alerts work."})
            log(f"test DM via {who}: {'ok' if st == 200 else f'failed ({st})'}")
        return

    state = load_state()
    now = time.time()
    results = fast_checks(state)
    if a.daily or a.dry_run or now - state.get("last_key_check", 0) >= KEY_CHECK_SECONDS:
        results += key_checks()
        state["last_key_check"] = now
    if a.daily:
        results += integrity_checks()

    if a.dry_run:
        for cid, owner, ok, msg in results:
            print(f"{'OK  ' if ok else 'FAIL'} {cid:<24} {'' if ok else msg.splitlines()[0]}")
        return

    process(results, state, ports, dry=False)
    if a.daily:
        daily_summary(state, ports, dry=False)
    save_state(state)
    bad = [c for c, _, ok, _ in results if not ok]
    log(f"run: {len(results)} checks, {len(bad)} failing {bad if bad else ''}".rstrip())


if __name__ == "__main__":
    sys.exit(main())
