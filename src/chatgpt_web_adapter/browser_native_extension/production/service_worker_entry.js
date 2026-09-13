import { getLegacyRuntimeCallbacks } from "./legacy_runtime.js";

// Task 5 composition seam.  The factories are intentionally named and explicit:
// later slices replace the legacy collaborator one owner at a time without
// changing the manifest entrypoint again.
export function createTurnExecutor(runtime = getLegacyRuntimeCallbacks()) {
  return runtime.executeTurn;
}

export function createNativeMessageRouter(runtime = getLegacyRuntimeCallbacks()) {
  return runtime.routeNativeMessage;
}

export function createStreamLifecycle(runtime = getLegacyRuntimeCallbacks()) {
  return Object.freeze({ ownsObservedTab: runtime.ownsObservedTab });
}

const legacyRuntime = getLegacyRuntimeCallbacks();

export const productionRuntime = Object.freeze({
  turnExecutor: createTurnExecutor(legacyRuntime),
  nativeMessageRouter: createNativeMessageRouter(legacyRuntime),
  streamLifecycle: createStreamLifecycle(legacyRuntime),
});
