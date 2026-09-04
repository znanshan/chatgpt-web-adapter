from pathlib import Path

import pytest

from chatgpt_web_adapter.browser_native_provider import BrowserNativeTurnProvider


ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension"


def test_provider_running_snapshot_is_local_multi_signal_read(tmp_path, monkeypatch) -> None:
    provider = BrowserNativeTurnProvider(state_dir=tmp_path)
    captured = {}

    def ok_rpc(payload, *, timeout, on_event=None):
        captured.update(payload)
        return {
            "protocol": 1,
            "type": "running_snapshot_result",
            "request_id": payload["request_id"],
            "ok": True,
            "schema": 1,
            "attached_page_count": 1,
            "pages": [{
                "tab_id": 7,
                "route": "https://chatgpt.com/c/c1",
                "path_conversation_id": "c1",
                "entries": [{"id": "c2", "order": 0, "title": "P", "busy": True,
                             "preview": "", "time": None}],
                "page": {"stop": True, "turn_ids": [], "last_len": 1, "composer": True},
            }],
        }

    monkeypatch.setattr(provider, "_rpc", ok_rpc)
    result = provider.running_snapshot(timeout=5.0)
    assert captured["type"] == "running_snapshot"
    assert "text" not in captured
    assert "conversationId" not in captured
    assert result["attached_page_count"] == 1
    assert result["pages"][0]["entries"][0]["busy"] is True
    assert result["pages"][0]["page"]["stop"] is True


def test_provider_observe_list_surface_is_read_only_local(tmp_path, monkeypatch) -> None:
    provider = BrowserNativeTurnProvider(state_dir=tmp_path)
    captured = {}

    def ok_rpc(payload, *, timeout, on_event=None):
        captured.update(payload)
        return {
            "protocol": 1,
            "type": "list_surface_result",
            "request_id": payload["request_id"],
            "ok": True,
            "tab_id": 11,
            "attached": True,
            "url": "https://chatgpt.com/",
        }

    monkeypatch.setattr(provider, "_rpc", ok_rpc)
    result = provider.observe_list_surface(timeout=5.0)
    assert captured["type"] == "observe_list_surface"
    assert "text" not in captured
    assert result["attached"] is True
    assert result["url"] == "https://chatgpt.com/"


def test_extension_installs_persistent_turn_observer_after_all_writer_layers() -> None:
    assert '"version": "0.1.20"' in (EXT / "manifest.json").read_text(encoding="utf-8")
    entry = (EXT / "service_worker_entry_v3.js").read_text(
        encoding="utf-8"
    )
    assert entry.rstrip().endswith(
        'importScripts("service_worker_persistent_turn_observer_v3.js");'
    )
    source = (EXT / "service_worker_persistent_turn_observer_v3.js").read_text(
        encoding="utf-8"
    )
    assert "Network.streamResourceContent" in source
    assert 'state: "RUNNING"' in source
    assert '"COMPLETED"' in source
    assert '"FAILED"' in source
    assert "chrome.debugger.detach" not in source
    assert "DOM_SILENCE" not in source
    assert "browserAuthorityLeaseId" in source
    assert "page_generation_control_released" in source
    assert "page_ready_after_observer_rebind" in source


def test_provider_reads_observation_without_submitting_or_canonical_read(tmp_path, monkeypatch) -> None:
    provider = BrowserNativeTurnProvider(state_dir=tmp_path)
    captured = {}

    def rpc(payload, *, timeout, on_event=None):
        captured.update(payload)
        return {
            "protocol": 1,
            "type": "turn_observation_result",
            "request_id": payload["request_id"],
            "ok": True,
            "observation": {"state": "RUNNING", "conversationId": "c1"},
        }

    monkeypatch.setattr(provider, "_rpc", rpc)
    result = provider.observe_turn(conversation="c1")
    assert captured["type"] == "observe_turn"
    assert "text" not in captured
    assert result == {"state": "RUNNING", "conversationId": "c1"}


def test_provider_characterize_control_is_read_only_local(tmp_path, monkeypatch) -> None:
    from chatgpt_web_adapter.browser_native_provider import RequestError

    provider = BrowserNativeTurnProvider(state_dir=tmp_path)
    captured = {}

    def ok_rpc(payload, *, timeout, on_event=None):
        captured.update(payload)
        return {
            "protocol": 1,
            "type": "characterize_result",
            "request_id": payload["request_id"],
            "ok": True,
            "active": True,
        }

    monkeypatch.setattr(provider, "_rpc", ok_rpc)
    result = provider.characterize_control(action="start", session_id="session-1")
    assert captured["type"] == "characterize"
    assert captured["action"] == "start"
    assert captured["session_id"] == "session-1"
    assert "text" not in captured
    assert result == {"ok": True, "active": True} or result["active"] is True

    def bad_rpc(payload, *, timeout, on_event=None):
        return {
            "protocol": 1,
            "type": "characterize_result",
            "request_id": payload["request_id"],
            "ok": False,
            "error": "CHARACTERIZE_NOT_ACTIVE",
        }

    monkeypatch.setattr(provider, "_rpc", bad_rpc)
    with pytest.raises(RequestError, match="CHARACTERIZE_NOT_ACTIVE"):
        provider.characterize_control(action="stop")

    with pytest.raises(ValueError, match="action"):
        provider.characterize_control(action="reboot")
