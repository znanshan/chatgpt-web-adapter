from __future__ import annotations

import argparse
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXTENSION_ROOT = REPO_ROOT / "src" / "chatgpt_web_adapter" / "browser_native_extension"
SOURCE_ENTRY = "service_worker_entry_v3.js"
OUTPUT = EXTENSION_ROOT / "production" / "legacy_runtime.js"
_IMPORT = re.compile(r'^\s*importScripts\("([^"]+)"\);?\s*$', re.MULTILINE)
_BASE_TURN_DECL = "async function executeNativeTurn(message) {"
_TURN_CHAIN = re.compile(
    r"(?P<prior>const\s+(?P<prior_name>[A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*executeNativeTurn\s*;)"
    r"|(?P<assignment>^executeNativeTurn\s*=\s*)",
    re.MULTILINE,
)
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

_STREAM_LISTENER_REWRITES: dict[str, tuple[tuple[str, str | None, str], ...]] = {
    "service_worker.js": (("chrome.tabs.onRemoved.addListener(async (tabId) => {", "async function queryComposerReadiness", "async function _productionRuntimeTabRemoved(tabId) {"),),
    "service_worker_hotfix.js": (("chrome.debugger.onEvent.addListener((source, method, params) => {", "async function _waitForSubmitAck", "function _productionSubmitAckDebuggerEvent(source, method, params) {"),),
    "service_worker_runtime_tab_reconciliation.js": (
        ("chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {", "chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {", "function _productionRuntimeTabUpdated(tabId, changeInfo, tab) {"),
        ("chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {", "_pr824a3PublishValidatedRuntimeState().catch(() => {});", "function _productionRuntimeTabReplaced(addedTabId, removedTabId) {"),
    ),
    "service_worker_temporary_chat_production_pr8_13.js": (
        ("chrome.debugger.onEvent.addListener((source, method, params) => {", "ensureRuntimeTab = async function _pr813EnsureRuntimeTab", "function _productionTemporaryDebuggerEvent(source, method, params) {"),
        ("chrome.tabs.onRemoved.addListener(async (tabId) => {", None, "async function _productionTemporaryTabRemoved(tabId) {"),
    ),
    "service_worker_persistent_turn_observer_v3.js": (
        ("chrome.debugger.onEvent.addListener((source, method, params) => {", "chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {", "function _productionPersistentDebuggerEvent(source, method, params) {"),
        ("chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {", "chrome.debugger.onDetach.addListener((source, reason) => {", "function _productionPersistentTabUpdated(tabId, changeInfo, tab) {"),
        ("chrome.debugger.onDetach.addListener((source, reason) => {", "async function _cwaEnsurePersistentObserver", "function _productionPersistentDebuggerDetach(source, reason) {"),
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
    "  const streamLifecycleCapabilities = Object.freeze({\n"
    "    runtimeTabRemoved: _productionRuntimeTabRemoved,\n"
    "    submitAckDebuggerEvent: _productionSubmitAckDebuggerEvent,\n"
    "    runtimeTabUpdated: _productionRuntimeTabUpdated,\n"
    "    runtimeTabReplaced: _productionRuntimeTabReplaced,\n"
    "    temporaryDebuggerEvent: _productionTemporaryDebuggerEvent,\n"
    "    temporaryTabRemoved: _productionTemporaryTabRemoved,\n"
    "    externalOperationDebuggerEvent: _cwaCharOnDebuggerEvent,\n"
    "    externalOperationTabUpdated: _cwaCharOnTabUpdated,\n"
    "    externalOperationTabActivated: (activeInfo) => {\n"
    "      if (!_cwaCharActive) return;\n"
    "      _cwaCharPush({ source: \"tab\", kind: \"activated\", tabId: activeInfo?.tabId ?? null });\n"
    "    },\n"
    "    externalOperationTabRemoved: (tabId) => {\n"
    "      if (!_cwaCharActive) return;\n"
    "      _cwaCharPush({ source: \"tab\", kind: \"removed\", tabId });\n"
    "    },\n"
    "    persistentDebuggerEvent: _productionPersistentDebuggerEvent,\n"
    "    persistentTabUpdated: _productionPersistentTabUpdated,\n"
    "    persistentDebuggerDetach: _productionPersistentDebuggerDetach,\n"
    "  });\n"
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
    "    executeTurn: composedTurnExecutor,\n"
    "    startNativeBridge: connectNativeBridge,\n"
    "    ownsObservedTab: globalThis._cwaPersistentObserverOwnsTab ?? null,\n"
    "    nativeMessageCapabilities,\n"
    "    streamLifecycleCapabilities,\n"
    "  });\n"
    "}\n"
)



def _rewrite_listener_block(name: str, text: str, start_marker: str, end_marker: str | None, declaration: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f"stream listener start marker missing: {name}: {start_marker}")
    end = len(text) if end_marker is None else text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"stream listener end marker missing: {name}: {end_marker}")
    block = text[start:end].rstrip()
    if not block.endswith("});"):
        raise RuntimeError(f"stream listener closure mismatch: {name}: {start_marker}")
    body = block[len(start_marker):-3]
    return text[:start] + declaration + body + "}\n\n" + text[end:]


def _rewrite_stream_lifecycle(name: str, text: str) -> str:
    for start_marker, end_marker, declaration in _STREAM_LISTENER_REWRITES.get(name, ()):
        text = _rewrite_listener_block(name, text, start_marker, end_marker, declaration)
    if name == "service_worker_external_operation_v2_1.js":
        old_activate = '''function _cwaCharActivateListeners() {
  chrome.debugger.onEvent.addListener(_cwaCharOnDebuggerEvent);
  _cwaCharTabUpdatedListener = _cwaCharOnTabUpdated;
  chrome.tabs.onUpdated.addListener(_cwaCharTabUpdatedListener);
  _cwaCharTabActivatedListener = (activeInfo) => {
    if (!_cwaCharActive) return;
    _cwaCharPush({ source: "tab", kind: "activated", tabId: activeInfo?.tabId ?? null });
  };
  chrome.tabs.onActivated.addListener(_cwaCharTabActivatedListener);
  _cwaCharTabRemovedListener = (tabId) => {
    if (!_cwaCharActive) return;
    _cwaCharPush({ source: "tab", kind: "removed", tabId });
  };
  chrome.tabs.onRemoved.addListener(_cwaCharTabRemovedListener);
  _cwaCharDomTimer = setInterval(() => { void _cwaCharDomProbeOnce(); }, CWA_CHARACTERIZATION_DOM_INTERVAL_MS);
}'''
        new_activate = '''function _cwaCharActivateListeners() {
  if (_cwaCharDomTimer === null) {
    _cwaCharDomTimer = setInterval(() => { void _cwaCharDomProbeOnce(); }, CWA_CHARACTERIZATION_DOM_INTERVAL_MS);
  }
}'''
        if old_activate not in text:
            raise RuntimeError("external operation listener activation marker missing")
        text = text.replace(old_activate, new_activate, 1)
        old_remove = '''  chrome.debugger.onEvent.removeListener(_cwaCharOnDebuggerEvent);
  if (_cwaCharTabUpdatedListener) {
    chrome.tabs.onUpdated.removeListener(_cwaCharTabUpdatedListener);
    _cwaCharTabUpdatedListener = null;
  }
  if (_cwaCharTabActivatedListener) {
    chrome.tabs.onActivated.removeListener(_cwaCharTabActivatedListener);
    _cwaCharTabActivatedListener = null;
  }
  if (_cwaCharTabRemovedListener) {
    chrome.tabs.onRemoved.removeListener(_cwaCharTabRemovedListener);
    _cwaCharTabRemovedListener = null;
  }
'''
        if old_remove not in text:
            raise RuntimeError("external operation listener removal marker missing")
        text = text.replace(old_remove, "", 1)
    return text

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
    text = _rewrite_stream_lifecycle(name, text)
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


def compose_turn_executor(text: str) -> tuple[str, str, int]:
    if text.count(_BASE_TURN_DECL) != 1:
        raise RuntimeError("base turn executor marker mismatch")
    text = text.replace(
        _BASE_TURN_DECL,
        "async function _baseExecuteNativeTurn(message) {",
        1,
    )
    direct_call = "await executeNativeTurn(message)"
    if text.count(direct_call) != 1:
        raise RuntimeError("base turn dispatch marker mismatch")
    text = text.replace(direct_call, "await composedTurnExecutor(message)", 1)

    current = "_baseExecuteNativeTurn"
    stage_count = 0
    expecting_prior = True

    def replace(match: re.Match[str]) -> str:
        nonlocal current, stage_count, expecting_prior
        prior_name = match.group("prior_name")
        if prior_name is not None:
            if not expecting_prior:
                raise RuntimeError("turn executor prior appeared before assignment")
            expecting_prior = False
            return f"const {prior_name} = {current};"
        if expecting_prior:
            raise RuntimeError("turn executor assignment appeared without prior")
        stage_count += 1
        current = f"_productionTurnStage{stage_count:02d}"
        expecting_prior = True
        return f"const {current} = "

    transformed = _TURN_CHAIN.sub(replace, text)
    if not expecting_prior:
        raise RuntimeError("turn executor prior missing assignment")
    if stage_count == 0:
        raise RuntimeError("turn executor wrapper chain missing")
    return transformed, current, stage_count


def render_legacy_runtime() -> str:
    flattened = _PREFIX + flatten_script(SOURCE_ENTRY)
    composed, final_executor, stage_count = compose_turn_executor(flattened)
    if stage_count != 64:
        raise RuntimeError(f"turn executor stage count changed: {stage_count}")
    return (
        composed
        + f"\n\nconst composedTurnExecutor = {final_executor};"
        + _EXPORT_TAIL
    )


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
