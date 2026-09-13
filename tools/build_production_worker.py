from __future__ import annotations

import argparse
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXTENSION_ROOT = REPO_ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension"
SOURCE_ENTRY = "service_worker_entry_v3.js"
OUTPUT = EXTENSION_ROOT / "production" / "legacy_runtime.js"
_IMPORT = re.compile(r'^\s*importScripts\("([^"]+)"\);?\s*$', re.MULTILINE)
_NATIVE_ROUTER_PRIORS = {
    "service_worker_runtime_tab_reconciliation.js": "const _pr88PriorOnNativeMessage = onNativeMessage;",
    "service_worker_external_operation_v2_1.js": "const _cwaCharPriorOnNativeMessage = onNativeMessage;",
    "service_worker_running_monitor.js": "const _cwaRunMonPriorOnNativeMessage = onNativeMessage;",
    "service_worker_persistent_turn_observer_v3.js": "const _cwaPersistentPriorOnNativeMessage = onNativeMessage;",
}
_NATIVE_ROUTER_ASSIGNMENTS: dict[str, tuple[str, str | None]] = {
    "service_worker_runtime_tab_reconciliation.js": (
        "onNativeMessage = async function _onNativeMessageWithBrowserAuthorityLease",
        None,
    ),
    "service_worker_external_operation_v2_1.js": (
        "onNativeMessage = async function _onNativeMessageWithCharacterizationRecorder",
        None,
    ),
    "service_worker_running_monitor.js": (
        "onNativeMessage = async function _onNativeMessageWithRunningMonitor",
        None,
    ),
    "service_worker_persistent_turn_observer_v3.js": (
        "onNativeMessage = async function _onNativeMessageWithPersistentObservation",
        "// Resident list surface:",
    ),
}
_PREFIX = (
    "// Generated transitional runtime for Task 5.\n"
    "// Native-message dispatch is installed once by production/service_worker_entry.js.\n"
    "let _productionNativeMessageRouter = null;\n\n"
    "function _dispatchProductionNativeMessage(message, port) {\n"
    "  const router = _productionNativeMessageRouter ?? onNativeMessage;\n"
    "  return router(message, port);\n"
    "}\n\n"
)
_EXPORT_TAIL = (
    "\n\n// Transitional Task-5 boundary: expose final assembled turn behavior and the\n"
    "// named native-message capabilities used by the explicit production router.\n"
    "function _tryBeginNativeRequest(requestId) {\n"
    "  if (activeRequestId !== null) return false;\n"
    "  activeRequestId = requestId;\n"
    "  return true;\n"
    "}\n\n"
    "function _endNativeRequest(requestId) {\n"
    "  if (activeRequestId === requestId) activeRequestId = null;\n"
    "}\n\n"
    "export function installNativeMessageRouter(router) {\n"
    "  if (typeof router !== \"function\") throw new TypeError(\"NATIVE_MESSAGE_ROUTER_REQUIRED\");\n"
    "  if (_productionNativeMessageRouter !== null) {\n"
    "    throw new Error(\"NATIVE_MESSAGE_ROUTER_ALREADY_INSTALLED\");\n"
    "  }\n"
    "  _productionNativeMessageRouter = router;\n"
    "}\n\n"
    "export function getLegacyRuntimeCallbacks() {\n"
    "  const nativeMessageCapabilities = Object.freeze({\n"
    "    protocolVersion: BRIDGE_PROTOCOL_VERSION,\n"
    "    postNativeResult: safePortPost,\n"
    "    fallbackNativeMessage: onNativeMessage,\n"
    "    tryBeginNativeRequest: _tryBeginNativeRequest,\n"
    "    endNativeRequest: _endNativeRequest,\n"
    "    releaseRuntimeTab: _pr88ReleaseRuntimeTab,\n"
    "    externalOperationAck: _cwaCharExternalOperationAck,\n"
    "    externalOperationStatus: _cwaCharExternalOperationStatus,\n"
    "    externalOperationResult: _cwaCharExternalOperationResult,\n"
    "    externalOperationEvents: _cwaCharExternalOperationEvents,\n"
    "    characterizationStart: _cwaCharStart,\n"
    "    characterizationStop: _cwaCharStop,\n"
    "    characterizationDump: _cwaCharDump,\n"
    "    characterizationClear: _cwaCharClear,\n"
    "    characterizationStatus: _cwaCharStatus,\n"
    "    characterizationSessionId: () => _cwaCharSessionId,\n"
    "    runningSnapshot: _cwaRunMonSnapshot,\n"
    "    observeTurn: _cwaObserveTurn,\n"
    "    ensureListSurface: _cwaEnsureListSurface,\n"
    "  });\n"
    "  return Object.freeze({\n"
    "    executeTurn: executeNativeTurn,\n"
    "    startNativeBridge: connectNativeBridge,\n"
    "    ownsObservedTab: globalThis._cwaPersistentObserverOwnsTab ?? null,\n"
    "    nativeMessageCapabilities,\n"
    "  });\n"
    "}\n"
)


def _strip_native_router_wrapper(name: str, text: str) -> str:
    prior = _NATIVE_ROUTER_PRIORS.get(name)
    if prior is not None:
        if prior not in text:
            raise RuntimeError(f"native-message prior marker missing: {name}")
        text = text.replace(prior + "\n", "", 1)
    assignment = _NATIVE_ROUTER_ASSIGNMENTS.get(name)
    if assignment is None:
        return text
    start_marker, end_marker = assignment
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f"native-message assignment marker missing: {name}")
    if end_marker is None:
        return text[:start].rstrip() + "\n"
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"native-message end marker missing: {name}")
    return text[:start] + text[end:]


def _rewrite_base_dispatch(name: str, text: str) -> str:
    if name != "service_worker.js":
        return text
    old = "  port.onMessage.addListener((message) => {\n    onNativeMessage(message, thisPort);\n  });"
    new = "  port.onMessage.addListener((message) => {\n    _dispatchProductionNativeMessage(message, thisPort);\n  });"
    if old not in text:
        raise RuntimeError("base native-message listener marker missing")
    text = text.replace(old, new, 1)
    startup = (
        "chrome.runtime.onInstalled.addListener(() => connectNativeBridge());\n"
        "chrome.runtime.onStartup.addListener(() => connectNativeBridge());\n"
        "connectNativeBridge();"
    )
    replacement = (
        "chrome.runtime.onInstalled.addListener(() => connectNativeBridge());\n"
        "chrome.runtime.onStartup.addListener(() => connectNativeBridge());"
    )
    if startup not in text:
        raise RuntimeError("base native-bridge startup marker missing")
    return text.replace(startup, replacement, 1)


def flatten_script(name: str, stack: tuple[str, ...] = ()) -> str:
    if name in stack:
        raise RuntimeError(f"import cycle: {stack + (name,)}")
    text = (EXTENSION_ROOT / name).read_text(encoding="utf-8")
    text = _strip_native_router_wrapper(name, text)
    text = _rewrite_base_dispatch(name, text)
    output: list[str] = []
    position = 0
    for match in _IMPORT.finditer(text):
        output.append(text[position:match.start()])
        child = match.group(1)
        output.append(f"\n/* BEGIN legacy source: {child} */\n")
        output.append(flatten_script(child, stack + (name,)))
        output.append(f"\n/* END legacy source: {child} */\n")
        position = match.end()
    output.append(text[position:])
    return "".join(output)


def render_legacy_runtime() -> str:
    return _PREFIX + flatten_script(SOURCE_ENTRY) + _EXPORT_TAIL


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render_legacy_runtime()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != rendered:
            print(f"stale production bundle: {OUTPUT}")
            return 1
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(rendered, encoding="utf-8")
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
