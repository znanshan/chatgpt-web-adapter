from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension" / "production" / "native_message_router.js"


def test_production_native_message_router_behavior() -> None:
    node = shutil.which("node")
    assert node is not None, "Node.js is required for production worker contract tests"
    module_url = ROUTER.as_uri()
    script = f"""
import assert from 'node:assert/strict';
import {{ createNativeMessageRouter }} from {json.dumps(module_url)};

const posts = [];
const calls = [];
let busy = false;
let runningError = false;
const caps = {{
  protocolVersion: 1,
  postNativeResult: (_port, message) => {{ posts.push(message); return true; }},
  fallbackNativeMessage: async (message) => {{ calls.push(['fallback', message?.type]); }},
  tryBeginNativeRequest: (requestId) => {{ calls.push(['begin', requestId]); return !busy; }},
  endNativeRequest: (requestId) => calls.push(['end', requestId]),
  releaseRuntimeTab: async (message) => {{ calls.push(['release', message.request_id]); return {{ released: true }}; }},
  externalOperationAck: async (operationId, cursor) => {{ calls.push(['ack', operationId, cursor]); return {{ ok: true, cursor }}; }},
  externalOperationStatus: async (operationId) => ({{ ok: true, operation_id: operationId, status: 'running' }}),
  externalOperationResult: async (operationId) => ({{ ok: true, operation_id: operationId, status: 'completed' }}),
  externalOperationEvents: async (operationId, cursor, limit) => ({{ ok: true, operation_id: operationId, cursor, limit, events: [] }}),
  characterizationStart: async () => ({{ ok: true }}),
  characterizationStop: async () => ({{ ok: true }}),
  characterizationDump: async () => ({{ ok: true, events: [] }}),
  characterizationClear: async () => ({{ ok: true }}),
  characterizationStatus: () => ({{ ok: true, active: false }}),
  characterizationSessionId: () => 'session-1',
  runningSnapshot: async () => {{ if (runningError) throw new Error('snapshot failed'); return {{ ok: true, pages: [] }}; }},
  observeTurn: async () => ({{ state: 'RUNNING' }}),
  ensureListSurface: async () => ({{ attached: true, tab_id: 7 }}),
}};
const router = createNativeMessageRouter(caps);
const port = {{}};

await router({{ protocol: 99, type: 'turn', request_id: 'wrong-protocol' }}, port);
assert.equal(posts.length, 0);
assert.equal(calls.length, 0);

await router({{ protocol: 1, type: 'turn', request_id: 'turn-1' }}, port);
assert.deepEqual(calls.at(-1), ['fallback', 'turn']);

busy = true;
await router({{ protocol: 1, type: 'release_runtime_tab', request_id: 'release-busy' }}, port);
assert.equal(posts.at(-1).type, 'release_runtime_tab_result');
assert.equal(posts.at(-1).error, 'BROWSER_NATIVE_EXTENSION_BUSY');
assert.equal(calls.some((item) => item[0] === 'release' && item[1] === 'release-busy'), false);

busy = false;
await router({{ protocol: 1, type: 'release_runtime_tab', request_id: 'release-ok' }}, port);
assert.equal(posts.at(-1).ok, true);
assert.deepEqual(calls.slice(-3), [['begin', 'release-ok'], ['release', 'release-ok'], ['end', 'release-ok']]);

await router({{ protocol: 1, type: 'external_operation_ack', request_id: 'ack-1', operation_id: 'op-1', cursor: 'op-1:4' }}, port);
assert.deepEqual(calls.at(-1), ['ack', 'op-1', 'op-1:4']);
assert.equal(posts.at(-1).type, 'external_operation_ack_result');
assert.equal(posts.at(-1).cursor, 'op-1:4');

runningError = true;
await router({{ protocol: 1, type: 'running_snapshot', request_id: 'run-1' }}, port);
assert.equal(posts.at(-1).type, 'running_snapshot_result');
assert.equal(posts.at(-1).ok, false);
assert.equal(posts.at(-1).error, 'snapshot failed');

await router({{ protocol: 1, type: 'observe_turn', request_id: 'observe-1' }}, port);
assert.equal(posts.at(-1).type, 'turn_observation_result');
assert.equal(posts.at(-1).ok, true);
assert.equal(posts.at(-1).observation.state, 'RUNNING');

await router({{ protocol: 1, type: 'observe_list_surface', request_id: 'list-1' }}, port);
assert.equal(posts.at(-1).type, 'list_surface_result');
assert.equal(posts.at(-1).attached, true);

await router({{ protocol: 1, type: 'characterize', request_id: 'char-1', action: 'stop', session_id: 'other' }}, port);
assert.equal(posts.at(-1).type, 'characterize_result');
assert.equal(posts.at(-1).error, 'CHARACTERIZE_SESSION_MISMATCH');

console.log('production native message router behavior ok');
"""
    result = subprocess.run(
        [node, "--input-type=module", "-e", script],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "production native message router behavior ok" in result.stdout
