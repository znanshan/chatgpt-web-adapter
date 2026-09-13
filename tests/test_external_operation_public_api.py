from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any

from chatgpt_web_adapter import ChatGPTWebClient
import chatgpt_web_adapter.browser_native_host as host_subject
from chatgpt_web_adapter.browser_native_host import BrowserNativeBroker
from chatgpt_web_adapter.browser_native_provider import BrowserNativeTurnProvider
from chatgpt_web_adapter.exceptions import RequestError
from chatgpt_web_adapter.external_operation import ExternalOperationError, ExternalOperationEvent


def _frame(operation_id: str, *, event_seq: int, cursor: str, event_type: str) -> dict[str, Any]:
    return {
        "protocol": 2,
        "type": "turn_event",
        "operation_id": operation_id,
        "conversation_ref": "conversation-1",
        "attempt_id": "attempt-1",
        "turn_id": None,
        "event_seq": event_seq,
        "source": "network",
        "event_type": event_type,
        "t_ms": 1_000 + event_seq,
        "status": "running",
        "cursor": cursor,
        "metadata": {"bytes": 42},
        "error": None,
    }


class FakeExternalOperationProvider(BrowserNativeTurnProvider):
    def __init__(self) -> None:
        super().__init__(state_dir=".")
        self.calls: list[dict[str, Any]] = []
        self.response_operation_id = "operation-1"

    def _rpc(self, payload: dict[str, Any], *, timeout: float, on_event=None) -> dict[str, Any]:
        del timeout, on_event
        self.calls.append(dict(payload))
        if payload["type"] == "characterize":
            return {
                "protocol": 1,
                "type": "characterize_result",
                "request_id": payload["request_id"],
                "ok": True,
                "session_id": payload.get("session_id") or "operation-1",
                "active": payload["action"] != "stop",
            }
        if payload["type"] == "external_operation_events":
            operation_id = self.response_operation_id
            return {
                "protocol": 1,
                "type": "external_operation_events_result",
                "request_id": payload["request_id"],
                "ok": True,
                "operation_id": operation_id,
                "events": [
                    _frame(operation_id, event_seq=0, cursor=f"{operation_id}:10", event_type="turn_submitted"),
                    _frame(operation_id, event_seq=1, cursor=f"{operation_id}:11", event_type="stream_data"),
                ],
                "next_cursor": f"{operation_id}:11",
                "has_more": False,
            }
        if payload["type"] == "external_operation_ack":
            return {
                "protocol": 1,
                "type": "external_operation_ack_result",
                "request_id": payload["request_id"],
                "ok": True,
                "operation_id": payload["operation_id"],
                "cursor": payload["cursor"],
            }
        if payload["type"] == "external_operation_status":
            return {
                "protocol": 1,
                "type": "external_operation_status_result",
                "request_id": payload["request_id"],
                "ok": True,
                "operation_id": payload["operation_id"],
                "status": "running",
                "event_count": 2,
                "terminal_markers": 0,
                "failed": False,
                "retryable": False,
                "cursor": "operation-1:11",
            }
        if payload["type"] == "external_operation_result":
            return {
                "protocol": 1,
                "type": "external_operation_result_result",
                "request_id": payload["request_id"],
                "ok": True,
                "operation_id": payload["operation_id"],
                "status": "completed",
                "event_count": 3,
                "terminal_markers": 1,
                "failed": False,
                "retryable": False,
                "cursor": "operation-1:12",
            }
        raise AssertionError(payload)


class ExternalOperationPublicApiTests(unittest.TestCase):
    def test_provider_exposes_start_read_stop_external_operation_observation(self) -> None:
        provider = FakeExternalOperationProvider()

        started = provider.start_external_operation_observation("operation-1")
        self.assertEqual(started["session_id"], "operation-1")
        self.assertEqual(provider.calls[-1]["action"], "start")

        batch = provider.read_external_operation_events(
            "operation-1", cursor="operation-1:9", limit=2
        )
        self.assertEqual(batch.operation_id, "operation-1")
        self.assertEqual(batch.next_cursor, "operation-1:11")
        self.assertFalse(batch.has_more)
        self.assertEqual(tuple(event.event_type for event in batch.events), ("turn_submitted", "stream_data"))
        self.assertTrue(all(isinstance(event, ExternalOperationEvent) for event in batch.events))
        call = provider.calls[-1]
        self.assertEqual(call["type"], "external_operation_events")
        self.assertEqual(call["operation_id"], "operation-1")
        self.assertEqual(call["cursor"], "operation-1:9")
        self.assertEqual(call["limit"], 2)

        stopped = provider.stop_external_operation_observation("operation-1")
        self.assertEqual(stopped["session_id"], "operation-1")
        self.assertEqual(provider.calls[-1]["action"], "stop")

    def test_start_observation_forwards_known_operation_provenance(self) -> None:
        provider = FakeExternalOperationProvider()
        provider.start_external_operation_observation(
            "operation-1",
            conversation_ref="conversation-1",
            attempt_id="attempt-1",
            turn_id="turn-1",
        )
        call = provider.calls[-1]
        self.assertEqual(call["type"], "characterize")
        self.assertEqual(call["action"], "start")
        self.assertEqual(call["conversation_ref"], "conversation-1")
        self.assertEqual(call["attempt_id"], "attempt-1")
        self.assertEqual(call["turn_id"], "turn-1")

    def test_provider_exposes_ack_status_and_result(self) -> None:
        provider = FakeExternalOperationProvider()
        ack = provider.ack_external_operation_events("operation-1", cursor="operation-1:11")
        self.assertEqual(ack["cursor"], "operation-1:11")
        self.assertEqual(provider.calls[-1]["type"], "external_operation_ack")

        status = provider.external_operation_status("operation-1")
        self.assertEqual(status["status"], "running")
        self.assertEqual(provider.calls[-1]["type"], "external_operation_status")

        result = provider.external_operation_result("operation-1")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(provider.calls[-1]["type"], "external_operation_result")

    def test_provider_fails_closed_when_extension_returns_another_operation(self) -> None:
        provider = FakeExternalOperationProvider()
        provider.response_operation_id = "operation-other"
        with self.assertRaisesRegex(RequestError, "OPERATION_MISMATCH"):
            provider.read_external_operation_events("operation-1")

    def test_chatgpt_web_client_exposes_external_operation_observation_methods(self) -> None:
        for name in (
            "start_external_operation_observation",
            "read_external_operation_events",
            "ack_external_operation_events",
            "external_operation_status",
            "external_operation_result",
            "stop_external_operation_observation",
        ):
            self.assertTrue(callable(getattr(ChatGPTWebClient, name, None)), name)

    def test_public_wire_decoder_fails_closed(self) -> None:
        payload = _frame("operation-1", event_seq=0, cursor="operation-1:0", event_type="stream_data")
        self.assertEqual(ExternalOperationEvent.from_dict(payload).cursor, "operation-1:0")
        with self.assertRaisesRegex(ExternalOperationError, "protocol"):
            ExternalOperationEvent.from_dict({**payload, "protocol": 1})
        with self.assertRaisesRegex(ExternalOperationError, "structured error"):
            ExternalOperationEvent.from_dict({
                **payload,
                "status": "retryable",
                "error": {"code": "DELIVERY_TIMEOUT"},
            })

    def test_broker_external_operation_read_is_not_blocked_by_writer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            broker = BrowserNativeBroker(state_dir=Path(directory))
            broker.extension_connected = True
            original = host_subject.write_native_message

            def fake_write(stream, forwarded):
                del stream
                broker.route_native_message({
                    "protocol": 1,
                    "type": "external_operation_events_result",
                    "request_id": forwarded["request_id"],
                    "ok": True,
                    "operation_id": forwarded["operation_id"],
                    "events": [],
                    "next_cursor": forwarded.get("cursor"),
                    "has_more": False,
                })

            host_subject.write_native_message = fake_write
            broker.turn_lock.acquire()
            try:
                result = broker.handle_local_request({
                    "protocol": 1,
                    "token": broker.token,
                    "type": "external_operation_events",
                    "operation_id": "operation-1",
                    "cursor": None,
                    "limit": 50,
                    "request_id": "external-read-while-writing",
                    "timeoutMs": 1000,
                })
            finally:
                broker.turn_lock.release()
                host_subject.write_native_message = original
                broker._server.server_close()

        self.assertTrue(result["ok"])
        self.assertEqual(result["operation_id"], "operation-1")


if __name__ == "__main__":
    unittest.main()
