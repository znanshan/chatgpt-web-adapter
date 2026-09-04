from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "chatgpt_web_adapter" / "browser_native_extension"


def _read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_entry_imports_running_monitor_between_recorder_and_observer() -> None:
    entry = _read("service_worker_entry_v3.js")
    recorder_import = 'importScripts("service_worker_event_characterization_recorder.js")'
    monitor_import = 'importScripts("service_worker_running_monitor.js")'
    observer_import = 'importScripts("service_worker_persistent_turn_observer_v3.js")'
    assert recorder_import in entry
    assert monitor_import in entry
    assert observer_import in entry
    assert entry.index(recorder_import) < entry.index(monitor_import) < entry.index(observer_import)
    assert entry.rstrip().endswith(f"{observer_import};")


def test_running_monitor_is_inert_and_never_mutates_or_reads_browserless_http() -> None:
    worker = _read("service_worker_running_monitor.js")
    # No listeners registered at load and no second debugger attach anywhere.
    assert "addListener" not in worker
    assert "chrome.debugger.attach(" not in worker
    assert "chrome.tabs.create(" not in worker
    assert "chrome.tabs.update(" not in worker
    assert "chrome.tabs.remove(" not in worker
    assert "Input.dispatch" not in worker
    assert "fetch(" not in worker
    assert "XMLHttpRequest" not in worker


def test_running_monitor_handles_native_message_and_reads_page_own_list() -> None:
    worker = _read("service_worker_running_monitor.js")
    assert 'message?.type === "running_snapshot"' in worker
    assert "running_snapshot_result" in worker
    assert "chrome.debugger.getTargets" in worker
    assert "Runtime.evaluate" in worker
    # Multi-signal fields the list snapshot must expose.
    for field in ("order", "busy", "title", "preview", "time", "path_conversation_id"):
        assert field in worker, field
    # Busy markers are a strong signal, never assumed universal: the snapshot
    # must not filter on busy and must not conclude idle by itself.
    assert "[class*=\"animate-spin\"]" in worker
    assert "a strong signal that a conversation is generating" in worker


def test_worker_import_graph_resolves_running_monitor() -> None:
    worker = _read("service_worker_running_monitor.js")
    assert (ROOT / "service_worker_running_monitor.js").is_file()
    for line in worker.splitlines():
        match = re.match(r'importScripts\("([^"]+)"\)', line.strip())
        if match:
            assert (ROOT / match.group(1)).is_file(), match.group(1)
