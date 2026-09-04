"""Resident running-list collector (monitoring foundation proof).

Periodically asks the extension's inert `running_snapshot` (page's own DOM,
never a browserless HTTP read) on an instance whose persistent observer holds
the runtime tab's debugger, appends each snapshot to a local JSONL archive, and
prints incremental deltas: busy-set changes (a conversation started/stopped
generating), ordering moves, new conversation ids, and the displayed page's
generation-state transitions.

Multi-signal rule (OH plan): busy markers are a strong but non-universal
signal; no single signal may conclude "no run". The collector therefore
archives ordering + per-page state + times alongside busy markers so the
consumer can combine them.

Usage:
    python -m examples.running_list_collector \
        --state-dir <per-instance native state dir> \
        --debug-url http://127.0.0.1:9231 \
        --interval-seconds 10 \
        --samples 60 \
        --output <private path>/running-<instance>.jsonl

Never submits a turn and never performs a product HTTP read.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

from chatgpt_web_adapter.browser_native_provider import BrowserNativeTurnProvider


def _discover_displayed_conversation(debug_url: str) -> str | None:
    """Self-discovery: read the currently displayed /c/<id> from the page's own
    targets. Never assumes or requires a configured conversation id."""
    try:
        with urllib.request.urlopen(f"{debug_url.rstrip('/')}/json/list", timeout=3) as response:
            targets = json.load(response)
    except Exception:
        return None
    import re
    pattern = re.compile(r"/c/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")
    for target in targets if isinstance(targets, list) else []:
        if target.get("type") != "page":
            continue
        match = pattern.search(str(target.get("url") or ""))
        if match:
            return match.group(1)
    return None


def _entry_key(entry: dict) -> tuple[str, str]:
    return str(entry.get("id") or ""), str(entry.get("title") or "")


def _summarize(snapshot: dict) -> dict:
    pages = snapshot.get("pages") or []
    busy: list[dict] = []
    order: list[str] = []
    seen = set()
    page_states = []
    for page in pages:
        for entry in page.get("entries") or []:
            key = _entry_key(entry)
            if key[0] in seen:
                continue
            seen.add(key[0])
            if entry.get("busy"):
                busy.append({"id": key[0], "title": key[1]})
            order.append(key[0])
        page_states.append({
            "tab_id": page.get("tab_id"),
            "conversation_id": page.get("path_conversation_id"),
            "stop": bool((page.get("page") or {}).get("stop")),
            "turn_ids": (page.get("page") or {}).get("turn_ids") or [],
        })
    return {"busy": busy, "top_ids": order[:10], "page_states": page_states}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--debug-url", required=True)
    parser.add_argument("--interval-seconds", type=float, default=10.0)
    parser.add_argument("--samples", type=int, default=60)
    parser.add_argument("--output", default=None)
    args = parser.parse_args(argv)

    provider = BrowserNativeTurnProvider(state_dir=Path(args.state_dir))
    # MV3 service workers idle-terminate and drop chrome.debugger attachments,
    # so attachment must be re-ensured on demand rather than assumed persistent.
    conversation = _discover_displayed_conversation(args.debug_url)

    def ensure_attached() -> bool:
        nonlocal conversation
        if conversation is None:
            conversation = _discover_displayed_conversation(args.debug_url)
        if conversation is None:
            return False
        observation = provider.observe_turn(conversation=conversation, timeout=20.0)
        return bool(observation.get("observerAttached"))

    if conversation:
        attached = ensure_attached()
        print(json.dumps({"phase": "attach", "conversation_discovered": conversation,
                          "attached": attached}, default=str), flush=True)

    output = Path(args.output) if args.output else None
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)

    previous = None
    for index in range(max(1, args.samples)):
        try:
            snapshot = provider.running_snapshot(timeout=20.0)
        except Exception as error:
            print(json.dumps({"phase": "error", "index": index,
                              "error": f"{type(error).__name__}: {error}"}), flush=True)
            time.sleep(max(0.5, args.interval_seconds))
            continue
        if (snapshot.get("attached_page_count") or 0) == 0 and ensure_attached():
            try:
                snapshot = provider.running_snapshot(timeout=20.0)
            except Exception as error:
                print(json.dumps({"phase": "error", "index": index,
                                  "error": f"{type(error).__name__}: {error}"}), flush=True)
                time.sleep(max(0.5, args.interval_seconds))
                continue
        line = json.dumps({"index": index, "t_ms": int(time.time() * 1000), **snapshot},
                          ensure_ascii=False, default=str)
        if output:
            with output.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        summary = _summarize(snapshot)
        delta: dict = {}
        if previous is not None:
            prev_busy = {item["id"] for item in previous["busy"]}
            curr_busy = {item["id"] for item in summary["busy"]}
            added = curr_busy - prev_busy
            removed = prev_busy - curr_busy
            if added or removed:
                delta["busy_added"] = [item for item in summary["busy"] if item["id"] in added]
                delta["busy_removed"] = [item for item in previous["busy"] if item["id"] in removed]
            if previous["top_ids"] and previous["top_ids"] != summary["top_ids"]:
                delta["top_reorder"] = {"before": previous["top_ids"], "after": summary["top_ids"]}
            prev_pages = {(p["tab_id"], p["conversation_id"]): p for p in previous["page_states"]}
            for page in summary["page_states"]:
                key = (page["tab_id"], page["conversation_id"])
                prior = prev_pages.get(key)
                if prior and prior["stop"] != page["stop"]:
                    delta.setdefault("page_stop_transitions", []).append(
                        {"tab_id": key[0], "conversation_id": key[1],
                         "before": prior["stop"], "after": page["stop"]})
        print(json.dumps({"phase": "sample", "index": index, "delta": delta,
                          "busy": summary["busy"],
                          "page_states": summary["page_states"]},
                         ensure_ascii=False, default=str), flush=True)
        previous = summary
        time.sleep(max(0.5, args.interval_seconds))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
