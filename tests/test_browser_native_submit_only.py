from pathlib import Path


def test_extension_submit_only_returns_after_submit_ack_before_completion_wait() -> None:
    extension = (
        Path(__file__).parents[1]
        / "src"
        / "chatgpt_web_adapter"
        / "browser_native_extension"
    )
    source = (extension / "service_worker_submit_only.js").read_text(encoding="utf-8")
    entry = (extension / "service_worker_temporary_chat_route_reopen_probe.js").read_text(
        encoding="utf-8"
    )

    assert "Network.loadingFinished" not in source
    assert "CHATGPT_TURN_TIMEOUT" not in source
    assert "diagnostics.submitAckMs = elapsedMs(submitStartedAt);" in source
    assert "message?.submitOnly !== true" in source
    assert 'importScripts("service_worker_submit_only.js")' in entry
