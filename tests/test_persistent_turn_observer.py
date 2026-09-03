from pathlib import Path

from chatgpt_web_adapter.browser_native_provider import BrowserNativeTurnProvider


ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension"


def test_extension_installs_persistent_turn_observer_after_all_writer_layers() -> None:
    assert '"version": "0.1.16"' in (EXT / "manifest.json").read_text(encoding="utf-8")
    entry = (EXT / "service_worker_temporary_chat_route_reopen_probe.js").read_text(
        encoding="utf-8"
    )
    assert entry.rstrip().endswith(
        'importScripts("service_worker_persistent_turn_observer_v2.js");'
    )
    source = (EXT / "service_worker_persistent_turn_observer_v2.js").read_text(
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
    assert "page_ready_after_observer_restart" in source


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
