import {
  getLegacyRuntimeCallbacks,
  installNativeMessageRouter,
} from "./legacy_runtime.js";
import { createNativeMessageRouter as composeNativeMessageRouter } from "./native_message_router.js";

// Task 5 composition seam. The legacy runtime still owns turn behavior during
// the migration, while native-message dispatch has one explicit production owner.
const legacyRuntime = getLegacyRuntimeCallbacks();

export function createTurnExecutor(runtime = legacyRuntime) {
  return runtime.executeTurn;
}

export function createNativeMessageRouter(runtime = legacyRuntime) {
  return composeNativeMessageRouter(runtime.nativeMessageCapabilities);
}

export function createStreamLifecycle(runtime = legacyRuntime) {
  return Object.freeze({ ownsObservedTab: runtime.ownsObservedTab });
}

const nativeMessageRouter = createNativeMessageRouter();
installNativeMessageRouter(nativeMessageRouter);
legacyRuntime.startNativeBridge();

export const productionRuntime = Object.freeze({
  turnExecutor: createTurnExecutor(),
  nativeMessageRouter,
  streamLifecycle: createStreamLifecycle(),
});
