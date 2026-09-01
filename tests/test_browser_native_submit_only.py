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
    assert "CWA_SUBMIT_ONLY_ACKNOWLEDGED" in source
    assert "_submitOnlyAcknowledgedPageTurn" in source
    assert "message?.submitOnly !== true" in source
    assert "_submitOnlyWaitForAckOrGeneration" in source
    assert "CHATGPT_SUBMIT_NOT_COMMITTED_LOCAL_PROOF" in source
    assert "_submitOnlyClickStableSelector" in source
    assert 'importScripts("service_worker_submit_only.js")' in entry


def test_text_submit_never_falls_back_to_ambiguous_enter_commit() -> None:
    worker = (
        Path(__file__).parents[1]
        / "src"
        / "chatgpt_web_adapter"
        / "browser_native_extension"
        / "service_worker.js"
    ).read_text(encoding="utf-8")
    submit = worker[
        worker.index("async function submitOfficialPageTurn") :
        worker.index("async function executeOfficialPageTurn")
    ]

    assert "submitWithEnter" not in submit
    assert "CHATGPT_SEND_BUTTON_NOT_READY_BEFORE_COMMIT" in submit
