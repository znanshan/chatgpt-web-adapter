from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
SOURCE_JS = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension" / "service_worker_external_operation_v2_1.js"


def _probe() -> dict[str, object]:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for extension provenance fixture")
    harness = r'''
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
  return context;
}
(async () => {
  const provenance = {conversation_ref:"conversation-1", attempt_id:"attempt-1", turn_id:"turn-1"};
  const first = makeContext();
  const started = await vm.runInContext(`_cwaCharStart("operation-1", ${JSON.stringify(provenance)})`, first);
  const firstBatch = await vm.runInContext(`_cwaCharExternalOperationEvents("operation-1", null, 20)`, first);
  const second = makeContext();
  const resumed = await vm.runInContext(`_cwaCharStart("operation-1", ${JSON.stringify(provenance)})`, second);
  const secondBatch = await vm.runInContext(`_cwaCharExternalOperationEvents("operation-1", null, 20)`, second);
  const mismatched = await vm.runInContext(
    `_cwaCharStart("operation-1", ${JSON.stringify({...provenance, attempt_id:"attempt-other"})})`, second
  );
  process.stdout.write(JSON.stringify({started, firstBatch, resumed, secondBatch, mismatched, stored}));
})().catch((error) => { console.error(error); process.exit(1); });
'''
    completed = subprocess.run([node, "-e", harness, str(SOURCE_JS)], check=True, capture_output=True, text=True)
    return json.loads(completed.stdout)


def test_operation_provenance_survives_public_projection_and_worker_restart() -> None:
    probe = _probe()
    assert probe["started"]["ok"] is True
    first_events = probe["firstBatch"]["events"]
    assert first_events
    assert all(event["conversation_ref"] == "conversation-1" for event in first_events)
    assert all(event["attempt_id"] == "attempt-1" for event in first_events)
    assert all(event["turn_id"] == "turn-1" for event in first_events)
    assert probe["resumed"]["resumed"] is True
    second_events = probe["secondBatch"]["events"]
    assert all(event["conversation_ref"] == "conversation-1" for event in second_events)
    assert all(event["attempt_id"] == "attempt-1" for event in second_events)
    assert all(event["turn_id"] == "turn-1" for event in second_events)
    assert probe["mismatched"]["ok"] is False
    assert probe["mismatched"]["error"] == "EXTERNAL_OPERATION_CONTEXT_MISMATCH"
    stored = probe["stored"]["cwaCharacterizationLogV1"]
    assert stored["conversation_ref"] == "conversation-1"
    assert stored["attempt_id"] == "attempt-1"
    assert stored["turn_id"] == "turn-1"
