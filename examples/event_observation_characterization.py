"""Bounded event-observation characterization runner (protocol-v2 pre-work).

Drives the extension's inert characterization recorder over native messaging:
start -> wait through a bounded window during which real page-owned turn /
network / tool / DOM activity happens -> stop -> dump the bounded raw log to a
local, non-Git file.

Never submits a turn and never performs a product (browserless HTTP) read; the
recorder only observes the dedicated Chrome page's own traffic.

Usage:
    python -m examples.event_observation_characterization \
        --state-dir <per-instance native state root> \
        --window-seconds 300 \
        [--session-id characterize-<ts>] \
        [--output <private path>/characterization.json]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

from chatgpt_web_adapter.browser_native_provider import BrowserNativeTurnProvider


def _summarize(dump: dict) -> dict[str, object]:
    events = dump.get("events", [])
    by_family = Counter()
    methods = Counter()
    url_kinds = Counter()
    sse_types = Counter()
    statuses = Counter()
    for event in events:
        source = event.get("source", "?")
        method = event.get("method") or event.get("kind") or "?"
        by_family[source] += 1
        methods[f"{source}/{method}"] += 1
        if event.get("url_kind"):
            url_kinds[event["url_kind"]] += 1
        if event.get("status") is not None:
            statuses[f"http_{event['status']}"] += 1
        for token in event.get("sse_event_types") or []:
            sse_types[f"sse:{token}"] += 1
    return {
        "event_count": len(events),
        "dom_samples": dump.get("dom_samples") or 0,
        "by_source": dict(by_family),
        "by_source_method": dict(methods),
        "url_kinds": dict(url_kinds),
        "http_statuses": dict(statuses),
        "sse_event_types": dict(sse_types),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", required=True, help="per-instance native state root")
    parser.add_argument("--window-seconds", type=int, default=300)
    parser.add_argument("--session-id", default=None)
    parser.add_argument("--output", default=None, help="local non-Git file for the raw log")
    args = parser.parse_args(argv)

    provider = BrowserNativeTurnProvider(state_dir=Path(args.state_dir))
    try:
        status = provider.status()
    except Exception as error:
        print(json.dumps({"ok": False, "error": f"status failed: {type(error).__name__}: {error}"}))
        return 2
    if not status.available or not status.extension_connected:
        print(json.dumps({"ok": False, "error": "extension not connected", "status": status.__dict__}))
        return 2

    session_id = args.session_id or f"characterize-{int(time.time())}"
    started = provider.characterize_control(action="start", session_id=session_id)
    if not started.get("ok"):
        print(json.dumps({"ok": False, "error": started.get("error", "start failed")}))
        return 3
    print(json.dumps({"phase": "started", **started}))

    deadline = time.monotonic() + max(1.0, float(args.window_seconds))
    while time.monotonic() < deadline:
        time.sleep(min(10.0, max(0.1, deadline - time.monotonic())))

    stopped = provider.characterize_control(action="stop", timeout=20.0)
    print(json.dumps({"phase": "stopped", **stopped}))
    if not stopped.get("ok"):
        print(json.dumps({"ok": False, "error": stopped.get("error", "stop failed")}))
        return 3

    dump = provider.characterize_control(action="dump", timeout=20.0)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(dump, indent=2), encoding="utf-8")
        print(json.dumps({"phase": "dumped", "path": str(output)}))
    summary = _summarize(dump)
    print(json.dumps({"ok": True, "session_id": session_id, "summary": summary}, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
