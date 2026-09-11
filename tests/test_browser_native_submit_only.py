from pathlib import Path

from chatgpt_web_adapter.browser_native_provider import BrowserNativeTurnResult


def _submit_only_source() -> str:
    extension = (
        Path(__file__).parents[1]
        / "src"
        / "chatgpt_web_adapter"
        / "browser_native_extension"
    )
    return (extension / "service_worker_submit_only_v2.js").read_text(encoding="utf-8")


def test_extension_submit_only_returns_after_submit_ack_before_completion_wait() -> None:
    extension = (
        Path(__file__).parents[1]
        / "src"
        / "chatgpt_web_adapter"
        / "browser_native_extension"
    )
    source = (extension / "service_worker_submit_only_v2.js").read_text(encoding="utf-8")
    entry = (extension / "service_worker_entry_v3.js").read_text(
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
    assert "_submitOnlyClickStableSelector(debuggee" not in source
    # 5s, raised from 2s so the commit window can actually contain the response.
    # The success path still returns as soon as the status or local generation
    # evidence arrives, so this only lengthens the ambiguous case.
    assert "CWA_SUBMIT_COMMIT_OBSERVATION_MS = 5_000" in source
    assert "browserAuthorityLeaseId" in source
    assert 'importScripts("service_worker_submit_only_v2.js")' in entry


def test_submit_only_reads_the_real_status_instead_of_reporting_202() -> None:
    """The caller must receive the observed verdict, not a fabricated one.

    The submit-only path used to seed responseStatus to 202 and never subscribe
    to Network.responseReceived, so a backend rejection was indistinguishable
    from success and two downstream status checks were vacuously true.
    """
    source = _submit_only_source()

    assert "Network.responseReceived" in source
    assert "diagnostics.responseStatus = status;" in source
    assert "CHATGPT_TURN_HTTP_STATUS" in source
    assert "acknowledgement === \"rejected\"" in source

    # The object _executeNativeTurnWithSubmitOnly returns IS what the caller sees:
    # _executeSubmitOnlyPageTurn throws CWA_SUBMIT_ONLY_ACKNOWLEDGED to abort the
    # inherited completion chain, and the catch turns that throw into a result.
    # service_worker.js's own return is never reached, so this line is the one
    # that decides the reported status.
    assert "responseStatus: acknowledged.diagnostics.responseStatus," in source
    assert "responseStatus: 202," not in source.split("responseStatusObserved")[-1]


def test_submit_only_cli_payload_reports_whether_the_status_was_observed() -> None:
    """The submit-only stdout payload must carry the observed-status markers.

    The bridge reads this payload to distinguish a real 2xx from the
    dispatched-only 202 fallback.  Without these keys its writer_result audit
    records empty fields for a real success -- which is exactly what happened, and
    was only noticed by reading a production record rather than the tests.
    """
    cli = (
        Path(__file__).parents[1] / "src" / "chatgpt_web_adapter" / "cli.py"
    ).read_text(encoding="utf-8")
    start = cli.index("except BrowserNativeSubmissionAcknowledged")
    end = cli.index("return 0", start)
    payload = cli[start:end]

    assert '"conversation_id": turn.conversation_id' in payload
    assert '"backend_status": turn.response_status' in payload
    assert '"response_status_observed": turn.response_status_observed' in payload
    assert '"conversation_response_status": turn.conversation_response_status' in payload


def test_turn_result_carries_whether_the_status_was_actually_observed() -> None:
    """A caller must be able to tell a real 2xx from the dispatched-only 202."""
    default = BrowserNativeTurnResult(
        conversation_id=None, turn_exchange_id=None, response_status=202,
        response_mime_type=None, final_url=None, tab_id=None,
        tab_was_active=False, elapsed_ms=None,
    )
    assert default.response_status_observed is False
    assert default.conversation_response_status is None

    observed = BrowserNativeTurnResult(
        conversation_id=None, turn_exchange_id=None, response_status=200,
        response_mime_type=None, final_url=None, tab_id=None,
        tab_was_active=False, elapsed_ms=None,
        response_status_observed=True, conversation_response_status=200,
    )
    assert observed.response_status_observed is True
    assert observed.conversation_response_status == 200


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
