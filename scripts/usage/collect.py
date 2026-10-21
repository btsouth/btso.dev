#!/usr/bin/env python3
"""Build src/data/usage.json: my personal AI coding usage, as numbers only.

It reads Agent Pulse's usage ledger (every coding tool's logs on this machine, already
parsed and deduplicated), adds my personal Claude Code and Codex logs from the devbox, and
values each model call at API list price with Agent Pulse's rates.

Left out: work accounts, other people's accounts and any session in a work folder. Nothing
from a prompt, a reply or a file leaves the machine, and a project is only named when it's
a public app on this site.

  collect.py [--no-devbox] [--out PATH]
"""
import argparse
import collections
import datetime as dt
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

HOME = Path.home()
SITE = Path(__file__).resolve().parents[2]
AGENT_PULSE = Path(os.getenv("AGENT_PULSE", HOME / "Projects" / "omarchy-usage-dashboard"))
CACHE = HOME / ".cache" / "btso-usage"
TZ = ZoneInfo("America/New_York")

sys.path.insert(0, str(AGENT_PULSE))
import collector  # noqa: E402  Agent Pulse: log parsers and the pricing catalog

# Log folders that are mine and personal. Everything else in the ledger is left out,
# including the work Claude account (~/.claude), its API key and other people's Codex logins.
PERSONAL = [str(HOME / p) for p in (
    ".claude2/", ".claude3/", ".codex/", "Codex-Second/", ".local/share/opencode/",
    ".t3/commandcode/", ".commandcode/", ".hermes/", ".t3/userdata/", ".grok/", ".gemini/",
)] + ["/data/user-data/bts/codex/"]
WORK_FOLDERS = (str(HOME / "cssi"), str(HOME / "work"), "/cssi/", "-cssi-")


NAMES = {
    "claude-opus-5-5": "Opus 5.5", "claude-fable-5-1": "Fable 5.1", "claude-sonnet-5-5": "Sonnet 5.5",
    "claude-haiku-5-5": "Haiku 5.5", "gpt-6.1-sol": "Sol 6.1", "gpt-6-sol": "Sol 6", "gpt-6-astra": "Astra",
    "gpt-6-luna": "Luna", "gpt-5.6-sol": "Sol 5.6", "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
    "deepseek-v4-pro": "DeepSeek V4 Pro", "kimi-k3": "Kimi K3", "glm-5.3": "GLM-5.3",
}


WORDS = {"gpt": "GPT", "glm": "GLM", "deepseek": "DeepSeek", "kimi": "Kimi", "grok": "Grok", "mimo": "MiMo",
         "gemini": "Gemini", "qwen": "Qwen", "minimax": "MiniMax", "flash": "Flash", "pro": "Pro", "build": "Build",
         "code": "Code", "mini": "Mini", "lite": "Lite"}
# Route and speed variants of the same model count as that model.
DROP = {"fast", "exp", "vision", "preview", "free", "latest", "thinking", "turbo"}


def model_name(model):
    model = (model or "unknown").split("/")[-1].lower()
    if model in NAMES:
        return NAMES[model]
    for prefix, name in (("claude-opus-", "Opus "), ("claude-sonnet-", "Sonnet "), ("claude-haiku-", "Haiku "),
                         ("claude-fable-", "Fable ")):
        if model.startswith(prefix):
            version = model[len(prefix):].split("-20")[0]
            return name + version.replace("-", ".")
    parts = [p for p in model.replace(".", "-").split("-") if p and p not in DROP]
    # Rejoin version numbers that the split broke apart: v4 1 -> V4.1, 5 3 -> 5.3.
    out = []
    for p in parts:
        if out and p.isdigit() and (out[-1][-1:].isdigit()):
            out[-1] += "." + p
        else:
            out.append(WORDS.get(p, p.upper() if p[:1] == "v" and p[1:].isdigit() else p.capitalize()))
    name = " ".join(out)
    for known in NAMES.values():
        if name.replace(" ", "").lower() == known.replace(" ", "").lower():
            return known
    return name.replace("GLM 5", "GLM-5").replace("GPT 6", "GPT-6").replace("GPT 5", "GPT-5")


def personal(paths, project):
    if any(w in (project or "") for w in WORK_FOLDERS):
        return False
    return any(p.startswith(root) for p in paths for root in PERSONAL)


def ledger_events():
    db = collector.STATE / "usage.sqlite"
    conn = sqlite3.connect(db.resolve().as_uri() + "?mode=ro", uri=True, timeout=10)
    conn.row_factory = sqlite3.Row
    sources = collections.defaultdict(list)
    for event, path in conn.execute("SELECT event_id, path FROM event_sources"):
        sources[event].append(path)
    for row in conn.execute("SELECT * FROM events"):
        r = dict(row)
        if personal(sources.get(r["id"], []), r.get("project")):
            yield r
    conn.close()


def devbox_events():
    """My personal Claude Code and Codex logs on the devbox (its ~/.claude is the personal account)."""
    for remote, local in (("~/.claude/projects/", CACHE / "devbox-claude"), ("~/.codex/sessions/", CACHE / "devbox-codex")):
        local.mkdir(parents=True, exist_ok=True)
        subprocess.run(["rsync", "-a", "--delete", "--include=*/", "--include=*.jsonl", "--exclude=*",
                        f"devbox-bts:{remote}", f"{local}/"], check=True, timeout=600)
    for path in (CACHE / "devbox-claude").rglob("*.jsonl"):
        for r in collector.claude_records(path):
            if not any(w in r["project"] for w in WORK_FOLDERS):
                yield r
    for path in (CACHE / "devbox-codex").rglob("*.jsonl"):
        for r in collector.codex_records(path):
            if not any(w in r["project"] for w in WORK_FOLDERS):
                yield r


def public_projects():
    projects = json.loads((SITE / "src" / "data" / "projects.json").read_text())
    return {p["repo"].split("/")[1].lower(): p["id"] for p in projects}


def project_id(path, public):
    name = Path(path or "").name.lower().replace("_", "-")
    for repo, pid in public.items():
        if name == repo or name.startswith(repo + "-"):
            return pid
    return None


def streaks(days):
    """(current, longest) runs of consecutive active days."""
    longest = run = 0
    prev = None
    for d in sorted(days):
        run = run + 1 if prev and (d - prev).days == 1 else 1
        longest = max(longest, run)
        prev = d
    today = dt.datetime.now(TZ).date()
    current = run if prev and (today - prev).days <= 1 else 0
    return current, longest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-devbox", action="store_true")
    ap.add_argument("--out", default=str(SITE / "src" / "data" / "usage.json"))
    args = ap.parse_args()

    catalog = collector.load_rates()["document"]
    events, seen = [], set()
    sources = [ledger_events()] + ([] if args.no_devbox else [devbox_events()])
    for source in sources:
        for r in source:
            if r["id"] not in seen:
                seen.add(r["id"])
                events.append(r)

    public = public_projects()
    now = dt.datetime.now(TZ)
    cut30 = (now - dt.timedelta(days=30)).date()

    days = collections.defaultdict(lambda: {"tokens": 0, "value": 0.0, "calls": 0, "models": collections.Counter()})
    models = collections.defaultdict(lambda: {"tokens": 0, "tokens30": 0, "value": 0.0, "value30": 0.0,
                                              "output": 0, "calls": 0, "first": None, "last": None})
    projects30 = collections.Counter()
    totals = collections.Counter()
    unpriced = 0
    sessions, sessions30 = set(), set()

    for r in events:
        if not r.get("ts"):
            continue
        when = dt.datetime.fromtimestamp(r["ts"], TZ)
        day = when.date()
        tokens = sum(int(r.get(f) or 0) for f in ("input", "output", "cacheRead", "cacheWrite"))
        if tokens == 0:
            continue
        try:
            value = collector.price(r, catalog)[0]
        except Exception:
            value = None
        if value is None:
            unpriced += tokens
            value = 0.0
        name = model_name(r["model"])
        d = days[day.isoformat()]
        d["tokens"] += tokens
        d["value"] += value
        d["calls"] += 1
        d["models"][name] += tokens
        m = models[name]
        m["tokens"] += tokens
        m["value"] += value
        m["output"] += int(r.get("output") or 0)
        m["calls"] += 1
        m["first"] = min(m["first"] or day, day)
        m["last"] = max(m["last"] or day, day)
        totals["tokens"] += tokens
        totals["value"] += value
        totals["cacheRead"] += int(r.get("cacheRead") or 0)
        totals["output"] += int(r.get("output") or 0)
        totals["calls"] += 1
        sessions.add(r.get("session"))
        if day >= cut30:
            m["tokens30"] += tokens
            m["value30"] += value
            sessions30.add(r.get("session"))
            totals["tokens30"] += tokens
            totals["value30"] += value
            totals["calls30"] += 1
            pid = project_id(r.get("project"), public)
            if pid:
                projects30[pid] += tokens

    active = [dt.date.fromisoformat(k) for k, v in days.items() if v["tokens"]]
    current, longest = streaks(active)
    first = min(active).isoformat() if active else None
    busiest = max(days.items(), key=lambda kv: kv[1]["tokens"]) if days else None

    top_models = sorted(models.items(), key=lambda kv: -kv[1]["tokens"])
    keep = {name for name, _ in top_models[:7]}
    out = {
        "updated": now.isoformat(timespec="minutes"),
        "first": first,
        "totals": {
            "tokens": totals["tokens"], "value": round(totals["value"], 2),
            "tokens30": totals["tokens30"], "value30": round(totals["value30"], 2),
            "cacheShare": round(totals["cacheRead"] / totals["tokens"], 4) if totals["tokens"] else 0,
            "output": totals["output"], "calls": totals["calls"], "calls30": totals["calls30"],
            "sessions": len(sessions), "sessions30": len(sessions30),
            "activeDays": len(active), "streak": current, "longestStreak": longest,
            "busiestDay": {"date": busiest[0], "tokens": busiest[1]["tokens"]} if busiest else None,
            "unpricedShare": round(unpriced / totals["tokens"], 4) if totals["tokens"] else 0,
        },
        "days": [{"d": k, "t": v["tokens"], "v": round(v["value"], 2), "c": v["calls"],
                  "m": {(n if n in keep else "Other"): t for n, t in v["models"].most_common(4)}}
                 for k, v in sorted(days.items())],
        "models": [{"name": n, "tokens": v["tokens"], "tokens30": v["tokens30"], "value": round(v["value"], 2),
                    "value30": round(v["value30"], 2), "output": v["output"], "calls": v["calls"],
                    "first": v["first"].isoformat(), "last": v["last"].isoformat()}
                   for n, v in top_models[:12]],
        "projects30": [{"id": p, "tokens": t} for p, t in projects30.most_common(8)],
    }
    Path(args.out).write_text(json.dumps(out, separators=(",", ":")) + "\n")
    t = out["totals"]
    print(f"{len(events)} calls, {t['tokens'] / 1e9:.2f}B tokens, ${t['value']:,.0f} at API prices, "
          f"{t['activeDays']} active days, unpriced {t['unpricedShare']:.1%} -> {args.out}")


if __name__ == "__main__":
    main()
