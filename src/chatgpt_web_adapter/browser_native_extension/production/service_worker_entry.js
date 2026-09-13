import {
  getLegacyRuntimeCallbacks,
  installNativeMessageRouter,
} from "./legacy_runtime.js";
import { createNativeMessageRouter as composeNativeMessageRouter } from "./native_message_router.js";
import { createStreamLifecycle as composeStreamLifecycle } from "./stream_lifecycle.js";

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
  return composeStreamLifecycle(runtime.streamLifecycleCapabilities);
}

const nativeMessageRouter = createNativeMessageRouter();
const streamLifecycle = createStreamLifecycle();
installNativeMessageRouter(nativeMessageRouter);
streamLifecycle.install();
legacyRuntime.startNativeBridge();

export const productionRuntime = Object.freeze({
  turnExecutor: createTurnExecutor(),
  nativeMessageRouter,
  streamLifecycle,
});
