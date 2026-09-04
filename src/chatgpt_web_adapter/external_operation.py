"""External-operation event frames, protocol v2 (content-free, replayable).

One normalized event vocabulary for the dedicated Chrome page's own
turn/network/stream/DOM observation.  Public frames never carry prompt/final/
tool bodies, cookies or tokens; detailed content lives in the private evidence
store.  A consumer attaches, reads frames by cursor, applies receipts, and
never closes a turn on the first terminal marker (see terminal semantics).

Driven by ``docs/external_operation_event_contract_v2_design.md`` (protocol v2
event contract) and the external-operation driving plan Task 3.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

PROTOCOL_V2 = 2

EVENT_TYPES: frozenset[str] = frozenset({
    # turn lifecycle
    "turn_submitted", "text_delta", "content_update", "status_update",
    "metadata_update", "end_turn", "tool_call", "tool_result", "user_message",
    # transport / network
    "stream_data", "stream_finished", "stream_failed", "http_status",
    "rate_limited", "route_change",
    # page / UI / runtime / policy
    "page_state", "runtime_reattach", "observer_lost", "policy_banner",
    "session",
})

SOURCES: frozenset[str] = frozenset({
    "network", "page", "model", "tool", "user", "runtime", "system", "session",
})

STATUSES: frozenset[str] = frozenset({
    "running", "completed", "failed", "retryable", "unknown",
})

# SSE path vocabulary observed in the page-owned stream (code-derived).
_SSE_PATHS: dict[str, str] = {
    "/message/content/parts/0": "text_delta",
    "/message/content": "content_update",
    "/message/metadata": "metadata_update",
    "/message/status": "status_update",
    "/message/end_turn": "end_turn",
}

# Content-carrying metadata keys that a public frame must never include.
_FORBIDDEN_PUBLIC_METADATA_KEYS: frozenset[str] = frozenset({
    "text", "content", "message", "payload", "value", "data", "result", "body",
    "prompt", "response", "tool_input", "tool_output", "thinking", "token",
    "cookie",
})


class ExternalOperationError(RuntimeError):
    """Base protocol-v2 error."""


class SequenceGap(ExternalOperationError):
    """An event sequence is not contiguous for its operation/source."""


class SourceIdentityDrift(ExternalOperationError):
    """A frame's source identity moved without a runtime-reattach event."""


class ContentLeak(ExternalOperationError):
    """A public frame attempted to carry content it must not."""


@dataclass(frozen=True)
class ExternalOperationEvent:
    """One content-free, replayable external-operation event frame."""

    operation_id: str
    event_seq: int
    source: str
    event_type: str
    t_ms: int
    cursor: str
    conversation_ref: str | None = None
    attempt_id: str | None = None
    turn_id: str | None = None
    status: str = "running"
    metadata: dict[str, Any] = field(default_factory=dict)
    error: dict[str, Any] | None = None
    protocol: int = PROTOCOL_V2

    def __post_init__(self) -> None:
        if self.event_type not in EVENT_TYPES:
            raise ExternalOperationError(f"unknown event_type: {self.event_type}")
        if self.source not in SOURCES:
            raise ExternalOperationError(f"unknown source: {self.source}")
        if self.status not in STATUSES:
            raise ExternalOperationError(f"unknown status: {self.status}")
        if not isinstance(self.event_seq, int) or self.event_seq < 0:
            raise ExternalOperationError("event_seq must be a non-negative integer")
        if not isinstance(self.cursor, str) or not self.cursor:
            raise ExternalOperationError("cursor is required")
        if not isinstance(self.operation_id, str) or not self.operation_id:
            raise ExternalOperationError("operation_id is required")
        leaked = {k for k in self.metadata if _looks_like_content(k)}
        if leaked:
            raise ContentLeak(f"public frame metadata carries content keys: {sorted(leaked)}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocol": self.protocol,
            "type": "turn_event",
            "operation_id": self.operation_id,
            "conversation_ref": self.conversation_ref,
            "attempt_id": self.attempt_id,
            "turn_id": self.turn_id,
            "event_seq": self.event_seq,
            "source": self.source,
            "event_type": self.event_type,
            "t_ms": self.t_ms,
            "status": self.status,
            "cursor": self.cursor,
            "metadata": self.metadata,
            "error": self.error,
        }


def _looks_like_content(key: str) -> bool:
    lowered = (key or "").lower()
    return any(token in lowered for token in _FORBIDDEN_PUBLIC_METADATA_KEYS)


def cursor_for(operation_id: str, event_seq: int) -> str:
    """Opaque but deterministic resume cursor: operation + applied sequence."""
    return f"{operation_id}:{event_seq}"


class CursorTracker:
    """Per-operation/source monotonic sequence and cursor validation."""

    def __init__(self) -> None:
        self._last: dict[tuple[str, str], int] = {}

    def validate(self, operation_id: str, source: str, event_seq: int) -> None:
        key = (operation_id, source)
        last = self._last.get(key)
        if last is not None:
            if event_seq <= last:
                raise SequenceGap(
                    f"sequence not monotonic for {key}: {event_seq} after {last}"
                )
            if event_seq > last + 1:
                raise SequenceGap(f"sequence gap for {key}: expected {last + 1}, got {event_seq}")
        self._last[key] = event_seq

    def next_seq(self, operation_id: str, source: str) -> int:
        key = (operation_id, source)
        return self._last.get(key, -1) + 1

    def reset(self, operation_id: str, source: str) -> None:
        self._last.pop((operation_id, source), None)


def normalize_sse_path(path: str | None, *, role: str | None = None) -> str | None:
    """Map an SSE path (+ role) to a normalized content-free event type.

    ``path is None`` with an assistant role is the text-content fast path;
    role=user marks a user message; the transport emits the stream/HTTP
    events separately.
    """
    if isinstance(path, str) and path in _SSE_PATHS:
        return _SSE_PATHS[path]
    if path in (None, "/message/content/parts/0"):
        if role == "user":
            return "user_message"
        if role == "tool":
            return "tool_result"
        if role == "assistant":
            return "text_delta"
    if role == "tool":
        return "tool_result"
    if role == "user":
        return "user_message"
    return None


def terminal_marker(event_type: str) -> bool:
    """Per-segment terminal markers; NOT the turn end (see design doc)."""
    return event_type in {"end_turn", "status_update", "metadata_update"}


def turn_is_complete(
    *,
    terminal_evidence: bool,
    last_data_age_seconds: float,
    quiescence_window_seconds: float,
) -> bool:
    """A turn ends only on sustained quiescence after terminal evidence.

    Finding 002: after an ``end_turn`` / conjunction the SSE stream keeps
    delivering in tool-chained turns, so terminal evidence alone is never
    enough.  The turn is complete only when the stream has been quiet (no
    data/terminal frames) for the bounded quiescence window after terminal
    evidence.
    """
    if not terminal_evidence:
        return False
    return last_data_age_seconds >= quiescence_window_seconds


# Event types that count as stream "data" for the quiescence model (finding
# 002: data arriving after a terminal marker proves the turn is still live).
_DATA_EVENT_TYPES: frozenset[str] = frozenset({"text_delta", "content_update", "tool_call", "tool_result"})
_TERMINAL_EVENT_TYPES: frozenset[str] = frozenset({"end_turn", "status_update", "metadata_update"})
_FAILURE_EVENT_TYPES: frozenset[str] = frozenset({"stream_failed", "observer_lost"})


class ExternalOperationStream:
    """Consumes content-free protocol-v2 frames for one operation.

    Exposes read/status/result for the normalized stream: completion is only
    ever declared through the sustained-quiescence terminal model, and a
    conjunction marker alone keeps the operation ``running``.
    """

    def __init__(
        self,
        operation_id: str,
        *,
        quiescence_window_seconds: float = 3.0,
        now: Callable[[], float] | None = None,
    ) -> None:
        if quiescence_window_seconds <= 0:
            raise ValueError("quiescence_window_seconds must be positive")
        self.operation_id = operation_id
        self.quiescence_window_seconds = float(quiescence_window_seconds)
        self._now = now or time.time
        self._tracker = CursorTracker()
        self._events: list[ExternalOperationEvent] = []
        self._terminal_seen = False
        self._failed = False
        self._last_data_t_ms: int | None = None
        self._last_t_ms: int | None = None

    def ingest(self, event: ExternalOperationEvent) -> None:
        if event.operation_id != self.operation_id:
            raise ExternalOperationError(
                f"event operation {event.operation_id} does not match {self.operation_id}"
            )
        self._tracker.validate(self.operation_id, event.source, event.event_seq)
        if event.error is not None:
            self._failed = True
        if event.event_type in _FAILURE_EVENT_TYPES:
            self._failed = True
        if event.event_type in _TERMINAL_EVENT_TYPES and event.status in {"completed", "failed"}:
            self._terminal_seen = True
        if event.event_type in _DATA_EVENT_TYPES:
            self._last_data_t_ms = event.t_ms
        if self._last_t_ms is None or event.t_ms > self._last_t_ms:
            self._last_t_ms = event.t_ms
        self._events.append(event)

    def status(self) -> str:
        if self._failed:
            return "failed"
        if self._terminal_seen:
            anchor = self._last_data_t_ms if self._last_data_t_ms is not None else self._last_t_ms
            if anchor is None:
                return "completed"
            age = max(0.0, (self._now() * 1000.0) - float(anchor))
            if age / 1000.0 >= self.quiescence_window_seconds:
                return "completed"
        return "running"

    def result(self) -> dict[str, Any]:
        terminal_events = [e for e in self._events if e.event_type in _TERMINAL_EVENT_TYPES]
        metadata = terminal_events[-1].metadata if terminal_events else {}
        return {
            "operation_id": self.operation_id,
            "status": self.status(),
            "event_count": len(self._events),
            "terminal_markers": len(terminal_events),
            "failed": self._failed,
            "final_status": metadata.get("status"),
            "finish_reason": metadata.get("finish_reason"),
            "last_t_ms": self._last_t_ms,
        }
