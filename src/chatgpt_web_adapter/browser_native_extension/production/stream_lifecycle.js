function invokeIsolated(handler, args) {
  try {
    const value = handler(...args);
    if (value && typeof value.then === "function") value.catch(() => {});
  } catch {}
}

function fanout(handlers, args) {
  for (const handler of handlers) invokeIsolated(handler, args);
}

const REQUIRED_HANDLERS = Object.freeze([
  "runtimeTabRemoved",
  "submitAckDebuggerEvent",
  "runtimeTabUpdated",
  "runtimeTabReplaced",
  "temporaryDebuggerEvent",
  "temporaryTabRemoved",
  "externalOperationDebuggerEvent",
  "externalOperationTabUpdated",
  "externalOperationTabActivated",
  "externalOperationTabRemoved",
  "persistentDebuggerEvent",
  "persistentTabUpdated",
  "persistentDebuggerDetach",
]);

export function createStreamLifecycle(capabilities, chromeApi = chrome) {
  if (!capabilities || typeof capabilities !== "object") {
    throw new TypeError("STREAM_LIFECYCLE_CAPABILITIES_REQUIRED");
  }
  for (const name of REQUIRED_HANDLERS) {
    if (typeof capabilities[name] !== "function") {
      throw new TypeError(`STREAM_LIFECYCLE_CAPABILITY_REQUIRED:${name}`);
    }
  }
  let installed = false;
  const debuggerEvent = (...args) => fanout([
    capabilities.submitAckDebuggerEvent,
    capabilities.temporaryDebuggerEvent,
    capabilities.externalOperationDebuggerEvent,
    capabilities.persistentDebuggerEvent,
  ], args);
  const debuggerDetach = (...args) => fanout([
    capabilities.persistentDebuggerDetach,
  ], args);
  const tabUpdated = (...args) => fanout([
    capabilities.runtimeTabUpdated,
    capabilities.externalOperationTabUpdated,
    capabilities.persistentTabUpdated,
  ], args);
  const tabRemoved = (...args) => fanout([
    capabilities.runtimeTabRemoved,
    capabilities.temporaryTabRemoved,
    capabilities.externalOperationTabRemoved,
  ], args);
  const tabReplaced = (...args) => fanout([
    capabilities.runtimeTabReplaced,
  ], args);
  const tabActivated = (...args) => fanout([
    capabilities.externalOperationTabActivated,
  ], args);

  return Object.freeze({
    install() {
      if (installed) throw new Error("STREAM_LIFECYCLE_ALREADY_INSTALLED");
      installed = true;
      chromeApi.debugger.onEvent.addListener(debuggerEvent);
      chromeApi.debugger.onDetach.addListener(debuggerDetach);
      chromeApi.tabs.onUpdated.addListener(tabUpdated);
      chromeApi.tabs.onRemoved.addListener(tabRemoved);
      chromeApi.tabs.onReplaced.addListener(tabReplaced);
      chromeApi.tabs.onActivated.addListener(tabActivated);
    },
  });
}
