from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension" / "production" / "stream_lifecycle.js"


def test_stream_lifecycle_fanout_is_single_owner_and_failure_isolated(tmp_path: Path) -> None:
    module_uri = MODULE.as_uri()
    script = tmp_path / "lifecycle.mjs"
    script.write_text(f'''
import {{ createStreamLifecycle }} from {json.dumps(module_uri)};

const registrations = {{}};
function event(name) {{
  return {{ addListener(fn) {{ if (registrations[name]) throw new Error(`duplicate:${{name}}`); registrations[name] = fn; }} }};
}}
const chromeApi = {{
  debugger: {{ onEvent: event("debugger.onEvent"), onDetach: event("debugger.onDetach") }},
  tabs: {{
    onUpdated: event("tabs.onUpdated"),
    onRemoved: event("tabs.onRemoved"),
    onReplaced: event("tabs.onReplaced"),
    onActivated: event("tabs.onActivated"),
  }},
}};
const seen = [];
const mark = (name) => (...args) => {{ seen.push([name, ...args]); }};
const caps = {{
  runtimeTabRemoved: mark("runtimeRemoved"),
  submitAckDebuggerEvent: () => {{ seen.push(["submit"]); throw new Error("boom"); }},
  runtimeTabUpdated: mark("runtimeUpdated"),
  runtimeTabReplaced: mark("runtimeReplaced"),
  temporaryDebuggerEvent: mark("temporaryDebugger"),
  temporaryTabRemoved: mark("temporaryRemoved"),
  externalOperationDebuggerEvent: mark("externalDebugger"),
  externalOperationTabUpdated: mark("externalUpdated"),
  externalOperationTabActivated: mark("externalActivated"),
  externalOperationTabRemoved: mark("externalRemoved"),
  persistentDebuggerEvent: mark("persistentDebugger"),
  persistentTabUpdated: mark("persistentUpdated"),
  persistentDebuggerDetach: mark("persistentDetach"),
}};
let missing = null;
try {{ createStreamLifecycle({{}}, chromeApi); }} catch (error) {{ missing = error.message; }}
const lifecycle = createStreamLifecycle(caps, chromeApi);
lifecycle.install();
let duplicate = null;
try {{ lifecycle.install(); }} catch (error) {{ duplicate = error.message; }}
registrations["debugger.onEvent"]({{tabId: 7}}, "Network.requestWillBeSent", {{requestId: "r"}});
registrations["tabs.onRemoved"](7);
registrations["tabs.onUpdated"](7, {{url: "https://chatgpt.com/c/x"}}, {{id: 7}});
registrations["tabs.onReplaced"](8, 7);
registrations["tabs.onActivated"]({{tabId: 7}});
registrations["debugger.onDetach"]({{tabId: 7}}, "target_closed");
await new Promise((resolve) => setTimeout(resolve, 0));
console.log(JSON.stringify({{ names: Object.keys(registrations).sort(), seen: seen.map((x) => x[0]), duplicate, missing }}));
''', encoding="utf-8")
    result = subprocess.run(["node", str(script)], check=True, capture_output=True, text=True)
    payload = json.loads(result.stdout)
    assert payload["names"] == [
        "debugger.onDetach", "debugger.onEvent", "tabs.onActivated",
        "tabs.onRemoved", "tabs.onReplaced", "tabs.onUpdated",
    ]
    assert payload["missing"] == "STREAM_LIFECYCLE_CAPABILITY_REQUIRED:runtimeTabRemoved"
    assert payload["duplicate"] == "STREAM_LIFECYCLE_ALREADY_INSTALLED"
    assert payload["seen"] == [
        "submit", "temporaryDebugger", "externalDebugger", "persistentDebugger",
        "runtimeRemoved", "temporaryRemoved", "externalRemoved",
        "runtimeUpdated", "externalUpdated", "persistentUpdated",
        "runtimeReplaced", "externalActivated", "persistentDetach",
    ]
