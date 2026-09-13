from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "production_characterization_v2.json"
RECORDER = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension" / "service_worker_external_operation_v2_1.js"
ROUTER = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension" / "production" / "native_message_router.js"


def _assert_subset(actual: object, expected: object) -> None:
    if isinstance(expected, dict):
        assert isinstance(actual, dict)
        for key, value in expected.items():
            assert key in actual
            _assert_subset(actual[key], value)
        return
    if isinstance(expected, list):
        assert actual == expected
        return
    assert actual == expected


def test_characterization_projection_fixture_matrix() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for production characterization fixtures")
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    harness = r'''const fs = require("fs");
const vm = require("vm");
const recorder = fs.readFileSync(process.argv[1], "utf8");
const fixture = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
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
vm.runInContext(recorder, context);
const projected = fixture.projection_scenarios.map((scenario) => ({
  name: scenario.name,
  events: scenario.raw_events.map((entry) => vm.runInContext(
    `_cwaCharProjectExternalEvent("fixture-op", ${JSON.stringify(entry)})`, context
  )),
}));
process.stdout.write(JSON.stringify(projected));
'''
    completed = subprocess.run([node, "-e", harness, str(RECORDER), str(FIXTURE)], check=True, capture_output=True, text=True, timeout=20)
    actual_by_name = {item["name"]: item["events"] for item in json.loads(completed.stdout)}
    for scenario in fixture["projection_scenarios"]:
        actual = actual_by_name[scenario["name"]]
        assert len(actual) == len(scenario["expected"])
        for event, expected in zip(actual, scenario["expected"], strict=True):
            _assert_subset(event, expected)


def test_native_messaging_failure_fixture() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for production characterization fixtures")
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))["native_messaging_failure"]
    script = f'''import {{ createNativeMessageRouter }} from {json.dumps(ROUTER.as_uri())};
const posts = [];
const caps = {{
  protocolVersion: 1,
  postNativeResult: (_port, message) => {{ posts.push(message); return true; }},
  fallbackNativeMessage: async () => {{}}, tryBeginNativeRequest: () => true, endNativeRequest: () => {{}},
  releaseRuntimeTab: async () => ({{ released: true }}), externalOperationAck: async () => ({{ ok: true }}),
  externalOperationStatus: async () => ({{ ok: true }}), externalOperationResult: async () => ({{ ok: true }}),
  externalOperationEvents: async () => ({{ ok: true, events: [] }}), characterizationStart: async () => ({{ ok: true }}),
  characterizationStop: async () => ({{ ok: true }}), characterizationDump: async () => ({{ ok: true }}),
  characterizationClear: async () => ({{ ok: true }}), characterizationStatus: () => ({{ ok: true }}),
  characterizationSessionId: () => null, runningSnapshot: async () => {{ throw new Error("fixture snapshot failed"); }},
  observeTurn: async () => ({{}}), ensureListSurface: async () => ({{}}),
}};
await createNativeMessageRouter(caps)({json.dumps(fixture["message"])}, {{}});
console.log(JSON.stringify(posts.at(-1)));
'''
    completed = subprocess.run([node, "--input-type=module", "-e", script], cwd=ROOT, check=True, capture_output=True, text=True, timeout=20)
    _assert_subset(json.loads(completed.stdout), fixture["expected"])


def test_characterization_dom_probe_exposes_content_free_retry_fact() -> None:
    source = RECORDER.read_text(encoding="utf-8")
    assert 'const retry = Boolean(document.querySelector(' in source
    assert 'assign("retry"' in source
