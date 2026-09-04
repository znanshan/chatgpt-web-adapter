from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "chatgpt_web_adapter" / "browser_native_extension"


def _read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_entry_imports_recorder_before_persistent_observer_kept_last() -> None:
    entry = _read("service_worker_entry_v3.js")
    recorder_import = 'importScripts("service_worker_event_characterization_recorder.js")'
    observer_import = 'importScripts("service_worker_persistent_turn_observer_v3.js")'
    assert recorder_import in entry
    assert entry.index(recorder_import) < entry.index(observer_import)
    # The persistent turn observer remains the final production layer.
    assert entry.rstrip().endswith(f"{observer_import};")


def test_recorder_is_inert_until_explicit_start() -> None:
    worker = _read("service_worker_event_characterization_recorder.js")
    start_marker = "function _cwaCharStart("
    assert start_marker in worker
    # Every addListener call must live inside the explicit start function; the
    # module registers no listeners at load time.
    for line in worker.splitlines():
        if "addListener" in line and not line.strip().startswith("//"):
            assert worker.index(line) > worker.index(start_marker), line


def test_recorder_never_mutates_pages_or_reads_browserless_http() -> None:
    worker = _read("service_worker_event_characterization_recorder.js")
    for forbidden in (
        "chrome.tabs.create(",
        "chrome.tabs.update(",
        "chrome.tabs.remove(",
        "chrome.debugger.attach(",
        "Input.dispatch",
        "fetch(",
        "XMLHttpRequest",
    ):
        assert forbidden not in worker, forbidden
    # Observation only: page-owned network events plus read-only DOM probes.
    assert "chrome.debugger.onEvent.addListener" in worker
    assert "Runtime.evaluate" in worker


def test_recorder_handles_characterize_native_message() -> None:
    worker = _read("service_worker_event_characterization_recorder.js")
    assert 'message?.type === "characterize"' in worker
    for action in ("start", "stop", "dump", "clear", "status"):
        assert action in worker
    # No browserless HTTP canonical read surface exists on the recorder.
    assert "_get_conversation_payload" not in worker
