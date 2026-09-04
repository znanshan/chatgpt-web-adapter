from __future__ import annotations

import pytest

from chatgpt_web_adapter.external_operation import (
    ContentLeak,
    CursorTracker,
    ExternalOperationError,
    ExternalOperationEvent,
    SequenceGap,
    cursor_for,
    normalize_sse_path,
    terminal_marker,
    turn_is_complete,
)


def _event(**overrides) -> ExternalOperationEvent:
    base = {
        "operation_id": "op-1",
        "event_seq": 0,
        "source": "network",
        "event_type": "stream_data",
        "t_ms": 1000,
        "cursor": "op-1:0",
    }
    base.update(overrides)
    return ExternalOperationEvent(**base)


def test_frame_requires_valid_enum_values() -> None:
    with pytest.raises(ExternalOperationError):
        _event(event_type="not_a_type")
    with pytest.raises(ExternalOperationError):
        _event(source="not_a_source")
    with pytest.raises(ExternalOperationError):
        _event(status="bogus")


def test_frame_rejects_content_in_public_metadata() -> None:
    with pytest.raises(ContentLeak):
        _event(metadata={"text": "assistant reply body"})
    with pytest.raises(ContentLeak):
        _event(metadata={"tool_output": "..."})
    # content-free metadata is allowed
    event = _event(metadata={"bytes": 42, "url_kind": "conversation", "http_status": 202})
    assert event.to_dict()["metadata"]["http_status"] == 202


def test_cursor_is_deterministic() -> None:
    assert cursor_for("op-1", 3) == "op-1:3"
    assert cursor_for("op-1", 3) == cursor_for("op-1", 3)


def test_cursor_tracker_validates_monotonic_contiguous_sequences() -> None:
    tracker = CursorTracker()
    assert tracker.next_seq("op-1", "network") == 0
    tracker.validate("op-1", "network", 0)
    tracker.validate("op-1", "network", 1)
    assert tracker.next_seq("op-1", "network") == 2
    # per-source monotonicity is independent
    tracker.validate("op-1", "page", 0)
    # non-monotonic
    with pytest.raises(SequenceGap):
        tracker.validate("op-1", "network", 1)
    # gap
    with pytest.raises(SequenceGap):
        tracker.validate("op-1", "network", 5)
    tracker.reset("op-1", "network")
    tracker.validate("op-1", "network", 0)


def test_normalize_sse_path_maps_vocabulary_and_roles() -> None:
    assert normalize_sse_path("/message/end_turn") == "end_turn"
    assert normalize_sse_path("/message/metadata") == "metadata_update"
    assert normalize_sse_path("/message/status") == "status_update"
    assert normalize_sse_path("/message/content/parts/0") == "text_delta"
    assert normalize_sse_path(None, role="user") == "user_message"
    assert normalize_sse_path(None, role="tool") == "tool_result"
    assert normalize_sse_path(None, role="assistant") == "text_delta"
    assert normalize_sse_path("/other", role="assistant") is None


def test_terminal_marker_is_not_turn_end() -> None:
    assert terminal_marker("end_turn")
    assert terminal_marker("status_update")
    assert not terminal_marker("text_delta")


def test_turn_complete_requires_sustained_quiescence() -> None:
    # terminal evidence alone is never enough (finding 002)
    assert not turn_is_complete(terminal_evidence=True, last_data_age_seconds=0.5, quiescence_window_seconds=3.0)
    # data still arriving after the terminal marker -> not complete
    assert not turn_is_complete(terminal_evidence=True, last_data_age_seconds=1.0, quiescence_window_seconds=3.0)
    # quiet for the window after terminal evidence -> complete
    assert turn_is_complete(terminal_evidence=True, last_data_age_seconds=5.0, quiescence_window_seconds=3.0)
    # no terminal evidence -> never complete
    assert not turn_is_complete(terminal_evidence=False, last_data_age_seconds=99.0, quiescence_window_seconds=3.0)
