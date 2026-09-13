from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess

import pytest

from chatgpt_web_adapter.external_operation import ExternalOperationEvent, ExternalOperationStream

ROOT = Path(__file__).resolve().parents[1]
RECORDER = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension" / "service_worker_external_operation_v2_1.js"


def _event(operation_id: str, seq: int, event_type: str, *, status: str, error=None) -> ExternalOperationEvent:
    return ExternalOperationEvent(
        operation_id=operation_id,
        event_seq=seq,
        source="network",
        event_type=event_type,
        t_ms=1000 + seq,
        cursor=f"{operation_id}:{seq}",
        status=status,
        error=error,
    )


def test_retryable_delivery_is_not_a_permanent_stream_failure() -> None:
    now = {"s": 1.0}
    stream = ExternalOperationStream("operation-1", now=lambda: now["s"])
    stream.ingest(_event(
        "operation-1", 0, "rate_limited", status="retryable",
        error={"code": "HTTP_429", "retryable": True},
    ))
    assert stream.status() == "retryable"
    assert stream.result()["failed"] is False
    assert stream.result()["retryable"] is True

    stream.ingest(_event("operation-1", 1, "turn_submitted", status="running"))
    assert stream.status() == "running"

    stream.ingest(_event("operation-1", 2, "end_turn", status="completed"))
    now["s"] = 10.0
    assert stream.status() == "completed"
    assert stream.result()["retryable"] is False


def _restart_probe() -> dict[str, object]:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for extension restart fixtures")
    harness = r"""
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync(process.argv[1], "utf8");
const stored = {};

function makeContext() {
  const noopEvent = { addListener() {}, removeListener() {} };
  const chrome = {
    storage: { local: {
      async get(key) { return { [key]: stored[key] }; },
      async set(value) { Object.assign(stored, value); },
      async remove(key) { delete stored[key]; },
    }},
    debugger: {
      onEvent: noopEvent,
      async sendCommand() { return {}; },
      async getTargets() { return []; },
    },
    tabs: {
      onUpdated: noopEvent,
      onActivated: noopEvent,
      onRemoved: noopEvent,
    },
  };
  const sandbox = {
    URL, Map, Set, console, chrome,
    CHATGPT_ORIGIN: "https://chatgpt.com",
    BRIDGE_PROTOCOL_VERSION: 1,
    onNativeMessage: async function() {},
    safePortPost() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context);
  return context;
}

(async () => {
  const first = makeContext();
  await vm.runInContext(`_cwaCharStart("operation-1")`, first);
  vm.runInContext(`_cwaCharPush({source:"network", method:"Network.dataReceived", bytes:7})`, first);
  const firstBatch = await vm.runInContext(`_cwaCharExternalOperationEvents("operation-1", null, 20)`, first);
  const durableAfterRead = Boolean(stored.cwaCharacterizationLogV1?.events?.length);
  const ack = await vm.runInContext(`_cwaCharExternalOperationAck("operation-1", ${JSON.stringify(firstBatch.next_cursor)})`, first);

  const second = makeContext();
  const resumed = await vm.runInContext(`_cwaCharStart("operation-1")`, second);
  vm.runInContext(`_cwaCharPush({source:"network", method:"Network.dataReceived", bytes:9})`, second);
  const secondBatch = await vm.runInContext(
    `_cwaCharExternalOperationEvents("operation-1", ${JSON.stringify(firstBatch.next_cursor)}, 20)`,
    second
  );
  const status = await vm.runInContext(`_cwaCharExternalOperationStatus("operation-1")`, second);
  const result = await vm.runInContext(`_cwaCharExternalOperationResult("operation-1")`, second);
  await vm.runInContext(`_cwaCharStop()`, second);
  const third = makeContext();
  const coldAck = await vm.runInContext(`_cwaCharExternalOperationAck("operation-1", ${JSON.stringify(secondBatch.next_cursor)})`, third);
  const coldStatus = await vm.runInContext(`_cwaCharExternalOperationStatus("operation-1")`, third);
  const rollbackAck = await vm.runInContext(`_cwaCharExternalOperationAck("operation-1", ${JSON.stringify(firstBatch.next_cursor)})`, third);
  process.stdout.write(JSON.stringify({firstBatch, durableAfterRead, ack, resumed, secondBatch, status, result, coldAck, coldStatus, rollbackAck, stored}));
})().catch((error) => { console.error(error); process.exit(1); });
"""
    completed = subprocess.run(
        [node, "-e", harness, str(RECORDER)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_public_read_is_durable_and_worker_restart_resumes_cursor_without_replay() -> None:
    probe = _restart_probe()
    first = probe["firstBatch"]
    second = probe["secondBatch"]
    assert probe["durableAfterRead"] is True
    assert probe["ack"]["ok"] is True
    assert probe["ack"]["cursor"] == first["next_cursor"]
    assert probe["resumed"]["ok"] is True
    assert probe["resumed"]["resumed"] is True
    assert [event["event_type"] for event in second["events"]] == ["runtime_reattach", "stream_data"]
    assert second["events"][1]["event_seq"] == 1
    assert second["next_cursor"] != first["next_cursor"]
    assert probe["status"]["operation_id"] == "operation-1"
    assert probe["result"]["operation_id"] == "operation-1"
    assert probe["coldAck"]["ok"] is True
    assert probe["coldStatus"]["acked_cursor"] == second["next_cursor"]
    assert probe["rollbackAck"]["ok"] is False
    assert probe["rollbackAck"]["error"] == "EXTERNAL_OPERATION_ACK_ROLLBACK"
    assert probe["stored"]["cwaCharacterizationLogV1"]["acked_cursor"] == second["next_cursor"]
    assert probe["stored"]["cwaCharacterizationLogV1"]["events"]


def test_extension_aggregate_uses_conversation_write_transport_terminal_with_quiescence() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for extension aggregate fixtures")
    harness = r"""
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync(process.argv[1], "utf8");
const noopEvent = { addListener() {}, removeListener() {} };
const chrome = {
  storage: { local: { async get() { return {}; }, async set() {}, async remove() {} } },
  debugger: { onEvent: noopEvent, async sendCommand() { return {}; }, async getTargets() { return []; } },
  tabs: { onUpdated: noopEvent, onActivated: noopEvent, onRemoved: noopEvent },
};
const sandbox = {
  URL, Map, Set, console, chrome,
  CHATGPT_ORIGIN: "https://chatgpt.com",
  BRIDGE_PROTOCOL_VERSION: 1,
  onNativeMessage: async function() {}, safePortPost() {},
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
};
const context = vm.createContext(sandbox);
vm.runInContext(source, context);
const now = Date.now();
function event(seq, method, t, isWrite) {
  return {source:"network", seq, source_seq:seq, method, t, is_conversation_write:isWrite};
}
const background = vm.runInContext(`_cwaCharExternalAggregate("op", ${JSON.stringify([
  event(0,"Network.requestWillBeSent",now-6000,true),
  event(1,"Network.dataReceived",now-5500,true),
  event(2,"Network.loadingFinished",now-5000,false),
])}, null)`, context);
const recentTerminal = vm.runInContext(`_cwaCharExternalAggregate("op", ${JSON.stringify([
  event(0,"Network.requestWillBeSent",now-6000,true),
  event(1,"Network.dataReceived",now-5500,true),
  event(2,"Network.loadingFinished",now-500,true),
])}, null)`, context);
const quietTerminal = vm.runInContext(`_cwaCharExternalAggregate("op", ${JSON.stringify([
  event(0,"Network.requestWillBeSent",now-7000,true),
  event(1,"Network.dataReceived",now-6500,true),
  event(2,"Network.loadingFinished",now-5000,true),
])}, null)`, context);
process.stdout.write(JSON.stringify({background,recentTerminal,quietTerminal}));
"""
    completed = subprocess.run(
        [node, "-e", harness, str(RECORDER)],
        check=True,
        capture_output=True,
        text=True,
    )
    probe = json.loads(completed.stdout)
    assert probe["background"]["status"] == "running"
    assert probe["recentTerminal"]["status"] == "running"
    assert probe["quietTerminal"]["status"] == "completed"
    assert probe["quietTerminal"]["terminal_markers"] == 1
