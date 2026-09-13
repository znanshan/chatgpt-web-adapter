// Generated transitional runtime for Task 5.
// Native-message dispatch is installed once by production/service_worker_entry.js.
let _productionNativeMessageRouter = null;

function _dispatchProductionNativeMessage(message, port) {
  const router = _productionNativeMessageRouter ?? onNativeMessage;
  return router(message, port);
}


/* BEGIN legacy source: service_worker_temporary_chat_manual_ground_truth.js */

/* BEGIN legacy source: service_worker_temporary_chat_history_probe.js */

/* BEGIN legacy source: service_worker_temporary_chat_turn_probe.js */

/* BEGIN legacy source: service_worker_temporary_chat_semantic_notice.js */

/* BEGIN legacy source: service_worker_temporary_chat_ax_semantics.js */

/* BEGIN legacy source: service_worker_temporary_chat_state_semantics.js */

/* BEGIN legacy source: service_worker_temporary_chat.js */

/* BEGIN legacy source: service_worker_runtime_tab_reconciliation.js */

/* BEGIN legacy source: service_worker_observability.js */

/* BEGIN legacy source: service_worker_phase_timing_pr8_8.js */

/* BEGIN legacy source: service_worker_recovery.js */

/* BEGIN legacy source: service_worker_hotfix.js */

/* BEGIN legacy source: service_worker.js */
const CHATGPT_ORIGIN = "https://chatgpt.com";
const HOST_NAME = "com.kymuco.chatgpt_web_adapter";
const BRIDGE_PROTOCOL_VERSION = 1;
const CDP_PROTOCOL_VERSION = "1.3";
const DEFAULT_TIMEOUT_MS = 150_000;
const MAX_TURN_TIMEOUT_MS = 1_800_000;
const DEFAULT_READY_TIMEOUT_MS = 120_000;
const DEFAULT_SUBMIT_READY_TIMEOUT_MS = 10_000;
const DEFAULT_SUBMIT_ACK_TIMEOUT_MS = 10_000;
const RUNTIME_TAB_KEY = "browserNativeRuntimeTabId";

let nativePort = null;
let reconnectDelayMs = 1000;
let reconnectTimer = null;
let activeRequestId = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elapsedMs(startedAt) {
  return Math.round(performance.now() - startedAt);
}

function remainingMs(startedAt, timeoutMs, floorMs = 1000) {
  return Math.max(floorMs, timeoutMs - elapsedMs(startedAt));
}

function isChatGPTUrl(url) {
  try {
    return new URL(url).origin === CHATGPT_ORIGIN;
  } catch {
    return false;
  }
}

function conversationIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== CHATGPT_ORIGIN) return null;
    const match = parsed.pathname.match(/^\/c\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function isConversationWrite(url, method) {
  if (method !== "POST") return false;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== CHATGPT_ORIGIN) return false;
    const path = parsed.pathname.replace(/\/+$/, "");
    return path.endsWith("/backend-api/f/conversation") ||
      path.endsWith("/backend-api/conversation");
  } catch {
    return false;
  }
}

function extractSafeStreamMetadata(body, base64Encoded) {
  const result = { conversationId: null, turnExchangeId: null };
  if (base64Encoded || typeof body !== "string") return result;
  for (const rawLine of body.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) continue;
    const payloadText = rawLine.slice(5).trim();
    if (!payloadText.startsWith("{") || !payloadText.includes('"type":"stream_handoff"')) continue;
    try {
      const payload = JSON.parse(payloadText);
      if (payload?.type !== "stream_handoff") continue;
      if (typeof payload.conversation_id === "string") result.conversationId = payload.conversation_id;
      if (typeof payload.turn_exchange_id === "string") result.turnExchangeId = payload.turn_exchange_id;
    } catch {
      // Ignore partial SSE. Raw response data never leaves this worker.
    }
  }
  return result;
}

async function sendCommand(debuggee, method, params = undefined) {
  return chrome.debugger.sendCommand(debuggee, method, params);
}

async function waitForTabComplete(tabId, timeoutMs = 45_000) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return current;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("CHATGPT_RUNTIME_TAB_LOAD_TIMEOUT"));
    }, timeoutMs);

    async function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      try {
        resolve(await chrome.tabs.get(tabId));
      } catch (error) {
        reject(error);
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function storedRuntimeTabId() {
  const value = await chrome.storage.local.get(RUNTIME_TAB_KEY);
  return Number.isInteger(value?.[RUNTIME_TAB_KEY]) ? value[RUNTIME_TAB_KEY] : null;
}

async function storeRuntimeTabId(tabId) {
  await chrome.storage.local.set({ [RUNTIME_TAB_KEY]: tabId });
  postNative({
    protocol: BRIDGE_PROTOCOL_VERSION,
    type: "runtime_state",
    runtimeTabId: tabId
  });
}

async function ensureRuntimeTab(conversationId) {
  const targetUrl = conversationId
    ? `${CHATGPT_ORIGIN}/c/${encodeURIComponent(conversationId)}`
    : `${CHATGPT_ORIGIN}/`;

  let tab = null;
  const storedId = await storedRuntimeTabId();
  if (Number.isInteger(storedId)) {
    try {
      const candidate = await chrome.tabs.get(storedId);
      if (isChatGPTUrl(candidate.url || "")) tab = candidate;
    } catch {
      tab = null;
    }
  }

  if (!tab) {
    tab = await chrome.tabs.create({ url: targetUrl, active: false });
    if (!Number.isInteger(tab.id)) throw new Error("CHATGPT_RUNTIME_TAB_CREATE_FAILED");
    await storeRuntimeTabId(tab.id);
    return waitForTabComplete(tab.id);
  }

  const currentConversationId = conversationIdFromUrl(tab.url || "");
  const alreadyTargeted = conversationId
    ? currentConversationId === conversationId
    : currentConversationId == null && new URL(tab.url || CHATGPT_ORIGIN).pathname === "/";

  if (!alreadyTargeted) {
    await chrome.tabs.update(tab.id, { url: targetUrl, active: false });
    tab = await waitForTabComplete(tab.id);
  }
  return tab;
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const storedId = await storedRuntimeTabId();
  if (storedId === tabId) {
    await chrome.storage.local.remove(RUNTIME_TAB_KEY);
    postNative({
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "runtime_state",
      runtimeTabId: null
    });
  }
});

async function queryComposerReadiness(debuggee) {
  const result = await sendCommand(debuggee, "Runtime.evaluate", {
    expression: `(() => {
      const selectors = [
        '#prompt-textarea',
        '[contenteditable="true"]',
        'textarea[placeholder]'
      ];
      const composer = selectors
        .map((selector) => document.querySelector(selector))
        .find((el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      if (!composer) return { ready: false, state: 'UNKNOWN', reason: 'composer_missing' };

      const stopSelectors = [
        '[data-testid="stop-button"]',
        '[data-testid="stop-generating-button"]',
        'button[aria-label*="Stop generating"]',
        'button[aria-label*="Остановить"]'
      ];
      const stopVisible = stopSelectors.some((selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const busy = composer.getAttribute('aria-busy') === 'true' ||
        composer.getAttribute('contenteditable') === 'false' ||
        composer.disabled === true;
      return {
        ready: !stopVisible && !busy,
        state: stopVisible || busy ? 'GENERATING' : 'READY_FOR_INPUT',
        reason: stopVisible ? 'generation_control_visible' : (busy ? 'composer_busy' : 'ready')
      };
    })()`,
    returnByValue: true,
    awaitPromise: true
  });
  return result?.result?.value || { ready: false, reason: "unknown" };
}

async function waitForComposerReady(debuggee, timeoutMs = DEFAULT_READY_TIMEOUT_MS) {
  const startedAt = performance.now();
  let consecutiveReady = 0;
  let lastReason = "unknown";
  while (elapsedMs(startedAt) < timeoutMs) {
    try {
      const state = await queryComposerReadiness(debuggee);
      lastReason = state?.reason || "unknown";
      if (state?.ready) {
        consecutiveReady += 1;
        if (consecutiveReady >= 2) return elapsedMs(startedAt);
      } else {
        consecutiveReady = 0;
      }
    } catch {
      consecutiveReady = 0;
      lastReason = "readiness_probe_failed";
    }
    await sleep(250);
  }
  throw new Error(`CHATGPT_COMPOSER_NOT_READY:${lastReason}`);
}

async function locateAndFocusComposer(debuggee) {
  await sendCommand(debuggee, "DOM.enable");
  await sendCommand(debuggee, "Accessibility.enable");

  try {
    const tree = await sendCommand(debuggee, "Accessibility.getFullAXTree");
    const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
    const candidates = nodes.filter((node) => {
      const role = node?.role?.value;
      const backendDOMNodeId = node?.backendDOMNodeId;
      if (role !== "textbox" || !Number.isInteger(backendDOMNodeId)) return false;
      const props = Array.isArray(node?.properties) ? node.properties : [];
      const editable = props.find((prop) => prop?.name === "editable");
      return editable == null || Boolean(editable?.value?.value);
    });
    if (candidates.length) {
      const node = candidates[candidates.length - 1];
      await sendCommand(debuggee, "DOM.focus", { backendNodeId: node.backendDOMNodeId });
      return "accessibility";
    }
  } catch {
    // Fall through to the bounded DOM fallback.
  }

  const result = await sendCommand(debuggee, "Runtime.evaluate", {
    expression: `(() => {
      const selectors = [
        '#prompt-textarea',
        '[contenteditable="true"]',
        'textarea[placeholder]'
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        el.focus();
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
    awaitPromise: true
  });
  if (!result?.result?.value) throw new Error("CHATGPT_COMPOSER_NOT_FOUND");
  return "bounded_dom_fallback";
}

async function clearComposer(debuggee) {
  await sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyDown", key: "a", code: "KeyA", modifiers: 2,
    windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
  });
  await sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyUp", key: "a", code: "KeyA", modifiers: 2,
    windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
  });
  await sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyDown", key: "Backspace", code: "Backspace",
    windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8
  });
  await sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyUp", key: "Backspace", code: "Backspace",
    windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8
  });
}

async function querySendButtonPoint(debuggee) {
  const result = await sendCommand(debuggee, "Runtime.evaluate", {
    expression: `(() => {
      const selectors = [
        'button[data-testid="send-button"]',
        'button[data-testid="composer-submit-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]',
        'button[aria-label="Отправить сообщение"]'
      ];
      for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (!button) continue;
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        const disabled = button.disabled === true || button.getAttribute('aria-disabled') === 'true';
        if (rect.width <= 0 || rect.height <= 0 || disabled || style.pointerEvents === 'none') continue;
        return {
          selector,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
      return null;
    })()`,
    returnByValue: true,
    awaitPromise: true
  });
  return result?.result?.value || null;
}

async function waitForSendButtonPoint(debuggee, timeoutMs = DEFAULT_SUBMIT_READY_TIMEOUT_MS) {
  const startedAt = performance.now();
  while (elapsedMs(startedAt) < timeoutMs) {
    const point = await querySendButtonPoint(debuggee);
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) return point;
    await sleep(100);
  }
  throw new Error("CHATGPT_SEND_BUTTON_NOT_READY");
}

async function clickSendButton(debuggee, point) {
  await sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y
  });
  await sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1
  });
  await sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1
  });
}

async function submitWithEnter(debuggee) {
  await sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r",
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13
  });
  await sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyUp", key: "Enter", code: "Enter",
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13
  });
}

async function submitOfficialPageTurn(debuggee, timeoutMs) {
  try {
    const point = await waitForSendButtonPoint(
      debuggee,
      Math.min(timeoutMs, DEFAULT_SUBMIT_READY_TIMEOUT_MS)
    );
    await clickSendButton(debuggee, point);
    return { strategy: "send_button_click", selector: point.selector };
  } catch (error) {
    // No commit action has occurred if the visible Send control was not
    // acquired. Raw Enter is ambiguous (it may send or insert a newline), so
    // fail with explicit pre-commit evidence and let Bridge refresh/retry.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`CHATGPT_SEND_BUTTON_NOT_READY_BEFORE_COMMIT:${detail}`);
  }
}

async function executeOfficialPageTurn({ tabId, text, timeoutMs, onUiState = null, submitOnly = false }) {
  if (!Number.isInteger(tabId)) throw new Error("TAB_ID_REQUIRED");
  if (typeof text !== "string" || !text.trim()) throw new Error("TEXT_REQUIRED");
  if (text.length > 200_000) throw new Error("TEXT_TOO_LARGE_FOR_BROWSER_NATIVE_TURN");

  const startedAt = performance.now();
  const tab = await chrome.tabs.get(tabId);
  if (!isChatGPTUrl(tab.url || "")) throw new Error("RUNTIME_TAB_IS_NOT_CHATGPT");
  const debuggee = { tabId };
  const diagnostics = {
    tabId,
    tabWasActive: Boolean(tab.active),
    composerStrategy: null,
    submitStrategy: null,
    submitButtonSelector: null,
    submitAckMs: null,
    responseStatus: null,
    responseMimeType: null,
    conversationRequestSeen: false,
    conversationResponseSeen: false,
    loadingFinished: false,
    completionReadyWaitMs: null,
    debuggerAttachedAfter: null,
    elapsedMs: null
  };

  let attached = false;
  let eventListener = null;
  let uiProbeTimer = null;
  let lastUiState = null;
  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await sendCommand(debuggee, "Network.enable");
    await sendCommand(debuggee, "Runtime.enable");
    await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );

    let conversationRequestId = null;
    let resolveRequestSeen;
    let resolveCompleted;
    let rejectCompleted;
    const requestSeen = new Promise((resolve) => {
      resolveRequestSeen = resolve;
    });
    const completed = new Promise((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    eventListener = (source, method, params) => {
      if (source.tabId !== tabId) return;
      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (!conversationRequestId && isConversationWrite(request?.url || "", request?.method || "")) {
          conversationRequestId = params.requestId;
          diagnostics.conversationRequestSeen = true;
          resolveRequestSeen(params.requestId);
        }
        return;
      }
      if (!conversationRequestId || params?.requestId !== conversationRequestId) return;
      if (method === "Network.responseReceived") {
        diagnostics.conversationResponseSeen = true;
        diagnostics.responseStatus = params?.response?.status ?? null;
        diagnostics.responseMimeType = params?.response?.mimeType ?? null;
        return;
      }
      if (method === "Network.loadingFailed") {
        rejectCompleted(new Error(`CHATGPT_CONVERSATION_REQUEST_FAILED:${params?.errorText || "unknown"}`));
        return;
      }
      if (method === "Network.loadingFinished") {
        diagnostics.loadingFinished = true;
        resolveCompleted(conversationRequestId);
      }
    };
    chrome.debugger.onEvent.addListener(eventListener);

    diagnostics.composerStrategy = await locateAndFocusComposer(debuggee);
    await clearComposer(debuggee);
    await sendCommand(debuggee, "Input.insertText", { text });

    const submitStartedAt = performance.now();
    const submit = await submitOfficialPageTurn(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_READY_TIMEOUT_MS)
    );
    diagnostics.submitStrategy = submit.strategy;
    diagnostics.submitButtonSelector = submit.selector;

    await Promise.race([
      requestSeen,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`CHATGPT_SUBMIT_NOT_OBSERVED:${submit.strategy}`)),
        Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_ACK_TIMEOUT_MS)
      ))
    ]);
    diagnostics.submitAckMs = elapsedMs(submitStartedAt);

    if (submitOnly) {
      const finalTab = await chrome.tabs.get(tabId);
      // This older branch acks on the dispatch event alone and has no network
      // response to report, so 202 here means "dispatched, unconfirmed".
      // service_worker_submit_only_v2.js replaces this path and does read the
      // real status; record the fallback explicitly so the two are
      // distinguishable instead of both claiming a server verdict.
      diagnostics.responseStatus = 202;
      diagnostics.responseStatusObserved = false;
      diagnostics.elapsedMs = elapsedMs(startedAt);
      return {
        diagnostics,
        finalUrl: finalTab.url || "",
        conversationId: conversationIdFromUrl(finalTab.url || ""),
        turnExchangeId: null
      };
    }

    const reportUiState = async () => {
      if (typeof onUiState !== "function") return;
      try {
        const state = await queryComposerReadiness(debuggee);
        const normalized = state?.state === "GENERATING" || state?.state === "READY_FOR_INPUT"
          ? state.state
          : "UNKNOWN";
        if (normalized === lastUiState) return;
        lastUiState = normalized;
        onUiState({ state: normalized, reason: state?.reason || "unknown" });
      } catch {
        if (lastUiState === "UNKNOWN") return;
        lastUiState = "UNKNOWN";
        onUiState({ state: "UNKNOWN", reason: "ui_state_probe_failed" });
      }
    };
    await reportUiState();
    if (typeof onUiState === "function") {
      uiProbeTimer = setInterval(() => { reportUiState(); }, 1000);
    }

    const requestId = await Promise.race([
      completed,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("CHATGPT_TURN_TIMEOUT")),
        remainingMs(startedAt, timeoutMs)
      ))
    ]);

    let safeMetadata = { conversationId: null, turnExchangeId: null };
    try {
      const response = await sendCommand(debuggee, "Network.getResponseBody", { requestId });
      safeMetadata = extractSafeStreamMetadata(response?.body, Boolean(response?.base64Encoded));
    } catch {
      // Optional safe metadata only.
    }

    diagnostics.completionReadyWaitMs = await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );

    const finalTab = await chrome.tabs.get(tabId);
    const urlConversationId = conversationIdFromUrl(finalTab.url || "");
    diagnostics.elapsedMs = elapsedMs(startedAt);
    return {
      diagnostics,
      finalUrl: finalTab.url || "",
      conversationId: safeMetadata.conversationId || urlConversationId,
      turnExchangeId: safeMetadata.turnExchangeId
    };
  } finally {
    if (uiProbeTimer !== null) clearInterval(uiProbeTimer);
    if (eventListener) chrome.debugger.onEvent.removeListener(eventListener);
    if (attached) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch {
        // Tab may have closed.
      }
    }
    try {
      const targets = await chrome.debugger.getTargets();
      diagnostics.debuggerAttachedAfter = Boolean(
        targets.find((target) => target.tabId === tabId)?.attached
      );
    } catch {
      diagnostics.debuggerAttachedAfter = null;
    }
  }
}

async function executeNativeTurn(message) {
  const conversationId = typeof message.conversationId === "string" && message.conversationId.trim()
    ? message.conversationId.trim()
    : null;
  const timeoutMs = Number.isFinite(message.timeoutMs)
    ? Math.max(10_000, Math.min(Number(message.timeoutMs), MAX_TURN_TIMEOUT_MS))
    : DEFAULT_TIMEOUT_MS;

  const tab = await ensureRuntimeTab(conversationId);
  if (!Number.isInteger(tab.id)) throw new Error("CHATGPT_RUNTIME_TAB_MISSING_ID");
  const onUiState = message.streamTextObservations === true
    ? (state) => postNative({
        protocol: BRIDGE_PROTOCOL_VERSION,
        type: "turn_event",
        request_id: message.request_id,
        event: {
          schema: 1,
          type: "browser_ui_state",
          state: state?.state || "UNKNOWN",
          reason: state?.reason || "unknown"
        }
      })
    : null;
  const result = await executeOfficialPageTurn({
    tabId: tab.id,
    text: message.text,
    timeoutMs,
    onUiState,
    submitOnly: message.submitOnly === true
  });
  const resolvedConversationId = result.conversationId || conversationId;
  if (!resolvedConversationId && message.submitOnly !== true) {
    throw new Error("CHATGPT_TURN_MISSING_CONVERSATION_ID");
  }
  // Under submit-only the extension now reports the status it actually read
  // from the network when it has one, so demanding exactly 202 would reject a
  // genuine 200.  Require a real 2xx instead.  The previous submit-only form
  // compared against a value the submit-only path had just hard-coded, which
  // made this check vacuously true and hid every backend rejection.
  if (message.submitOnly === true) {
    const submitOnlyStatus = result.diagnostics.responseStatus;
    if (
      !Number.isInteger(submitOnlyStatus) ||
      submitOnlyStatus < 200 ||
      submitOnlyStatus >= 300
    ) {
      throw new Error(`CHATGPT_TURN_HTTP_STATUS:${submitOnlyStatus}`);
    }
  } else if (result.diagnostics.responseStatus !== 200) {
    throw new Error(`CHATGPT_TURN_HTTP_STATUS:${result.diagnostics.responseStatus}`);
  }
  if (result.diagnostics.debuggerAttachedAfter === true) {
    throw new Error("CHATGPT_DEBUGGER_ATTACHMENT_LEAK");
  }
  return {
    conversationId: resolvedConversationId,
    turnExchangeId: result.turnExchangeId,
    responseStatus: result.diagnostics.responseStatus,
    responseMimeType: result.diagnostics.responseMimeType,
    finalUrl: result.finalUrl,
    tabId: tab.id,
    tabWasActive: result.diagnostics.tabWasActive,
    elapsedMs: result.diagnostics.elapsedMs,
    submitStrategy: result.diagnostics.submitStrategy,
    submitAckMs: result.diagnostics.submitAckMs
  };
}

function safePortPost(port, message) {
  if (!port) return false;
  try {
    port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

function postNative(message) {
  return safePortPost(nativePort, message);
}

async function onNativeMessage(message, port) {
  if (message?.protocol !== BRIDGE_PROTOCOL_VERSION) return;
  if (message?.type !== "turn") return;
  const requestId = message.request_id;
  if (typeof requestId !== "string" || !requestId) return;
  if (activeRequestId !== null) {
    safePortPost(port, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "turn_result",
      request_id: requestId,
      ok: false,
      error: "BROWSER_NATIVE_EXTENSION_BUSY"
    });
    return;
  }

  activeRequestId = requestId;
  try {
    const result = await executeNativeTurn(message);
    safePortPost(port, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "turn_result",
      request_id: requestId,
      ok: true,
      ...result
    });
  } catch (error) {
    safePortPost(port, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "turn_result",
      request_id: requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    activeRequestId = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNativeBridge();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
}

function connectNativeBridge() {
  if (nativePort !== null) return;
  let port;
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch {
    scheduleReconnect();
    return;
  }

  nativePort = port;
  const thisPort = port;
  port.onMessage.addListener((message) => {
    _dispatchProductionNativeMessage(message, thisPort);
  });
  port.onDisconnect.addListener(() => {
    if (nativePort === thisPort) nativePort = null;
    scheduleReconnect();
  });
  reconnectDelayMs = 1000;

  storedRuntimeTabId().then((runtimeTabId) => {
    if (nativePort !== thisPort) return;
    postNative({
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "hello",
      extensionId: chrome.runtime.id,
      extensionVersion: chrome.runtime.getManifest().version,
      runtimeTabId
    });
  });
}

chrome.runtime.onInstalled.addListener(() => connectNativeBridge());
chrome.runtime.onStartup.addListener(() => connectNativeBridge());

/* END legacy source: service_worker.js */

const HOTFIX_SUBMIT_ACK_MS = 1_500;
const HOTFIX_FINAL_ACK_MS = 2_500;
const _originalCoreSendCommand = sendCommand;
const _submitStateByTabId = new Map();

function _isConversationWrite(url, method) {
  if (method !== "POST") return false;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== "https://chatgpt.com") return false;
    const path = parsed.pathname.replace(/\/+$/, "");
    return path.endsWith("/backend-api/f/conversation") ||
      path.endsWith("/backend-api/conversation");
  } catch {
    return false;
  }
}

function _newSubmitState(tabId) {
  const state = {
    tabId,
    observed: false,
    resolver: null,
    strategy: null
  };
  _submitStateByTabId.set(tabId, state);
  return state;
}

function _markSubmitObserved(tabId) {
  const state = _submitStateByTabId.get(tabId);
  if (!state || state.observed) return;
  state.observed = true;
  if (state.resolver) {
    const resolve = state.resolver;
    state.resolver = null;
    resolve(true);
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!Number.isInteger(source?.tabId) || method !== "Network.requestWillBeSent") return;
  const request = params?.request;
  if (_isConversationWrite(request?.url || "", request?.method || "")) {
    _markSubmitObserved(source.tabId);
  }
});

async function _waitForSubmitAck(tabId, timeoutMs) {
  const state = _submitStateByTabId.get(tabId);
  if (!state) return false;
  if (state.observed) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (state.resolver === finish) state.resolver = null;
      resolve(value);
    };
    state.resolver = finish;
    setTimeout(() => finish(Boolean(state.observed)), timeoutMs);
  });
}

function _sendButtonExpression(action) {
  return `(() => {
    const selectors = [
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Отправить сообщение"]'
    ];
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (!button) continue;
      const rect = button.getBoundingClientRect();
      const disabled = button.disabled === true || button.getAttribute('aria-disabled') === 'true';
      if (rect.width <= 0 || rect.height <= 0 || disabled) continue;
      if (${JSON.stringify(action)} === 'focus') button.focus();
      if (${JSON.stringify(action)} === 'click') button.click();
      return { selector };
    }
    return null;
  })()`;
}

async function _focusSendButton(debuggee) {
  const result = await _originalCoreSendCommand(debuggee, "Runtime.evaluate", {
    expression: _sendButtonExpression("focus"),
    returnByValue: true,
    awaitPromise: true
  });
  return result?.result?.value?.selector || null;
}

async function _pageActivateSendButton(debuggee) {
  const result = await _originalCoreSendCommand(debuggee, "Runtime.evaluate", {
    expression: _sendButtonExpression("click"),
    returnByValue: true,
    awaitPromise: true
  });
  return result?.result?.value?.selector || null;
}

async function _pressFocusedButton(debuggee, key, code, virtualKeyCode, text = undefined) {
  const base = {
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode
  };
  await _originalCoreSendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyDown",
    ...base,
    ...(text ? { text, unmodifiedText: text } : {})
  });
  await _originalCoreSendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyUp",
    ...base
  });
}

async function _runSubmitFallbackLadder(debuggee) {
  const tabId = debuggee?.tabId;
  if (!Number.isInteger(tabId)) return null;
  const state = _submitStateByTabId.get(tabId) || _newSubmitState(tabId);

  if (await _waitForSubmitAck(tabId, HOTFIX_SUBMIT_ACK_MS)) {
    state.strategy = "cdp_mouse";
    return state.strategy;
  }

  const selector = await _focusSendButton(debuggee);
  if (selector && !state.observed) {
    await _pressFocusedButton(debuggee, "Enter", "Enter", 13, "\r");
    if (await _waitForSubmitAck(tabId, HOTFIX_SUBMIT_ACK_MS)) {
      state.strategy = "focused_button_enter";
      return state.strategy;
    }
  }

  if (selector && !state.observed) {
    await _pressFocusedButton(debuggee, " ", "Space", 32, " ");
    if (await _waitForSubmitAck(tabId, HOTFIX_SUBMIT_ACK_MS)) {
      state.strategy = "focused_button_space";
      return state.strategy;
    }
  }

  if (!state.observed) {
    const pageSelector = await _pageActivateSendButton(debuggee);
    if (pageSelector && await _waitForSubmitAck(tabId, HOTFIX_FINAL_ACK_MS)) {
      state.strategy = "page_button_click";
      return state.strategy;
    }
  }

  return null;
}

async function _patchedCoreSendCommand(debuggee, method, params = undefined) {
  if (method !== "Input.dispatchMouseEvent" || !Number.isInteger(debuggee?.tabId)) {
    return _originalCoreSendCommand(debuggee, method, params);
  }

  if (params?.type === "mousePressed" && params?.button === "left") {
    _newSubmitState(debuggee.tabId);
    return _originalCoreSendCommand(debuggee, method, {
      ...params,
      buttons: 1
    });
  }

  if (params?.type === "mouseReleased" && params?.button === "left") {
    const result = await _originalCoreSendCommand(debuggee, method, {
      ...params,
      buttons: 0
    });
    try {
      await _runSubmitFallbackLadder(debuggee);
    } finally {
      setTimeout(() => _submitStateByTabId.delete(debuggee.tabId), 15_000);
    }
    return result;
  }

  return _originalCoreSendCommand(debuggee, method, params);
}

sendCommand = _patchedCoreSendCommand;

/* END legacy source: service_worker_hotfix.js */

const STALE_UI_COMPLETION_EVIDENCE_MAX_AGE_MS = 5_000;
const STALE_UI_RELOAD_TIMEOUT_MS = 45_000;
const _pr811OriginalExecuteNativeTurn = executeNativeTurn;

// PR8.11.1 installs a per-turn promise here from the later response-stream
// overlay. The core page turn snapshots the promise after submit observation.
// If no later layer installs one, behavior is exactly the prior network-complete
// path. The hook never authorizes a write or a retry.
let _cwaOfficialPageEarlyCompletionSignalPromise = null;

function _cwaInstallOfficialPageEarlyCompletionSignal(promise) {
  const previous = _cwaOfficialPageEarlyCompletionSignalPromise;
  _cwaOfficialPageEarlyCompletionSignalPromise = (
    promise && typeof promise.then === "function"
  ) ? promise : null;
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    _cwaOfficialPageEarlyCompletionSignalPromise = previous;
  };
}

function _pr811FreshCanonicalCompletionEvidence(message) {
  if (message?.canonicalCompleted !== true) return false;
  if (!Number.isFinite(message?.canonicalCompletedAtMs)) return false;
  const ageMs = Date.now() - Number(message.canonicalCompletedAtMs);
  return ageMs >= 0 && ageMs <= STALE_UI_COMPLETION_EVIDENCE_MAX_AGE_MS;
}

async function _pr811ReloadRuntimeTabAndWait(tabId, expectedConversationId) {
  const startedAt = performance.now();
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("CHATGPT_STALE_UI_RELOAD_TIMEOUT")),
      STALE_UI_RELOAD_TIMEOUT_MS
    );
    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.reload(tabId).catch((error) => finish(error));
  });

  const reloadedTab = await chrome.tabs.get(tabId);
  const conversationId = conversationIdFromUrl(reloadedTab.url || "");
  if (conversationId !== expectedConversationId) {
    throw new Error("CHATGPT_STALE_UI_RELOAD_CONVERSATION_MISMATCH");
  }
  return Math.round(performance.now() - startedAt);
}

async function _pr811MaybeRecoverStaleRuntimeUi(message) {
  const conversationId = typeof message?.conversationId === "string"
    ? message.conversationId.trim()
    : "";
  if (!conversationId || !_pr811FreshCanonicalCompletionEvidence(message)) {
    return { runtimeReloaded: false, runtimeReloadMs: null };
  }

  const tab = await ensureRuntimeTab(conversationId);
  if (!Number.isInteger(tab?.id)) {
    throw new Error("CHATGPT_RUNTIME_TAB_MISSING_ID");
  }

  const debuggee = { tabId: tab.id };
  let attached = false;
  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await sendCommand(debuggee, "Runtime.enable");
    const readiness = await queryComposerReadiness(debuggee);
    if (readiness?.reason !== "generation_control_visible") {
      return { runtimeReloaded: false, runtimeReloadMs: null };
    }
  } finally {
    if (attached) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch {
        // The dedicated runtime tab may have closed while probing.
      }
    }
  }

  const runtimeReloadMs = await _pr811ReloadRuntimeTabAndWait(tab.id, conversationId);
  return { runtimeReloaded: true, runtimeReloadMs };
}

// PR8.11.1 production repair. This is the current core page-turn implementation
// with one additional fail-closed completion race. A visible assistant terminal
// signal may stop blocking on Network.loadingFinished only when the response is
// already HTTP 200 and the page already exposes a concrete /c/<id> route.
// Otherwise it falls through to the prior network-complete path. Canonical HTTP
// readback remains mandatory in browser_native_client.py after this returns.
executeOfficialPageTurn = async function _executeOfficialPageTurnWithEarlyTerminalBoundary({
  tabId,
  text,
  timeoutMs,
  onUiState = null
}) {
  if (!Number.isInteger(tabId)) throw new Error("TAB_ID_REQUIRED");
  if (typeof text !== "string" || !text.trim()) throw new Error("TEXT_REQUIRED");
  if (text.length > 200_000) throw new Error("TEXT_TOO_LARGE_FOR_BROWSER_NATIVE_TURN");

  const startedAt = performance.now();
  const tab = await chrome.tabs.get(tabId);
  if (!isChatGPTUrl(tab.url || "")) throw new Error("RUNTIME_TAB_IS_NOT_CHATGPT");
  const debuggee = { tabId };
  const diagnostics = {
    tabId,
    tabWasActive: Boolean(tab.active),
    composerStrategy: null,
    submitStrategy: null,
    submitButtonSelector: null,
    submitAckMs: null,
    responseStatus: null,
    responseMimeType: null,
    conversationRequestSeen: false,
    conversationResponseSeen: false,
    loadingFinished: false,
    completionReadyWaitMs: null,
    completionBoundary: null,
    earlyCompletionCandidateSeen: false,
    earlyCompletionAccepted: false,
    earlyCompletionKind: null,
    earlyCompletionRejectedReason: null,
    debuggerAttachedAfter: null,
    elapsedMs: null
  };

  let attached = false;
  let eventListener = null;
  let uiProbeTimer = null;
  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await sendCommand(debuggee, "Network.enable");
    await sendCommand(debuggee, "Runtime.enable");
    await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );

    let conversationRequestId = null;
    let resolveRequestSeen;
    let resolveCompleted;
    let rejectCompleted;
    const requestSeen = new Promise((resolve) => {
      resolveRequestSeen = resolve;
    });
    const completed = new Promise((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    eventListener = (source, method, params) => {
      if (source.tabId !== tabId) return;
      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (!conversationRequestId && isConversationWrite(request?.url || "", request?.method || "")) {
          conversationRequestId = params.requestId;
          diagnostics.conversationRequestSeen = true;
          resolveRequestSeen(params.requestId);
        }
        return;
      }
      if (!conversationRequestId || params?.requestId !== conversationRequestId) return;
      if (method === "Network.responseReceived") {
        diagnostics.conversationResponseSeen = true;
        diagnostics.responseStatus = params?.response?.status ?? null;
        diagnostics.responseMimeType = params?.response?.mimeType ?? null;
        return;
      }
      if (method === "Network.loadingFailed") {
        rejectCompleted(new Error(`CHATGPT_CONVERSATION_REQUEST_FAILED:${params?.errorText || "unknown"}`));
        return;
      }
      if (method === "Network.loadingFinished") {
        diagnostics.loadingFinished = true;
        resolveCompleted(conversationRequestId);
      }
    };
    chrome.debugger.onEvent.addListener(eventListener);

    diagnostics.composerStrategy = await locateAndFocusComposer(debuggee);
    await clearComposer(debuggee);
    await sendCommand(debuggee, "Input.insertText", { text });

    const submitStartedAt = performance.now();
    const submit = await submitOfficialPageTurn(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_READY_TIMEOUT_MS)
    );
    diagnostics.submitStrategy = submit.strategy;
    diagnostics.submitButtonSelector = submit.selector;

    await Promise.race([
      requestSeen,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`CHATGPT_SUBMIT_NOT_OBSERVED:${submit.strategy}`)),
        Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_ACK_TIMEOUT_MS)
      ))
    ]);
    diagnostics.submitAckMs = elapsedMs(submitStartedAt);

    // Keep the redacted UI-state sidecar alive through the effective recovery
    // implementation.  This wrapper replaces the core page-turn function in
    // the installed chain, so dropping onUiState here makes Bridge observe
    // activity events but never learn that the composer returned to input.
    const reportUiState = async () => {
      if (typeof onUiState !== "function") return;
      try {
        const state = await queryComposerReadiness(debuggee);
        const normalized = state?.state === "GENERATING" || state?.state === "READY_FOR_INPUT"
          ? state.state
          : "UNKNOWN";
        onUiState({ state: normalized, reason: state?.reason || "unknown" });
      } catch {
        onUiState({ state: "UNKNOWN", reason: "ui_state_probe_failed" });
      }
    };
    await reportUiState();
    if (typeof onUiState === "function") {
      uiProbeTimer = setInterval(() => { reportUiState(); }, 1000);
    }

    const earlySignalPromise = _cwaOfficialPageEarlyCompletionSignalPromise;
    const timeoutResult = new Promise((_, reject) => setTimeout(
      () => reject(new Error("CHATGPT_TURN_TIMEOUT")),
      remainingMs(startedAt, timeoutMs)
    ));
    const networkResult = completed.then((requestId) => ({
      kind: "network_complete",
      requestId
    }));
    const firstBoundary = earlySignalPromise
      ? await Promise.race([
          networkResult,
          Promise.resolve(earlySignalPromise).then((signal) => ({
            kind: "assistant_terminal_candidate",
            signal
          })),
          timeoutResult
        ])
      : await Promise.race([networkResult, timeoutResult]);

    let requestId = conversationRequestId;
    let safeMetadata = { conversationId: null, turnExchangeId: null };
    let finalTab = null;
    let urlConversationId = null;

    if (firstBoundary?.kind === "assistant_terminal_candidate") {
      diagnostics.earlyCompletionCandidateSeen = true;
      diagnostics.earlyCompletionKind = (
        typeof firstBoundary?.signal?.kind === "string"
          ? firstBoundary.signal.kind
          : null
      );
      finalTab = await chrome.tabs.get(tabId);
      urlConversationId = conversationIdFromUrl(finalTab.url || "");

      if (diagnostics.conversationResponseSeen !== true || diagnostics.responseStatus !== 200) {
        diagnostics.earlyCompletionRejectedReason = "response_not_proven_200";
      } else if (!urlConversationId) {
        diagnostics.earlyCompletionRejectedReason = "conversation_route_not_resolved";
      } else {
        diagnostics.earlyCompletionAccepted = true;
        diagnostics.completionBoundary = "assistant_terminal";
      }
    }

    if (diagnostics.earlyCompletionAccepted !== true) {
      if (firstBoundary?.kind === "network_complete") {
        requestId = firstBoundary.requestId;
      } else {
        requestId = await Promise.race([completed, timeoutResult]);
      }
      diagnostics.completionBoundary = "network_loading_finished";

      try {
        const response = await sendCommand(debuggee, "Network.getResponseBody", { requestId });
        safeMetadata = extractSafeStreamMetadata(response?.body, Boolean(response?.base64Encoded));
      } catch {
        // Optional safe metadata only.
      }

      diagnostics.completionReadyWaitMs = await waitForComposerReady(
        debuggee,
        Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
      );
      finalTab = await chrome.tabs.get(tabId);
      urlConversationId = conversationIdFromUrl(finalTab.url || "");
    }

    diagnostics.elapsedMs = elapsedMs(startedAt);
    return {
      diagnostics,
      finalUrl: finalTab?.url || "",
      conversationId: safeMetadata.conversationId || urlConversationId,
      turnExchangeId: safeMetadata.turnExchangeId
    };
  } finally {
    if (uiProbeTimer !== null) clearInterval(uiProbeTimer);
    if (eventListener) chrome.debugger.onEvent.removeListener(eventListener);
    if (attached) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch {
        // Tab may have closed.
      }
    }
    try {
      const targets = await chrome.debugger.getTargets();
      diagnostics.debuggerAttachedAfter = Boolean(
        targets.find((target) => target.tabId === tabId)?.attached
      );
    } catch {
      diagnostics.debuggerAttachedAfter = null;
    }
  }
};

executeNativeTurn = async function _executeNativeTurnWithStaleUiRecovery(message) {
  const recovery = await _pr811MaybeRecoverStaleRuntimeUi(message);
  const result = await _pr811OriginalExecuteNativeTurn(message);
  return {
    ...result,
    runtimeReloaded: recovery.runtimeReloaded,
    runtimeReloadMs: recovery.runtimeReloadMs
  };
};

/* END legacy source: service_worker_recovery.js */

// PR8.8 phase-level Browser Authority cost attribution.
//
// This layer adds observability only. It is loaded immediately below the
// existing provisioning-observability/lease/Temporary wrappers, so those
// established semantics remain authoritative.
//
// Only bounded numeric timing metadata is retained. No prompt text, cookies,
// raw response bodies, SSE, DOM, or authentication material is stored/exported.

const PR88_PHASE_TIMING_SCHEMA_VERSION = 1;
const PR88_PHASE_TIMING_STORAGE_KEY = "browserAuthorityLastPhaseTimingV1";

const _pr88PhasePriorEnsureRuntimeTab = ensureRuntimeTab;
const _pr88PhasePriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr88PhasePriorExecuteNativeTurn = executeNativeTurn;

let _pr88PhaseTimingContext = null;

function _pr88PhaseLeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

function _pr88PhaseDurationMs(startedAt, endedAt = performance.now()) {
  return Math.max(0, Math.round(endedAt - startedAt));
}

function _pr88PhaseSafeInt(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(Number(value))) : null;
}

function _pr88PhaseTimingQueryConflict(message) {
  return (
    message?.text != null ||
    message?.conversationId != null ||
    message?.canonicalCompleted === true ||
    message?.browserAuthorityLeaseId != null ||
    message?.probeTemporaryMode === true ||
    message?.characterizeTemporaryTurn === true ||
    message?.probeTemporaryHistoryPresence === true ||
    message?.characterizeManualTemporaryGroundTruth === true ||
    message?.probeTemporaryRouteReopen === true
  );
}

ensureRuntimeTab = async function _ensureRuntimeTabWithPhaseTiming(conversationId) {
  const context = _pr88PhaseTimingContext;
  if (context === null) {
    return _pr88PhasePriorEnsureRuntimeTab(conversationId);
  }

  const startedAt = performance.now();
  try {
    return await _pr88PhasePriorEnsureRuntimeTab(conversationId);
  } finally {
    const durationMs = _pr88PhaseDurationMs(startedAt);
    context.runtimeTabResolveCallCount += 1;
    context.runtimeTabResolveTotalMs += durationMs;
    context.runtimeTabResolveMaxMs = Math.max(
      context.runtimeTabResolveMaxMs,
      durationMs
    );
    if (context.runtimeTabFirstResolveMs === null) {
      context.runtimeTabFirstResolveMs = durationMs;
    }
  }
};

executeOfficialPageTurn = async function _executeOfficialPageTurnWithPhaseTiming(args) {
  const context = _pr88PhaseTimingContext;
  if (context === null) {
    return _pr88PhasePriorExecuteOfficialPageTurn(args);
  }

  const pageStartedAt = performance.now();
  let conversationRequestId = null;
  let delegatedAt = null;
  let networkCompleteAt = null;

  const observer = (source, method, params) => {
    try {
      if (source?.tabId !== args?.tabId) return;
      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (
          conversationRequestId === null &&
          isConversationWrite(request?.url || "", request?.method || "")
        ) {
          conversationRequestId = params.requestId;
          delegatedAt = performance.now();
        }
        return;
      }
      if (
        conversationRequestId !== null &&
        params?.requestId === conversationRequestId &&
        method === "Network.loadingFinished"
      ) {
        networkCompleteAt = performance.now();
      }
    } catch {
      // Timing observation must never perturb the proven product write path.
    }
  };

  let listenerInstalled = false;
  try {
    chrome.debugger.onEvent.addListener(observer);
    listenerInstalled = true;
  } catch {
    listenerInstalled = false;
  }

  try {
    return await _pr88PhasePriorExecuteOfficialPageTurn(args);
  } finally {
    const nativeCompleteAt = performance.now();
    if (listenerInstalled) {
      try {
        chrome.debugger.onEvent.removeListener(observer);
      } catch {
        // Observability cleanup only.
      }
    }

    context.pageTurnElapsedMs = _pr88PhaseDurationMs(
      pageStartedAt,
      nativeCompleteAt
    );
    context.tabReadyToWriteDelegatedMs = delegatedAt === null
      ? null
      : _pr88PhaseDurationMs(pageStartedAt, delegatedAt);
    context.writeDelegatedToNetworkCompleteMs = (
      delegatedAt === null || networkCompleteAt === null
    )
      ? null
      : _pr88PhaseDurationMs(delegatedAt, networkCompleteAt);
    context.networkCompleteToNativeCompleteMs = networkCompleteAt === null
      ? null
      : _pr88PhaseDurationMs(networkCompleteAt, nativeCompleteAt);
    context.writeDelegatedToNativeCompleteMs = delegatedAt === null
      ? null
      : _pr88PhaseDurationMs(delegatedAt, nativeCompleteAt);
  }
};

async function _pr88PhaseTimingRecord() {
  try {
    const stored = await chrome.storage.local.get(PR88_PHASE_TIMING_STORAGE_KEY);
    const value = stored?.[PR88_PHASE_TIMING_STORAGE_KEY];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

async function _pr88CharacterizePhaseTiming(message) {
  if (_pr88PhaseTimingQueryConflict(message)) {
    throw new Error("PR8_8_PHASE_TIMING_QUERY_FLAG_CONFLICT");
  }
  const expectedLeaseId = _pr88PhaseLeaseId(
    message?.expectedBrowserAuthorityLeaseId
  );
  if (expectedLeaseId === null) {
    throw new Error("PR8_8_PHASE_TIMING_EXPECTED_LEASE_REQUIRED");
  }

  const record = await _pr88PhaseTimingRecord();
  if (record === null) {
    throw new Error("PR8_8_PHASE_TIMING_RECORD_NOT_AVAILABLE");
  }
  if (_pr88PhaseLeaseId(record.phaseTimingLeaseId) !== expectedLeaseId) {
    throw new Error("PR8_8_PHASE_TIMING_RECORD_LEASE_MISMATCH");
  }

  return {
    probeContext: "browser_authority_phase_timing",
    readOnly: true,
    phaseTimingSupported: true,
    ...record
  };
}

executeNativeTurn = async function _executeNativeTurnWithPhaseTiming(message) {
  if (message?.characterizeBrowserAuthorityPhaseTimingSupport === true) {
    if (_pr88PhaseTimingQueryConflict(message)) {
      throw new Error("PR8_8_PHASE_TIMING_SUPPORT_FLAG_CONFLICT");
    }
    return {
      probeContext: "browser_authority_phase_timing_support",
      readOnly: true,
      phaseTimingSupported: true,
      phaseTimingSchemaVersion: PR88_PHASE_TIMING_SCHEMA_VERSION
    };
  }

  if (message?.characterizeBrowserAuthorityPhaseTiming === true) {
    return _pr88CharacterizePhaseTiming(message);
  }

  const leaseId = _pr88PhaseLeaseId(message?.browserAuthorityLeaseId);
  const ordinaryProductWrite = (
    typeof message?.text === "string" &&
    Boolean(message.text.trim()) &&
    leaseId !== null
  );
  if (!ordinaryProductWrite) {
    return _pr88PhasePriorExecuteNativeTurn(message);
  }

  const nativeStartedAt = performance.now();
  const context = {
    runtimeTabResolveCallCount: 0,
    runtimeTabFirstResolveMs: null,
    runtimeTabResolveTotalMs: 0,
    runtimeTabResolveMaxMs: 0,
    pageTurnElapsedMs: null,
    tabReadyToWriteDelegatedMs: null,
    writeDelegatedToNetworkCompleteMs: null,
    networkCompleteToNativeCompleteMs: null,
    writeDelegatedToNativeCompleteMs: null
  };
  _pr88PhaseTimingContext = context;

  try {
    const result = await _pr88PhasePriorExecuteNativeTurn(message);
    const nativeTurnElapsedMs = _pr88PhaseDurationMs(nativeStartedAt);
    const runtimeReloaded = result?.runtimeReloaded === true;
    const runtimeReloadMs = runtimeReloaded
      ? _pr88PhaseSafeInt(result?.runtimeReloadMs)
      : null;

    const required = [
      context.runtimeTabFirstResolveMs,
      context.pageTurnElapsedMs,
      context.tabReadyToWriteDelegatedMs,
      context.writeDelegatedToNetworkCompleteMs,
      context.networkCompleteToNativeCompleteMs,
      context.writeDelegatedToNativeCompleteMs
    ];
    const complete = (
      context.runtimeTabResolveCallCount >= 1 &&
      required.every((value) => Number.isInteger(value))
    );

    if (complete) {
      const accountedMs = (
        context.runtimeTabResolveTotalMs +
        context.pageTurnElapsedMs +
        (runtimeReloadMs || 0)
      );
      const record = {
        phaseTimingLeaseId: leaseId,
        phaseTimingSchemaVersion: PR88_PHASE_TIMING_SCHEMA_VERSION,
        runtimeTabResolveCallCount: context.runtimeTabResolveCallCount,
        runtimeTabFirstResolveMs: context.runtimeTabFirstResolveMs,
        runtimeTabResolveTotalMs: context.runtimeTabResolveTotalMs,
        runtimeTabResolveMaxMs: context.runtimeTabResolveMaxMs,
        pageTurnElapsedMs: context.pageTurnElapsedMs,
        tabReadyToWriteDelegatedMs: context.tabReadyToWriteDelegatedMs,
        writeDelegatedToNetworkCompleteMs:
          context.writeDelegatedToNetworkCompleteMs,
        networkCompleteToNativeCompleteMs:
          context.networkCompleteToNativeCompleteMs,
        writeDelegatedToNativeCompleteMs:
          context.writeDelegatedToNativeCompleteMs,
        nativeTurnElapsedMs,
        runtimeReloaded,
        runtimeReloadMs,
        otherNativeOverheadMs: nativeTurnElapsedMs - accountedMs
      };

      // Failure to persist optional observability must not change a successful
      // product write outcome. The live gate will fail later, read-only, if the
      // timing record is unavailable.
      try {
        await chrome.storage.local.set({
          [PR88_PHASE_TIMING_STORAGE_KEY]: record
        });
      } catch {
        // Deliberately ignored: observability must not become write semantics.
      }
    }

    return result;
  } finally {
    _pr88PhaseTimingContext = null;
  }
};

/* END legacy source: service_worker_phase_timing_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_mode_pr8_8.js */
// PR8.8 Instant-mode observability and no-reasoning route characterization.
//
// This layer never selects a model and never changes ChatGPT settings. A
// read-only preflight may open the exact durable conversation in the dedicated
// background runtime tab, inspect the composer-local selected model control,
// and close that tab again before any product write. Ordinary product writes
// use the already-proven page-owned route. During those writes we retain only
// bounded, normalized model/reasoning metadata derived browser-locally from
// the conversation request/response. Prompt text, assistant text, raw DOM, raw
// request bodies, raw SSE, cookies, and auth material never leave this worker.

const PR88_INSTANT_MODE_SCHEMA_VERSION = 1;
const PR88_INSTANT_MODE_STORAGE_KEY = "browserAuthorityLastInstantModeV1";
const PR88_INSTANT_PROBE_TIMEOUT_MS = 15_000;
const PR88_INSTANT_MODE_SNAPSHOT_POLL_MS = 200;

const _pr88InstantPriorExecuteNativeTurn = executeNativeTurn;
const _pr88InstantPriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr88InstantPriorLocateAndFocusComposer = locateAndFocusComposer;
const _pr88InstantPriorExtractSafeStreamMetadata = extractSafeStreamMetadata;

let _pr88InstantContext = null;

function _pr88InstantLeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

function _pr88InstantConversationId(value) {
  const conversationId = typeof value === "string" ? value.trim() : "";
  if (
    !conversationId ||
    conversationId.includes("/") ||
    conversationId.includes("?") ||
    conversationId.includes("#")
  ) {
    return null;
  }
  return conversationId;
}

function _pr88InstantNormalize(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s_\-]+/g, " ")
    : "";
}

function _pr88InstantSafeIdentifier(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 96) return null;
  if (!/^[A-Za-z0-9._:+\-/ ]+$/.test(text)) return null;
  return text;
}

function _pr88InstantClassifyMode(value) {
  const text = _pr88InstantNormalize(value);
  if (!text) return null;
  if (
    text === "instant" ||
    text === "мгновенно" ||
    text.includes(" instant") ||
    text.startsWith("instant ") ||
    text.includes("-instant") ||
    text.includes("_instant")
  ) return "INSTANT";
  if (
    text === "medium" ||
    text === "средний" ||
    text.includes("thinking standard") ||
    text.includes("reasoning medium")
  ) return "MEDIUM";
  if (
    text === "extra high" ||
    text === "очень высокий" ||
    text.includes("thinking heavy") ||
    text.includes("reasoning extra high")
  ) return "EXTRA_HIGH";
  if (
    text === "high" ||
    text === "высокий" ||
    text.includes("thinking extended") ||
    text.includes("reasoning high")
  ) return "HIGH";
  if (
    text === "pro standard" ||
    text.includes("pro-standard") ||
    text.includes("pro_standard")
  ) return "PRO_STANDARD";
  if (
    text === "pro extended" ||
    text.includes("pro-extended") ||
    text.includes("pro_extended")
  ) return "PRO_EXTENDED";
  if (text === "thinking" || text.includes(" thinking")) return "REASONING_OTHER";
  if (text === "pro" || text.startsWith("pro ")) return "PRO_OTHER";
  return null;
}

function _pr88InstantReasoningState(value) {
  if (value === false) return "OFF";
  if (value === true) return "ON";
  const text = _pr88InstantNormalize(String(value ?? ""));
  if (!text) return null;
  if (["none", "off", "disabled", "false", "0", "instant"].includes(text)) {
    return "OFF";
  }
  if (["medium", "standard", "thinking", "on", "enabled", "true", "1"].includes(text)) {
    return "ON";
  }
  if (["high", "extended", "extra high", "heavy", "pro", "pro standard", "pro extended"].includes(text)) {
    return "ON";
  }
  return null;
}

function _pr88InstantNewHintAccumulator() {
  return {
    modelIdentifiers: new Set(),
    modelModes: new Set(),
    reasoningStates: new Set(),
    modelHintKeys: new Set(),
    reasoningHintKeys: new Set(),
    visitedNodes: 0
  };
}

function _pr88InstantCollectHints(value, out, depth = 0) {
  if (!value || typeof value !== "object" || depth > 8 || out.visitedNodes > 600) return;
  out.visitedNodes += 1;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) {
      _pr88InstantCollectHints(item, out, depth + 1);
    }
    return;
  }

  for (const [rawKey, child] of Object.entries(value).slice(0, 160)) {
    const key = String(rawKey || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const modelKey = [
      "model", "modelslug", "modelid", "selectedmodel", "requestedmodel",
      "modelmode", "selectedmodelmode", "requestedmodelmode"
    ].includes(key);
    const reasoningKey = [
      "reasoningeffort", "reasoningmode", "reasoninglevel", "reasoning",
      "thinkingeffort", "thinkingmode", "thinkinglevel", "thinking"
    ].includes(key);

    if (modelKey && ["string", "number", "boolean"].includes(typeof child)) {
      out.modelHintKeys.add(rawKey);
      const safe = _pr88InstantSafeIdentifier(String(child));
      if (safe !== null) out.modelIdentifiers.add(safe);
      const mode = _pr88InstantClassifyMode(String(child));
      if (mode !== null) out.modelModes.add(mode);
    }
    if (reasoningKey && ["string", "number", "boolean"].includes(typeof child)) {
      out.reasoningHintKeys.add(rawKey);
      const state = _pr88InstantReasoningState(child);
      if (state !== null) out.reasoningStates.add(state);
      const mode = _pr88InstantClassifyMode(String(child));
      if (mode !== null) out.modelModes.add(mode);
    }

    const skipNestedContent = [
      "content", "parts", "text", "messages", "attachments", "files"
    ].includes(key);
    if (child && typeof child === "object" && !skipNestedContent) {
      _pr88InstantCollectHints(child, out, depth + 1);
    }
  }
}

function _pr88InstantParseRequestPostData(postData) {
  const out = _pr88InstantNewHintAccumulator();
  if (typeof postData !== "string" || !postData.trim()) return out;
  try {
    const payload = JSON.parse(postData);
    _pr88InstantCollectHints(payload, out);
  } catch {
    // Request metadata is optional observability only.
  }
  return out;
}

function _pr88InstantParseSseHints(body, base64Encoded) {
  const out = _pr88InstantNewHintAccumulator();
  if (base64Encoded || typeof body !== "string") return out;
  let parsedLines = 0;
  for (const rawLine of body.split(/\r?\n/)) {
    if (parsedLines >= 400) break;
    if (!rawLine.startsWith("data:")) continue;
    const payloadText = rawLine.slice(5).trim();
    if (!payloadText.startsWith("{") || payloadText.length > 1_000_000) continue;
    try {
      _pr88InstantCollectHints(JSON.parse(payloadText), out);
      parsedLines += 1;
    } catch {
      // Ignore partial or non-JSON SSE lines.
    }
  }
  return out;
}

function _pr88InstantMergeHints(target, source) {
  for (const value of source.modelIdentifiers) target.modelIdentifiers.add(value);
  for (const value of source.modelModes) target.modelModes.add(value);
  for (const value of source.reasoningStates) target.reasoningStates.add(value);
  for (const value of source.modelHintKeys) target.modelHintKeys.add(value);
  for (const value of source.reasoningHintKeys) target.reasoningHintKeys.add(value);
  target.visitedNodes += source.visitedNodes;
}

function _pr88InstantHintsRecord(hints) {
  return {
    modelIdentifiers: Array.from(hints.modelIdentifiers).sort().slice(0, 12),
    modelModes: Array.from(hints.modelModes).sort(),
    reasoningStates: Array.from(hints.reasoningStates).sort(),
    modelHintKeys: Array.from(hints.modelHintKeys).sort().slice(0, 20),
    reasoningHintKeys: Array.from(hints.reasoningHintKeys).sort().slice(0, 20)
  };
}

function _pr88InstantDeriveNetworkRoute(requestHints, responseHints) {
  const merged = _pr88InstantNewHintAccumulator();
  _pr88InstantMergeHints(merged, requestHints);
  _pr88InstantMergeHints(merged, responseHints);
  const modes = merged.modelModes;
  const reasoning = merged.reasoningStates;
  const reasoningModeObserved = Array.from(modes).some((mode) =>
    ["MEDIUM", "HIGH", "EXTRA_HIGH", "PRO_STANDARD", "PRO_EXTENDED", "REASONING_OTHER", "PRO_OTHER"].includes(mode)
  );
  const reasoningPositive = reasoning.has("ON") || reasoningModeObserved;
  const instantPositive = modes.has("INSTANT");
  const reasoningOff = reasoning.has("OFF");

  let status = "INCONCLUSIVE";
  if (reasoningPositive) status = "REASONING_ROUTE_OBSERVED";
  else if (instantPositive && !reasoningPositive) status = "INSTANT_MODEL_ROUTE_OBSERVED";
  else if (reasoningOff && !reasoningPositive) status = "NO_REASONING_EXPLICITLY_OBSERVED";

  return {
    status,
    instantModelRouteObserved: instantPositive,
    reasoningRouteObserved: reasoningPositive,
    reasoningOffObserved: reasoningOff,
    noReasoningRouteProven: (
      status === "INSTANT_MODEL_ROUTE_OBSERVED" ||
      status === "NO_REASONING_EXPLICITLY_OBSERVED"
    )
  };
}

function _pr88InstantModeSnapshotExpression() {
  return `(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    const classify = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (text === 'instant' || text === '即时' || text === 'мгновенно') return 'INSTANT';
      if (text === 'medium' || text === '中' || text === 'средний' || text === 'thinking standard') return 'MEDIUM';
      if (text === 'extra high' || text === '极高' || text === 'очень высокий' || text === 'thinking heavy') return 'EXTRA_HIGH';
      if (text === 'high' || text === '高' || text === 'высокий' || text === 'thinking extended') return 'HIGH';
      if (text === 'pro standard') return 'PRO_STANDARD';
      if (text === 'pro extended') return 'PRO_EXTENDED';
      if (text === 'thinking') return 'REASONING_OTHER';
      if (text === 'pro') return 'PRO_OTHER';
      return null;
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const selectors = [
      '#prompt-textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'textarea[placeholder]'
    ];
    const composer = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    if (!composer || !visible(composer)) {
      return { composerReady: false, selectedMode: null, selectedModeProven: false, candidateCount: 0, proofKind: 'composer_missing' };
    }
    const composerRect = composer.getBoundingClientRect();
    const controls = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
    const candidates = [];
    for (const control of controls) {
      const fields = [control.innerText, control.getAttribute('aria-label'), control.getAttribute('title')];
      const modes = Array.from(new Set(fields.map(classify).filter(Boolean)));
      if (modes.length !== 1) continue;
      const rect = control.getBoundingClientRect();
      const dx = Math.max(0, Math.max(composerRect.left - rect.right, rect.left - composerRect.right));
      const dy = Math.max(0, Math.max(composerRect.top - rect.bottom, rect.top - composerRect.bottom));
      const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
      if (distance > 800) continue;
      candidates.push({ mode: modes[0], distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    if (!candidates.length) {
      return { composerReady: true, selectedMode: null, selectedModeProven: false, candidateCount: 0, proofKind: 'no_mode_control' };
    }
    const nearest = candidates[0];
    const equallyNear = candidates.filter((candidate) => candidate.distance <= nearest.distance + 16);
    const uniqueModes = Array.from(new Set(equallyNear.map((candidate) => candidate.mode)));
    const proven = uniqueModes.length === 1;
    return {
      composerReady: true,
      selectedMode: proven ? uniqueModes[0] : null,
      selectedModeProven: proven,
      candidateCount: candidates.length,
      nearestDistancePx: nearest.distance,
      proofKind: proven ? 'nearest_composer_mode_control' : 'ambiguous_mode_controls'
    };
  })()`;
}

async function _pr88InstantSelectedModeSnapshot(debuggee) {
  try {
    const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: _pr88InstantModeSnapshotExpression(),
      returnByValue: true,
      awaitPromise: true
    });
    const value = result?.result?.value;
    if (value && typeof value === "object") {
      return {
        composerReady: value.composerReady === true,
        selectedMode: typeof value.selectedMode === "string" ? value.selectedMode : null,
        selectedModeProven: value.selectedModeProven === true,
        candidateCount: Number.isInteger(value.candidateCount) ? value.candidateCount : 0,
        nearestDistancePx: Number.isFinite(value.nearestDistancePx) ? Math.max(0, Math.round(value.nearestDistancePx)) : null,
        proofKind: typeof value.proofKind === "string" ? value.proofKind : "unknown"
      };
    }
  } catch {
    // Read-only UI evidence is optional until the runner validates it.
  }
  return {
    composerReady: false,
    selectedMode: null,
    selectedModeProven: false,
    candidateCount: 0,
    nearestDistancePx: null,
    proofKind: "probe_failed"
  };
}

async function _pr88InstantWaitForSelectedMode(debuggee, timeoutMs) {
  const startedAt = performance.now();
  let last = null;
  while (performance.now() - startedAt < timeoutMs) {
    last = await _pr88InstantSelectedModeSnapshot(debuggee);
    if (last.selectedModeProven === true) return last;
    await sleep(PR88_INSTANT_MODE_SNAPSHOT_POLL_MS);
  }
  return last || await _pr88InstantSelectedModeSnapshot(debuggee);
}

locateAndFocusComposer = async function _locateAndFocusComposerWithInstantObservation(debuggee) {
  const context = _pr88InstantContext;
  if (context !== null && context.preWritePicker === null) {
    context.preWritePicker = await _pr88InstantSelectedModeSnapshot(debuggee);
  }
  return _pr88InstantPriorLocateAndFocusComposer(debuggee);
};

extractSafeStreamMetadata = function _extractSafeStreamMetadataWithInstantHints(body, base64Encoded) {
  const context = _pr88InstantContext;
  if (context !== null) {
    try {
      _pr88InstantMergeHints(
        context.responseHints,
        _pr88InstantParseSseHints(body, base64Encoded)
      );
    } catch {
      // Never perturb the existing safe stream metadata path.
    }
  }
  return _pr88InstantPriorExtractSafeStreamMetadata(body, base64Encoded);
};

executeOfficialPageTurn = async function _executeOfficialPageTurnWithInstantObservation(args) {
  const context = _pr88InstantContext;
  if (context === null) {
    return _pr88InstantPriorExecuteOfficialPageTurn(args);
  }

  let listenerInstalled = false;
  const observer = (source, method, params) => {
    try {
      if (source?.tabId !== args?.tabId || method !== "Network.requestWillBeSent") return;
      const request = params?.request;
      if (!isConversationWrite(request?.url || "", request?.method || "")) return;
      if (context.requestObserved) return;
      context.requestObserved = true;
      _pr88InstantMergeHints(
        context.requestHints,
        _pr88InstantParseRequestPostData(request?.postData)
      );
    } catch {
      // Observability cannot perturb the product write.
    }
  };
  try {
    chrome.debugger.onEvent.addListener(observer);
    listenerInstalled = true;
  } catch {
    listenerInstalled = false;
  }

  try {
    return await _pr88InstantPriorExecuteOfficialPageTurn(args);
  } finally {
    if (listenerInstalled) {
      try { chrome.debugger.onEvent.removeListener(observer); } catch {}
    }
  }
};

function _pr88InstantQueryConflict(message) {
  return (
    message?.text != null ||
    message?.canonicalCompleted === true ||
    message?.browserAuthorityLeaseId != null ||
    message?.probeTemporaryMode === true ||
    message?.characterizeTemporaryTurn === true ||
    message?.probeTemporaryHistoryPresence === true ||
    message?.characterizeManualTemporaryGroundTruth === true ||
    message?.probeTemporaryRouteReopen === true
  );
}

async function _pr88InstantStoredRecord() {
  try {
    const stored = await chrome.storage.local.get(PR88_INSTANT_MODE_STORAGE_KEY);
    const value = stored?.[PR88_INSTANT_MODE_STORAGE_KEY];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

async function _pr88InstantCharacterizeRecord(message) {
  if (_pr88InstantQueryConflict(message) || message?.conversationId != null) {
    throw new Error("PR8_8_INSTANT_MODE_RECORD_FLAG_CONFLICT");
  }
  const expectedLeaseId = _pr88InstantLeaseId(message?.expectedBrowserAuthorityLeaseId);
  if (expectedLeaseId === null) {
    throw new Error("PR8_8_INSTANT_MODE_EXPECTED_LEASE_REQUIRED");
  }
  const record = await _pr88InstantStoredRecord();
  if (record === null) throw new Error("PR8_8_INSTANT_MODE_RECORD_NOT_AVAILABLE");
  if (_pr88InstantLeaseId(record.instantModeLeaseId) !== expectedLeaseId) {
    throw new Error("PR8_8_INSTANT_MODE_RECORD_LEASE_MISMATCH");
  }
  return {
    probeContext: "instant_mode_route_record",
    readOnly: true,
    instantModeSupported: true,
    ...record
  };
}

async function _pr88InstantCharacterizeSelectedMode(message) {
  if (_pr88InstantQueryConflict(message)) {
    throw new Error("PR8_8_INSTANT_SELECTED_MODE_FLAG_CONFLICT");
  }
  const conversationId = _pr88InstantConversationId(message?.conversationId);
  if (conversationId === null) {
    throw new Error("PR8_8_INSTANT_SELECTED_MODE_CONVERSATION_REQUIRED");
  }

  const initialRuntimeTabId = await storedRuntimeTabId();
  if (initialRuntimeTabId !== null) {
    throw new Error("PR8_8_INSTANT_SELECTED_MODE_REQUIRES_CLOSED_RUNTIME_TAB");
  }

  const activatedTabIds = new Set();
  const onActivated = (activeInfo) => {
    if (Number.isInteger(activeInfo?.tabId)) activatedTabIds.add(activeInfo.tabId);
  };
  chrome.tabs.onActivated.addListener(onActivated);

  let tabId = null;
  let debuggee = null;
  let attached = false;
  let networkListener = null;
  let conversationWriteCount = 0;
  let snapshot = null;
  let tabWasActive = null;
  let tabActiveAfter = null;
  let probeTabClosed = false;
  let debuggerAttachedAfter = null;

  try {
    const tab = await ensureRuntimeTab(conversationId);
    tabId = Number.isInteger(tab?.id) ? tab.id : null;
    if (tabId === null) throw new Error("PR8_8_INSTANT_SELECTED_MODE_RUNTIME_TAB_MISSING");
    tabWasActive = Boolean(tab?.active);
    debuggee = { tabId };
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Runtime.enable");
    await chrome.debugger.sendCommand(debuggee, "Network.enable");

    networkListener = (source, method, params) => {
      if (source?.tabId !== tabId || method !== "Network.requestWillBeSent") return;
      const request = params?.request;
      if (isConversationWrite(request?.url || "", request?.method || "")) {
        conversationWriteCount += 1;
      }
    };
    chrome.debugger.onEvent.addListener(networkListener);

    await waitForComposerReady(debuggee, PR88_INSTANT_PROBE_TIMEOUT_MS);
    snapshot = await _pr88InstantWaitForSelectedMode(
      debuggee,
      Math.min(PR88_INSTANT_PROBE_TIMEOUT_MS, Number(message?.timeoutMs) || PR88_INSTANT_PROBE_TIMEOUT_MS)
    );
    const finalTab = await chrome.tabs.get(tabId);
    tabActiveAfter = Boolean(finalTab?.active);
    if (conversationIdFromUrl(finalTab?.url || "") !== conversationId) {
      throw new Error("PR8_8_INSTANT_SELECTED_MODE_CONVERSATION_CHANGED");
    }
    if (conversationWriteCount !== 0) {
      throw new Error(`PR8_8_INSTANT_SELECTED_MODE_UNEXPECTED_WRITE:${conversationWriteCount}`);
    }
  } finally {
    if (networkListener) {
      try { chrome.debugger.onEvent.removeListener(networkListener); } catch {}
    }
    if (attached && debuggee) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
    if (debuggee) {
      try {
        const targets = await chrome.debugger.getTargets();
        debuggerAttachedAfter = Boolean(targets.find((target) => target.tabId === tabId)?.attached);
      } catch {
        debuggerAttachedAfter = null;
      }
    }
    if (Number.isInteger(tabId)) {
      try {
        await chrome.tabs.remove(tabId);
        probeTabClosed = true;
      } catch {
        probeTabClosed = false;
      }
    }
    chrome.tabs.onActivated.removeListener(onActivated);
  }

  let runtimeTabIdAfter = await storedRuntimeTabId();
  const settleStartedAt = performance.now();
  while (runtimeTabIdAfter !== null && performance.now() - settleStartedAt < 2000) {
    await sleep(50);
    runtimeTabIdAfter = await storedRuntimeTabId();
  }

  return {
    probeContext: "instant_selected_mode_exact_conversation_preflight",
    readOnly: true,
    instantModeSupported: true,
    instantModeSchemaVersion: PR88_INSTANT_MODE_SCHEMA_VERSION,
    conversationId,
    selectedMode: snapshot?.selectedMode || null,
    selectedModeProven: snapshot?.selectedModeProven === true,
    candidateCount: Number.isInteger(snapshot?.candidateCount) ? snapshot.candidateCount : 0,
    nearestDistancePx: Number.isFinite(snapshot?.nearestDistancePx) ? snapshot.nearestDistancePx : null,
    proofKind: snapshot?.proofKind || "unknown",
    conversationWriteCount,
    runtimeTabIdDuringProbe: tabId,
    runtimeTabIdAfter,
    probeTabClosed,
    tabWasActive,
    tabActiveAfter,
    tabActivatedDuringProbe: Number.isInteger(tabId) && activatedTabIds.has(tabId),
    foregroundActivationObserved: Boolean(
      tabWasActive === true ||
      tabActiveAfter === true ||
      (Number.isInteger(tabId) && activatedTabIds.has(tabId))
    ),
    debuggerAttachedAfter
  };
}

executeNativeTurn = async function _executeNativeTurnWithInstantModeObservation(message) {
  if (message?.characterizeInstantModeSupport === true) {
    if (_pr88InstantQueryConflict(message) || message?.conversationId != null) {
      throw new Error("PR8_8_INSTANT_MODE_SUPPORT_FLAG_CONFLICT");
    }
    return {
      probeContext: "instant_mode_support",
      readOnly: true,
      instantModeSupported: true,
      instantModeSchemaVersion: PR88_INSTANT_MODE_SCHEMA_VERSION,
      selectedModeProbeSupported: true,
      requestRouteObservationSupported: true,
      responseRouteObservationSupported: true
    };
  }

  if (message?.characterizeInstantSelectedMode === true) {
    return _pr88InstantCharacterizeSelectedMode(message);
  }

  if (message?.characterizeInstantModeRecord === true) {
    return _pr88InstantCharacterizeRecord(message);
  }

  const leaseId = _pr88InstantLeaseId(message?.browserAuthorityLeaseId);
  const requireInstant = message?.requiredModelMode === "INSTANT";
  const ordinaryProductWrite = (
    typeof message?.text === "string" &&
    Boolean(message.text.trim()) &&
    leaseId !== null
  );
  if (!ordinaryProductWrite || !requireInstant) {
    return _pr88InstantPriorExecuteNativeTurn(message);
  }

  const context = {
    leaseId,
    preWritePicker: null,
    requestObserved: false,
    requestHints: _pr88InstantNewHintAccumulator(),
    responseHints: _pr88InstantNewHintAccumulator()
  };
  _pr88InstantContext = context;

  try {
    const result = await _pr88InstantPriorExecuteNativeTurn(message);
    const networkRoute = _pr88InstantDeriveNetworkRoute(
      context.requestHints,
      context.responseHints
    );
    const preWritePicker = context.preWritePicker || {
      selectedMode: null,
      selectedModeProven: false,
      candidateCount: 0,
      nearestDistancePx: null,
      proofKind: "not_observed"
    };
    const record = {
      instantModeLeaseId: leaseId,
      instantModeSchemaVersion: PR88_INSTANT_MODE_SCHEMA_VERSION,
      requestedModelMode: "INSTANT",
      requireNoReasoningRoute: message?.requireNoReasoningRoute === true,
      selectedModeBeforeWrite: preWritePicker.selectedMode || null,
      selectedModeBeforeWriteProven: preWritePicker.selectedModeProven === true,
      selectedModeCandidateCount: Number.isInteger(preWritePicker.candidateCount) ? preWritePicker.candidateCount : 0,
      selectedModeNearestDistancePx: Number.isFinite(preWritePicker.nearestDistancePx) ? preWritePicker.nearestDistancePx : null,
      selectedModeProofKind: preWritePicker.proofKind || "unknown",
      conversationRequestObserved: context.requestObserved === true,
      requestEvidence: _pr88InstantHintsRecord(context.requestHints),
      responseEvidence: _pr88InstantHintsRecord(context.responseHints),
      networkRouteStatus: networkRoute.status,
      instantModelRouteObserved: networkRoute.instantModelRouteObserved,
      reasoningRouteObserved: networkRoute.reasoningRouteObserved,
      reasoningOffObserved: networkRoute.reasoningOffObserved,
      networkNoReasoningRouteProven: networkRoute.noReasoningRouteProven
    };

    try {
      await chrome.storage.local.set({ [PR88_INSTANT_MODE_STORAGE_KEY]: record });
    } catch {
      // Optional observability must not change successful product semantics.
    }

    return {
      ...result,
      instantModeSchemaVersion: PR88_INSTANT_MODE_SCHEMA_VERSION,
      requestedModelMode: "INSTANT",
      selectedModeBeforeWrite: record.selectedModeBeforeWrite,
      selectedModeBeforeWriteProven: record.selectedModeBeforeWriteProven,
      networkRouteStatus: record.networkRouteStatus,
      reasoningRouteObserved: record.reasoningRouteObserved,
      networkNoReasoningRouteProven: record.networkNoReasoningRouteProven
    };
  } finally {
    _pr88InstantContext = null;
  }
};

/* END legacy source: service_worker_instant_mode_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_unified_route_semantics_pr8_8.js */
// PR8.8 unified GPT-5.6 route semantics and model-slug false-reasoning dealiasing.
//
// Model identity and reasoning state are separate evidence dimensions. In current
// ChatGPT, model identifiers such as "gpt-5-6-thinking" may appear in response
// metadata while the independently proven composer effort remains INSTANT.
// Therefore a model/model_slug value containing "thinking" is not, by itself,
// evidence that the product routed the turn through Medium/High reasoning.
//
// Positive reasoning-route evidence remains fail-closed: an explicit reasoning/
// thinking key that resolves ON (or is present with no explicit OFF state) still
// classifies the route as reasoning. Raw prompt/response content is unchanged and
// remains outside this bounded metadata layer.

const PR88_UNIFIED_GPT56_ROUTE_STATUS =
  "UNIFIED_GPT_5_6_ROUTE_WITHOUT_EXPLICIT_REASONING";

function _pr88UnifiedGpt56Identifier(value) {
  if (typeof value !== "string") return false;
  const text = value.trim().toLowerCase();
  return /^gpt-5-6(?:$|[-_.:/])/.test(text);
}

function _pr88UnifiedModelSlugReasoningAlias(value) {
  if (!_pr88UnifiedGpt56Identifier(value)) return false;
  const text = value.trim().toLowerCase();
  return text.includes("thinking") || text.includes("reasoning");
}

_pr88InstantDeriveNetworkRoute =
  function _pr88InstantDeriveNetworkRouteWithUnifiedGpt56Semantics(
    requestHints,
    responseHints
  ) {
    const merged = _pr88InstantNewHintAccumulator();
    _pr88InstantMergeHints(merged, requestHints);
    _pr88InstantMergeHints(merged, responseHints);

    const reasoning = merged.reasoningStates;
    const explicitReasoningMetadataObserved = merged.reasoningHintKeys.size > 0;
    const reasoningOff = reasoning.has("OFF");

    // A model slug is model identity evidence, not reasoning-state evidence.
    // If an explicit reasoning/thinking key exists but is not explicitly OFF,
    // stay conservative and treat it as a positive reasoning-route observation.
    const explicitReasoningPositive =
      reasoning.has("ON") ||
      (explicitReasoningMetadataObserved && !reasoningOff);

    const instantPositive = merged.modelModes.has("INSTANT");
    const identifiers = Array.from(merged.modelIdentifiers);
    const unifiedGpt56Observed = identifiers.some(_pr88UnifiedGpt56Identifier);
    const modelSlugReasoningAliasObserved =
      identifiers.some(_pr88UnifiedModelSlugReasoningAlias);

    let status = "INCONCLUSIVE";
    if (explicitReasoningPositive) {
      status = "REASONING_ROUTE_OBSERVED";
    } else if (instantPositive) {
      status = "INSTANT_MODEL_ROUTE_OBSERVED";
    } else if (reasoningOff) {
      status = "NO_REASONING_EXPLICITLY_OBSERVED";
    } else if (unifiedGpt56Observed) {
      status = PR88_UNIFIED_GPT56_ROUTE_STATUS;
    }

    return {
      status,
      instantModelRouteObserved: instantPositive,
      reasoningRouteObserved: explicitReasoningPositive,
      reasoningOffObserved: reasoningOff,
      // This legacy field stays strict: a unified GPT-5.6 identity without
      // explicit reasoning metadata is compatible with INSTANT, but model
      // identity alone does not prove "no reasoning" at the network layer.
      noReasoningRouteProven: (
        status === "INSTANT_MODEL_ROUTE_OBSERVED" ||
        status === "NO_REASONING_EXPLICITLY_OBSERVED"
      ),
      unifiedGpt56RouteObserved: unifiedGpt56Observed,
      modelSlugReasoningAliasObserved
    };
  };

/* END legacy source: service_worker_instant_unified_route_semantics_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_selection_repair_pr8_8.js */
// PR8.8 fresh-tab Instant selection repair and pre-submit materialization characterization.
//
// Loaded after service_worker_instant_mode_pr8_8.js and before the existing
// provisioning-observability wrapper captures executeNativeTurn.
//
// The layer performs one bounded product-UI model-picker action only for leased
// characterization turns that explicitly require INSTANT. The action happens
// after the proven runtime tab exists and before any prompt text is inserted.
// It never changes generic product-runtime defaults or Temporary semantics.
//
// Only bounded selection/network metadata is persisted. No prompt text,
// assistant text, raw DOM, raw request/response payloads, cookies, or auth data
// leave the worker.

const PR88_INSTANT_SELECTION_SCHEMA_VERSION = 1;
const PR88_INSTANT_SELECTION_STORAGE_KEY = "browserAuthorityLastInstantSelectionV1";
const PR88_INSTANT_SELECTION_OPTION_TIMEOUT_MS = 8000;
const PR88_INSTANT_SELECTION_SETTLE_TIMEOUT_MS = 8000;
const PR88_INSTANT_SELECTION_POLL_MS = 100;

const _pr88SelectionPriorExecuteNativeTurn = executeNativeTurn;
const _pr88SelectionPriorLocateAndFocusComposer = locateAndFocusComposer;

let _pr88SelectionContext = null;

function _pr88SelectionLeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

function _pr88SelectionDurationMs(startedAt, endedAt = performance.now()) {
  return Math.max(0, Math.round(endedAt - startedAt));
}

function _pr88SelectionSafeInt(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(Number(value))) : null;
}

function _pr88SelectionQueryConflict(message) {
  return (
    message?.text != null ||
    message?.conversationId != null ||
    message?.canonicalCompleted === true ||
    message?.browserAuthorityLeaseId != null ||
    message?.probeTemporaryMode === true ||
    message?.characterizeTemporaryTurn === true ||
    message?.probeTemporaryHistoryPresence === true ||
    message?.characterizeManualTemporaryGroundTruth === true ||
    message?.probeTemporaryRouteReopen === true
  );
}

function _pr88SelectionPointExpression(kind) {
  return `(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    // THE MODE LABELS ARE LOCALE-DEPENDENT, and this classifier is the one that decides WHERE the
    // mode control is, i.e. it gates the submit. Measured 2026-09-12: this deployment renders the
    // effort control as the Chinese single characters ("高"), so an English+Russian-only table left
    // every candidate unclassified, the function returned picker_missing, and the writer failed
    // with PR8_10_MODEL_PROFILE_PICKER_NOT_PROVEN -- the prompt was never submitted at all
    // (submission_count 0), twice in a row. The sibling classifier in
    // service_worker_instant_mode_pr8_8.js (_pr88InstantModeSnapshotExpression) already carried
    // the Chinese characters and the apostrophe-free variants; this one must agree with it, because
    // two tables that disagree about the same UI are how "the mode is fine" and "the picker is
    // missing" get reported for the same page.
    const classify = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (
        text === 'instant' ||
        text === '即时' ||
        text === 'мгновенно' ||
        text.startsWith('instant ') ||
        text.includes(' instant') ||
        text.startsWith('мгновенно ') ||
        text.includes(' мгновенно')
      ) return 'INSTANT';
      if (text === 'medium' || text === '中' || text === 'средний' || text.includes('thinking standard')) return 'MEDIUM';
      if (text === 'extra high' || text === '极高' || text === 'очень высокий' || text.includes('thinking heavy')) return 'EXTRA_HIGH';
      if (text === 'high' || text === '高' || text === 'высокий' || text.includes('thinking extended')) return 'HIGH';
      if (text === 'pro standard') return 'PRO_STANDARD';
      if (text === 'pro extended') return 'PRO_EXTENDED';
      if (text === 'thinking') return 'REASONING_OTHER';
      if (text === 'pro') return 'PRO_OTHER';
      return null;
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const center = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    };
    const fields = (el) => [
      el.innerText,
      el.getAttribute('aria-label'),
      el.getAttribute('title')
    ];

    if (${JSON.stringify(kind)} === 'picker') {
      const composer = [
        '#prompt-textarea',
        '[contenteditable="true"][data-lexical-editor="true"]',
        'textarea[placeholder]'
      ].map((selector) => document.querySelector(selector)).find(Boolean);
      if (!composer || !visible(composer)) {
        return { found: false, reason: 'composer_missing', candidateCount: 0 };
      }
      const composerRect = composer.getBoundingClientRect();
      const controls = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
      const candidates = [];
      for (const control of controls) {
        const modes = Array.from(new Set(fields(control).map(classify).filter(Boolean)));
        if (modes.length !== 1) continue;
        const rect = control.getBoundingClientRect();
        const dx = Math.max(0, Math.max(composerRect.left - rect.right, rect.left - composerRect.right));
        const dy = Math.max(0, Math.max(composerRect.top - rect.bottom, rect.top - composerRect.bottom));
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 800) continue;
        candidates.push({ element: control, mode: modes[0], distance });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      if (!candidates.length) {
        return { found: false, reason: 'picker_missing', candidateCount: 0 };
      }
      const nearest = candidates[0];
      const point = center(nearest.element);
      return {
        found: true,
        mode: nearest.mode,
        x: point.x,
        y: point.y,
        candidateCount: candidates.length,
        nearestDistancePx: Math.round(nearest.distance)
      };
    }

    const actionables = Array.from(document.querySelectorAll(
      '[role="menuitem"],[role="option"],[role="radio"],button,[role="button"]'
    )).filter(visible);
    const instantCandidates = [];
    for (const element of actionables) {
      const modes = Array.from(new Set(fields(element).map(classify).filter(Boolean)));
      if (modes.length !== 1 || modes[0] !== 'INSTANT') continue;
      const point = center(element);
      instantCandidates.push({ element, x: point.x, y: point.y });
    }
    if (instantCandidates.length !== 1) {
      return {
        found: false,
        reason: instantCandidates.length ? 'instant_option_ambiguous' : 'instant_option_missing',
        candidateCount: instantCandidates.length
      };
    }
    return {
      found: true,
      x: instantCandidates[0].x,
      y: instantCandidates[0].y,
      candidateCount: 1
    };
  })()`;
}

async function _pr88SelectionPoint(debuggee, kind) {
  const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
    expression: _pr88SelectionPointExpression(kind),
    returnByValue: true,
    awaitPromise: true
  });
  const value = result?.result?.value;
  return value && typeof value === "object"
    ? value
    : { found: false, reason: "point_probe_failed", candidateCount: 0 };
}

async function _pr88SelectionRawClick(debuggee, point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    throw new Error("PR8_8_INSTANT_SELECTION_CLICK_POINT_REQUIRED");
  }
  // Intentionally bypass sendCommand(): the proven submit hotfix treats generic
  // mouse release as possible send-button activity. Picker clicks are unrelated
  // product UI and must not enter that fallback ladder.
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y
  });
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1
  });
}

async function _pr88SelectionWaitForInstantOption(debuggee, timeoutMs) {
  const startedAt = performance.now();
  let last = null;
  while (performance.now() - startedAt < timeoutMs) {
    last = await _pr88SelectionPoint(debuggee, "instant_option");
    if (last?.found === true) return last;
    await sleep(PR88_INSTANT_SELECTION_POLL_MS);
  }
  return last || { found: false, reason: "instant_option_timeout", candidateCount: 0 };
}

async function _pr88SelectionWaitForInstantSelected(debuggee, timeoutMs) {
  const startedAt = performance.now();
  let last = null;
  while (performance.now() - startedAt < timeoutMs) {
    last = await _pr88InstantSelectedModeSnapshot(debuggee);
    if (
      last?.selectedModeProven === true &&
      last?.selectedMode === "INSTANT"
    ) {
      return last;
    }
    await sleep(PR88_INSTANT_SELECTION_POLL_MS);
  }
  return last || await _pr88InstantSelectedModeSnapshot(debuggee);
}

function _pr88SelectionNetworkClass(url, method) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "INVALID_URL";
  }
  if (parsed.origin !== CHATGPT_ORIGIN) return "OTHER_ORIGIN";
  if (isConversationWrite(url, method)) return "CONVERSATION_WRITE";
  const normalizedMethod = String(method || "").toUpperCase();
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod);
  if (!mutating) return "CHATGPT_READ";
  const path = parsed.pathname.toLowerCase();
  if (
    path.includes("setting") ||
    path.includes("preference") ||
    path.includes("model") ||
    path.includes("config")
  ) {
    return "CHATGPT_SETTING_LIKE_MUTATION";
  }
  return "CHATGPT_MUTATION_OTHER";
}

function _pr88SelectionInstallNetworkWindow(debuggee, context) {
  const listener = (source, method, params) => {
    if (source?.tabId !== debuggee.tabId || method !== "Network.requestWillBeSent") return;
    const request = params?.request;
    const requestClass = _pr88SelectionNetworkClass(
      request?.url || "",
      request?.method || ""
    );

    if (requestClass === "CONVERSATION_WRITE") {
      context.conversationWriteBoundaryObserved = true;
      if (context.selectionComplete !== true) {
        context.unexpectedConversationWriteBeforeSelectionComplete = true;
        context.conversationWriteCountDuringSelection += 1;
      }
      try { chrome.debugger.onEvent.removeListener(listener); } catch {}
      context.networkListener = null;
      return;
    }

    context.networkRequestCountDuringSelection += 1;
    context.requestClasses.add(requestClass);
    if (requestClass !== "OTHER_ORIGIN" && requestClass !== "INVALID_URL") {
      context.chatgptRequestCountDuringSelection += 1;
    }
    if (
      requestClass === "CHATGPT_SETTING_LIKE_MUTATION" ||
      requestClass === "CHATGPT_MUTATION_OTHER"
    ) {
      context.chatgptMutatingNonConversationRequestCount += 1;
    }
    if (requestClass === "CHATGPT_SETTING_LIKE_MUTATION") {
      context.settingLikeMutationObserved = true;
    }
  };
  chrome.debugger.onEvent.addListener(listener);
  context.networkListener = listener;
}

async function _pr88SelectionEnsureInstant(debuggee, context) {
  if (context.selectionChecked === true) return;
  context.selectionChecked = true;
  const startedAt = performance.now();

  const before = await _pr88InstantSelectedModeSnapshot(debuggee);
  context.selectedModeBeforeSelection = before?.selectedMode || null;
  context.selectedModeBeforeSelectionProven = before?.selectedModeProven === true;
  context.selectedModeBeforeSelectionProofKind = before?.proofKind || "unknown";
  context.selectedModeBeforeSelectionCandidateCount = Number.isInteger(before?.candidateCount)
    ? before.candidateCount
    : 0;

  if (before?.selectedModeProven !== true || typeof before?.selectedMode !== "string") {
    throw new Error("PR8_8_INSTANT_SELECTION_INITIAL_MODE_NOT_PROVEN");
  }

  if (before.selectedMode === "INSTANT") {
    context.selectionPerformed = false;
    context.selectedModeAfterSelection = "INSTANT";
    context.selectedModeAfterSelectionProven = true;
    context.selectedModeAfterSelectionProofKind = before.proofKind || "unknown";
    context.selectionElapsedMs = _pr88SelectionDurationMs(startedAt);
    context.selectionMutationElapsedMs = 0;
    context.selectionComplete = true;
    return;
  }

  context.selectionPerformed = true;
  _pr88SelectionInstallNetworkWindow(debuggee, context);

  const mutationStartedAt = performance.now();
  const picker = await _pr88SelectionPoint(debuggee, "picker");
  context.pickerCandidateCount = Number.isInteger(picker?.candidateCount)
    ? picker.candidateCount
    : 0;
  context.pickerNearestDistancePx = _pr88SelectionSafeInt(picker?.nearestDistancePx);
  context.pickerModeBeforeClick = typeof picker?.mode === "string" ? picker.mode : null;
  if (picker?.found !== true) {
    throw new Error(`PR8_8_INSTANT_SELECTION_PICKER_NOT_FOUND:${picker?.reason || "unknown"}`);
  }
  await _pr88SelectionRawClick(debuggee, picker);

  const option = await _pr88SelectionWaitForInstantOption(
    debuggee,
    PR88_INSTANT_SELECTION_OPTION_TIMEOUT_MS
  );
  context.instantOptionCandidateCount = Number.isInteger(option?.candidateCount)
    ? option.candidateCount
    : 0;
  if (option?.found !== true) {
    throw new Error(`PR8_8_INSTANT_SELECTION_OPTION_NOT_FOUND:${option?.reason || "unknown"}`);
  }
  await _pr88SelectionRawClick(debuggee, option);

  const after = await _pr88SelectionWaitForInstantSelected(
    debuggee,
    PR88_INSTANT_SELECTION_SETTLE_TIMEOUT_MS
  );
  context.selectedModeAfterSelection = after?.selectedMode || null;
  context.selectedModeAfterSelectionProven = after?.selectedModeProven === true;
  context.selectedModeAfterSelectionProofKind = after?.proofKind || "unknown";
  if (
    after?.selectedModeProven !== true ||
    after?.selectedMode !== "INSTANT"
  ) {
    throw new Error("PR8_8_INSTANT_SELECTION_DID_NOT_SETTLE_TO_INSTANT");
  }

  context.selectionMutationElapsedMs = _pr88SelectionDurationMs(mutationStartedAt);
  context.selectionElapsedMs = _pr88SelectionDurationMs(startedAt);
  context.selectionComplete = true;
  // Keep the network window open until the actual conversation POST. This
  // captures any asynchronous model-selection persistence without adding an
  // artificial sleep to the latency measurement.
}

locateAndFocusComposer = async function _locateAndFocusComposerWithInstantSelectionRepair(debuggee) {
  const context = _pr88SelectionContext;
  if (context !== null) {
    await _pr88SelectionEnsureInstant(debuggee, context);
  }
  // The prior wrapper is the existing Instant observer. Calling it only after
  // selection means its preWritePicker snapshot must see the repaired state.
  return _pr88SelectionPriorLocateAndFocusComposer(debuggee);
};

async function _pr88SelectionStoredRecord() {
  try {
    const stored = await chrome.storage.local.get(PR88_INSTANT_SELECTION_STORAGE_KEY);
    const value = stored?.[PR88_INSTANT_SELECTION_STORAGE_KEY];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

async function _pr88SelectionCharacterizeRecord(message) {
  if (_pr88SelectionQueryConflict(message)) {
    throw new Error("PR8_8_INSTANT_SELECTION_RECORD_FLAG_CONFLICT");
  }
  const expectedLeaseId = _pr88SelectionLeaseId(message?.expectedBrowserAuthorityLeaseId);
  if (expectedLeaseId === null) {
    throw new Error("PR8_8_INSTANT_SELECTION_EXPECTED_LEASE_REQUIRED");
  }
  const record = await _pr88SelectionStoredRecord();
  if (record === null) {
    throw new Error("PR8_8_INSTANT_SELECTION_RECORD_NOT_AVAILABLE");
  }
  if (_pr88SelectionLeaseId(record.instantSelectionLeaseId) !== expectedLeaseId) {
    throw new Error("PR8_8_INSTANT_SELECTION_RECORD_LEASE_MISMATCH");
  }
  return {
    probeContext: "instant_selection_repair_record",
    readOnly: true,
    instantSelectionRepairSupported: true,
    ...record
  };
}

function _pr88SelectionRecord(context) {
  let materializationStatus = "NO_SELECTION_REQUIRED";
  if (context.selectionPerformed === true) {
    if (context.unexpectedConversationWriteBeforeSelectionComplete === true) {
      materializationStatus = "UNEXPECTED_CONVERSATION_WRITE_DURING_SELECTION";
    } else if (context.settingLikeMutationObserved === true) {
      materializationStatus = "SETTING_LIKE_BACKEND_MUTATION_OBSERVED";
    } else if (context.chatgptMutatingNonConversationRequestCount > 0) {
      materializationStatus = "OTHER_CHATGPT_MUTATION_OBSERVED";
    } else if (context.chatgptRequestCountDuringSelection > 0) {
      materializationStatus = "NO_CHATGPT_MUTATION_OBSERVED";
    } else {
      materializationStatus = "NO_NETWORK_ACTIVITY_OBSERVED";
    }
  }

  return {
    instantSelectionLeaseId: context.leaseId,
    instantSelectionSchemaVersion: PR88_INSTANT_SELECTION_SCHEMA_VERSION,
    requestedModelMode: "INSTANT",
    selectedModeBeforeSelection: context.selectedModeBeforeSelection,
    selectedModeBeforeSelectionProven: context.selectedModeBeforeSelectionProven,
    selectedModeBeforeSelectionProofKind: context.selectedModeBeforeSelectionProofKind,
    selectedModeBeforeSelectionCandidateCount: context.selectedModeBeforeSelectionCandidateCount,
    selectionPerformed: context.selectionPerformed === true,
    selectionElapsedMs: _pr88SelectionSafeInt(context.selectionElapsedMs),
    selectionMutationElapsedMs: _pr88SelectionSafeInt(context.selectionMutationElapsedMs),
    pickerModeBeforeClick: context.pickerModeBeforeClick,
    pickerCandidateCount: context.pickerCandidateCount,
    pickerNearestDistancePx: context.pickerNearestDistancePx,
    instantOptionCandidateCount: context.instantOptionCandidateCount,
    selectedModeAfterSelection: context.selectedModeAfterSelection,
    selectedModeAfterSelectionProven: context.selectedModeAfterSelectionProven,
    selectedModeAfterSelectionProofKind: context.selectedModeAfterSelectionProofKind,
    selectionComplete: context.selectionComplete === true,
    conversationWriteBoundaryObserved: context.conversationWriteBoundaryObserved === true,
    unexpectedConversationWriteBeforeSelectionComplete:
      context.unexpectedConversationWriteBeforeSelectionComplete === true,
    conversationWriteCountDuringSelection: context.conversationWriteCountDuringSelection,
    networkRequestCountDuringSelection: context.networkRequestCountDuringSelection,
    chatgptRequestCountDuringSelection: context.chatgptRequestCountDuringSelection,
    chatgptMutatingNonConversationRequestCount:
      context.chatgptMutatingNonConversationRequestCount,
    settingLikeMutationObserved: context.settingLikeMutationObserved === true,
    requestClasses: Array.from(context.requestClasses).sort(),
    modelSelectionMaterializationStatus: materializationStatus
  };
}

executeNativeTurn = async function _executeNativeTurnWithInstantSelectionRepair(message) {
  if (message?.characterizeInstantSelectionRepairSupport === true) {
    if (_pr88SelectionQueryConflict(message)) {
      throw new Error("PR8_8_INSTANT_SELECTION_SUPPORT_FLAG_CONFLICT");
    }
    return {
      probeContext: "instant_selection_repair_support",
      readOnly: true,
      instantSelectionRepairSupported: true,
      instantSelectionSchemaVersion: PR88_INSTANT_SELECTION_SCHEMA_VERSION,
      productUiSelectionSupported: true,
      preSubmitNetworkClassificationSupported: true,
      conversationWriteBoundarySupported: true
    };
  }

  if (message?.characterizeInstantSelectionRecord === true) {
    return _pr88SelectionCharacterizeRecord(message);
  }

  const leaseId = _pr88SelectionLeaseId(message?.browserAuthorityLeaseId);
  const ordinaryProductWrite = (
    typeof message?.text === "string" &&
    Boolean(message.text.trim()) &&
    leaseId !== null
  );
  const requireInstant = message?.requiredModelMode === "INSTANT";

  if (!ordinaryProductWrite || !requireInstant) {
    return _pr88SelectionPriorExecuteNativeTurn(message);
  }

  const context = {
    leaseId,
    selectionChecked: false,
    selectionComplete: false,
    selectionPerformed: false,
    selectedModeBeforeSelection: null,
    selectedModeBeforeSelectionProven: false,
    selectedModeBeforeSelectionProofKind: null,
    selectedModeBeforeSelectionCandidateCount: 0,
    selectionElapsedMs: null,
    selectionMutationElapsedMs: null,
    pickerModeBeforeClick: null,
    pickerCandidateCount: 0,
    pickerNearestDistancePx: null,
    instantOptionCandidateCount: 0,
    selectedModeAfterSelection: null,
    selectedModeAfterSelectionProven: false,
    selectedModeAfterSelectionProofKind: null,
    conversationWriteBoundaryObserved: false,
    unexpectedConversationWriteBeforeSelectionComplete: false,
    conversationWriteCountDuringSelection: 0,
    networkRequestCountDuringSelection: 0,
    chatgptRequestCountDuringSelection: 0,
    chatgptMutatingNonConversationRequestCount: 0,
    settingLikeMutationObserved: false,
    requestClasses: new Set(),
    networkListener: null
  };
  _pr88SelectionContext = context;

  try {
    const result = await _pr88SelectionPriorExecuteNativeTurn(message);
    const record = _pr88SelectionRecord(context);
    try {
      await chrome.storage.local.set({
        [PR88_INSTANT_SELECTION_STORAGE_KEY]: record
      });
    } catch {
      // Optional observability must not change successful product semantics.
    }
    return {
      ...result,
      instantSelectionSchemaVersion: PR88_INSTANT_SELECTION_SCHEMA_VERSION,
      instantSelectionPerformed: record.selectionPerformed,
      selectedModeBeforeSelection: record.selectedModeBeforeSelection,
      selectedModeAfterSelection: record.selectedModeAfterSelection,
      modelSelectionMaterializationStatus: record.modelSelectionMaterializationStatus
    };
  } finally {
    if (context.networkListener) {
      try { chrome.debugger.onEvent.removeListener(context.networkListener); } catch {}
      context.networkListener = null;
    }
    _pr88SelectionContext = null;
  }
};

/* END legacy source: service_worker_instant_selection_repair_pr8_8.js */


/* BEGIN legacy source: service_worker_retained_picker_forensics_pr8_8.js */
// PR8.8 retained failed-picker forensics and zero-write reconciliation evidence.
//
// Loaded after the Instant selection repair. This layer adds only read-only
// characterization RPCs. It never clicks the picker, changes model state,
// inserts prompt text, submits a conversation request, or closes the runtime
// tab. Optional runtime-tab reconciliation close remains a separate Python-side
// action using the existing lease+tab fenced release_runtime_tab API.

const PR88_RETAINED_PICKER_FORENSICS_SCHEMA_VERSION = 1;
const PR88_FORENSICS_MAX_DOM_CANDIDATES = 80;
const PR88_FORENSICS_MAX_AX_CANDIDATES = 80;
const PR88_FORENSICS_MAX_POPUPS = 24;
const _pr88ForensicsPriorExecuteNativeTurn = executeNativeTurn;

function _pr88ForensicsConversationId(value) {
  const conversationId = typeof value === "string" ? value.trim() : "";
  if (!conversationId || conversationId.includes("/") || conversationId.includes("?") || conversationId.includes("#")) {
    return null;
  }
  return conversationId;
}

function _pr88ForensicsNormalize(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s_\-]+/g, " ")
    : "";
}

function _pr88ForensicsModes(value) {
  const text = _pr88ForensicsNormalize(value);
  if (!text) return [];
  const modes = [];
  const has = (pattern) => pattern.test(text);
  if (has(/(^|\b)(instant|мгновенно)(\b|$)/)) modes.push("INSTANT");
  if (has(/(^|\b)(medium|средний)(\b|$)/) || text.includes("thinking standard")) modes.push("MEDIUM");
  if (text.includes("extra high") || text.includes("очень высокий") || text.includes("thinking heavy")) modes.push("EXTRA_HIGH");
  else if (has(/(^|\b)(high|высокий)(\b|$)/) || text.includes("thinking extended")) modes.push("HIGH");
  if (text.includes("pro standard")) modes.push("PRO_STANDARD");
  if (text.includes("pro extended")) modes.push("PRO_EXTENDED");
  if (text === "thinking") modes.push("REASONING_OTHER");
  if (text === "pro") modes.push("PRO_OTHER");
  return Array.from(new Set(modes));
}

function _pr88ForensicsQueryConflict(message) {
  return (
    message?.text != null ||
    message?.canonicalCompleted === true ||
    message?.browserAuthorityLeaseId != null ||
    message?.probeTemporaryMode === true ||
    message?.characterizeTemporaryTurn === true ||
    message?.probeTemporaryHistoryPresence === true ||
    message?.characterizeManualTemporaryGroundTruth === true ||
    message?.probeTemporaryRouteReopen === true ||
    message?.characterizeInstantSelectedMode === true ||
    message?.characterizeInstantModeRecord === true ||
    message?.characterizeInstantSelectionRecord === true
  );
}

function _pr88ForensicsDomExpression() {
  return `(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    const modes = (value) => {
      const text = normalize(value);
      if (!text) return [];
      const out = [];
      const has = (re) => re.test(text);
      // Locale coverage, same as the picker-identity table: the effort control renders as the
      // Chinese single character "高" here, and \b does not separate CJK from surrounding text.
      if (has(/(^|\\b)(instant|мгновенно)(\\b|$)/) || text.includes('即时')) out.push('INSTANT');
      if (has(/(^|\\b)(medium|средний)(\\b|$)/) || text === '中' || text.includes('thinking standard')) out.push('MEDIUM');
      if (text.includes('extra high') || text.includes('极高') || text.includes('очень высокий') || text.includes('thinking heavy')) out.push('EXTRA_HIGH');
      else if (has(/(^|\\b)(high|высокий)(\\b|$)/) || text === '高' || text.includes('thinking extended')) out.push('HIGH');
      if (text.includes('pro standard')) out.push('PRO_STANDARD');
      if (text.includes('pro extended')) out.push('PRO_EXTENDED');
      if (text === 'thinking') out.push('REASONING_OTHER');
      if (text === 'pro') out.push('PRO_OTHER');
      return Array.from(new Set(out));
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const boundedState = (value) => {
      const text = normalize(value);
      return ['open','closed','selected','checked','unchecked','active','inactive','on','off'].includes(text) ? text : null;
    };
    const ownText = (el) => Array.from(el.childNodes || [])
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || '')
      .join(' ');
    const directFields = (el) => [
      ownText(el),
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('data-testid')
    ];
    const subtreeFields = (el) => [
      typeof el.innerText === 'string' ? el.innerText.slice(0, 320) : '',
      el.textContent ? String(el.textContent).slice(0, 320) : ''
    ];
    const rectRecord = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left), y: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height)
      };
    };
    const parentRoles = (el) => {
      const out = [];
      let current = el.parentElement;
      while (current && out.length < 5) {
        const role = current.getAttribute('role');
        if (role) out.push(role);
        current = current.parentElement;
      }
      return out;
    };
    const composer = [
      '#prompt-textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'textarea[placeholder]'
    ].map((selector) => document.querySelector(selector)).find((el) => el && visible(el));
    const composerReady = Boolean(composer);
    const composerRect = composer ? composer.getBoundingClientRect() : null;

    let pickerControl = null;
    if (composer) {
      const controls = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
      const candidates = [];
      for (const control of controls) {
        const found = Array.from(new Set(directFields(control).flatMap(modes)));
        if (found.length !== 1) continue;
        const r = control.getBoundingClientRect();
        const dx = Math.max(0, Math.max(composerRect.left - r.right, r.left - composerRect.right));
        const dy = Math.max(0, Math.max(composerRect.top - r.bottom, r.top - composerRect.bottom));
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 800) continue;
        candidates.push({ control, mode: found[0], distance });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      if (candidates.length) {
        const nearest = candidates[0];
        pickerControl = {
          tag: nearest.control.tagName,
          role: nearest.control.getAttribute('role') || null,
          mode: nearest.mode,
          candidateCount: candidates.length,
          nearestDistancePx: Math.round(nearest.distance),
          rect: rectRecord(nearest.control),
          ariaExpanded: nearest.control.getAttribute('aria-expanded') || null,
          ariaHaspopup: nearest.control.getAttribute('aria-haspopup') || null,
          dataState: boundedState(nearest.control.getAttribute('data-state'))
        };
      }
    }

    const actionableRoles = new Set([
      'menuitem','menuitemradio','menuitemcheckbox','option','radio','button',
      'tab','treeitem','listitem','combobox'
    ]);
    const popupRoles = new Set(['menu','listbox','dialog','radiogroup','group','tree']);
    const domCandidates = [];
    const popupSurfaces = [];
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      if (!visible(el)) continue;
      const role = el.getAttribute('role') || null;
      const directModes = Array.from(new Set(directFields(el).flatMap(modes)));
      const subtreeModes = Array.from(new Set(subtreeFields(el).flatMap(modes)));
      const combinedModes = Array.from(new Set([...directModes, ...subtreeModes]));
      const tag = el.tagName;
      const actionable = tag === 'BUTTON' || (role && actionableRoles.has(role));
      const popup = role && popupRoles.has(role);

      if (popup && popupSurfaces.length < ${PR88_FORENSICS_MAX_POPUPS}) {
        popupSurfaces.push({
          tag,
          role,
          rect: rectRecord(el),
          ariaLabelMode: Array.from(new Set(modes(el.getAttribute('aria-label')))),
          descendantKnownModeCount: Array.from(el.querySelectorAll('*')).filter((child) => {
            if (!visible(child)) return false;
            return Array.from(new Set([
              ...directFields(child).flatMap(modes),
              ...subtreeFields(child).flatMap(modes)
            ])).length > 0;
          }).length
        });
      }

      if (domCandidates.length >= ${PR88_FORENSICS_MAX_DOM_CANDIDATES}) continue;
      if (!combinedModes.length && !actionable) continue;
      if (!combinedModes.length && role && !actionableRoles.has(role)) continue;

      const style = getComputedStyle(el);
      domCandidates.push({
        tag,
        role,
        modes: combinedModes,
        directModes,
        subtreeModes,
        modeEvidence: directModes.length ? 'DIRECT' : (subtreeModes.length ? 'SUBTREE' : 'NONE'),
        ariaChecked: el.getAttribute('aria-checked'),
        ariaSelected: el.getAttribute('aria-selected'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaHaspopup: el.getAttribute('aria-haspopup'),
        dataState: boundedState(el.getAttribute('data-state')),
        tabIndex: Number.isInteger(el.tabIndex) ? el.tabIndex : null,
        disabled: Boolean(el.disabled === true || el.getAttribute('aria-disabled') === 'true'),
        pointerEventsEnabled: style.pointerEvents !== 'none',
        rect: rectRecord(el),
        parentRoles: parentRoles(el),
        childElementCount: el.children ? el.children.length : 0,
        descendantActionableCount: Array.from(el.querySelectorAll('button,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="option"],[role="radio"]')).filter(visible).length
      });
    }

    const recognizedModes = Array.from(new Set(domCandidates.flatMap((item) => item.modes))).sort();
    const instantDomCandidates = domCandidates.filter((item) => item.modes.includes('INSTANT'));
    const popupSurfaceOpen = popupSurfaces.length > 0 || Boolean(
      pickerControl && (pickerControl.ariaExpanded === 'true' || pickerControl.dataState === 'open')
    );
    return {
      composerReady,
      pickerControl,
      popupSurfaceOpen,
      popupSurfaces,
      domCandidates,
      recognizedModes,
      instantDomCandidateCount: instantDomCandidates.length,
      scannedVisibleElementCount: all.filter(visible).length
    };
  })()`;
}

function _pr88ForensicsAxProperty(node, name) {
  const properties = Array.isArray(node?.properties) ? node.properties : [];
  const entry = properties.find((item) => item?.name === name);
  const value = entry?.value?.value;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  return null;
}

function _pr88ForensicsAxMode(node) {
  const nameModes = _pr88ForensicsModes(node?.name?.value);
  if (nameModes.length === 1) return { mode: nameModes[0], evidence: "NAME" };
  const descModes = _pr88ForensicsModes(node?.description?.value);
  if (descModes.length === 1) return { mode: descModes[0], evidence: "DESCRIPTION" };
  return { mode: null, evidence: "NONE" };
}

function _pr88ForensicsAxTopology(axTree) {
  const nodes = Array.isArray(axTree?.nodes) ? axTree.nodes : [];
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const interestingRoles = new Set([
    "menu", "menuitem", "menuitemradio", "menuitemcheckbox", "listbox", "option",
    "radio", "radiogroup", "button", "dialog", "group", "combobox", "tab", "treeitem"
  ]);
  const candidates = [];
  for (const node of nodes) {
    if (candidates.length >= PR88_FORENSICS_MAX_AX_CANDIDATES) break;
    const role = typeof node?.role?.value === "string" ? node.role.value : null;
    const modeRecord = _pr88ForensicsAxMode(node);
    if (modeRecord.mode === null && !interestingRoles.has(role || "")) continue;
    const parent = node?.parentId ? byId.get(node.parentId) : null;
    const parentRole = typeof parent?.role?.value === "string" ? parent.role.value : null;
    candidates.push({
      role,
      mode: modeRecord.mode,
      modeEvidence: modeRecord.evidence,
      ignored: node?.ignored === true,
      parentRole,
      checked: _pr88ForensicsAxProperty(node, "checked"),
      selected: _pr88ForensicsAxProperty(node, "selected"),
      expanded: _pr88ForensicsAxProperty(node, "expanded"),
      focusable: _pr88ForensicsAxProperty(node, "focusable"),
      disabled: _pr88ForensicsAxProperty(node, "disabled"),
      backendDOMNodeIdPresent: Number.isInteger(node?.backendDOMNodeId),
      childCount: Array.isArray(node?.childIds) ? node.childIds.length : 0
    });
  }
  const recognizedModes = Array.from(new Set(candidates.map((item) => item.mode).filter(Boolean))).sort();
  return {
    candidateCount: candidates.length,
    instantCandidateCount: candidates.filter((item) => item.mode === "INSTANT").length,
    recognizedModes,
    candidates
  };
}

async function _pr88ForensicsStoredLeaseIdSafe() {
  try {
    if (typeof _pr88StoredLeaseId === "function") return await _pr88StoredLeaseId();
  } catch {}
  return null;
}

async function _pr88ForensicsProbe(message) {
  if (_pr88ForensicsQueryConflict(message)) {
    throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_FLAG_CONFLICT");
  }
  const conversationId = _pr88ForensicsConversationId(message?.conversationId);
  if (conversationId === null) {
    throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_CONVERSATION_REQUIRED");
  }
  const expectedTabId = Number.isInteger(message?.expectedRuntimeTabId)
    ? message.expectedRuntimeTabId
    : null;
  const runtimeTabId = await storedRuntimeTabId();
  if (!Number.isInteger(runtimeTabId)) {
    throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_RUNTIME_TAB_REQUIRED");
  }
  if (expectedTabId !== null && runtimeTabId !== expectedTabId) {
    throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_RUNTIME_TAB_CHANGED");
  }

  const tabBefore = await chrome.tabs.get(runtimeTabId);
  if (!isChatGPTUrl(tabBefore?.url || "")) {
    throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_TAB_NOT_CHATGPT");
  }
  if (conversationIdFromUrl(tabBefore?.url || "") !== conversationId) {
    throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_CONVERSATION_MISMATCH");
  }

  let debuggerAttachedBefore = null;
  try {
    const targets = await chrome.debugger.getTargets();
    debuggerAttachedBefore = Boolean(targets.find((target) => target.tabId === runtimeTabId)?.attached);
  } catch {
    debuggerAttachedBefore = null;
  }
  if (debuggerAttachedBefore === true) {
    throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_DEBUGGER_ALREADY_ATTACHED");
  }

  const activatedTabIds = new Set();
  const onActivated = (info) => {
    if (Number.isInteger(info?.tabId)) activatedTabIds.add(info.tabId);
  };
  chrome.tabs.onActivated.addListener(onActivated);

  const debuggee = { tabId: runtimeTabId };
  let attached = false;
  let networkListener = null;
  let conversationWriteCount = 0;
  let dom = null;
  let ax = null;
  let tabActiveAfter = null;
  let debuggerAttachedAfter = null;
  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Runtime.enable");
    await chrome.debugger.sendCommand(debuggee, "Network.enable");
    try { await chrome.debugger.sendCommand(debuggee, "Accessibility.enable"); } catch {}

    networkListener = (source, method, params) => {
      if (source?.tabId !== runtimeTabId || method !== "Network.requestWillBeSent") return;
      const request = params?.request;
      if (isConversationWrite(request?.url || "", request?.method || "")) {
        conversationWriteCount += 1;
      }
    };
    chrome.debugger.onEvent.addListener(networkListener);

    const domResult = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: _pr88ForensicsDomExpression(),
      returnByValue: true,
      awaitPromise: true
    });
    dom = domResult?.result?.value || null;

    let axTree = null;
    try {
      axTree = await chrome.debugger.sendCommand(debuggee, "Accessibility.getFullAXTree", { depth: 12 });
    } catch {
      axTree = { nodes: [] };
    }
    ax = _pr88ForensicsAxTopology(axTree);

    const tabAfter = await chrome.tabs.get(runtimeTabId);
    tabActiveAfter = Boolean(tabAfter?.active);
    if (conversationIdFromUrl(tabAfter?.url || "") !== conversationId) {
      throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_CONVERSATION_CHANGED");
    }
    if (conversationWriteCount !== 0) {
      throw new Error(`PR8_8_RETAINED_PICKER_FORENSICS_UNEXPECTED_WRITE:${conversationWriteCount}`);
    }
  } finally {
    if (networkListener) {
      try { chrome.debugger.onEvent.removeListener(networkListener); } catch {}
    }
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
    try {
      const targets = await chrome.debugger.getTargets();
      debuggerAttachedAfter = Boolean(targets.find((target) => target.tabId === runtimeTabId)?.attached);
    } catch {
      debuggerAttachedAfter = null;
    }
    chrome.tabs.onActivated.removeListener(onActivated);
  }

  const runtimeTabIdAfter = await storedRuntimeTabId();
  const leaseId = await _pr88ForensicsStoredLeaseIdSafe();
  return {
    probeContext: "retained_failed_picker_surface_forensics",
    readOnly: true,
    zeroProductWrites: true,
    retainedPickerForensicsSupported: true,
    retainedPickerForensicsSchemaVersion: PR88_RETAINED_PICKER_FORENSICS_SCHEMA_VERSION,
    conversationId,
    expectedRuntimeTabId: expectedTabId,
    runtimeTabId,
    runtimeTabIdAfter,
    runtimeTabRetained: runtimeTabIdAfter === runtimeTabId,
    browserAuthorityLeaseId: leaseId,
    leaseIdPresent: leaseId !== null,
    tabWasActive: Boolean(tabBefore?.active),
    tabActiveAfter,
    tabActivatedDuringProbe: activatedTabIds.has(runtimeTabId),
    foregroundActivationObserved: Boolean(tabBefore?.active || tabActiveAfter === true || activatedTabIds.has(runtimeTabId)),
    debuggerAttachedBefore,
    debuggerAttachedAfter,
    conversationWriteCount,
    domTopology: dom,
    accessibilityTopology: ax,
    pickerSurfaceOpen: dom?.popupSurfaceOpen === true,
    instantDomCandidateCount: Number.isInteger(dom?.instantDomCandidateCount) ? dom.instantDomCandidateCount : 0,
    instantAxCandidateCount: Number.isInteger(ax?.instantCandidateCount) ? ax.instantCandidateCount : 0,
    recognizedModes: Array.from(new Set([
      ...(Array.isArray(dom?.recognizedModes) ? dom.recognizedModes : []),
      ...(Array.isArray(ax?.recognizedModes) ? ax.recognizedModes : [])
    ])).sort()
  };
}

executeNativeTurn = async function _executeNativeTurnWithRetainedPickerForensics(message) {
  if (message?.characterizeRetainedPickerForensicsSupport === true) {
    if (_pr88ForensicsQueryConflict(message) || message?.conversationId != null) {
      throw new Error("PR8_8_RETAINED_PICKER_FORENSICS_SUPPORT_FLAG_CONFLICT");
    }
    return {
      probeContext: "retained_picker_forensics_support",
      readOnly: true,
      zeroProductWrites: true,
      retainedPickerForensicsSupported: true,
      retainedPickerForensicsSchemaVersion: PR88_RETAINED_PICKER_FORENSICS_SCHEMA_VERSION,
      retainedExistingTabProbeSupported: true,
      domTopologySupported: true,
      accessibilityTopologySupported: true,
      conversationWriteGuardSupported: true,
      fencedReconciliationCloseSupported: true
    };
  }

  if (message?.characterizeRetainedPickerSurfaceForensics === true) {
    return _pr88ForensicsProbe(message);
  }

  return _pr88ForensicsPriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_retained_picker_forensics_pr8_8.js */


/* BEGIN legacy source: service_worker_retained_route_identity_pr8_8.js */
// PR8.8 retained runtime-tab route identity forensics.
//
// Loaded after service_worker_retained_picker_forensics_pr8_8.js. This layer
// adds route-only characterization RPCs. It never attaches the debugger, reads
// DOM/AX topology, clicks product UI, inserts text, submits a conversation
// request, navigates/reloads a tab, or closes Browser Authority.

const PR88_RETAINED_ROUTE_IDENTITY_SCHEMA_VERSION = 1;
const _pr88RoutePriorExecuteNativeTurn = executeNativeTurn;

function _pr88RouteConversationId(value) {
  const conversationId = typeof value === "string" ? value.trim() : "";
  if (!conversationId || conversationId.includes("/") || conversationId.includes("?") || conversationId.includes("#")) {
    return null;
  }
  return conversationId;
}

function _pr88RouteIdentity(urlValue, expectedConversationId) {
  const url = typeof urlValue === "string" ? urlValue : "";
  let pathname = "/";
  try {
    pathname = new URL(url).pathname || "/";
  } catch {
    pathname = "/";
  }
  const observedConversationId = _pr88RouteConversationId(conversationIdFromUrl(url));
  let routeKind = "OTHER_CHATGPT";
  if (observedConversationId !== null) routeKind = "CONVERSATION";
  else if (pathname === "/" || pathname === "") routeKind = "ROOT";

  const conversationMatchesExpected = observedConversationId === expectedConversationId;
  let routeIdentityStatus = "OTHER_CHATGPT_ROUTE";
  if (conversationMatchesExpected) routeIdentityStatus = "EXPECTED_CONVERSATION_MATCH";
  else if (routeKind === "CONVERSATION") routeIdentityStatus = "OTHER_CONVERSATION";
  else if (routeKind === "ROOT") routeIdentityStatus = "ROOT_ROUTE";

  return {
    routeKind,
    observedConversationId,
    expectedConversationId,
    conversationMatchesExpected,
    routeIdentityStatus,
    rawUrlExported: false,
    queryExported: false,
    fragmentExported: false
  };
}

function _pr88RouteQueryConflict(message) {
  return (
    message?.text != null ||
    message?.canonicalCompleted === true ||
    message?.browserAuthorityLeaseId != null ||
    message?.probeTemporaryMode === true ||
    message?.characterizeTemporaryTurn === true ||
    message?.probeTemporaryHistoryPresence === true ||
    message?.characterizeManualTemporaryGroundTruth === true ||
    message?.probeTemporaryRouteReopen === true ||
    message?.characterizeInstantSelectedMode === true ||
    message?.characterizeInstantModeRecord === true ||
    message?.characterizeInstantSelectionRecord === true ||
    message?.characterizeRetainedPickerForensicsSupport === true ||
    message?.characterizeRetainedPickerSurfaceForensics === true
  );
}

async function _pr88RouteStoredLeaseIdSafe() {
  try {
    if (typeof _pr88StoredLeaseId === "function") return await _pr88StoredLeaseId();
  } catch {}
  return null;
}

async function _pr88RouteDebuggerAttached(tabId) {
  try {
    const targets = await chrome.debugger.getTargets();
    return Boolean(targets.find((target) => target.tabId === tabId)?.attached);
  } catch {
    return null;
  }
}

async function _pr88RetainedRouteIdentityProbe(message) {
  if (_pr88RouteQueryConflict(message)) {
    throw new Error("PR8_8_RETAINED_ROUTE_IDENTITY_FLAG_CONFLICT");
  }
  const conversationId = _pr88RouteConversationId(message?.conversationId);
  if (conversationId === null) {
    throw new Error("PR8_8_RETAINED_ROUTE_IDENTITY_CONVERSATION_REQUIRED");
  }
  const expectedTabId = Number.isInteger(message?.expectedRuntimeTabId)
    ? message.expectedRuntimeTabId
    : null;
  const runtimeTabId = await storedRuntimeTabId();
  if (!Number.isInteger(runtimeTabId)) {
    throw new Error("PR8_8_RETAINED_ROUTE_IDENTITY_RUNTIME_TAB_REQUIRED");
  }
  if (expectedTabId !== null && runtimeTabId !== expectedTabId) {
    throw new Error("PR8_8_RETAINED_ROUTE_IDENTITY_RUNTIME_TAB_CHANGED");
  }

  const tabBefore = await chrome.tabs.get(runtimeTabId);
  if (!isChatGPTUrl(tabBefore?.url || "")) {
    throw new Error("PR8_8_RETAINED_ROUTE_IDENTITY_TAB_NOT_CHATGPT");
  }
  const routeIdentity = _pr88RouteIdentity(tabBefore?.url || "", conversationId);
  const debuggerAttachedBefore = await _pr88RouteDebuggerAttached(runtimeTabId);

  // Deliberately no debugger attach and no DOM/AX inspection. The second tab
  // read proves the retained resource/route stayed stable while taking evidence.
  const tabAfter = await chrome.tabs.get(runtimeTabId);
  if (!isChatGPTUrl(tabAfter?.url || "")) {
    throw new Error("PR8_8_RETAINED_ROUTE_IDENTITY_TAB_LEFT_CHATGPT");
  }
  const routeIdentityAfter = _pr88RouteIdentity(tabAfter?.url || "", conversationId);
  const runtimeTabIdAfter = await storedRuntimeTabId();
  const debuggerAttachedAfter = await _pr88RouteDebuggerAttached(runtimeTabId);
  const leaseId = await _pr88RouteStoredLeaseIdSafe();
  const routeIdentityStable = (
    routeIdentity.routeKind === routeIdentityAfter.routeKind &&
    routeIdentity.observedConversationId === routeIdentityAfter.observedConversationId &&
    routeIdentity.routeIdentityStatus === routeIdentityAfter.routeIdentityStatus
  );

  return {
    probeContext: "retained_runtime_tab_route_identity_forensics",
    readOnly: true,
    zeroProductWrites: true,
    retainedRouteIdentitySupported: true,
    retainedRouteIdentitySchemaVersion: PR88_RETAINED_ROUTE_IDENTITY_SCHEMA_VERSION,
    conversationId,
    expectedRuntimeTabId: expectedTabId,
    runtimeTabId,
    runtimeTabIdAfter,
    runtimeTabRetained: runtimeTabIdAfter === runtimeTabId,
    browserAuthorityLeaseId: leaseId,
    leaseIdPresent: leaseId !== null,
    routeIdentity,
    routeIdentityAfter,
    routeIdentityStable,
    routeMismatchCharacterized: routeIdentity.conversationMatchesExpected !== true,
    domAxInspectionPerformed: false,
    conversationWriteGuardObserved: false,
    conversationWriteCount: null,
    tabWasActive: Boolean(tabBefore?.active),
    tabActiveAfter: Boolean(tabAfter?.active),
    tabActivatedDuringProbe: false,
    foregroundActivationObserved: Boolean(tabBefore?.active || tabAfter?.active),
    debuggerAttachedBefore,
    debuggerAttachedAfter
  };
}

executeNativeTurn = async function _executeNativeTurnWithRetainedRouteIdentity(message) {
  if (message?.characterizeRetainedRouteIdentitySupport === true) {
    if (_pr88RouteQueryConflict(message) || message?.conversationId != null) {
      throw new Error("PR8_8_RETAINED_ROUTE_IDENTITY_SUPPORT_FLAG_CONFLICT");
    }
    return {
      probeContext: "retained_runtime_tab_route_identity_support",
      readOnly: true,
      zeroProductWrites: true,
      retainedRouteIdentitySupported: true,
      retainedRouteIdentitySchemaVersion: PR88_RETAINED_ROUTE_IDENTITY_SCHEMA_VERSION,
      retainedExistingTabRouteProbeSupported: true,
      conversationMismatchCharacterizationSupported: true,
      routeMismatchDomAxSuppressionSupported: true,
      rawRouteRedactionSupported: true,
      exactMatchSurfaceForensicsDelegationSupported: true
    };
  }

  if (message?.characterizeRetainedRouteIdentity === true) {
    return _pr88RetainedRouteIdentityProbe(message);
  }

  return _pr88RoutePriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_retained_route_identity_pr8_8.js */


/* BEGIN legacy source: service_worker_orphan_lease_reconciliation_pr8_8.js */
// PR8.8 explicit zero-product-write orphan Browser Authority lease reconciliation.
const PR88_ORPHAN_LEASE_SCHEMA = 1;
const _pr88OrphanPriorExecuteNativeTurn = executeNativeTurn;

function _pr88OrphanAssertReadOnly(message) {
  if (
    message?.text != null || message?.conversationId != null ||
    message?.browserAuthorityLeaseId != null || message?.canonicalCompleted != null ||
    message?.canonicalCompletedAtMs != null
  ) throw new Error("PR8_8_ORPHAN_LEASE_RECONCILIATION_WRITE_FIELD_CONFLICT");
}

async function _pr88OrphanSnapshot() {
  const raw = await _pr824a3RawStoredRuntimeTabId();
  const runtimeTabId = Number.isInteger(raw) ? raw : null;
  const leaseId = await _pr88StoredLeaseId();
  if (runtimeTabId === null) {
    return { runtimeTabId: null, leaseId, runtimeTabState: "NO_RUNTIME_TAB_METADATA", liveChatGPTTab: false };
  }
  try {
    const tab = await chrome.tabs.get(runtimeTabId);
    const live = isChatGPTUrl(tab?.url || "");
    return { runtimeTabId, leaseId, runtimeTabState: live ? "LIVE_CHATGPT_TAB" : "NON_CHATGPT_TAB", liveChatGPTTab: live };
  } catch {
    return { runtimeTabId, leaseId, runtimeTabState: "MISSING_CHROME_TAB", liveChatGPTTab: false };
  }
}

function _pr88OrphanPublic(snapshot) {
  return {
    runtimeTabId: Number.isInteger(snapshot?.runtimeTabId) ? snapshot.runtimeTabId : null,
    runtimeTabState: snapshot?.runtimeTabState || "UNKNOWN",
    leaseIdPresent: typeof snapshot?.leaseId === "string" && snapshot.leaseId.length > 0,
    liveChatGPTTabObserved: snapshot?.liveChatGPTTab === true
  };
}

function _pr88OrphanResult(status, initial, final, extra = {}) {
  return {
    probeContext: "orphaned_browser_authority_lease_zero_write_reconciliation",
    orphanLeaseReconciliationSupported: true,
    orphanLeaseReconciliationSchemaVersion: PR88_ORPHAN_LEASE_SCHEMA,
    reconciliationStatus: status,
    initialState: _pr88OrphanPublic(initial),
    finalState: _pr88OrphanPublic(final),
    cleanBaseline: final?.runtimeTabId == null && final?.leaseId == null,
    leaseIdExported: false,
    zeroProductWrites: true,
    automaticRetry: false,
    ...extra
  };
}

async function _pr88OrphanSupport(message) {
  _pr88OrphanAssertReadOnly(message);
  return {
    orphanLeaseReconciliationSupported: true,
    orphanLeaseReconciliationSchemaVersion: PR88_ORPHAN_LEASE_SCHEMA,
    serializedZeroWriteReconciliationSupported: true,
    exactLeaseCompareAndClearSupported: true,
    runtimeTabPresenceFenceSupported: true,
    stateChangeAbstentionSupported: true,
    leaseIdExported: false,
    zeroProductWrites: true,
    automaticRetry: false
  };
}

async function _pr88ReconcileOrphanLease(message) {
  _pr88OrphanAssertReadOnly(message);
  const initial = await _pr88OrphanSnapshot();
  if (initial.liveChatGPTTab) return _pr88OrphanResult("LIVE_AUTHORITY_RETAINED", initial, initial);

  let staleRuntimeTabMetadataCleared = false;
  if (Number.isInteger(initial.runtimeTabId)) {
    staleRuntimeTabMetadataCleared = await _pr824a3ClearStoredRuntimeTabIdIfMatches(initial.runtimeTabId);
    if (!staleRuntimeTabMetadataCleared) {
      return _pr88OrphanResult("STATE_CHANGED_ABSTAINED", initial, await _pr88OrphanSnapshot(), { stateChangedBeforeCommit: true });
    }
  }

  const precommit = await _pr88OrphanSnapshot();
  if (precommit.liveChatGPTTab || Number.isInteger(precommit.runtimeTabId)) {
    return _pr88OrphanResult("STATE_CHANGED_ABSTAINED", initial, precommit, { staleRuntimeTabMetadataCleared, stateChangedBeforeCommit: true });
  }
  if (initial.leaseId == null) {
    return _pr88OrphanResult(staleRuntimeTabMetadataCleared ? "STALE_TAB_METADATA_CLEARED_NO_LEASE" : "ALREADY_CLEAN", initial, precommit, { staleRuntimeTabMetadataCleared });
  }
  if (precommit.leaseId !== initial.leaseId) {
    return _pr88OrphanResult("STATE_CHANGED_ABSTAINED", initial, precommit, { staleRuntimeTabMetadataCleared, stateChangedBeforeCommit: true });
  }

  const orphanLeaseCleared = await _pr88ClearLeaseIdIfMatches(initial.leaseId);
  if (!orphanLeaseCleared) {
    return _pr88OrphanResult("STATE_CHANGED_ABSTAINED", initial, await _pr88OrphanSnapshot(), { staleRuntimeTabMetadataCleared, stateChangedBeforeCommit: true });
  }
  const final = await _pr88OrphanSnapshot();
  const clean = final.runtimeTabId == null && final.leaseId == null;
  return _pr88OrphanResult(
    clean ? (staleRuntimeTabMetadataCleared ? "STALE_TAB_AND_ORPHAN_LEASE_CLEARED" : "ORPHAN_LEASE_CLEARED") : "POST_CLEAN_STATE_CHANGED",
    initial,
    final,
    { staleRuntimeTabMetadataCleared, orphanLeaseCleared: true, stateChangedBeforeCommit: !clean }
  );
}

executeNativeTurn = async function _executeNativeTurnWithOrphanLeaseReconciliation(message) {
  if (message?.characterizeOrphanLeaseReconciliationSupport === true) return _pr88OrphanSupport(message);
  if (message?.reconcileOrphanedBrowserAuthorityLease === true) return _pr88ReconcileOrphanLease(message);
  return _pr88OrphanPriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_orphan_lease_reconciliation_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_failure_forensics_pr8_8.js */
// PR8.8 fresh Instant failure evidence capture.
//
// Loaded after Instant selection repair and retained route/picker forensics.
// This layer does not add a new product mutation. It wraps the existing
// locateAndFocusComposer call only to persist bounded evidence if that call
// fails before control returns to the transport's clear/input/submit sequence.
//
// The original exception is always re-thrown unchanged. No automatic retry,
// navigation, tab close, prompt insertion, submit, raw DOM/error export, cookie,
// auth, or response-body access is introduced.

const PR88_INSTANT_FAILURE_FORENSICS_SCHEMA_VERSION = 1;
const PR88_INSTANT_FAILURE_FORENSICS_STORAGE_KEY =
  "browserAuthorityLastInstantFailureForensicsV1";

const _pr88FailurePriorExecuteNativeTurn = executeNativeTurn;
const _pr88FailurePriorLocateAndFocusComposer = locateAndFocusComposer;

function _pr88FailureLeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

function _pr88FailureCode(error) {
  const message = String(error?.message || error || "");
  if (message.startsWith("PR8_8_INSTANT_SELECTION_INITIAL_MODE_NOT_PROVEN")) {
    return "INITIAL_MODE_NOT_PROVEN";
  }
  if (message.startsWith("PR8_8_INSTANT_SELECTION_PICKER_NOT_FOUND:")) {
    return "PICKER_NOT_FOUND";
  }
  if (message.startsWith("PR8_8_INSTANT_SELECTION_OPTION_NOT_FOUND:")) {
    return "OPTION_NOT_FOUND";
  }
  if (message.startsWith("PR8_8_INSTANT_SELECTION_DID_NOT_SETTLE_TO_INSTANT")) {
    return "DID_NOT_SETTLE_TO_INSTANT";
  }
  return "LOCATE_OR_SELECTION_OTHER";
}

function _pr88FailureReason(error) {
  const message = String(error?.message || error || "");
  const allowed = new Set([
    "composer_missing",
    "picker_missing",
    "point_probe_failed",
    "instant_option_missing",
    "instant_option_ambiguous",
    "instant_option_timeout",
    "unknown"
  ]);
  const index = message.indexOf(":");
  if (index < 0) return null;
  const reason = message.slice(index + 1).trim();
  return allowed.has(reason) ? reason : "unknown";
}

function _pr88FailureSelectionPublic(context) {
  let source = {};
  try {
    if (typeof _pr88SelectionRecord === "function") {
      const record = _pr88SelectionRecord(context);
      source = record && typeof record === "object" ? record : {};
    }
  } catch {
    source = {};
  }

  return {
    requestedModelMode: source.requestedModelMode || "INSTANT",
    selectedModeBeforeSelection: source.selectedModeBeforeSelection || null,
    selectedModeBeforeSelectionProven:
      source.selectedModeBeforeSelectionProven === true,
    selectedModeBeforeSelectionProofKind:
      source.selectedModeBeforeSelectionProofKind || null,
    selectedModeBeforeSelectionCandidateCount:
      Number.isInteger(source.selectedModeBeforeSelectionCandidateCount)
        ? source.selectedModeBeforeSelectionCandidateCount
        : 0,
    selectionPerformed: source.selectionPerformed === true,
    selectionElapsedMs:
      Number.isInteger(source.selectionElapsedMs) ? source.selectionElapsedMs : null,
    selectionMutationElapsedMs:
      Number.isInteger(source.selectionMutationElapsedMs)
        ? source.selectionMutationElapsedMs
        : null,
    pickerModeBeforeClick: source.pickerModeBeforeClick || null,
    pickerCandidateCount:
      Number.isInteger(source.pickerCandidateCount) ? source.pickerCandidateCount : 0,
    pickerNearestDistancePx:
      Number.isInteger(source.pickerNearestDistancePx)
        ? source.pickerNearestDistancePx
        : null,
    instantOptionCandidateCount:
      Number.isInteger(source.instantOptionCandidateCount)
        ? source.instantOptionCandidateCount
        : 0,
    selectedModeAfterSelection: source.selectedModeAfterSelection || null,
    selectedModeAfterSelectionProven:
      source.selectedModeAfterSelectionProven === true,
    selectedModeAfterSelectionProofKind:
      source.selectedModeAfterSelectionProofKind || null,
    selectionComplete: source.selectionComplete === true,
    conversationWriteBoundaryObserved:
      source.conversationWriteBoundaryObserved === true,
    unexpectedConversationWriteBeforeSelectionComplete:
      source.unexpectedConversationWriteBeforeSelectionComplete === true,
    conversationWriteCountDuringSelection:
      Number.isInteger(source.conversationWriteCountDuringSelection)
        ? source.conversationWriteCountDuringSelection
        : 0,
    networkRequestCountDuringSelection:
      Number.isInteger(source.networkRequestCountDuringSelection)
        ? source.networkRequestCountDuringSelection
        : 0,
    chatgptRequestCountDuringSelection:
      Number.isInteger(source.chatgptRequestCountDuringSelection)
        ? source.chatgptRequestCountDuringSelection
        : 0,
    chatgptMutatingNonConversationRequestCount:
      Number.isInteger(source.chatgptMutatingNonConversationRequestCount)
        ? source.chatgptMutatingNonConversationRequestCount
        : 0,
    settingLikeMutationObserved: source.settingLikeMutationObserved === true,
    requestClasses: Array.isArray(source.requestClasses)
      ? source.requestClasses.filter((item) => typeof item === "string").slice(0, 16)
      : [],
    modelSelectionMaterializationStatus:
      source.modelSelectionMaterializationStatus || "INCONCLUSIVE"
  };
}

async function _pr88FailurePersist(error, context) {
  const leaseId = _pr88FailureLeaseId(context?.leaseId);
  if (leaseId === null) return false;

  const record = {
    schemaVersion: PR88_INSTANT_FAILURE_FORENSICS_SCHEMA_VERSION,
    leaseId,
    failureCaptured: true,
    failureCode: _pr88FailureCode(error),
    failureReason: _pr88FailureReason(error),
    preInputFailureBoundaryProven: true,
    promptInsertionReached: false,
    submitReached: false,
    rawErrorExported: false,
    selection: _pr88FailureSelectionPublic(context)
  };

  await chrome.storage.local.set({
    [PR88_INSTANT_FAILURE_FORENSICS_STORAGE_KEY]: record
  });
  return true;
}

locateAndFocusComposer = async function _locateAndFocusComposerWithInstantFailureEvidence(debuggee) {
  try {
    return await _pr88FailurePriorLocateAndFocusComposer(debuggee);
  } catch (error) {
    let context = null;
    try {
      if (typeof _pr88SelectionContext !== "undefined") {
        context = _pr88SelectionContext;
      }
    } catch {
      context = null;
    }
    if (context !== null && _pr88FailureLeaseId(context?.leaseId) !== null) {
      try {
        await _pr88FailurePersist(error, context);
      } catch {
        // Evidence persistence must never replace or mask the original failure.
      }
    }
    throw error;
  }
};

function _pr88FailureQueryConflict(message) {
  return (
    message?.text != null ||
    message?.conversationId != null ||
    message?.browserAuthorityLeaseId != null ||
    message?.canonicalCompleted === true ||
    message?.canonicalCompletedAtMs != null
  );
}

async function _pr88FailureStoredRecord() {
  const stored = await chrome.storage.local.get(
    PR88_INSTANT_FAILURE_FORENSICS_STORAGE_KEY
  );
  const value = stored?.[PR88_INSTANT_FAILURE_FORENSICS_STORAGE_KEY];
  return value && typeof value === "object" ? value : null;
}

async function _pr88FailureRecord(message) {
  if (_pr88FailureQueryConflict(message)) {
    throw new Error("PR8_8_INSTANT_FAILURE_FORENSICS_RECORD_FLAG_CONFLICT");
  }
  const expectedLeaseId = _pr88FailureLeaseId(
    message?.expectedBrowserAuthorityLeaseId
  );
  if (expectedLeaseId === null) {
    throw new Error("PR8_8_INSTANT_FAILURE_FORENSICS_EXPECTED_LEASE_REQUIRED");
  }
  const record = await _pr88FailureStoredRecord();
  if (record === null) {
    throw new Error("PR8_8_INSTANT_FAILURE_FORENSICS_RECORD_NOT_AVAILABLE");
  }
  if (_pr88FailureLeaseId(record.leaseId) !== expectedLeaseId) {
    throw new Error("PR8_8_INSTANT_FAILURE_FORENSICS_LEASE_MISMATCH");
  }

  return {
    probeContext: "instant_failure_forensics_record",
    readOnly: true,
    zeroProductWrites: true,
    automaticRetry: false,
    instantFailureForensicsSupported: true,
    instantFailureForensicsSchemaVersion:
      PR88_INSTANT_FAILURE_FORENSICS_SCHEMA_VERSION,
    failureCaptured: record.failureCaptured === true,
    failureCode: record.failureCode || "UNKNOWN",
    failureReason: record.failureReason || null,
    preInputFailureBoundaryProven:
      record.preInputFailureBoundaryProven === true,
    promptInsertionReached: record.promptInsertionReached === true,
    submitReached: record.submitReached === true,
    rawErrorExported: record.rawErrorExported === true,
    leaseIdExported: false,
    selection:
      record.selection && typeof record.selection === "object"
        ? record.selection
        : {}
  };
}

executeNativeTurn = async function _executeNativeTurnWithInstantFailureForensics(message) {
  if (message?.characterizeInstantFailureForensicsSupport === true) {
    if (_pr88FailureQueryConflict(message) || message?.expectedBrowserAuthorityLeaseId != null) {
      throw new Error("PR8_8_INSTANT_FAILURE_FORENSICS_SUPPORT_FLAG_CONFLICT");
    }
    return {
      probeContext: "instant_failure_forensics_support",
      readOnly: true,
      zeroProductWrites: true,
      automaticRetry: false,
      instantFailureForensicsSupported: true,
      instantFailureForensicsSchemaVersion:
        PR88_INSTANT_FAILURE_FORENSICS_SCHEMA_VERSION,
      failureRecordPersistenceSupported: true,
      preInputFailureBoundarySupported: true,
      retainedRouteForensicsCompositionSupported: true,
      retainedPickerForensicsCompositionSupported: true,
      rawErrorRedactionSupported: true,
      leaseIdExported: false
    };
  }

  if (message?.characterizeInstantFailureForensicsRecord === true) {
    return _pr88FailureRecord(message);
  }

  return _pr88FailurePriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_instant_failure_forensics_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_popup_subtree_forensics_pr8_8.js */
// PR8.8 in-failure open-picker popup-subtree evidence capture.
//
// Loaded after service_worker_instant_failure_forensics_pr8_8.js. This layer
// adds no product mutation. It catches the same locate/selection failure after
// the prior failure layer has persisted its bounded record, captures only the
// currently-open popup subtree through the debugger that is already attached by
// the ordinary write path, persists bounded topology keyed by the same lease,
// and rethrows the original exception object unchanged.

const PR88_INSTANT_POPUP_SUBTREE_SCHEMA_VERSION = 1;
const PR88_INSTANT_POPUP_SUBTREE_STORAGE_KEY =
  "browserAuthorityLastInstantPopupSubtreeForensicsV1";
const PR88_INSTANT_POPUP_MAX_SURFACES = 8;
const PR88_INSTANT_POPUP_MAX_MODE_LABELS = 16;
const PR88_INSTANT_POPUP_MAX_ACTIONABLES = 32;

const _pr88PopupPriorExecuteNativeTurn = executeNativeTurn;
const _pr88PopupPriorLocateAndFocusComposer = locateAndFocusComposer;

function _pr88PopupLeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

function _pr88PopupModes(value) {
  try {
    if (typeof _pr88ForensicsModes === "function") {
      return _pr88ForensicsModes(value);
    }
  } catch {}
  const text = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s_\-]+/g, " ")
    : "";
  if (!text) return [];
  const out = [];
  if (/(^|\b)(instant|мгновенно)(\b|$)/.test(text)) out.push("INSTANT");
  if (/(^|\b)(medium|средний)(\b|$)/.test(text) || text.includes("thinking standard")) out.push("MEDIUM");
  if (text.includes("extra high") || text.includes("очень высокий") || text.includes("thinking heavy")) out.push("EXTRA_HIGH");
  else if (/(^|\b)(high|высокий)(\b|$)/.test(text) || text.includes("thinking extended")) out.push("HIGH");
  if (text.includes("pro standard")) out.push("PRO_STANDARD");
  if (text.includes("pro extended")) out.push("PRO_EXTENDED");
  if (text === "thinking") out.push("REASONING_OTHER");
  if (text === "pro") out.push("PRO_OTHER");
  return Array.from(new Set(out));
}

function _pr88PopupRoute(urlValue) {
  const url = typeof urlValue === "string" ? urlValue : "";
  const observedConversationId = (() => {
    try {
      const value = conversationIdFromUrl(url);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  })();
  let pathname = "/";
  try { pathname = new URL(url).pathname || "/"; } catch {}
  let routeKind = "OTHER_CHATGPT";
  if (observedConversationId !== null) routeKind = "CONVERSATION";
  else if (pathname === "/" || pathname === "") routeKind = "ROOT";
  return { routeKind, observedConversationId };
}

function _pr88PopupDomExpression() {
  return `(() => {
    const MAX_SURFACES = ${PR88_INSTANT_POPUP_MAX_SURFACES};
    const MAX_MODE_LABELS = ${PR88_INSTANT_POPUP_MAX_MODE_LABELS};
    const MAX_ACTIONABLES = ${PR88_INSTANT_POPUP_MAX_ACTIONABLES};
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    const modes = (value) => {
      const text = normalize(value);
      if (!text) return [];
      const out = [];
      if (/(^|\\b)(instant|мгновенно)(\\b|$)/.test(text)) out.push('INSTANT');
      if (/(^|\\b)(medium|средний)(\\b|$)/.test(text) || text.includes('thinking standard')) out.push('MEDIUM');
      if (text.includes('extra high') || text.includes('очень высокий') || text.includes('thinking heavy')) out.push('EXTRA_HIGH');
      else if (/(^|\\b)(high|высокий)(\\b|$)/.test(text) || text.includes('thinking extended')) out.push('HIGH');
      if (text.includes('pro standard')) out.push('PRO_STANDARD');
      if (text.includes('pro extended')) out.push('PRO_EXTENDED');
      if (text === 'thinking') out.push('REASONING_OTHER');
      if (text === 'pro') out.push('PRO_OTHER');
      return Array.from(new Set(out));
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height)};
    };
    const ownText = (el) => Array.from(el.childNodes || [])
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent || '')
      .join(' ');
    const directFields = (el) => [
      ['OWN_TEXT', ownText(el)],
      ['ARIA_LABEL', el.getAttribute('aria-label')],
      ['TITLE', el.getAttribute('title')],
      ['TEST_ID', el.getAttribute('data-testid')]
    ];
    const modeRecord = (el) => {
      for (const [source, value] of directFields(el)) {
        const found = modes(value);
        if (found.length === 1) return {mode: found[0], evidence: source};
      }
      const subtree = Array.from(new Set([
        ...modes(typeof el.innerText === 'string' ? el.innerText.slice(0, 320) : ''),
        ...modes(el.textContent ? String(el.textContent).slice(0, 320) : '')
      ]));
      if (subtree.length === 1) return {mode: subtree[0], evidence: 'SUBTREE_TEXT'};
      return {mode: null, evidence: 'NONE'};
    };
    const directModes = (el) => Array.from(new Set(directFields(el).flatMap(([, value]) => modes(value))));
    const subtreeModes = (el) => Array.from(new Set([
      ...modes(typeof el.innerText === 'string' ? el.innerText.slice(0, 320) : ''),
      ...modes(el.textContent ? String(el.textContent).slice(0, 320) : '')
    ]));
    const actionableRoles = new Set(['menuitem','menuitemradio','menuitemcheckbox','option','radio','button','tab','treeitem']);
    const isActionable = (el) => el instanceof Element && (el.tagName === 'BUTTON' || actionableRoles.has(el.getAttribute('role') || ''));
    const actionableRecord = (el) => {
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        role: el.getAttribute('role') || null,
        directModes: directModes(el),
        subtreeModes: subtreeModes(el),
        ariaChecked: el.getAttribute('aria-checked'),
        ariaSelected: el.getAttribute('aria-selected'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaHaspopup: el.getAttribute('aria-haspopup'),
        dataState: ['open','closed','selected','checked','unchecked','active','inactive','on','off'].includes(normalize(el.getAttribute('data-state'))) ? normalize(el.getAttribute('data-state')) : null,
        disabled: Boolean(el.disabled === true || el.getAttribute('aria-disabled') === 'true'),
        pointerEventsEnabled: style.pointerEvents !== 'none',
        rect: rect(el),
        childElementCount: el.children ? el.children.length : 0
      };
    };
    const nearestActionableAncestor = (el, surface) => {
      let current = el;
      let hops = 0;
      while (current && hops <= 8) {
        if (isActionable(current)) return {element: current, hops};
        if (current === surface) break;
        current = current.parentElement;
        hops += 1;
      }
      return {element: null, hops: null};
    };
    const allSurfaces = Array.from(document.querySelectorAll('[role="menu"],[role="listbox"],[role="dialog"],[role="radiogroup"],[role="group"]')).filter(visible);
    const priority = {menu: 0, listbox: 1, radiogroup: 2, dialog: 3, group: 4};
    const surfaceRecords = [];
    for (const surface of allSurfaces) {
      const descendants = Array.from(surface.querySelectorAll('*')).filter(visible);
      const rawModes = descendants.map((el) => ({el, rec: modeRecord(el)})).filter((item) => item.rec.mode);
      const minimalModes = rawModes.filter((item) => !rawModes.some((other) => other !== item && item.el.contains(other.el) && other.rec.mode === item.rec.mode));
      if (!minimalModes.length) continue;
      const actionables = descendants.filter(isActionable);
      const role = surface.getAttribute('role') || null;
      surfaceRecords.push({surface, role, descendants, minimalModes, actionables, knownModeCount: minimalModes.length, actionCount: actionables.length});
    }
    surfaceRecords.sort((a, b) => {
      const pa = Object.prototype.hasOwnProperty.call(priority, a.role) ? priority[a.role] : 9;
      const pb = Object.prototype.hasOwnProperty.call(priority, b.role) ? priority[b.role] : 9;
      if (pa !== pb) return pa - pb;
      if (a.knownModeCount !== b.knownModeCount) return b.knownModeCount - a.knownModeCount;
      const ar = a.surface.getBoundingClientRect();
      const br = b.surface.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    });
    const candidateSurfaces = surfaceRecords.slice(0, MAX_SURFACES).map((item) => ({
      tag: item.surface.tagName,
      role: item.role,
      knownModeDescendantCount: item.knownModeCount,
      actionableDescendantCount: item.actionCount,
      rect: rect(item.surface)
    }));
    const selected = surfaceRecords.length ? surfaceRecords[0] : null;
    if (!selected) {
      return {
        surfaceFound: false,
        surfaceSelectionStatus: 'NO_MODE_POPUP_FOUND',
        candidateSurfaceCount: surfaceRecords.length,
        candidateSurfaces,
        candidateSurfacesTruncated: surfaceRecords.length > MAX_SURFACES,
        recognizedModes: [],
        popupSubtreeVisibleElementCount: 0,
        modeLabelCount: 0,
        modeLabels: [],
        modeLabelsTruncated: false,
        actionableDescendantCount: 0,
        actionableDescendants: [],
        actionableDescendantsTruncated: false,
        candidateCapDealiased: true,
        globalCandidateCapUsed: false
      };
    }
    const modeLabelsAll = selected.minimalModes.map((item) => {
      const nearest = nearestActionableAncestor(item.el, selected.surface);
      return {
        mode: item.rec.mode,
        evidence: item.rec.evidence,
        tag: item.el.tagName,
        role: item.el.getAttribute('role') || null,
        rect: rect(item.el),
        actionableAncestorFound: Boolean(nearest.element),
        actionableAncestorHops: nearest.hops,
        actionableAncestor: actionableRecord(nearest.element)
      };
    });
    const actionableAll = selected.actionables.map((el) => {
      const descendantModes = Array.from(new Set(
        selected.minimalModes.filter((item) => el.contains(item.el)).map((item) => item.rec.mode)
      )).sort();
      return {
        ...actionableRecord(el),
        modeBearingDescendantModes: descendantModes,
        modeBearingDescendantCount: descendantModes.length
      };
    });
    const recognizedModes = Array.from(new Set(modeLabelsAll.map((item) => item.mode))).sort();
    return {
      surfaceFound: true,
      surfaceSelectionStatus: 'SELECTED_MODE_BEARING_POPUP',
      candidateSurfaceCount: surfaceRecords.length,
      candidateSurfaces,
      candidateSurfacesTruncated: surfaceRecords.length > MAX_SURFACES,
      selectedSurface: {
        tag: selected.surface.tagName,
        role: selected.role,
        knownModeDescendantCount: selected.knownModeCount,
        actionableDescendantCount: selected.actionCount,
        rect: rect(selected.surface)
      },
      recognizedModes,
      popupSubtreeVisibleElementCount: selected.descendants.length,
      modeLabelCount: modeLabelsAll.length,
      modeLabels: modeLabelsAll.slice(0, MAX_MODE_LABELS),
      modeLabelsTruncated: modeLabelsAll.length > MAX_MODE_LABELS,
      actionableDescendantCount: actionableAll.length,
      actionableDescendants: actionableAll.slice(0, MAX_ACTIONABLES),
      actionableDescendantsTruncated: actionableAll.length > MAX_ACTIONABLES,
      candidateCapDealiased: true,
      globalCandidateCapUsed: false
    };
  })()`;
}

async function _pr88PopupCapture(debuggee) {
  const tabId = Number.isInteger(debuggee?.tabId) ? debuggee.tabId : null;
  let route = { routeKind: "UNKNOWN", observedConversationId: null };
  if (tabId !== null) {
    try {
      const tab = await chrome.tabs.get(tabId);
      route = _pr88PopupRoute(tab?.url || "");
    } catch {}
  }
  try {
    const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: _pr88PopupDomExpression(),
      returnByValue: true,
      awaitPromise: true
    });
    const topology = result?.result?.value;
    const safe = topology && typeof topology === "object" ? topology : {};
    return {
      captureStatus: safe.surfaceFound === true ? "POPUP_SUBTREE_CAPTURED" : "NO_MODE_POPUP_FOUND",
      captureTabId: tabId,
      routeKind: route.routeKind,
      observedConversationId: route.observedConversationId,
      rawUrlExported: false,
      rawTextExported: false,
      rawHtmlExported: false,
      candidateCapDealiased: safe.candidateCapDealiased === true,
      globalCandidateCapUsed: safe.globalCandidateCapUsed === true,
      topology: safe
    };
  } catch {
    return {
      captureStatus: "CAPTURE_FAILED",
      captureTabId: tabId,
      routeKind: route.routeKind,
      observedConversationId: route.observedConversationId,
      rawUrlExported: false,
      rawTextExported: false,
      rawHtmlExported: false,
      candidateCapDealiased: false,
      globalCandidateCapUsed: false,
      topology: {}
    };
  }
}

async function _pr88PopupPersist(error, context, debuggee) {
  const leaseId = _pr88PopupLeaseId(context?.leaseId);
  if (leaseId === null) return false;
  const capture = await _pr88PopupCapture(debuggee);
  const failureCode = (() => {
    try { return typeof _pr88FailureCode === "function" ? _pr88FailureCode(error) : "UNKNOWN"; } catch { return "UNKNOWN"; }
  })();
  const failureReason = (() => {
    try { return typeof _pr88FailureReason === "function" ? _pr88FailureReason(error) : null; } catch { return null; }
  })();
  await chrome.storage.local.set({
    [PR88_INSTANT_POPUP_SUBTREE_STORAGE_KEY]: {
      schemaVersion: PR88_INSTANT_POPUP_SUBTREE_SCHEMA_VERSION,
      leaseId,
      capturedAtFailure: true,
      failureCode,
      failureReason,
      ...capture
    }
  });
  return true;
}

locateAndFocusComposer = async function _locateAndFocusComposerWithInstantPopupSubtreeEvidence(debuggee) {
  try {
    return await _pr88PopupPriorLocateAndFocusComposer(debuggee);
  } catch (error) {
    let context = null;
    try {
      if (typeof _pr88SelectionContext !== "undefined") context = _pr88SelectionContext;
    } catch {}
    if (context !== null && _pr88PopupLeaseId(context?.leaseId) !== null) {
      try {
        await _pr88PopupPersist(error, context, debuggee);
      } catch {
        // Popup evidence must never replace or mask the original failure.
      }
    }
    throw error;
  }
};

async function _pr88PopupStoredRecord() {
  try {
    const stored = await chrome.storage.local.get(PR88_INSTANT_POPUP_SUBTREE_STORAGE_KEY);
    const value = stored?.[PR88_INSTANT_POPUP_SUBTREE_STORAGE_KEY];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function _pr88PopupPublicRecord(record) {
  if (!record || typeof record !== "object") return null;
  return {
    schemaVersion: Number.isInteger(record.schemaVersion) ? record.schemaVersion : null,
    capturedAtFailure: record.capturedAtFailure === true,
    failureCode: typeof record.failureCode === "string" ? record.failureCode : "UNKNOWN",
    failureReason: typeof record.failureReason === "string" ? record.failureReason : null,
    captureStatus: typeof record.captureStatus === "string" ? record.captureStatus : "UNKNOWN",
    captureTabId: Number.isInteger(record.captureTabId) ? record.captureTabId : null,
    routeKind: typeof record.routeKind === "string" ? record.routeKind : null,
    observedConversationId: typeof record.observedConversationId === "string" ? record.observedConversationId : null,
    rawUrlExported: false,
    rawTextExported: false,
    rawHtmlExported: false,
    leaseIdExported: false,
    zeroProductWrites: true,
    automaticRetry: false,
    candidateCapDealiased: record.candidateCapDealiased === true,
    globalCandidateCapUsed: record.globalCandidateCapUsed === true,
    topology: record.topology && typeof record.topology === "object" ? record.topology : {}
  };
}

executeNativeTurn = async function _executeNativeTurnWithInstantPopupSubtreeForensics(message) {
  if (message?.characterizeInstantFailureForensicsSupport === true) {
    const prior = await _pr88PopupPriorExecuteNativeTurn(message);
    return {
      ...prior,
      popupSubtreeCaptureSupported: true,
      popupLocalTraversalSupported: true,
      modeLabelActionableAncestorMappingSupported: true,
      candidateCapDealiasingSupported: true,
      popupEvidencePersistenceSupported: true,
      rawPopupTextRedactionSupported: true
    };
  }

  if (message?.characterizeInstantFailureForensicsRecord === true) {
    const prior = await _pr88PopupPriorExecuteNativeTurn(message);
    const expectedLeaseId = _pr88PopupLeaseId(message?.expectedBrowserAuthorityLeaseId);
    const stored = await _pr88PopupStoredRecord();
    const popupAvailable = (
      expectedLeaseId !== null &&
      stored !== null &&
      _pr88PopupLeaseId(stored.leaseId) === expectedLeaseId
    );
    return {
      ...prior,
      popupSubtreeRecordAvailable: popupAvailable,
      popupSubtree: popupAvailable ? _pr88PopupPublicRecord(stored) : null
    };
  }

  return _pr88PopupPriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_instant_popup_subtree_forensics_pr8_8.js */


/* BEGIN legacy source: service_worker_picker_trigger_identity_pr8_8.js */
// PR8.8 model-picker trigger identity, click-actuation, and per-poll menu timeline.
//
// Loaded after the in-failure popup-subtree layer. This layer adds no new product
// mutation and does not broaden the Instant selector. It observes the existing
// picker point/click and existing 100 ms Instant-option polling loop, persists
// bounded evidence under the same private Browser Authority lease, and rethrows
// the exact original error object unchanged.
//
// No prompt/response text, raw DOM/HTML, raw URL, cookies, auth material, or
// response bodies are exported. No retry, navigation, tab create/close, debugger
// attach, prompt insertion, or submit is introduced.

const PR88_PICKER_TRIGGER_TIMELINE_SCHEMA_VERSION = 1;
const PR88_PICKER_TRIGGER_TIMELINE_STORAGE_KEY =
  "browserAuthorityLastPickerTriggerTimelineV1";
const PR88_PICKER_TRIGGER_MAX_SAMPLES = 96;

const _pr88TriggerPriorExecuteNativeTurn = executeNativeTurn;
const _pr88TriggerPriorSelectionPoint = _pr88SelectionPoint;
const _pr88TriggerPriorRawClick = _pr88SelectionRawClick;
const _pr88TriggerPriorLocateAndFocusComposer = locateAndFocusComposer;

let _pr88TriggerTimelineContext = null;

function _pr88TriggerLeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

function _pr88TriggerSafeInt(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(Number(value))) : null;
}

function _pr88TriggerSamePoint(a, b) {
  return (
    Number.isFinite(a?.x) &&
    Number.isFinite(a?.y) &&
    Number.isFinite(b?.x) &&
    Number.isFinite(b?.y) &&
    Math.abs(Number(a.x) - Number(b.x)) <= 1 &&
    Math.abs(Number(a.y) - Number(b.y)) <= 1
  );
}

function _pr88TriggerIdentityExpression(point, pickerMode) {
  const safePoint = {
    x: Number.isFinite(point?.x) ? Number(point.x) : null,
    y: Number.isFinite(point?.y) ? Number(point.y) : null
  };
  const safeMode = typeof pickerMode === "string" ? pickerMode : null;
  return `(() => {
    const point = ${JSON.stringify(safePoint)};
    const expectedMode = ${JSON.stringify(safeMode)};
    const normalize = (value) =>
      String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    const modes = (value) => {
      const text = normalize(value);
      if (!text) return [];
      const out = [];
      // Locale coverage: the composer's effort control renders as the Chinese single character
      // "高" on this deployment. \b does not separate CJK from surrounding text, so the Chinese
      // labels are matched with includes()/equality rather than the word-boundary regex.
      if (/(^|\\b)(instant|мгновенно)(\\b|$)/.test(text) || text.includes('即时')) out.push('INSTANT');
      if (/(^|\\b)(medium|средний)(\\b|$)/.test(text) || text === '中' || text.includes('thinking standard')) out.push('MEDIUM');
      if (text.includes('extra high') || text.includes('极高') || text.includes('очень высокий') || text.includes('thinking heavy')) out.push('EXTRA_HIGH');
      else if (/(^|\\b)(high|высокий)(\\b|$)/.test(text) || text === '高' || text.includes('thinking extended')) out.push('HIGH');
      if (text.includes('pro standard')) out.push('PRO_STANDARD');
      if (text.includes('pro extended')) out.push('PRO_EXTENDED');
      if (text === 'thinking') out.push('REASONING_OTHER');
      if (text === 'pro') out.push('PRO_OTHER');
      return Array.from(new Set(out));
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height)};
    };
    const center = (el) => {
      const r = el.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    };
    const directModes = (el) =>
      Array.from(new Set([
        el.innerText,
        el.getAttribute('aria-label'),
        el.getAttribute('title')
      ].flatMap(modes)));
    const subtreeModes = (el) =>
      Array.from(new Set([
        ...modes(typeof el.innerText === 'string' ? el.innerText.slice(0, 320) : ''),
        ...modes(el.textContent ? String(el.textContent).slice(0, 320) : '')
      ]));
    const boundedState = (value) => {
      const text = normalize(value);
      return ['open','closed','selected','checked','unchecked','active','inactive','on','off'].includes(text) ? text : null;
    };
    const controlRecord = (el) => {
      if (!(el instanceof Element)) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        role: el.getAttribute('role') || null,
        directModes: directModes(el),
        subtreeModes: subtreeModes(el),
        ariaHaspopup: el.getAttribute('aria-haspopup') || null,
        ariaExpanded: el.getAttribute('aria-expanded') || null,
        dataState: boundedState(el.getAttribute('data-state')),
        disabled: Boolean(el.disabled === true || el.getAttribute('aria-disabled') === 'true'),
        pointerEventsEnabled: style.pointerEvents !== 'none',
        childElementCount: el.children ? el.children.length : 0,
        rect: rect(el)
      };
    };

    let candidate = null;
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
      let best = null;
      for (const control of Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)) {
        const found = directModes(control);
        if (found.length !== 1) continue;
        if (expectedMode && found[0] !== expectedMode) continue;
        const c = center(control);
        const distance = Math.hypot(c.x - point.x, c.y - point.y);
        if (best === null || distance < best.distance) best = {element: control, distance};
      }
      if (best && best.distance <= 24) candidate = best.element;
    }

    let trigger = null;
    let triggerHops = null;
    if (candidate) {
      let current = candidate;
      let hops = 0;
      while (current && hops <= 8) {
        const popup = normalize(current.getAttribute('aria-haspopup'));
        const expanded = current.getAttribute('aria-expanded');
        const state = boundedState(current.getAttribute('data-state'));
        if (popup === 'menu' || popup === 'listbox' || expanded !== null || state === 'open' || state === 'closed') {
          trigger = current;
          triggerHops = hops;
          break;
        }
        current = current.parentElement;
        hops += 1;
      }
    }

    const genericSurfaces = Array.from(document.querySelectorAll(
      '[role="menu"],[role="listbox"],[role="dialog"],[role="radiogroup"],[role="group"],[role="tree"]'
    )).filter(visible);
    const genericMenuSurfaceCount = genericSurfaces.filter((el) => el.getAttribute('role') === 'menu').length;
    const candidateRecord = controlRecord(candidate);
    const triggerRecord = controlRecord(trigger);
    const triggerOpenSignal = Boolean(
      triggerRecord &&
      (triggerRecord.ariaExpanded === 'true' || triggerRecord.dataState === 'open')
    );
    return {
      pickerCandidateFound: candidateRecord !== null,
      pickerCandidate: candidateRecord,
      nearestMenuTriggerFound: triggerRecord !== null,
      nearestMenuTriggerHops: triggerHops,
      nearestMenuTrigger: triggerRecord,
      triggerOpenSignal,
      genericPopupSurfaceCount: genericSurfaces.length,
      genericMenuSurfaceCount
    };
  })()`;
}


async function _pr88TriggerEvaluate(debuggee, expression) {
  try {
    const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    const value = result?.result?.value;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function _pr88TriggerIdentitySnapshot(debuggee, context) {
  return _pr88TriggerEvaluate(
    debuggee,
    _pr88TriggerIdentityExpression(context?.pickerPoint, context?.pickerMode)
  );
}

async function _pr88TriggerModePopupSnapshot(debuggee) {
  try {
    if (typeof _pr88PopupDomExpression === "function") {
      return await _pr88TriggerEvaluate(debuggee, _pr88PopupDomExpression());
    }
  } catch {}
  return {};
}

function _pr88TriggerControlState(record) {
  const source = record && typeof record === "object" ? record : {};
  return {
    ariaExpanded:
      typeof source.ariaExpanded === "string" ? source.ariaExpanded : null,
    dataState: typeof source.dataState === "string" ? source.dataState : null,
    ariaHaspopup:
      typeof source.ariaHaspopup === "string" ? source.ariaHaspopup : null
  };
}

function _pr88TriggerStateChanged(a, b) {
  return Boolean(
    a &&
    b &&
    (
      a.ariaExpanded !== b.ariaExpanded ||
      a.dataState !== b.dataState ||
      a.ariaHaspopup !== b.ariaHaspopup
    )
  );
}

function _pr88TriggerEnsureContext(point, pickerMode) {
  let selection = null;
  try {
    if (typeof _pr88SelectionContext !== "undefined") {
      selection = _pr88SelectionContext;
    }
  } catch {}
  const leaseId = _pr88TriggerLeaseId(selection?.leaseId);
  if (leaseId === null) return null;
  if (
    _pr88TriggerTimelineContext === null ||
    _pr88TriggerTimelineContext.leaseId !== leaseId
  ) {
    _pr88TriggerTimelineContext = {
      leaseId,
      startedAt: performance.now(),
      pickerPoint: {
        x: Number.isFinite(point?.x) ? Number(point.x) : null,
        y: Number.isFinite(point?.y) ? Number(point.y) : null
      },
      pickerMode: typeof pickerMode === "string" ? pickerMode : null,
      awaitingPickerClick: true,
      clickDispatchCompleted: false,
      pickerClickElapsedMs: null,
      pollSampleCount: 0,
      samples: [],
      samplesTruncated: false,
      preClickState: null,
      bestSeen: {
        recognizedModes: new Set(),
        maxModeBearingPopupSurfaceCount: 0,
        maxKnownModeDescendantCount: 0,
        firstModeBearingPopupSeenMs: null,
        lastModeBearingPopupSeenMs: null,
        firstTriggerOpenSignalMs: null,
        triggerStateTransitionObserved: false,
        falseOpenGenericOnlyObserved: false,
        bestSelectedSurface: null
      }
    };
  }
  return _pr88TriggerTimelineContext;
}

async function _pr88TriggerAppendSample(
  debuggee,
  phase,
  optionResult = null,
  pollIndex = null
) {
  const context = _pr88TriggerTimelineContext;
  if (context === null) return null;

  const identity = await _pr88TriggerIdentitySnapshot(debuggee, context);
  const popup = await _pr88TriggerModePopupSnapshot(debuggee);
  const elapsedMs = Math.max(
    0,
    Math.round(performance.now() - context.startedAt)
  );

  const candidateState = _pr88TriggerControlState(identity?.pickerCandidate);
  const triggerState = _pr88TriggerControlState(identity?.nearestMenuTrigger);
  const effectiveState =
    identity?.nearestMenuTriggerFound === true ? triggerState : candidateState;
  if (phase === "PRE_CLICK") {
    context.preClickState = effectiveState;
  } else if (
    context.preClickState !== null &&
    _pr88TriggerStateChanged(context.preClickState, effectiveState)
  ) {
    context.bestSeen.triggerStateTransitionObserved = true;
  }

  const modeBearingCount = Number.isInteger(popup?.candidateSurfaceCount)
    ? popup.candidateSurfaceCount
    : 0;
  const selectedSurface =
    popup?.selectedSurface && typeof popup.selectedSurface === "object"
      ? popup.selectedSurface
      : null;
  const knownCount = Number.isInteger(selectedSurface?.knownModeDescendantCount)
    ? selectedSurface.knownModeDescendantCount
    : 0;
  const recognizedModes = Array.isArray(popup?.recognizedModes)
    ? popup.recognizedModes.filter((item) => typeof item === "string").slice(0, 16)
    : [];
  const genericCount = Number.isInteger(identity?.genericPopupSurfaceCount)
    ? identity.genericPopupSurfaceCount
    : 0;
  const falseOpenGenericOnly = genericCount > 0 && modeBearingCount === 0;

  if (modeBearingCount > 0) {
    if (context.bestSeen.firstModeBearingPopupSeenMs === null) {
      context.bestSeen.firstModeBearingPopupSeenMs = elapsedMs;
    }
    context.bestSeen.lastModeBearingPopupSeenMs = elapsedMs;
  }
  if (
    identity?.triggerOpenSignal === true &&
    context.bestSeen.firstTriggerOpenSignalMs === null
  ) {
    context.bestSeen.firstTriggerOpenSignalMs = elapsedMs;
  }
  if (falseOpenGenericOnly) {
    context.bestSeen.falseOpenGenericOnlyObserved = true;
  }
  context.bestSeen.maxModeBearingPopupSurfaceCount = Math.max(
    context.bestSeen.maxModeBearingPopupSurfaceCount,
    modeBearingCount
  );
  context.bestSeen.maxKnownModeDescendantCount = Math.max(
    context.bestSeen.maxKnownModeDescendantCount,
    knownCount
  );
  if (
    selectedSurface &&
    (
      context.bestSeen.bestSelectedSurface === null ||
      knownCount >
        (context.bestSeen.bestSelectedSurface.knownModeDescendantCount || 0)
    )
  ) {
    context.bestSeen.bestSelectedSurface = selectedSurface;
  }
  for (const mode of recognizedModes) {
    context.bestSeen.recognizedModes.add(mode);
  }

  const sample = {
    phase,
    pollIndex: Number.isInteger(pollIndex) ? pollIndex : null,
    elapsedMs,
    optionFound: optionResult?.found === true,
    optionCandidateCount: Number.isInteger(optionResult?.candidateCount)
      ? optionResult.candidateCount
      : 0,
    pickerCandidateFound: identity?.pickerCandidateFound === true,
    pickerCandidate:
      identity?.pickerCandidate && typeof identity.pickerCandidate === "object"
        ? identity.pickerCandidate
        : null,
    nearestMenuTriggerFound: identity?.nearestMenuTriggerFound === true,
    nearestMenuTriggerHops: Number.isInteger(identity?.nearestMenuTriggerHops)
      ? identity.nearestMenuTriggerHops
      : null,
    nearestMenuTrigger:
      identity?.nearestMenuTrigger &&
      typeof identity.nearestMenuTrigger === "object"
        ? identity.nearestMenuTrigger
        : null,
    triggerOpenSignal: identity?.triggerOpenSignal === true,
    genericPopupSurfaceCount: genericCount,
    genericMenuSurfaceCount: Number.isInteger(identity?.genericMenuSurfaceCount)
      ? identity.genericMenuSurfaceCount
      : 0,
    modeBearingPopupSurfaceCount: modeBearingCount,
    recognizedModes,
    maxKnownModeDescendantCount: knownCount,
    modePickerMaterialized: modeBearingCount > 0,
    falseOpenGenericOnly,
    selectedModeSurface: selectedSurface
  };
  if (context.samples.length < PR88_PICKER_TRIGGER_MAX_SAMPLES) {
    context.samples.push(sample);
  } else {
    context.samplesTruncated = true;
  }
  return sample;
}


/* END legacy source: service_worker_picker_trigger_identity_pr8_8.js */


/* BEGIN legacy source: service_worker_picker_trigger_poll_timeline_pr8_8.js */
_pr88SelectionPoint =
  async function _pr88SelectionPointWithTriggerIdentity(debuggee, kind) {
    const result = await _pr88TriggerPriorSelectionPoint(debuggee, kind);
    if (kind === "picker" && result?.found === true) {
      const context = _pr88TriggerEnsureContext(result, result?.mode);
      if (context !== null) {
        await _pr88TriggerAppendSample(debuggee, "PICKER_RESOLVED");
      }
    }
    return result;
  };

_pr88SelectionRawClick =
  async function _pr88SelectionRawClickWithActuationEvidence(debuggee, point) {
    const context = _pr88TriggerTimelineContext;
    if (
      context !== null &&
      context.awaitingPickerClick === true &&
      _pr88TriggerSamePoint(context.pickerPoint, point)
    ) {
      await _pr88TriggerAppendSample(debuggee, "PRE_CLICK");
      const startedAt = performance.now();
      const result = await _pr88TriggerPriorRawClick(debuggee, point);
      context.clickDispatchCompleted = true;
      context.pickerClickElapsedMs = _pr88TriggerSafeInt(
        performance.now() - startedAt
      );
      context.awaitingPickerClick = false;
      await _pr88TriggerAppendSample(debuggee, "POST_CLICK_IMMEDIATE");
      return result;
    }
    return _pr88TriggerPriorRawClick(debuggee, point);
  };

_pr88SelectionWaitForInstantOption =
  async function _pr88SelectionWaitForInstantOptionWithTimeline(
    debuggee,
    timeoutMs
  ) {
    const startedAt = performance.now();
    let last = null;
    let pollIndex = 0;
    while (performance.now() - startedAt < timeoutMs) {
      last = await _pr88TriggerPriorSelectionPoint(debuggee, "instant_option");
      pollIndex += 1;
      if (_pr88TriggerTimelineContext !== null) {
        _pr88TriggerTimelineContext.pollSampleCount = pollIndex;
        await _pr88TriggerAppendSample(
          debuggee,
          "OPTION_POLL",
          last,
          pollIndex
        );
      }
      if (last?.found === true) return last;
      await sleep(PR88_INSTANT_SELECTION_POLL_MS);
    }
    return (
      last || {
        found: false,
        reason: "instant_option_timeout",
        candidateCount: 0
      }
    );
  };


function _pr88TriggerMaterializationOutcome(context) {
  const best = context?.bestSeen;
  if (!best) return "TIMELINE_UNAVAILABLE";
  if (best.maxModeBearingPopupSurfaceCount > 0) {
    return "MODE_BEARING_PICKER_MATERIALIZED";
  }
  if (
    best.triggerStateTransitionObserved === true ||
    best.firstTriggerOpenSignalMs !== null
  ) {
    return "TRIGGER_ACTUATED_WITHOUT_MODE_PICKER";
  }
  if (context?.clickDispatchCompleted === true) {
    return "CLICK_DISPATCHED_WITHOUT_OBSERVED_ACTUATION";
  }
  return "PICKER_CLICK_NOT_CONFIRMED";
}

async function _pr88TriggerRoute(debuggee) {
  const tabId = Number.isInteger(debuggee?.tabId) ? debuggee.tabId : null;
  if (tabId === null) {
    return {
      captureTabId: null,
      routeKind: "UNKNOWN",
      observedConversationId: null
    };
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = typeof tab?.url === "string" ? tab.url : "";
    let observedConversationId = null;
    try {
      const value = conversationIdFromUrl(url);
      if (typeof value === "string" && value.trim()) {
        observedConversationId = value.trim();
      }
    } catch {}
    let pathname = "/";
    try {
      pathname = new URL(url).pathname || "/";
    } catch {}
    return {
      captureTabId: tabId,
      routeKind:
        observedConversationId !== null
          ? "CONVERSATION"
          : pathname === "/" || pathname === ""
            ? "ROOT"
            : "OTHER_CHATGPT",
      observedConversationId
    };
  } catch {
    return {
      captureTabId: tabId,
      routeKind: "UNKNOWN",
      observedConversationId: null
    };
  }
}

async function _pr88TriggerPersist(error, context, debuggee) {
  const leaseId = _pr88TriggerLeaseId(context?.leaseId);
  if (leaseId === null) return false;
  const route = await _pr88TriggerRoute(debuggee);
  const failureCode = (() => {
    try {
      return typeof _pr88FailureCode === "function"
        ? _pr88FailureCode(error)
        : "UNKNOWN";
    } catch {
      return "UNKNOWN";
    }
  })();
  const failureReason = (() => {
    try {
      return typeof _pr88FailureReason === "function"
        ? _pr88FailureReason(error)
        : null;
    } catch {
      return null;
    }
  })();
  const best = context.bestSeen || {};
  const record = {
    schemaVersion: PR88_PICKER_TRIGGER_TIMELINE_SCHEMA_VERSION,
    leaseId,
    capturedAtFailure: true,
    failureCode,
    failureReason,
    captureStatus: "TRIGGER_TIMELINE_CAPTURED",
    ...route,
    pickerMode: context.pickerMode || null,
    pickerPointAvailable:
      Number.isFinite(context?.pickerPoint?.x) &&
      Number.isFinite(context?.pickerPoint?.y),
    clickDispatchCompleted: context.clickDispatchCompleted === true,
    pickerClickElapsedMs: _pr88TriggerSafeInt(context.pickerClickElapsedMs),
    timelineSampleCount: context.samples.length,
    pollSampleCount: Number.isInteger(context.pollSampleCount)
      ? context.pollSampleCount
      : 0,
    timelineSamples: context.samples.slice(0, PR88_PICKER_TRIGGER_MAX_SAMPLES),
    timelineSamplesTruncated: context.samplesTruncated === true,
    bestSeen: {
      recognizedModes: Array.from(best.recognizedModes || []).sort(),
      maxModeBearingPopupSurfaceCount: Number.isInteger(
        best.maxModeBearingPopupSurfaceCount
      )
        ? best.maxModeBearingPopupSurfaceCount
        : 0,
      maxKnownModeDescendantCount: Number.isInteger(
        best.maxKnownModeDescendantCount
      )
        ? best.maxKnownModeDescendantCount
        : 0,
      firstModeBearingPopupSeenMs: _pr88TriggerSafeInt(
        best.firstModeBearingPopupSeenMs
      ),
      lastModeBearingPopupSeenMs: _pr88TriggerSafeInt(
        best.lastModeBearingPopupSeenMs
      ),
      firstTriggerOpenSignalMs: _pr88TriggerSafeInt(
        best.firstTriggerOpenSignalMs
      ),
      triggerStateTransitionObserved:
        best.triggerStateTransitionObserved === true,
      falseOpenGenericOnlyObserved:
        best.falseOpenGenericOnlyObserved === true,
      bestSelectedSurface:
        best.bestSelectedSurface &&
        typeof best.bestSelectedSurface === "object"
          ? best.bestSelectedSurface
          : null
    },
    materializationOutcome: _pr88TriggerMaterializationOutcome(context),
    rawUrlExported: false,
    rawTextExported: false,
    rawHtmlExported: false,
    leaseIdExported: false,
    zeroProductWrites: true,
    automaticRetry: false
  };
  await chrome.storage.local.set({
    [PR88_PICKER_TRIGGER_TIMELINE_STORAGE_KEY]: record
  });
  return true;
}


/* END legacy source: service_worker_picker_trigger_poll_timeline_pr8_8.js */


/* BEGIN legacy source: service_worker_picker_trigger_persistence_pr8_8.js */
locateAndFocusComposer =
  async function _locateAndFocusComposerWithPickerTriggerTimeline(debuggee) {
    try {
      return await _pr88TriggerPriorLocateAndFocusComposer(debuggee);
    } catch (error) {
      const context = _pr88TriggerTimelineContext;
      if (context !== null && _pr88TriggerLeaseId(context.leaseId) !== null) {
        try {
          await _pr88TriggerPersist(error, context, debuggee);
        } catch {
          // Timeline persistence must never replace or mask the original failure.
        }
      }
      throw error;
    }
  };

async function _pr88TriggerStoredRecord() {
  try {
    const stored = await chrome.storage.local.get(
      PR88_PICKER_TRIGGER_TIMELINE_STORAGE_KEY
    );
    const value = stored?.[PR88_PICKER_TRIGGER_TIMELINE_STORAGE_KEY];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

executeNativeTurn =
  async function _executeNativeTurnWithPickerTriggerTimeline(message) {
    const result = await _pr88TriggerPriorExecuteNativeTurn(message);

    if (message?.characterizeInstantFailureForensicsSupport === true) {
      return {
        ...result,
        pickerTriggerIdentitySupported: true,
        clickActuationVerificationSupported: true,
        perPollMenuMaterializationTimelineSupported: true,
        falseOpenSurfaceDealiasingSupported: true,
        triggerTimelinePersistenceSupported: true,
        rawTriggerTextRedactionSupported: true
      };
    }

    if (message?.characterizeInstantFailureForensicsRecord === true) {
      const expectedLeaseId = _pr88TriggerLeaseId(
        message?.expectedBrowserAuthorityLeaseId
      );
      const record = await _pr88TriggerStoredRecord();
      const matched =
        expectedLeaseId !== null &&
        record !== null &&
        _pr88TriggerLeaseId(record.leaseId) === expectedLeaseId;
      let publicRecord = null;
      if (matched) {
        publicRecord = {...record};
        delete publicRecord.leaseId;
        publicRecord.leaseIdExported = false;
      }
      return {
        ...result,
        triggerTimelineRecordAvailable: matched,
        triggerTimeline: publicRecord
      };
    }

    return result;
  };

/* END legacy source: service_worker_picker_trigger_persistence_pr8_8.js */


/* BEGIN legacy source: service_worker_reasoning_effort_slider_topology_pr8_8.js */
// PR8.8 reasoning-effort slider topology and quick/advanced surface classifiers.
// Pure observation helpers: no clicks, writes, navigation, or storage mutation.

const PR88_REASONING_EFFORT_SLIDER_SCHEMA_VERSION = 1;

function _pr88EffortNormalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_\-]+/g, " ") : "";
}

function _pr88EffortMode(value) {
  const text = _pr88EffortNormalize(value);
  if (!text) return null;
  if (/(^|\b)(instant|мгновенно)(\b|$)/.test(text)) return "INSTANT";
  if (/(^|\b)(medium|средний)(\b|$)/.test(text)) return "MEDIUM";
  if (/(^|\b)(high|высокий)(\b|$)/.test(text)) return "HIGH";
  return null;
}

function _pr88ModelMode(value) {
  const text = _pr88EffortNormalize(value);
  if (!text) return null;
  if (text.includes("gpt 5.6 sol") || text.includes("gpt-5.6 sol")) return "GPT_5_6_SOL";
  if (text.includes("gpt 5.5") || text.includes("gpt-5.5")) return "GPT_5_5";
  if (/(^|\b)o3(\b|$)/.test(text)) return "O3";
  return null;
}

function _pr88Dimension(value) {
  const text = _pr88EffortNormalize(value);
  if (!text) return null;
  if (text === "advanced" || text === "расширенные") return "ADVANCED";
  if (text === "model" || text === "модель") return "MODEL";
  if (text === "effort" || text === "усилие") return "EFFORT";
  if (text === "back" || text === "назад") return "BACK";
  return null;
}

function _pr88EffortTopologyExpression(kind) {
  return `(() => {
    const KIND = ${JSON.stringify(kind)};
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    const effort = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (/(^|\\b)(instant|мгновенно)(\\b|$)/.test(text)) return 'INSTANT';
      if (/(^|\\b)(medium|средний)(\\b|$)/.test(text)) return 'MEDIUM';
      if (/(^|\\b)(high|высокий)(\\b|$)/.test(text)) return 'HIGH';
      return null;
    };
    const model = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (text.includes('gpt 5.6 sol') || text.includes('gpt-5.6 sol')) return 'GPT_5_6_SOL';
      if (text.includes('gpt 5.5') || text.includes('gpt-5.5')) return 'GPT_5_5';
      if (/(^|\\b)o3(\\b|$)/.test(text)) return 'O3';
      return null;
    };
    const dimension = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (text === 'advanced' || text === 'расширенные' || text.startsWith('advanced ') || text.startsWith('расширенные ')) return 'ADVANCED';
      if (text === 'model' || text === 'модель' || text.startsWith('model ') || text.startsWith('модель ')) return 'MODEL';
      if (text === 'effort' || text === 'усилие' || text.startsWith('effort ') || text.startsWith('усилие ')) return 'EFFORT';
      if (text === 'back' || text === 'назад') return 'BACK';
      return null;
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height)};
    };
    const ownText = (el) => Array.from(el.childNodes || []).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent || '').join(' ');
    const direct = (el) => [ownText(el), el.getAttribute('aria-label'), el.getAttribute('title')];
    const controlFields = (el) => [typeof el.innerText === 'string' ? el.innerText.slice(0, 160) : '', el.getAttribute('aria-label'), el.getAttribute('title')];
    const subtree = (el) => [typeof el.innerText === 'string' ? el.innerText.slice(0, 320) : '', el.textContent ? String(el.textContent).slice(0, 320) : ''];
    const one = (values, fn) => {
      const found = Array.from(new Set(values.map(fn).filter(Boolean)));
      return found.length === 1 ? found[0] : null;
    };
    const boundedState = (value) => {
      const text = normalize(value);
      return ['open','closed','selected','checked','unchecked','active','inactive','on','off'].includes(text) ? text : null;
    };
    const controlRecord = (el) => el ? ({
      tag: el.tagName,
      role: el.getAttribute('role') || null,
      rect: rect(el),
      effortMode: one(controlFields(el), effort),
      dimension: one(controlFields(el), dimension),
      ariaHaspopup: el.getAttribute('aria-haspopup') || null,
      ariaExpanded: el.getAttribute('aria-expanded') || null,
      dataState: boundedState(el.getAttribute('data-state')),
      disabled: Boolean(el.disabled === true || el.getAttribute('aria-disabled') === 'true'),
      pointerEventsEnabled: getComputedStyle(el).pointerEvents !== 'none',
      childElementCount: el.children ? el.children.length : 0
    }) : null;
    const composer = ['#prompt-textarea','[contenteditable="true"][data-lexical-editor="true"]','textarea[placeholder]']
      .map((s) => document.querySelector(s)).find((el) => el && visible(el));
    let currentEffortControl = null;
    let currentEffortCandidateCount = 0;
    if (composer) {
      const cr = composer.getBoundingClientRect();
      const candidates = [];
      for (const el of Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)) {
        const mode = one(controlFields(el), effort);
        if (!mode) continue;
        const r = el.getBoundingClientRect();
        const dx = Math.max(0, Math.max(cr.left - r.right, r.left - cr.right));
        const dy = Math.max(0, Math.max(cr.top - r.bottom, r.top - cr.bottom));
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= 800) candidates.push({el, mode, distance});
      }
      candidates.sort((a,b) => a.distance - b.distance);
      currentEffortCandidateCount = candidates.length;
      if (candidates.length) {
        currentEffortControl = {...controlRecord(candidates[0].el), effortMode: candidates[0].mode, nearestDistancePx: Math.round(candidates[0].distance)};
      }
    }
    const surfaceRoles = new Set(['menu','dialog','group','listbox','radiogroup']);
    const allSurfaces = Array.from(document.querySelectorAll('[role="menu"],[role="dialog"],[role="group"],[role="listbox"],[role="radiogroup"]')).filter(visible);
    if (KIND === 'quick') {
      const candidates = [];
      for (const surface of allSurfaces) {
        const descendants = [surface, ...Array.from(surface.querySelectorAll('*'))].filter(visible);
        const sliders = descendants.filter((el) => el.getAttribute('role') === 'slider' || (el.tagName === 'INPUT' && normalize(el.getAttribute('type')) === 'range'));
        const modeNodes = descendants.map((el) => ({el, mode: one([...direct(el), ...subtree(el)], effort)})).filter((x) => x.mode);
        const modes = Array.from(new Set(modeNodes.map((x) => x.mode))).sort();
        if (!sliders.length && modes.length < 2) continue;
        candidates.push({surface, descendants, sliders, modeNodes, modes});
      }
      candidates.sort((a,b) => (b.modes.length - a.modes.length) || (b.sliders.length - a.sliders.length));
      const selected = candidates[0] || null;
      const genericSurfaceCount = allSurfaces.length;
      if (!selected) return {surfaceFound:false, genericSurfaceCount, modeBearingSurfaceCount:0, sliderSurfaceCount:0, currentEffortControl, currentEffortCandidateCount};
      const sliders = selected.sliders.map((el, index) => {
        const r = el.getBoundingClientRect();
        const valueTextMode = effort(el.getAttribute('aria-valuetext')) || effort(el.getAttribute('aria-label'));
        const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
        return {
          index,
          tag: el.tagName,
          role: el.getAttribute('role') || null,
          rect: rect(el),
          orientation: el.getAttribute('aria-orientation') || (r.width >= r.height ? 'horizontal' : 'vertical'),
          ariaValueMin: num(el.getAttribute('aria-valuemin')),
          ariaValueMax: num(el.getAttribute('aria-valuemax')),
          ariaValueNow: num(el.getAttribute('aria-valuenow')),
          ariaValueTextMode: valueTextMode,
          nativeMin: num(el.min), nativeMax: num(el.max), nativeValue: num(el.value), nativeStep: num(el.step),
          disabled: Boolean(el.disabled === true || el.getAttribute('aria-disabled') === 'true')
        };
      });
      const minimal = selected.modeNodes.filter((item) => !selected.modeNodes.some((other) => other !== item && item.el.contains(other.el) && other.mode === item.mode));
      const marks = minimal.map((item) => {
        const rr = item.el.getBoundingClientRect();
        let nearestIndex = null, nearestDistance = null, normalizedPosition = null;
        sliders.forEach((slider) => {
          const sr = selected.sliders[slider.index].getBoundingClientRect();
          const horizontal = slider.orientation !== 'vertical';
          const pos = horizontal ? ((rr.left + rr.width/2 - sr.left) / Math.max(1, sr.width)) : ((rr.top + rr.height/2 - sr.top) / Math.max(1, sr.height));
          const clamped = Math.max(0, Math.min(1, pos));
          const dx = Math.max(0, Math.max(sr.left - rr.right, rr.left - sr.right));
          const dy = Math.max(0, Math.max(sr.top - rr.bottom, rr.top - sr.bottom));
          const distance = Math.round(Math.sqrt(dx*dx + dy*dy));
          if (nearestDistance === null || distance < nearestDistance) { nearestDistance = distance; nearestIndex = slider.index; normalizedPosition = Math.round(clamped * 1000) / 1000; }
        });
        return {mode:item.mode, tag:item.el.tagName, role:item.el.getAttribute('role') || null, rect:rect(item.el), nearestSliderIndex:nearestIndex, nearestSliderDistancePx:nearestDistance, normalizedPosition};
      });
      const primary = sliders.length ? sliders[0] : null;
      const mapping = marks.filter((m) => m.nearestSliderIndex === 0).sort((a,b) => (a.normalizedPosition ?? 0) - (b.normalizedPosition ?? 0)).map((m, rank) => ({mode:m.mode, rank, normalizedPosition:m.normalizedPosition}));
      const mappedModes = Array.from(new Set(mapping.map((m) => m.mode))).sort();
      const advanced = selected.descendants.filter((el) => ['BUTTON','DIV'].includes(el.tagName) || el.getAttribute('role') === 'button').map((el) => ({el, dimension:one(controlFields(el), dimension)})).filter((x) => x.dimension === 'ADVANCED');
      return {
        surfaceFound:true,
        genericSurfaceCount,
        modeBearingSurfaceCount:candidates.filter((x) => x.modes.length >= 2).length,
        sliderSurfaceCount:candidates.filter((x) => x.sliders.length > 0).length,
        selectedSurface:{tag:selected.surface.tagName, role:selected.surface.getAttribute('role') || null, rect:rect(selected.surface), recognizedEffortModes:selected.modes, visibleElementCount:selected.descendants.length},
        currentEffortControl, currentEffortCandidateCount,
        sliders, effortMarks:marks, discreteStepMapping:mapping,
        completeThreeStepMapping:['HIGH','INSTANT','MEDIUM'].every((m) => mappedModes.includes(m)),
        primarySlider:primary,
        advancedButtonCount:advanced.length,
        advancedButton:advanced.length === 1 ? controlRecord(advanced[0].el) : null
      };
    }
    const surfaces = [];
    for (const surface of allSurfaces) {
      const descendants = [surface, ...Array.from(surface.querySelectorAll('*'))].filter(visible);
      const dims = descendants.map((el) => ({el, dimension:one(controlFields(el), dimension)})).filter((x) => x.dimension);
      const dimSet = Array.from(new Set(dims.map((x) => x.dimension))).sort();
      if (!dimSet.includes('MODEL') || !dimSet.includes('EFFORT')) continue;
      surfaces.push({surface, descendants, dims, dimSet});
    }
    const selected = surfaces[0] || null;
    if (!selected) return {surfaceFound:false, candidateSurfaceCount:surfaces.length};
    const controls = selected.dims.map((x) => ({...controlRecord(x.el), dimension:x.dimension}));
    const modelControls = controls.filter((x) => x.dimension === 'MODEL');
    const effortControls = controls.filter((x) => x.dimension === 'EFFORT');
    const modelValues = Array.from(new Set(selected.descendants.flatMap((el) => [...direct(el), ...subtree(el)].map(model).filter(Boolean)))).sort();
    const effortValues = Array.from(new Set(selected.descendants.flatMap((el) => [...direct(el), ...subtree(el)].map(effort).filter(Boolean)))).sort();
    const separated = modelControls.length === 1 && effortControls.length === 1 && (modelControls[0].rect.x !== effortControls[0].rect.x || modelControls[0].rect.y !== effortControls[0].rect.y);
    return {
      surfaceFound:true,
      candidateSurfaceCount:surfaces.length,
      selectedSurface:{tag:selected.surface.tagName, role:selected.surface.getAttribute('role') || null, rect:rect(selected.surface), visibleElementCount:selected.descendants.length},
      dimensionControls:controls,
      modelControlCount:modelControls.length,
      effortControlCount:effortControls.length,
      backControlCount:controls.filter((x) => x.dimension === 'BACK').length,
      dimensionsSeparated:separated,
      visibleModelValues:modelValues,
      visibleEffortValues:effortValues
    };
  })()`;
}

async function _pr88EffortEvaluate(debuggee, kind) {
  const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
    expression: _pr88EffortTopologyExpression(kind), returnByValue: true, awaitPromise: true
  });
  const value = result?.result?.value;
  return value && typeof value === "object" ? value : {};
}

/* END legacy source: service_worker_reasoning_effort_slider_topology_pr8_8.js */


/* BEGIN legacy source: service_worker_reasoning_effort_slider_governance_pr8_8.js */
// PR8.8 retained-tab reasoning-effort slider characterization.
// Zero product writes. Optional UI navigation is limited to opening the quick
// effort picker and opening Advanced; no slider/model/effort choice is clicked.

const _pr88EffortPriorExecuteNativeTurn = executeNativeTurn;

function _pr88EffortConversationId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id && !/[\/?#]/.test(id) ? id : null;
}

function _pr88EffortConflict(message) {
  return message?.text != null || message?.browserAuthorityLeaseId != null || message?.canonicalCompleted === true;
}

async function _pr88EffortRawClick(debuggee, record) {
  const r = record?.rect;
  if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.width) || !Number.isFinite(r.height)) {
    throw new Error("PR8_8_REASONING_EFFORT_CLICK_TARGET_REQUIRED");
  }
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  for (const payload of [
    {type:"mouseMoved",x,y},
    {type:"mousePressed",x,y,button:"left",buttons:1,clickCount:1},
    {type:"mouseReleased",x,y,button:"left",buttons:0,clickCount:1}
  ]) {
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", payload);
  }
}

async function _pr88EffortWait(debuggee, kind, predicate, timeoutMs = 2500) {
  const started = performance.now();
  let last = {};
  while (performance.now() - started < timeoutMs) {
    last = await _pr88EffortEvaluate(debuggee, kind);
    if (predicate(last)) return last;
    await sleep(100);
  }
  return last;
}

async function _pr88EffortProbe(message) {
  if (_pr88EffortConflict(message)) throw new Error("PR8_8_REASONING_EFFORT_FLAG_CONFLICT");
  const conversationId = _pr88EffortConversationId(message?.conversationId);
  if (!conversationId) throw new Error("PR8_8_REASONING_EFFORT_CONVERSATION_REQUIRED");
  const expectedTabId = Number.isInteger(message?.expectedRuntimeTabId) ? message.expectedRuntimeTabId : null;
  const openQuick = message?.openQuickPicker === true;
  const inspectAdvanced = message?.inspectAdvancedSurface === true;
  const allowNavigation = message?.allowUiNavigation === true;
  if ((openQuick || inspectAdvanced) && !allowNavigation) throw new Error("PR8_8_REASONING_EFFORT_UI_NAVIGATION_NOT_ACKNOWLEDGED");

  const runtimeTabId = await storedRuntimeTabId();
  if (!Number.isInteger(runtimeTabId)) throw new Error("PR8_8_REASONING_EFFORT_RUNTIME_TAB_REQUIRED");
  if (expectedTabId !== null && runtimeTabId !== expectedTabId) throw new Error("PR8_8_REASONING_EFFORT_RUNTIME_TAB_CHANGED");
  const tabBefore = await chrome.tabs.get(runtimeTabId);
  if (!isChatGPTUrl(tabBefore?.url || "") || conversationIdFromUrl(tabBefore?.url || "") !== conversationId) {
    throw new Error("PR8_8_REASONING_EFFORT_CONVERSATION_MISMATCH");
  }

  const leasePresent = typeof _pr88StoredLeaseId === "function" ? Boolean(await _pr88StoredLeaseId()) : null;
  const debuggee = {tabId: runtimeTabId};
  let attached = false;
  let conversationWriteCount = 0;
  let chatgptMutationCount = 0;
  let quickOpenClickPerformed = false;
  let advancedClickPerformed = false;
  const onEvent = (source, method, params) => {
    if (source?.tabId !== runtimeTabId || method !== "Network.requestWillBeSent") return;
    const req = params?.request;
    if (isConversationWrite(req?.url || "", req?.method || "")) conversationWriteCount += 1;
    try {
      const u = new URL(req?.url || "");
      const m = String(req?.method || "").toUpperCase();
      if (u.origin === CHATGPT_ORIGIN && ["POST","PUT","PATCH","DELETE"].includes(m) && !isConversationWrite(req?.url || "", req?.method || "")) chatgptMutationCount += 1;
    } catch {}
  };

  try {
    await chrome.debugger.attach(debuggee, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Network.enable");
    chrome.debugger.onEvent.addListener(onEvent);

    const beforeQuick = await _pr88EffortEvaluate(debuggee, "quick");
    let quick = beforeQuick;
    if (quick?.surfaceFound !== true && openQuick) {
      if (quick?.currentEffortCandidateCount !== 1 || !quick?.currentEffortControl) {
        throw new Error("PR8_8_REASONING_EFFORT_CURRENT_CONTROL_NOT_UNIQUE");
      }
      await _pr88EffortRawClick(debuggee, quick.currentEffortControl);
      quickOpenClickPerformed = true;
      quick = await _pr88EffortWait(debuggee, "quick", (x) => x?.surfaceFound === true && (x?.sliders?.length || x?.completeThreeStepMapping === true));
    }

    let advanced = null;
    if (inspectAdvanced) {
      if (quick?.surfaceFound !== true) throw new Error("PR8_8_REASONING_EFFORT_QUICK_SURFACE_REQUIRED");
      if (quick?.advancedButtonCount !== 1 || !quick?.advancedButton) throw new Error("PR8_8_REASONING_EFFORT_ADVANCED_CONTROL_NOT_UNIQUE");
      await _pr88EffortRawClick(debuggee, quick.advancedButton);
      advancedClickPerformed = true;
      advanced = await _pr88EffortWait(debuggee, "advanced", (x) => x?.surfaceFound === true && x?.modelControlCount === 1 && x?.effortControlCount === 1);
    }

    if (conversationWriteCount !== 0) throw new Error("PR8_8_REASONING_EFFORT_ZERO_WRITE_BOUNDARY_VIOLATED");
    const tabAfter = await chrome.tabs.get(runtimeTabId);
    if (!isChatGPTUrl(tabAfter?.url || "") || conversationIdFromUrl(tabAfter?.url || "") !== conversationId) {
      throw new Error("PR8_8_REASONING_EFFORT_ROUTE_CHANGED");
    }
    return {
      reasoningEffortSliderSupported: true,
      reasoningEffortSliderSchemaVersion: PR88_REASONING_EFFORT_SLIDER_SCHEMA_VERSION,
      conversationId,
      runtimeTabId,
      runtimeTabIdAfter: runtimeTabId,
      leaseIdPresent: leasePresent,
      rawUrlExported: false,
      rawTextExported: false,
      rawHtmlExported: false,
      leaseIdExported: false,
      zeroProductWrites: true,
      conversationWriteCount,
      chatgptMutationCount,
      uiNavigationAcknowledged: allowNavigation,
      quickOpenClickPerformed,
      advancedClickPerformed,
      selectionControlClickPerformed: false,
      quickTopology: quick,
      advancedTopology: advanced
    };
  } finally {
    try { chrome.debugger.onEvent.removeListener(onEvent); } catch {}
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
  }
}

executeNativeTurn = async function _executeNativeTurnWithReasoningEffortSlider(message) {
  if (message?.characterizeReasoningEffortSliderSupport === true) {
    if (_pr88EffortConflict(message)) throw new Error("PR8_8_REASONING_EFFORT_SUPPORT_FLAG_CONFLICT");
    return {
      reasoningEffortSliderSupported: true,
      reasoningEffortSliderSchemaVersion: PR88_REASONING_EFFORT_SLIDER_SCHEMA_VERSION,
      retainedExistingTabProbeSupported: true,
      sliderTopologySupported: true,
      discreteStepMappingSupported: true,
      quickAdvancedDimensionSeparationSupported: true,
      uiNavigationOptInSupported: true,
      selectionControlClickForbidden: true,
      conversationWriteGuardSupported: true,
      rawTextRedactionSupported: true,
      leaseIdExported: false,
      zeroProductWrites: true,
      automaticRetry: false
    };
  }
  if (message?.characterizeReasoningEffortSliderTopology === true) return _pr88EffortProbe(message);
  return _pr88EffortPriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_reasoning_effort_slider_governance_pr8_8.js */


/* BEGIN legacy source: service_worker_reasoning_effort_slider_geometry_pr8_8.js */
// PR8.8 slider thumb-vs-track geometry, discrete ARIA semantics, label association,
// and logical Advanced-control dealiasing. Strictly zero-click / zero-write.

const PR88_REASONING_EFFORT_GEOMETRY_SCHEMA_VERSION = 1;
const _pr88EffortGeometryPriorExecuteNativeTurn = executeNativeTurn;

function _pr88EffortGeometryConflict(message) {
  return (
    message?.text != null ||
    message?.browserAuthorityLeaseId != null ||
    message?.canonicalCompleted === true ||
    message?.openQuickPicker === true ||
    message?.inspectAdvancedSurface === true ||
    message?.allowUiNavigation === true
  );
}

function _pr88EffortGeometryConversationId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id && !/[\/?#]/.test(id) ? id : null;
}

function _pr88EffortGeometryExpression() {
  return `(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    const effort = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (/(^|\\b)(instant|мгновенно)(\\b|$)/.test(text)) return 'INSTANT';
      if (/(^|\\b)(medium|средний)(\\b|$)/.test(text)) return 'MEDIUM';
      if (/(^|\\b)(high|высокий)(\\b|$)/.test(text)) return 'HIGH';
      return null;
    };
    const dimension = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (text === 'advanced' || text === 'расширенные' || text.startsWith('advanced ') || text.startsWith('расширенные ')) return 'ADVANCED';
      return null;
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};
    };
    const ownText = (el) => Array.from(el.childNodes || []).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent || '').join(' ');
    const fields = (el) => [ownText(el), el.getAttribute('aria-label'), el.getAttribute('title')];
    const controlFields = (el) => [typeof el.innerText === 'string' ? el.innerText.slice(0,160) : '', el.getAttribute('aria-label'), el.getAttribute('title')];
    const one = (values, fn) => {
      const found = Array.from(new Set(values.map(fn).filter(Boolean)));
      return found.length === 1 ? found[0] : null;
    };
    const num = (value) => { const x = Number(value); return Number.isFinite(x) ? x : null; };
    const center = (r) => ({x:r.left+r.width/2,y:r.top+r.height/2});
    const centerDistance = (a,b) => Math.hypot((a.x+a.width/2)-(b.x+b.width/2),(a.y+a.height/2)-(b.y+b.height/2));
    const overlapRatio = (a,b) => {
      const left=Math.max(a.x,b.x), right=Math.min(a.x+a.width,b.x+b.width);
      const top=Math.max(a.y,b.y), bottom=Math.min(a.y+a.height,b.y+b.height);
      const area=Math.max(0,right-left)*Math.max(0,bottom-top);
      return area / Math.max(1, Math.min(a.width*a.height,b.width*b.height));
    };
    const relation = (a,b) => a.contains(b) ? 'CONTAINS' : (b.contains(a) ? 'CONTAINED_BY' : 'PEER');

    const composer = ['#prompt-textarea','[contenteditable="true"][data-lexical-editor="true"]','textarea[placeholder]']
      .map((s) => document.querySelector(s)).find((el) => el && visible(el));
    let currentEffortControl = null;
    if (composer) {
      const cr = composer.getBoundingClientRect();
      const controls = [];
      for (const el of Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)) {
        const mode = one(controlFields(el), effort);
        if (!mode) continue;
        const r = el.getBoundingClientRect();
        const dx=Math.max(0,Math.max(cr.left-r.right,r.left-cr.right));
        const dy=Math.max(0,Math.max(cr.top-r.bottom,r.top-cr.bottom));
        const d=Math.hypot(dx,dy);
        if (d <= 800) controls.push({el,mode,d});
      }
      controls.sort((a,b)=>a.d-b.d);
      if (controls.length === 1) currentEffortControl = {mode:controls[0].mode,rect:rect(controls[0].el),ariaExpanded:controls[0].el.getAttribute('aria-expanded'),dataState:normalize(controls[0].el.getAttribute('data-state'))||null};
    }

    const sliders = Array.from(document.querySelectorAll('[role="slider"],input[type="range"]')).filter(visible).map((el,index) => {
      const r=el.getBoundingClientRect();
      const min=num(el.getAttribute('aria-valuemin')) ?? num(el.min);
      const max=num(el.getAttribute('aria-valuemax')) ?? num(el.max);
      const now=num(el.getAttribute('aria-valuenow')) ?? num(el.value);
      const orientation=el.getAttribute('aria-orientation') || (r.width >= r.height ? 'horizontal':'vertical');
      const discrete=Number.isInteger(min)&&Number.isInteger(max)&&max>=min&&max-min<=15;
      return {el,index,r,min,max,now,orientation,discrete,stepCount:discrete?(max-min+1):null};
    });
    const effortRect=currentEffortControl?.rect || null;
    sliders.sort((a,b) => {
      const exactA = a.discrete && a.stepCount === 3 ? 0 : 1;
      const exactB = b.discrete && b.stepCount === 3 ? 0 : 1;
      if (exactA !== exactB) return exactA-exactB;
      if (!effortRect) return 0;
      return centerDistance(a.r,effortRect)-centerDistance(b.r,effortRect);
    });
    const primary = sliders[0] || null;

    let trackCandidates=[];
    let bestTrack=null;
    if (primary) {
      const thumb=primary.el, tr=primary.r, tc=center(tr);
      let root=thumb.parentElement;
      for (let hop=1; root && hop<=5; hop++, root=root.parentElement) {
        const nodes=[root,...Array.from(root.children || [])];
        for (const node of nodes) {
          if (!(node instanceof Element) || node===thumb || !visible(node)) continue;
          const rr=node.getBoundingClientRect();
          const horizontal=primary.orientation!=='vertical';
          const axisLength=horizontal?rr.width:rr.height;
          const crossLength=horizontal?rr.height:rr.width;
          const thumbAxis=horizontal?tr.width:tr.height;
          if (axisLength < Math.max(56, thumbAxis*2)) continue;
          const c=center(rr);
          const crossOffset=Math.abs((horizontal?c.y:c.x)-(horizontal?tc.y:tc.x));
          if (crossOffset > Math.max(32, (horizontal?tr.height:tr.width)*1.5)) continue;
          const axisContains=horizontal ? (tc.x>=rr.left-8 && tc.x<=rr.right+8) : (tc.y>=rr.top-8 && tc.y<=rr.bottom+8);
          if (!axisContains) continue;
          const mode=one(fields(node),effort), dim=one(controlFields(node),dimension);
          if (mode || dim || node.tagName==='BUTTON' || node.getAttribute('role')==='button') continue;
          const thinness=axisLength/Math.max(1,crossLength);
          const score=(hop*100)+(crossOffset*5)-Math.min(80,thinness*4)-Math.min(80,axisLength/4);
          trackCandidates.push({node,hop,score,record:{tag:node.tagName,role:node.getAttribute('role')||null,rect:rect(node),relationToThumb:relation(node,thumb),axisLengthPx:Math.round(axisLength),crossLengthPx:Math.round(crossLength),crossOffsetPx:Math.round(crossOffset),thumbCenterInsideAxis:true}});
        }
      }
      trackCandidates.sort((a,b)=>a.score-b.score);
      if (trackCandidates.length) bestTrack=trackCandidates[0];
    }

    const minimalLabels=Array.from(document.querySelectorAll('*')).filter(visible).map((el)=>({el,mode:one(fields(el),effort)})).filter((x)=>x.mode).filter((item,_,all)=>!all.some((other)=>other!==item&&item.el.contains(other.el)&&other.mode===item.mode));
    const labels=[];
    if (primary) {
      const tr=primary.r, trackRect=bestTrack?.node?.getBoundingClientRect() || null;
      for (const item of minimalLabels) {
        const lr=item.el.getBoundingClientRect();
        const d=centerDistance(lr,trackRect || tr);
        if (d > 240) continue;
        let normalizedPosition=null;
        if (trackRect) {
          const horizontal=primary.orientation!=='vertical';
          const axisStart=horizontal?trackRect.left:trackRect.top;
          const axisLength=Math.max(1,horizontal?trackRect.width:trackRect.height);
          const labelCenter=horizontal?(lr.left+lr.width/2):(lr.top+lr.height/2);
          normalizedPosition=Math.max(0,Math.min(1,(labelCenter-axisStart)/axisLength));
          normalizedPosition=Math.round(normalizedPosition*1000)/1000;
        }
        labels.push({mode:item.mode,tag:item.el.tagName,role:item.el.getAttribute('role')||null,rect:rect(item.el),distanceToTrackPx:Math.round(d),normalizedPosition});
      }
    }
    labels.sort((a,b)=>(a.normalizedPosition??9)-(b.normalizedPosition??9));
    const uniqueModes=Array.from(new Set(labels.map((x)=>x.mode)));
    const ariaRange = primary ? {min:primary.min,max:primary.max,now:primary.now,discrete:primary.discrete,stepCount:primary.stepCount,currentStepIndex:primary.discrete&&Number.isInteger(primary.now)?primary.now-primary.min:null} : null;
    let orderedStepMapping=[];
    if (primary && bestTrack && primary.discrete && uniqueModes.length===3) {
      const byMode=[];
      for (const mode of ['INSTANT','MEDIUM','HIGH']) {
        const candidates=labels.filter((x)=>x.mode===mode&&x.normalizedPosition!==null).sort((a,b)=>a.distanceToTrackPx-b.distanceToTrackPx);
        if (candidates.length) byMode.push(candidates[0]);
      }
      byMode.sort((a,b)=>a.normalizedPosition-b.normalizedPosition);
      if (byMode.length===3) orderedStepMapping=byMode.map((x,rank)=>({mode:x.mode,rank,ariaStepCandidate:primary.min+rank,normalizedPosition:x.normalizedPosition}));
    }
    const currentMode=currentEffortControl?.mode || null;
    const currentStepConsistent=Boolean(primary&&primary.discrete&&currentMode==='HIGH'&&primary.now===primary.max);
    const fullMappingProven=orderedStepMapping.length===3&&orderedStepMapping.map((x)=>x.mode).join(',')==='INSTANT,MEDIUM,HIGH'&&currentStepConsistent;

    const advancedNodes=Array.from(document.querySelectorAll('button,[role="button"],div')).filter(visible).map((el)=>({el,dimension:one(controlFields(el),dimension)})).filter((x)=>x.dimension==='ADVANCED').map((x,index)=>{
      const r=x.el.getBoundingClientRect();
      const actionable=x.el.tagName==='BUTTON'||x.el.getAttribute('role')==='button';
      return {index,el:x.el,r,record:{index,tag:x.el.tagName,role:x.el.getAttribute('role')||null,rect:rect(x.el),actionable,disabled:Boolean(x.el.disabled===true||x.el.getAttribute('aria-disabled')==='true'),pointerEventsEnabled:getComputedStyle(x.el).pointerEvents!=='none'}};
    });
    const parent=advancedNodes.map((_,i)=>i);
    const find=(i)=>parent[i]===i?i:(parent[i]=find(parent[i]));
    const unite=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
    for(let i=0;i<advancedNodes.length;i++) for(let j=i+1;j<advancedNodes.length;j++) {
      const a=advancedNodes[i],b=advancedNodes[j];
      const equivalent=a.el.contains(b.el)||b.el.contains(a.el)||overlapRatio(a.r,b.r)>=0.85||centerDistance(a.r,b.r)<=4;
      if(equivalent) unite(i,j);
    }
    const groups=new Map();
    advancedNodes.forEach((item,i)=>{const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(item);});
    const logicalGroups=Array.from(groups.values()).map((items,index)=>{
      const actionables=items.filter((x)=>x.record.actionable&&x.record.pointerEventsEnabled&&!x.record.disabled);
      actionables.sort((a,b)=>(a.r.width*a.r.height)-(b.r.width*b.r.height));
      const preferred=actionables[0] || null;
      return {index,candidateCount:items.length,candidates:items.map((x)=>x.record),actionableCandidateCount:actionables.length,preferredTarget:preferred?preferred.record:null};
    });

    return {
      currentEffortControl,
      sliderCandidateCount:sliders.length,
      primarySlider:primary?{tag:primary.el.tagName,role:primary.el.getAttribute('role')||null,rect:rect(primary.el),orientation:primary.orientation,ariaValueMin:primary.min,ariaValueMax:primary.max,ariaValueNow:primary.now,discrete:primary.discrete,stepCount:primary.stepCount}:null,
      thumbGeometryProven:Boolean(primary && Math.max(primary.r.width,primary.r.height)<=40),
      ariaRangeSemantics:ariaRange,
      trackCandidateCount:trackCandidates.length,
      trackCandidates:trackCandidates.slice(0,12).map((x)=>x.record),
      bestTrack:bestTrack?bestTrack.record:null,
      effortLabels:labels.slice(0,16),
      recognizedEffortModes:Array.from(new Set(labels.map((x)=>x.mode))).sort(),
      orderedStepMapping,
      currentStepConsistent,
      fullThreeStepMappingProven:fullMappingProven,
      advancedDomCandidateCount:advancedNodes.length,
      advancedLogicalControlCount:logicalGroups.length,
      advancedLogicalControls:logicalGroups.slice(0,8),
      advancedDealiased:Boolean(advancedNodes.length>1&&logicalGroups.length===1&&logicalGroups[0].preferredTarget),
      selectionControlClickPerformed:false,
      uiNavigationClickPerformed:false
    };
  })()`;
}

async function _pr88EffortGeometryProbe(message) {
  if (_pr88EffortGeometryConflict(message)) throw new Error("PR8_8_REASONING_EFFORT_GEOMETRY_FLAG_CONFLICT");
  const conversationId=_pr88EffortGeometryConversationId(message?.conversationId);
  if (!conversationId) throw new Error("PR8_8_REASONING_EFFORT_GEOMETRY_CONVERSATION_REQUIRED");
  const expectedTabId=Number.isInteger(message?.expectedRuntimeTabId)?message.expectedRuntimeTabId:null;
  const runtimeTabId=await storedRuntimeTabId();
  if (!Number.isInteger(runtimeTabId)) throw new Error("PR8_8_REASONING_EFFORT_GEOMETRY_RUNTIME_TAB_REQUIRED");
  if (expectedTabId!==null&&runtimeTabId!==expectedTabId) throw new Error("PR8_8_REASONING_EFFORT_GEOMETRY_RUNTIME_TAB_CHANGED");
  const tab=await chrome.tabs.get(runtimeTabId);
  if (!isChatGPTUrl(tab?.url||"")||conversationIdFromUrl(tab?.url||"")!==conversationId) throw new Error("PR8_8_REASONING_EFFORT_GEOMETRY_CONVERSATION_MISMATCH");
  const leasePresent=typeof _pr88StoredLeaseId==="function"?Boolean(await _pr88StoredLeaseId()):null;
  const debuggee={tabId:runtimeTabId};
  let attached=false;
  try {
    await chrome.debugger.attach(debuggee,"1.3");
    attached=true;
    const result=await chrome.debugger.sendCommand(debuggee,"Runtime.evaluate",{expression:_pr88EffortGeometryExpression(),returnByValue:true,awaitPromise:true});
    const topology=result?.result?.value;
    if (!topology||typeof topology!=="object") throw new Error("PR8_8_REASONING_EFFORT_GEOMETRY_RESULT_MISSING");
    return {
      reasoningEffortGeometrySupported:true,
      reasoningEffortGeometrySchemaVersion:PR88_REASONING_EFFORT_GEOMETRY_SCHEMA_VERSION,
      conversationId,runtimeTabId,runtimeTabIdAfter:runtimeTabId,leaseIdPresent:leasePresent,
      rawUrlExported:false,rawTextExported:false,rawHtmlExported:false,leaseIdExported:false,
      zeroProductWrites:true,conversationWriteCount:0,chatgptMutationCount:0,automaticRetry:false,
      topology
    };
  } finally {
    if (attached) { try { await chrome.debugger.detach(debuggee); } catch {} }
  }
}

executeNativeTurn = async function _executeNativeTurnWithReasoningEffortGeometry(message) {
  if (message?.characterizeReasoningEffortGeometrySupport === true) {
    if (_pr88EffortGeometryConflict(message)) throw new Error("PR8_8_REASONING_EFFORT_GEOMETRY_SUPPORT_FLAG_CONFLICT");
    return {
      reasoningEffortGeometrySupported:true,
      reasoningEffortGeometrySchemaVersion:PR88_REASONING_EFFORT_GEOMETRY_SCHEMA_VERSION,
      thumbTrackSeparationSupported:true,
      ariaDiscreteRangeSemanticsSupported:true,
      siblingTickAssociationSupported:true,
      advancedControlDealiasingSupported:true,
      retainedExistingTabProbeSupported:true,
      selectionControlClickForbidden:true,
      uiNavigationClickForbidden:true,
      zeroProductWrites:true,
      automaticRetry:false,
      rawTextRedactionSupported:true,
      leaseIdExported:false
    };
  }
  if (message?.characterizeReasoningEffortGeometry === true) return _pr88EffortGeometryProbe(message);
  return _pr88EffortGeometryPriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_reasoning_effort_slider_geometry_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_effort_slider_contract_pr8_8.js */
// PR8.8 semantic reasoning-effort slider runtime for production Instant selection.
// Pure helper layer: observation, focus, bounded wait, and the standard Home key.
// No prompt insertion, submit, Advanced/model click, tab lifecycle action, or retry.

const PR88_INSTANT_EFFORT_SELECTION_SCHEMA_VERSION = 1;
const PR88_INSTANT_EFFORT_SELECTION_SETTLE_TIMEOUT_MS = 8000;
const PR88_INSTANT_EFFORT_SELECTION_POLL_MS = 100;

function _pr88InstantEffortSupportConflict(message) {
  return (
    message?.text != null ||
    message?.conversationId != null ||
    message?.browserAuthorityLeaseId != null ||
    message?.canonicalCompleted === true ||
    message?.openQuickPicker === true ||
    message?.inspectAdvancedSurface === true ||
    message?.allowUiNavigation === true
  );
}

function _pr88InstantEffortSliderExpression(action) {
  return `(() => {
    const ACTION = ${JSON.stringify(action)};
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    const effort = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (/(^|\\b)(instant|мгновенно)(\\b|$)/.test(text)) return 'INSTANT';
      if (/(^|\\b)(medium|средний)(\\b|$)/.test(text)) return 'MEDIUM';
      if (/(^|\\b)(high|высокий)(\\b|$)/.test(text)) return 'HIGH';
      return null;
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};
    };
    const centerDistance = (a,b) => Math.hypot(
      (a.left+a.width/2)-(b.left+b.width/2),
      (a.top+a.height/2)-(b.top+b.height/2)
    );
    const fields = (el) => [
      typeof el.innerText === 'string' ? el.innerText.slice(0,160) : '',
      el.getAttribute('aria-label'),
      el.getAttribute('title')
    ];
    const oneMode = (el) => {
      const modes = Array.from(new Set(fields(el).map(effort).filter(Boolean)));
      return modes.length === 1 ? modes[0] : null;
    };
    const num = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const composer = [
      '#prompt-textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      'textarea[placeholder]'
    ].map((selector) => document.querySelector(selector)).find((el) => el && visible(el));
    if (!composer) {
      return {found:false, reason:'composer_missing', candidateCount:0, currentControlCount:0};
    }

    const cr = composer.getBoundingClientRect();
    const controls = [];
    for (const el of Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)) {
      const mode = oneMode(el);
      if (!mode) continue;
      const r = el.getBoundingClientRect();
      const dx = Math.max(0, Math.max(cr.left-r.right, r.left-cr.right));
      const dy = Math.max(0, Math.max(cr.top-r.bottom, r.top-cr.bottom));
      const distance = Math.hypot(dx,dy);
      if (distance <= 800) controls.push({el,mode,distance,r});
    }
    controls.sort((a,b) => a.distance-b.distance);
    if (controls.length !== 1) {
      return {
        found:false,
        reason:controls.length ? 'current_effort_control_ambiguous' : 'current_effort_control_missing',
        candidateCount:0,
        currentControlCount:controls.length
      };
    }

    const control = controls[0];
    const controlOpen = (
      control.el.getAttribute('aria-expanded') === 'true' ||
      normalize(control.el.getAttribute('data-state')) === 'open'
    );
    if (!controlOpen) {
      return {
        found:false, reason:'quick_picker_not_open', candidateCount:0,
        currentControlCount:1, currentMode:control.mode, currentControlOpen:false
      };
    }

    const sliders = [];
    for (const el of Array.from(document.querySelectorAll('[role="slider"],input[type="range"]')).filter(visible)) {
      const r = el.getBoundingClientRect();
      const min = num(el.getAttribute('aria-valuemin')) ?? num(el.min);
      const max = num(el.getAttribute('aria-valuemax')) ?? num(el.max);
      const now = num(el.getAttribute('aria-valuenow')) ?? num(el.value);
      const exact = (
        Number.isInteger(min) && Number.isInteger(max) && Number.isInteger(now) &&
        min === 0 && max === 2 && now >= min && now <= max
      );
      if (!exact) continue;
      const distance = centerDistance(r, control.r);
      if (distance > 400) continue;
      sliders.push({el,r,min,max,now,distance});
    }
    sliders.sort((a,b) => a.distance-b.distance);
    if (sliders.length !== 1) {
      return {
        found:false,
        reason:sliders.length ? 'effort_slider_ambiguous' : 'effort_slider_missing',
        candidateCount:sliders.length,
        currentControlCount:1,
        currentMode:control.mode,
        currentControlOpen:true
      };
    }

    const slider = sliders[0];
    let focusProven = document.activeElement === slider.el;
    if (ACTION === 'focus') {
      try { slider.el.focus({preventScroll:true}); }
      catch { try { slider.el.focus(); } catch {} }
      focusProven = document.activeElement === slider.el;
    }

    return {
      found:true, reason:null, candidateCount:1, currentControlCount:1,
      currentMode:control.mode, currentControlOpen:true,
      currentControlRect:rect(control.el),
      min:slider.min, max:slider.max, now:slider.now, stepCount:3,
      orientation:slider.el.getAttribute('aria-orientation') || (slider.r.width >= slider.r.height ? 'horizontal' : 'vertical'),
      thumbRect:rect(slider.el),
      tabIndex:Number.isInteger(slider.el.tabIndex) ? slider.el.tabIndex : null,
      disabled:Boolean(slider.el.disabled === true || slider.el.getAttribute('aria-disabled') === 'true'),
      pointerEventsEnabled:getComputedStyle(slider.el).pointerEvents !== 'none',
      focusProven
    };
  })()`;
}

async function _pr88InstantEffortSliderSnapshot(debuggee, action = "snapshot") {
  const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
    expression: _pr88InstantEffortSliderExpression(action),
    returnByValue: true,
    awaitPromise: true
  });
  const value = result?.result?.value;
  return value && typeof value === "object"
    ? value
    : {found:false, reason:"slider_probe_failed", candidateCount:0, currentControlCount:0};
}


/* END legacy source: service_worker_instant_effort_slider_contract_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_effort_slider_key_pr8_8.js */
// PR8.8 semantic Home-key operations for the proven effort slider.

async function _pr88InstantEffortWaitForSlider(debuggee, expectedMode, timeoutMs = 2500) {
  const startedAt = performance.now();
  let last = null;
  while (performance.now() - startedAt < timeoutMs) {
    last = await _pr88InstantEffortSliderSnapshot(debuggee, "snapshot");
    if (
      last?.found === true && last?.candidateCount === 1 &&
      last?.min === 0 && last?.max === 2 && Number.isInteger(last?.now) &&
      last?.stepCount === 3 && last?.currentControlOpen === true &&
      last?.currentMode === expectedMode && last?.disabled !== true &&
      last?.pointerEventsEnabled !== false
    ) return last;
    await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
  }
  return last || {found:false, reason:"effort_slider_timeout", candidateCount:0};
}

async function _pr88InstantEffortDispatchHome(debuggee) {
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type:"rawKeyDown", key:"Home", code:"Home",
    windowsVirtualKeyCode:36, nativeVirtualKeyCode:36
  });
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type:"keyUp", key:"Home", code:"Home",
    windowsVirtualKeyCode:36, nativeVirtualKeyCode:36
  });
}

async function _pr88InstantEffortWaitForSelected(debuggee, timeoutMs) {
  const startedAt = performance.now();
  let selected = null;
  let slider = null;
  let sliderMinReached = false;
  let sliderObservedAfterHome = false;
  while (performance.now() - startedAt < timeoutMs) {
    selected = await _pr88InstantSelectedModeSnapshot(debuggee);
    slider = await _pr88InstantEffortSliderSnapshot(debuggee, "snapshot");
    if (slider?.found === true) {
      sliderObservedAfterHome = true;
      if (slider?.min === 0 && slider?.now === slider?.min) sliderMinReached = true;
    }
    if (
      selected?.selectedModeProven === true &&
      selected?.selectedMode === "INSTANT" &&
      (sliderMinReached || slider?.found !== true)
    ) {
      return {selected, slider, sliderMinReached, sliderObservedAfterHome};
    }
    await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
  }
  return {selected, slider, sliderMinReached, sliderObservedAfterHome};
}

/* END legacy source: service_worker_instant_effort_slider_key_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_effort_slider_selection_pr8_8.js */
// PR8.8 production Instant selection overlay.
// Uses explicit reasoning-effort helpers. No monkey-patching of the shared raw
// click or slider snapshot primitives is required.

_pr88SelectionEnsureInstant = async function _pr88SelectionEnsureInstantViaEffortSlider(debuggee, context) {
  if (context.selectionChecked === true) return;
  context.selectionChecked = true;
  const startedAt = performance.now();

  const before = await _pr88InstantSelectedModeSnapshot(debuggee);
  context.selectedModeBeforeSelection = before?.selectedMode || null;
  context.selectedModeBeforeSelectionProven = before?.selectedModeProven === true;
  context.selectedModeBeforeSelectionProofKind = before?.proofKind || "unknown";
  context.selectedModeBeforeSelectionCandidateCount = Number.isInteger(before?.candidateCount)
    ? before.candidateCount : 0;

  Object.assign(context, {
    instantEffortSelectionSchemaVersion: PR88_INSTANT_EFFORT_SELECTION_SCHEMA_VERSION,
    selectionMechanism: null,
    instantEffortPickerClickPerformed: false,
    effortSliderCandidateCount: 0,
    effortSliderAriaValueMin: null,
    effortSliderAriaValueMax: null,
    effortSliderAriaValueNowBefore: null,
    effortSliderAriaValueNowAfter: null,
    effortSliderStepCount: null,
    effortSliderFocusProven: false,
    effortSliderHomeDispatched: false,
    effortSliderMinReachedProven: false,
    effortSliderObservedAfterHome: false,
    advancedControlClicked: false,
    modelControlClicked: false
  });

  if (before?.selectedModeProven !== true || typeof before?.selectedMode !== "string") {
    throw new Error("PR8_8_INSTANT_EFFORT_INITIAL_MODE_NOT_PROVEN");
  }
  if (before.selectedMode === "INSTANT") {
    context.selectionPerformed = false;
    context.selectionMechanism = "NO_SELECTION_REQUIRED";
    context.selectedModeAfterSelection = "INSTANT";
    context.selectedModeAfterSelectionProven = true;
    context.selectedModeAfterSelectionProofKind = before.proofKind || "unknown";
    context.selectionElapsedMs = _pr88SelectionDurationMs(startedAt);
    context.selectionMutationElapsedMs = 0;
    context.selectionComplete = true;
    return;
  }

  context.selectionPerformed = true;
  context.selectionMechanism = "REASONING_EFFORT_SLIDER_HOME";
  _pr88SelectionInstallNetworkWindow(debuggee, context);
  const mutationStartedAt = performance.now();

  const picker = await _pr88SelectionPoint(debuggee, "picker");
  context.pickerCandidateCount = Number.isInteger(picker?.candidateCount) ? picker.candidateCount : 0;
  context.pickerNearestDistancePx = _pr88SelectionSafeInt(picker?.nearestDistancePx);
  context.pickerModeBeforeClick = typeof picker?.mode === "string" ? picker.mode : null;
  context.instantOptionCandidateCount = 0;
  if (picker?.found !== true || picker?.candidateCount !== 1 || picker?.mode !== before.selectedMode) {
    throw new Error(`PR8_8_INSTANT_EFFORT_PICKER_NOT_PROVEN:${picker?.reason || "identity_mismatch"}`);
  }

  let slider = await _pr88InstantEffortResolvedSliderSnapshot(debuggee, "snapshot");
  const alreadyOpen = (
    slider?.found === true && slider?.candidateCount === 1 &&
    slider?.min === 0 && slider?.max === 2 && slider?.stepCount === 3 &&
    slider?.currentControlOpen === true && slider?.currentMode === before.selectedMode
  );
  if (!alreadyOpen) {
    await _pr88InstantEffortOpenPickerWithFallback(debuggee, picker, before.selectedMode);
    context.instantEffortPickerClickPerformed = true;
    slider = await _pr88InstantEffortWaitForResolvedSlider(debuggee, before.selectedMode, 3000);
  }

  context.effortSliderCandidateCount = Number.isInteger(slider?.candidateCount) ? slider.candidateCount : 0;
  context.effortSliderAriaValueMin = Number.isFinite(slider?.min) ? slider.min : null;
  context.effortSliderAriaValueMax = Number.isFinite(slider?.max) ? slider.max : null;
  context.effortSliderAriaValueNowBefore = Number.isFinite(slider?.now) ? slider.now : null;
  context.effortSliderStepCount = Number.isInteger(slider?.stepCount) ? slider.stepCount : null;
  if (
    slider?.found !== true || slider?.candidateCount !== 1 ||
    slider?.min !== 0 || slider?.max !== 2 || slider?.stepCount !== 3
  ) {
    throw new Error(`PR8_8_INSTANT_EFFORT_SLIDER_CONTRACT_NOT_PROVEN:${slider?.reason || "range_mismatch"}`);
  }
  if (context.unexpectedConversationWriteBeforeSelectionComplete === true) {
    throw new Error("PR8_8_INSTANT_EFFORT_CONVERSATION_WRITE_BEFORE_SELECTION");
  }

  const focused = await _pr88InstantEffortResolvedSliderSnapshot(debuggee, "focus");
  context.effortSliderFocusProven = focused?.focusProven === true;
  if (
    focused?.found !== true || focused?.candidateCount !== 1 ||
    focused?.min !== 0 || focused?.max !== 2 ||
    focused?.stepCount !== 3 || focused?.focusProven !== true
  ) throw new Error("PR8_8_INSTANT_EFFORT_SLIDER_FOCUS_NOT_PROVEN");

  await _pr88InstantEffortDispatchHome(debuggee);
  context.effortSliderHomeDispatched = true;

  const settled = await _pr88InstantEffortWaitForResolvedSelected(
    debuggee, PR88_INSTANT_EFFORT_SELECTION_SETTLE_TIMEOUT_MS
  );
  const after = settled?.selected || null;
  const sliderAfter = settled?.slider || null;
  context.effortSliderMinReachedProven = settled?.sliderMinReached === true;
  context.effortSliderObservedAfterHome = settled?.sliderObservedAfterHome === true;
  context.effortSliderAriaValueNowAfter = Number.isFinite(sliderAfter?.now)
    ? sliderAfter.now : (context.effortSliderMinReachedProven ? 0 : null);
  context.selectedModeAfterSelection = after?.selectedMode || null;
  context.selectedModeAfterSelectionProven = after?.selectedModeProven === true;
  context.selectedModeAfterSelectionProofKind = after?.proofKind || "unknown";

  if (context.unexpectedConversationWriteBeforeSelectionComplete === true) {
    throw new Error("PR8_8_INSTANT_EFFORT_CONVERSATION_WRITE_BEFORE_SELECTION");
  }
  if (after?.selectedModeProven !== true || after?.selectedMode !== "INSTANT") {
    throw new Error("PR8_8_INSTANT_EFFORT_DID_NOT_SETTLE_TO_INSTANT");
  }
  if (settled?.sliderObservedAfterHome === true && settled?.sliderMinReached !== true) {
    throw new Error("PR8_8_INSTANT_EFFORT_SLIDER_MIN_NOT_REACHED");
  }

  context.selectionMutationElapsedMs = _pr88SelectionDurationMs(mutationStartedAt);
  context.selectionElapsedMs = _pr88SelectionDurationMs(startedAt);
  context.selectionComplete = true;
};

/* END legacy source: service_worker_instant_effort_slider_selection_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_effort_activation_hardening_pr8_8.js */
// PR8.8 production hardening for current-effort picker actuation.
// This file intentionally does NOT monkey-patch _pr88SelectionRawClick or
// _pr88InstantEffortSliderSnapshot. Shipping code calls these helpers explicitly,
// keeping the wrapper graph acyclic.

function _pr88InstantEffortRelaxedSliderExpression(action) {
  return `(() => {
    const ACTION = ${JSON.stringify(action)};
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\\s_\\-]+/g, ' ');
    const effort = (value) => {
      const text = normalize(value);
      if (!text) return null;
      if (/(^|\\b)(instant|мгновенно)(\\b|$)/.test(text)) return 'INSTANT';
      if (/(^|\\b)(medium|средний)(\\b|$)/.test(text)) return 'MEDIUM';
      if (/(^|\\b)(high|высокий)(\\b|$)/.test(text)) return 'HIGH';
      return null;
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const r=el.getBoundingClientRect();
      if (r.width<=0||r.height<=0) return false;
      const s=getComputedStyle(el);
      return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
    };
    const num=(value)=>{
      if(value===null||value===undefined||value==='') return null;
      const parsed=Number(value);
      return Number.isFinite(parsed)?parsed:null;
    };
    const fields=(el)=>[
      typeof el.innerText==='string'?el.innerText.slice(0,160):'',
      el.getAttribute('aria-label'),el.getAttribute('title')
    ];
    const oneMode=(el)=>{
      const modes=Array.from(new Set(fields(el).map(effort).filter(Boolean)));
      return modes.length===1?modes[0]:null;
    };
    const composer=['#prompt-textarea','[contenteditable="true"][data-lexical-editor="true"]','textarea[placeholder]']
      .map((s)=>document.querySelector(s)).find((el)=>el&&visible(el));
    if(!composer) return {found:false,reason:'composer_missing',candidateCount:0,currentControlCount:0};
    const cr=composer.getBoundingClientRect();
    const controls=[];
    for(const el of Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)) {
      const mode=oneMode(el);
      if(!mode) continue;
      const r=el.getBoundingClientRect();
      const dx=Math.max(0,Math.max(cr.left-r.right,r.left-cr.right));
      const dy=Math.max(0,Math.max(cr.top-r.bottom,r.top-cr.bottom));
      const distance=Math.hypot(dx,dy);
      if(distance<=800) controls.push({el,mode,r,distance});
    }
    controls.sort((a,b)=>a.distance-b.distance);
    if(controls.length!==1) return {
      found:false,
      reason:controls.length?'current_effort_control_ambiguous':'current_effort_control_missing',
      candidateCount:0,currentControlCount:controls.length
    };
    const control=controls[0];
    const controlOpenObserved=
      control.el.getAttribute('aria-expanded')==='true'||
      normalize(control.el.getAttribute('data-state'))==='open';
    const sliders=[];
    for(const el of Array.from(document.querySelectorAll('[role="slider"],input[type="range"]')).filter(visible)) {
      const r=el.getBoundingClientRect();
      const min=num(el.getAttribute('aria-valuemin'))??num(el.min);
      const max=num(el.getAttribute('aria-valuemax'))??num(el.max);
      const now=num(el.getAttribute('aria-valuenow'))??num(el.value);
      if(!(Number.isInteger(min)&&Number.isInteger(max)&&Number.isInteger(now)&&min===0&&max===2&&now>=0&&now<=2)) continue;
      const distance=Math.hypot(
        (r.left+r.width/2)-(control.r.left+control.r.width/2),
        (r.top+r.height/2)-(control.r.top+control.r.height/2)
      );
      if(distance<=400) sliders.push({el,min,max,now,distance});
    }
    sliders.sort((a,b)=>a.distance-b.distance);
    if(sliders.length!==1) return {
      found:false,
      reason:controlOpenObserved?(sliders.length?'effort_slider_ambiguous':'effort_slider_missing'):'quick_picker_not_open',
      candidateCount:sliders.length,currentControlCount:1,currentMode:control.mode,
      currentControlOpen:controlOpenObserved
    };
    const slider=sliders[0];
    let focusProven=document.activeElement===slider.el;
    if(ACTION==='focus') {
      try { slider.el.focus({preventScroll:true}); } catch { try { slider.el.focus(); } catch {} }
      focusProven=document.activeElement===slider.el;
    }
    return {
      found:true,reason:null,candidateCount:1,currentControlCount:1,
      currentMode:control.mode,currentControlOpen:true,
      currentControlOpenObserved:controlOpenObserved,
      openProofKind:controlOpenObserved?'trigger_open_state':'visible_exact_slider',
      min:slider.min,max:slider.max,now:slider.now,stepCount:3,
      disabled:Boolean(slider.el.disabled===true||slider.el.getAttribute('aria-disabled')==='true'),
      pointerEventsEnabled:getComputedStyle(slider.el).pointerEvents!=='none',
      focusProven
    };
  })()`;
}

async function _pr88InstantEffortRelaxedSliderSnapshot(debuggee, action='snapshot') {
  const result=await chrome.debugger.sendCommand(debuggee,'Runtime.evaluate',{
    expression:_pr88InstantEffortRelaxedSliderExpression(action),
    returnByValue:true,awaitPromise:true
  });
  const value=result?.result?.value;
  return value&&typeof value==='object'
    ? value
    : {found:false,reason:'relaxed_slider_probe_failed',candidateCount:0,currentControlCount:0};
}

async function _pr88InstantEffortResolvedSliderSnapshot(debuggee, action='snapshot') {
  const primary=await _pr88InstantEffortSliderSnapshot(debuggee,action);
  if(primary?.found===true||primary?.reason!=='quick_picker_not_open') return primary;
  return _pr88InstantEffortRelaxedSliderSnapshot(debuggee,action);
}

function _pr88InstantEffortTriggerExpression(action) {
  return `(() => {
    const ACTION=${JSON.stringify(action)};
    const normalize=(value)=>String(value||'').trim().toLowerCase().replace(/[\\s_\\-]+/g,' ');
    const effort=(value)=>{
      const text=normalize(value);
      if(!text) return null;
      if(/(^|\\b)(instant|мгновенно)(\\b|$)/.test(text)) return 'INSTANT';
      if(/(^|\\b)(medium|средний)(\\b|$)/.test(text)) return 'MEDIUM';
      if(/(^|\\b)(high|высокий)(\\b|$)/.test(text)) return 'HIGH';
      return null;
    };
    const visible=(el)=>{
      if(!(el instanceof Element)) return false;
      const r=el.getBoundingClientRect();
      if(r.width<=0||r.height<=0) return false;
      const s=getComputedStyle(el);
      return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
    };
    const composer=['#prompt-textarea','[contenteditable="true"][data-lexical-editor="true"]','textarea[placeholder]']
      .map((s)=>document.querySelector(s)).find((el)=>el&&visible(el));
    if(!composer) return {found:false,reason:'composer_missing',candidateCount:0};
    const cr=composer.getBoundingClientRect();
    const candidates=[];
    for(const el of Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)) {
      const modes=Array.from(new Set([el.innerText,el.getAttribute('aria-label'),el.getAttribute('title')].map(effort).filter(Boolean)));
      if(modes.length!==1) continue;
      const r=el.getBoundingClientRect();
      const dx=Math.max(0,Math.max(cr.left-r.right,r.left-cr.right));
      const dy=Math.max(0,Math.max(cr.top-r.bottom,r.top-cr.bottom));
      const distance=Math.hypot(dx,dy);
      if(distance<=800) candidates.push({el,mode:modes[0],distance});
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    if(candidates.length!==1) return {
      found:false,reason:candidates.length?'trigger_ambiguous':'trigger_missing',
      candidateCount:candidates.length
    };
    const target=candidates[0].el;
    if(ACTION==='focus') {
      try { target.focus({preventScroll:true}); } catch { try { target.focus(); } catch {} }
    }
    return {
      found:true,reason:null,candidateCount:1,mode:candidates[0].mode,
      open:target.getAttribute('aria-expanded')==='true'||normalize(target.getAttribute('data-state'))==='open',
      focusProven:document.activeElement===target
    };
  })()`;
}

async function _pr88InstantEffortTriggerSnapshot(debuggee,action='snapshot') {
  const result=await chrome.debugger.sendCommand(debuggee,'Runtime.evaluate',{
    expression:_pr88InstantEffortTriggerExpression(action),returnByValue:true,awaitPromise:true
  });
  const value=result?.result?.value;
  return value&&typeof value==='object'
    ? value
    : {found:false,reason:'trigger_probe_failed',candidateCount:0};
}

async function _pr88InstantEffortDispatchEnter(debuggee) {
  await chrome.debugger.sendCommand(debuggee,'Input.dispatchKeyEvent',{
    type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13
  });
  await chrome.debugger.sendCommand(debuggee,'Input.dispatchKeyEvent',{
    type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13
  });
}

async function _pr88InstantEffortOpenPickerWithFallback(debuggee,point,expectedMode) {
  await _pr88SelectionRawClick(debuggee,point);
  const startedAt=performance.now();
  while(performance.now()-startedAt<3000) {
    const slider=await _pr88InstantEffortResolvedSliderSnapshot(debuggee,'snapshot');
    if(slider?.found===true&&slider?.candidateCount===1) return;
    const trigger=await _pr88InstantEffortTriggerSnapshot(debuggee,'snapshot');
    if(trigger?.found===true&&trigger?.mode===expectedMode&&trigger?.open===true) return;
    await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
  }
  const trigger=await _pr88InstantEffortTriggerSnapshot(debuggee,'focus');
  if(!(trigger?.found===true&&trigger?.candidateCount===1&&trigger?.mode===expectedMode&&trigger?.focusProven===true)) {
    throw new Error('PR8_8_INSTANT_EFFORT_TRIGGER_FOCUS_NOT_PROVEN');
  }
  if(trigger.open===true) return;
  await _pr88InstantEffortDispatchEnter(debuggee);
}

async function _pr88InstantEffortWaitForResolvedSlider(debuggee,expectedMode,timeoutMs=3000) {
  const startedAt=performance.now();
  let last=null;
  while(performance.now()-startedAt<timeoutMs) {
    last=await _pr88InstantEffortResolvedSliderSnapshot(debuggee,'snapshot');
    if(
      last?.found===true&&last?.candidateCount===1&&
      last?.min===0&&last?.max===2&&Number.isInteger(last?.now)&&last?.stepCount===3&&
      last?.currentMode===expectedMode&&last?.disabled!==true&&last?.pointerEventsEnabled!==false
    ) return last;
    await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
  }
  return last||{found:false,reason:'effort_slider_timeout',candidateCount:0};
}

async function _pr88InstantEffortWaitForResolvedSelected(debuggee,timeoutMs) {
  const startedAt=performance.now();
  let selected=null,slider=null,sliderMinReached=false,sliderObservedAfterHome=false;
  while(performance.now()-startedAt<timeoutMs) {
    selected=await _pr88InstantSelectedModeSnapshot(debuggee);
    slider=await _pr88InstantEffortResolvedSliderSnapshot(debuggee,'snapshot');
    if(slider?.found===true) {
      sliderObservedAfterHome=true;
      if(slider?.min===0&&slider?.now===slider?.min) sliderMinReached=true;
    }
    if(
      selected?.selectedModeProven===true&&selected?.selectedMode==='INSTANT'&&
      (sliderMinReached||slider?.found!==true)
    ) return {selected,slider,sliderMinReached,sliderObservedAfterHome};
    await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
  }
  return {selected,slider,sliderMinReached,sliderObservedAfterHome};
}

/* END legacy source: service_worker_instant_effort_activation_hardening_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_effort_dom_activation_pr8_8.js */
// PR8.8 shipping hardening: activate the proven current-effort product control
// through the DOM button itself. This avoids background-tab pointer-actuation
// variance while preserving the same fail-closed, pre-input boundary.

function _pr88InstantEffortDomTriggerClickExpression(expectedMode) {
  return `(() => {
    const expectedMode=${JSON.stringify(expectedMode)};
    const normalize=(value)=>String(value||'').trim().toLowerCase().replace(/[\\s_\\-]+/g,' ');
    const effort=(value)=>{
      const text=normalize(value);
      if(!text) return null;
      // LOCALE-AGNOSTIC AND ORDERED. Two defects lived here (measured 2026-09-12 against the live
      // composer, whose control renders as the Chinese single character "高"):
      //   1. the table was English+Russian only, so the real control classified to null and the
      //      caller reported picker_missing / model-control-not-proven, which BLOCKS the submit --
      //      the prompt was never sent (submission_count 0);
      //   2. there was no EXTRA_HIGH branch, so "extra high" fell through to the HIGH test below
      //      and was reported as HIGH -- a wrong mode silently chosen, which is worse than a miss.
      // Chinese labels are matched with includes(), not \b: there is no word boundary between CJK
      // characters and the surrounding text.
      if(/(^|\\b)(instant|мгновенно)(\\b|$)/.test(text) || text.includes('即时')) return 'INSTANT';
      if(text.includes('extra high') || text.includes('极高') || text.includes('очень высокий')) return 'EXTRA_HIGH';
      if(/(^|\\b)(medium|средний)(\\b|$)/.test(text) || text === '中') return 'MEDIUM';
      if(/(^|\\b)(high|высокий)(\\b|$)/.test(text) || text === '高') return 'HIGH';
      return null;
    };
    const visible=(el)=>{
      if(!(el instanceof Element)) return false;
      const r=el.getBoundingClientRect();
      if(r.width<=0||r.height<=0) return false;
      const s=getComputedStyle(el);
      return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
    };
    const composer=['#prompt-textarea','[contenteditable="true"][data-lexical-editor="true"]','textarea[placeholder]']
      .map((s)=>document.querySelector(s)).find((el)=>el&&visible(el));
    if(!composer) return {clicked:false,reason:'composer_missing',candidateCount:0};
    const cr=composer.getBoundingClientRect();
    const candidates=[];
    for(const el of Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)) {
      const modes=Array.from(new Set([
        el.innerText,el.getAttribute('aria-label'),el.getAttribute('title')
      ].map(effort).filter(Boolean)));
      if(modes.length!==1) continue;
      const r=el.getBoundingClientRect();
      const dx=Math.max(0,Math.max(cr.left-r.right,r.left-cr.right));
      const dy=Math.max(0,Math.max(cr.top-r.bottom,r.top-cr.bottom));
      const distance=Math.hypot(dx,dy);
      if(distance<=800) candidates.push({el,mode:modes[0],distance});
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    if(candidates.length!==1) return {
      clicked:false,
      reason:candidates.length?'trigger_ambiguous':'trigger_missing',
      candidateCount:candidates.length
    };
    const candidate=candidates[0];
    if(candidate.mode!==expectedMode) return {
      clicked:false,reason:'trigger_mode_mismatch',candidateCount:1,mode:candidate.mode
    };
    const target=candidate.el;
    const disabled=Boolean(
      target.disabled===true||
      target.getAttribute('aria-disabled')==='true'
    );
    const pointerEventsEnabled=getComputedStyle(target).pointerEvents!=='none';
    if(disabled||!pointerEventsEnabled) return {
      clicked:false,reason:'trigger_not_actionable',candidateCount:1,mode:candidate.mode
    };
    const openBefore=
      target.getAttribute('aria-expanded')==='true'||
      normalize(target.getAttribute('data-state'))==='open';
    target.click();
    return {
      clicked:true,reason:null,candidateCount:1,mode:candidate.mode,openBefore
    };
  })()`;
}

async function _pr88InstantEffortDomTriggerClick(debuggee,expectedMode) {
  const result=await chrome.debugger.sendCommand(debuggee,'Runtime.evaluate',{
    expression:_pr88InstantEffortDomTriggerClickExpression(expectedMode),
    returnByValue:true,
    awaitPromise:true
  });
  const value=result?.result?.value;
  return value&&typeof value==='object'
    ? value
    : {clicked:false,reason:'dom_trigger_probe_failed',candidateCount:0};
}

_pr88InstantEffortOpenPickerWithFallback =
  async function _pr88InstantEffortOpenPickerViaProvenDomControl(
    debuggee,point,expectedMode
  ) {
    if(
      point?.found!==true||
      point?.candidateCount!==1||
      point?.mode!==expectedMode
    ) {
      throw new Error('PR8_8_INSTANT_EFFORT_DOM_TRIGGER_IDENTITY_NOT_PROVEN');
    }

    const already=await _pr88InstantEffortResolvedSliderSnapshot(debuggee,'snapshot');
    if(already?.found===true&&already?.candidateCount===1) return;

    const clicked=await _pr88InstantEffortDomTriggerClick(debuggee,expectedMode);
    if(
      clicked?.clicked!==true||
      clicked?.candidateCount!==1||
      clicked?.mode!==expectedMode
    ) {
      throw new Error(
        `PR8_8_INSTANT_EFFORT_DOM_TRIGGER_CLICK_NOT_PROVEN:${clicked?.reason||'unknown'}`
      );
    }

    const startedAt=performance.now();
    while(performance.now()-startedAt<3000) {
      const slider=await _pr88InstantEffortResolvedSliderSnapshot(debuggee,'snapshot');
      if(slider?.found===true&&slider?.candidateCount===1) return;
      const trigger=await _pr88InstantEffortTriggerSnapshot(debuggee,'snapshot');
      if(trigger?.found===true&&trigger?.mode===expectedMode&&trigger?.open===true) return;
      await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
    }

    const trigger=await _pr88InstantEffortTriggerSnapshot(debuggee,'focus');
    if(!(
      trigger?.found===true&&
      trigger?.candidateCount===1&&
      trigger?.mode===expectedMode&&
      trigger?.focusProven===true
    )) {
      throw new Error('PR8_8_INSTANT_EFFORT_TRIGGER_FOCUS_NOT_PROVEN');
    }
    if(trigger.open===true) return;
    await _pr88InstantEffortDispatchEnter(debuggee);
  };

/* END legacy source: service_worker_instant_effort_dom_activation_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_effort_transient_foreground_pr8_8.js */
// PR8.8 shipping hardening for fresh runtime tabs.
// Fresh Browser Authority tabs are intentionally created inactive. Current ChatGPT
// effort-picker UI is allowed one bounded transient foreground window only while
// Instant selection is required. The previously active tab is restored in finally.

const _pr88InstantEffortForegroundPriorEnsureInstant = _pr88SelectionEnsureInstant;

async function _pr88InstantEffortDocumentVisible(debuggee) {
  try {
    const result = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
      expression: `(() => ({visible:document.visibilityState==='visible' && document.hidden!==true}))()`,
      returnByValue: true,
      awaitPromise: true
    });
    return result?.result?.value?.visible === true;
  } catch {
    return false;
  }
}

async function _pr88InstantEffortWaitForeground(debuggee, timeoutMs = 2500) {
  const tabId = Number.isInteger(debuggee?.tabId) ? debuggee.tabId : null;
  if (tabId === null) return false;
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.active === true && await _pr88InstantEffortDocumentVisible(debuggee)) {
        return true;
      }
    } catch {}
    await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
  }
  return false;
}

async function _pr88InstantEffortRestorePriorTab(state) {
  const result = {
    attempted: false,
    restored: state?.activated !== true,
    priorTabPresent: Number.isInteger(state?.priorActiveTabId)
  };
  if (state?.activated !== true || !Number.isInteger(state?.priorActiveTabId)) {
    return result;
  }
  result.attempted = true;
  try {
    const prior = await chrome.tabs.get(state.priorActiveTabId);
    if (!prior || prior.windowId !== state.windowId) return result;
    await chrome.tabs.update(state.priorActiveTabId, {active: true});
    const startedAt = performance.now();
    while (performance.now() - startedAt < 1500) {
      const current = await chrome.tabs.get(state.priorActiveTabId);
      if (current?.active === true) {
        result.restored = true;
        return result;
      }
      await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
    }
  } catch {}
  return result;
}

async function _pr88InstantEffortBeginTransientForeground(debuggee) {
  const tabId = Number.isInteger(debuggee?.tabId) ? debuggee.tabId : null;
  if (tabId === null) {
    throw new Error('PR8_8_INSTANT_EFFORT_RUNTIME_TAB_REQUIRED');
  }

  const runtimeTab = await chrome.tabs.get(tabId);
  const windowId = Number.isInteger(runtimeTab?.windowId) ? runtimeTab.windowId : null;
  if (windowId === null) {
    throw new Error('PR8_8_INSTANT_EFFORT_RUNTIME_WINDOW_REQUIRED');
  }

  let priorActiveTabId = null;
  try {
    const activeTabs = await chrome.tabs.query({active: true, windowId});
    const prior = activeTabs.find((tab) => Number.isInteger(tab?.id) && tab.id !== tabId);
    priorActiveTabId = Number.isInteger(prior?.id) ? prior.id : null;
  } catch {}

  const state = {
    tabId,
    windowId,
    activated: runtimeTab?.active !== true,
    priorActiveTabId,
    foregroundProven: false
  };

  try {
    if (state.activated) {
      await chrome.tabs.update(tabId, {active: true});
    }
    state.foregroundProven = await _pr88InstantEffortWaitForeground(debuggee, 2500);
    if (state.foregroundProven !== true) {
      throw new Error('PR8_8_INSTANT_EFFORT_FOREGROUND_NOT_PROVEN');
    }
    // Give the product surface one bounded paint/event-loop turn after visibility.
    await sleep(150);
    return state;
  } catch (error) {
    await _pr88InstantEffortRestorePriorTab(state);
    throw error;
  }
}

_pr88SelectionEnsureInstant =
  async function _pr88SelectionEnsureInstantWithTransientForeground(debuggee, context) {
    if (context?.selectionChecked === true) {
      return _pr88InstantEffortForegroundPriorEnsureInstant(debuggee, context);
    }

    const before = await _pr88InstantSelectedModeSnapshot(debuggee);
    if (before?.selectedModeProven !== true || before?.selectedMode === 'INSTANT') {
      return _pr88InstantEffortForegroundPriorEnsureInstant(debuggee, context);
    }

    const foreground = await _pr88InstantEffortBeginTransientForeground(debuggee);
    context.instantEffortTransientForegroundRequested = true;
    context.instantEffortTransientForegroundActivated = foreground.activated === true;
    context.instantEffortTransientForegroundProven = foreground.foregroundProven === true;
    context.instantEffortPriorActiveTabPresent = Number.isInteger(foreground.priorActiveTabId);

    try {
      return await _pr88InstantEffortForegroundPriorEnsureInstant(debuggee, context);
    } finally {
      const restored = await _pr88InstantEffortRestorePriorTab(foreground);
      context.instantEffortForegroundRestoreAttempted = restored.attempted === true;
      context.instantEffortForegroundRestoreProven = restored.restored === true;
    }
  };

/* END legacy source: service_worker_instant_effort_transient_foreground_pr8_8.js */


/* BEGIN legacy source: service_worker_instant_effort_slider_support_pr8_8.js */
// PR8.8 selection record enrichment and support RPC.

const _pr88InstantEffortPriorSelectionRecord = _pr88SelectionRecord;
const _pr88InstantEffortPriorExecuteNativeTurn = executeNativeTurn;

_pr88SelectionRecord = function _pr88SelectionRecordWithEffortSlider(context) {
  const base = _pr88InstantEffortPriorSelectionRecord(context);
  const finite = (value) => Number.isFinite(value) ? value : null;
  return {
    ...base,
    instantEffortSelectionSchemaVersion:
      context.instantEffortSelectionSchemaVersion || PR88_INSTANT_EFFORT_SELECTION_SCHEMA_VERSION,
    selectionMechanism: context.selectionMechanism || null,
    instantEffortPickerClickPerformed: context.instantEffortPickerClickPerformed === true,
    effortSliderCandidateCount: Number.isInteger(context.effortSliderCandidateCount)
      ? context.effortSliderCandidateCount : 0,
    effortSliderAriaValueMin: finite(context.effortSliderAriaValueMin),
    effortSliderAriaValueMax: finite(context.effortSliderAriaValueMax),
    effortSliderAriaValueNowBefore: finite(context.effortSliderAriaValueNowBefore),
    effortSliderAriaValueNowAfter: finite(context.effortSliderAriaValueNowAfter),
    effortSliderStepCount: Number.isInteger(context.effortSliderStepCount)
      ? context.effortSliderStepCount : null,
    effortSliderFocusProven: context.effortSliderFocusProven === true,
    effortSliderHomeDispatched: context.effortSliderHomeDispatched === true,
    effortSliderMinReachedProven: context.effortSliderMinReachedProven === true,
    effortSliderObservedAfterHome: context.effortSliderObservedAfterHome === true,
    advancedControlClicked: context.advancedControlClicked === true,
    modelControlClicked: context.modelControlClicked === true
  };
};

executeNativeTurn = async function _executeNativeTurnWithInstantEffortSelectionSupport(message) {
  if (message?.characterizeInstantEffortSelectionSupport === true) {
    if (_pr88InstantEffortSupportConflict(message)) {
      throw new Error("PR8_8_INSTANT_EFFORT_SUPPORT_FLAG_CONFLICT");
    }
    return {
      instantEffortSelectionSupported: true,
      instantEffortSelectionSchemaVersion: PR88_INSTANT_EFFORT_SELECTION_SCHEMA_VERSION,
      productionInstantWorkingPathSupported: true,
      quickPickerOnly: true,
      exactDiscreteRangeRequired: true,
      semanticHomeKeySelectionSupported: true,
      selectedInstantProofRequired: true,
      preInputFailureBoundaryPreserved: true,
      advancedPickerClickForbidden: true,
      modelControlClickForbidden: true,
      automaticRetry: false
    };
  }
  return _pr88InstantEffortPriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_instant_effort_slider_support_pr8_8.js */


/* BEGIN legacy source: service_worker_model_profile_selection_pr8_10.js */
// PR8.10 generalized semantic model-profile selector over the proven PR8.8 effort slider.
// Supports only the three product states already characterized in production:
// INSTANT (0), MEDIUM (1), HIGH (2). Explicit unsupported modes fail before write.

const PR810_MODEL_PROFILE_SCHEMA_VERSION = 1;
const PR810_MODEL_PROFILE_STORAGE_KEY = "browserAuthorityLastModelProfileSelectionV1";
const PR810_MODEL_MODE_INDEX = Object.freeze({INSTANT: 0, MEDIUM: 1, HIGH: 2});
const PR810_INITIAL_MODE_ACQUISITION_TIMEOUT_MS = 8000;

const _pr810ModelProfilePriorExecuteNativeTurn = executeNativeTurn;
const _pr810ModelProfilePriorLocateAndFocusComposer = locateAndFocusComposer;
let _pr810ModelProfileContext = null;

function _pr810Mode(value) {
  const mode = typeof value === "string" ? value.trim().toUpperCase() : "";
  return Object.prototype.hasOwnProperty.call(PR810_MODEL_MODE_INDEX, mode) ? mode : null;
}

function _pr810Lease(value) {
  const lease = typeof value === "string" ? value.trim() : "";
  return lease || null;
}

function _pr810QueryConflict(message) {
  return (
    message?.text != null ||
    message?.conversationId != null ||
    message?.browserAuthorityLeaseId != null ||
    message?.canonicalCompleted === true
  );
}

function _pr810InitialModeFailure(before) {
  const proofKind = typeof before?.proofKind === "string" ? before.proofKind : "unknown";
  const composerReady = before?.composerReady === true ? "true" : "false";
  const candidateCount = Number.isInteger(before?.candidateCount) ? before.candidateCount : 0;
  return `PR8_10_MODEL_PROFILE_INITIAL_MODE_NOT_PROVEN:${proofKind}:composer_ready=${composerReady}:candidate_count=${candidateCount}`;
}

async function _pr810DispatchKey(debuggee, key, code, virtualKeyCode) {
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "rawKeyDown", key, code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode
  });
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyUp", key, code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode
  });
}

async function _pr810WaitForTarget(debuggee, targetMode, targetIndex, timeoutMs = 8000) {
  const startedAt = performance.now();
  let selected = null;
  let slider = null;
  while (performance.now() - startedAt < timeoutMs) {
    selected = await _pr88InstantSelectedModeSnapshot(debuggee);
    slider = await _pr88InstantEffortResolvedSliderSnapshot(debuggee, "snapshot");
    const sliderCompatible = (
      slider?.found !== true ||
      (slider?.min === 0 && slider?.max === 2 && slider?.stepCount === 3 && slider?.now === targetIndex)
    );
    if (
      selected?.selectedModeProven === true &&
      selected?.selectedMode === targetMode &&
      sliderCompatible
    ) {
      return {selected, slider};
    }
    await sleep(PR88_INSTANT_EFFORT_SELECTION_POLL_MS);
  }
  return {selected, slider};
}

function _pr810InstallWriteBoundary(debuggee, context) {
  const listener = (source, method, params) => {
    if (source?.tabId !== debuggee.tabId || method !== "Network.requestWillBeSent") return;
    const request = params?.request;
    if (isConversationWrite(request?.url || "", request?.method || "")) {
      if (context.selectionComplete !== true) context.conversationWriteBeforeSelection = true;
      try { chrome.debugger.onEvent.removeListener(listener); } catch {}
      context.writeBoundaryListener = null;
    }
  };
  chrome.debugger.onEvent.addListener(listener);
  context.writeBoundaryListener = listener;
}

async function _pr810EnsureTargetMode(debuggee, context) {
  if (context.selectionChecked === true) return;
  context.selectionChecked = true;
  const startedAt = performance.now();
  const targetMode = context.requestedModelMode;
  const targetIndex = PR810_MODEL_MODE_INDEX[targetMode];

  const initialModeStartedAt = performance.now();
  const before = await _pr88InstantWaitForSelectedMode(
    debuggee,
    PR810_INITIAL_MODE_ACQUISITION_TIMEOUT_MS
  );
  context.initialModeAcquisitionElapsedMs = Math.max(
    0,
    Math.round(performance.now() - initialModeStartedAt)
  );
  context.initialModeComposerReady = before?.composerReady === true;
  context.selectedModeBefore = before?.selectedMode || null;
  context.selectedModeBeforeProven = before?.selectedModeProven === true;
  context.selectedModeBeforeProofKind = before?.proofKind || "unknown";
  context.selectedModeBeforeCandidateCount = Number.isInteger(before?.candidateCount)
    ? before.candidateCount
    : 0;
  context.selectedModeBeforeNearestDistancePx = Number.isFinite(before?.nearestDistancePx)
    ? Math.max(0, Math.round(before.nearestDistancePx))
    : null;

  if (before?.selectedModeProven !== true || typeof before?.selectedMode !== "string") {
    throw new Error(_pr810InitialModeFailure(before));
  }
  if (_pr810Mode(before.selectedMode) === null) {
    throw new Error(`PR8_10_MODEL_PROFILE_INITIAL_MODE_UNSUPPORTED:${before.selectedMode}`);
  }

  if (before.selectedMode === targetMode) {
    context.selectionPerformed = false;
    context.selectionMechanism = "NO_SELECTION_REQUIRED";
    context.selectedModeAfter = targetMode;
    context.selectedModeAfterProven = true;
    context.selectionComplete = true;
    context.selectionElapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    return;
  }

  context.selectionPerformed = true;
  context.selectionMechanism = "REASONING_EFFORT_SLIDER_HOME_PLUS_RIGHT";
  _pr810InstallWriteBoundary(debuggee, context);

  const foreground = await _pr88InstantEffortBeginTransientForeground(debuggee);
  context.transientForegroundActivated = foreground.activated === true;
  context.transientForegroundProven = foreground.foregroundProven === true;
  try {
    const picker = await _pr88SelectionPoint(debuggee, "picker");
    if (picker?.found !== true || picker?.candidateCount !== 1 || picker?.mode !== before.selectedMode) {
      throw new Error(`PR8_10_MODEL_PROFILE_PICKER_NOT_PROVEN:${picker?.reason || "identity_mismatch"}`);
    }

    let slider = await _pr88InstantEffortResolvedSliderSnapshot(debuggee, "snapshot");
    const alreadyOpen = (
      slider?.found === true && slider?.candidateCount === 1 &&
      slider?.min === 0 && slider?.max === 2 && slider?.stepCount === 3 &&
      slider?.currentControlOpen === true && slider?.currentMode === before.selectedMode
    );
    if (!alreadyOpen) {
      await _pr88InstantEffortOpenPickerWithFallback(debuggee, picker, before.selectedMode);
      slider = await _pr88InstantEffortWaitForResolvedSlider(debuggee, before.selectedMode, 3000);
    }
    if (
      slider?.found !== true || slider?.candidateCount !== 1 ||
      slider?.min !== 0 || slider?.max !== 2 || slider?.stepCount !== 3
    ) {
      throw new Error(`PR8_10_MODEL_PROFILE_SLIDER_CONTRACT_NOT_PROVEN:${slider?.reason || "range_mismatch"}`);
    }

    const focused = await _pr88InstantEffortResolvedSliderSnapshot(debuggee, "focus");
    if (focused?.focusProven !== true || focused?.min !== 0 || focused?.max !== 2 || focused?.stepCount !== 3) {
      throw new Error("PR8_10_MODEL_PROFILE_SLIDER_FOCUS_NOT_PROVEN");
    }

    await _pr88InstantEffortDispatchHome(debuggee);
    for (let index = 0; index < targetIndex; index += 1) {
      await _pr810DispatchKey(debuggee, "ArrowRight", "ArrowRight", 39);
    }

    const settled = await _pr810WaitForTarget(debuggee, targetMode, targetIndex);
    const after = settled?.selected;
    const sliderAfter = settled?.slider;
    context.sliderValueAfter = Number.isFinite(sliderAfter?.now) ? sliderAfter.now : targetIndex;
    context.selectedModeAfter = after?.selectedMode || null;
    context.selectedModeAfterProven = after?.selectedModeProven === true;
    if (context.conversationWriteBeforeSelection === true) {
      throw new Error("PR8_10_MODEL_PROFILE_CONVERSATION_WRITE_BEFORE_SELECTION");
    }
    if (after?.selectedModeProven !== true || after?.selectedMode !== targetMode) {
      throw new Error(`PR8_10_MODEL_PROFILE_DID_NOT_SETTLE:${targetMode}`);
    }
    if (sliderAfter?.found === true && sliderAfter?.now !== targetIndex) {
      throw new Error(`PR8_10_MODEL_PROFILE_SLIDER_TARGET_NOT_REACHED:${targetIndex}`);
    }
    context.selectionComplete = true;
  } finally {
    const restored = await _pr88InstantEffortRestorePriorTab(foreground);
    context.foregroundRestoreAttempted = restored.attempted === true;
    context.foregroundRestoreProven = restored.restored === true;
  }
  context.selectionElapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
}

locateAndFocusComposer = async function _locateAndFocusComposerWithModelProfile(debuggee) {
  if (_pr810ModelProfileContext !== null) {
    await _pr810EnsureTargetMode(debuggee, _pr810ModelProfileContext);
  }
  return _pr810ModelProfilePriorLocateAndFocusComposer(debuggee);
};

function _pr810Record(context) {
  return {
    schemaVersion: PR810_MODEL_PROFILE_SCHEMA_VERSION,
    browserAuthorityLeaseId: context.leaseId,
    requestedModelMode: context.requestedModelMode,
    requestedSliderIndex: PR810_MODEL_MODE_INDEX[context.requestedModelMode],
    initialModeAcquisitionTimeoutMs: PR810_INITIAL_MODE_ACQUISITION_TIMEOUT_MS,
    initialModeAcquisitionElapsedMs: Number.isFinite(context.initialModeAcquisitionElapsedMs)
      ? context.initialModeAcquisitionElapsedMs
      : null,
    initialModeComposerReady: context.initialModeComposerReady === true,
    selectedModeBefore: context.selectedModeBefore,
    selectedModeBeforeProven: context.selectedModeBeforeProven === true,
    selectedModeBeforeProofKind: context.selectedModeBeforeProofKind || null,
    selectedModeBeforeCandidateCount: Number.isInteger(context.selectedModeBeforeCandidateCount)
      ? context.selectedModeBeforeCandidateCount
      : 0,
    selectedModeBeforeNearestDistancePx: Number.isFinite(context.selectedModeBeforeNearestDistancePx)
      ? context.selectedModeBeforeNearestDistancePx
      : null,
    selectionPerformed: context.selectionPerformed === true,
    selectionMechanism: context.selectionMechanism || null,
    selectedModeAfter: context.selectedModeAfter,
    selectedModeAfterProven: context.selectedModeAfterProven === true,
    sliderValueAfter: Number.isFinite(context.sliderValueAfter) ? context.sliderValueAfter : null,
    selectionComplete: context.selectionComplete === true,
    conversationWriteBeforeSelection: context.conversationWriteBeforeSelection === true,
    transientForegroundActivated: context.transientForegroundActivated === true,
    transientForegroundProven: context.transientForegroundProven === true,
    foregroundRestoreAttempted: context.foregroundRestoreAttempted === true,
    foregroundRestoreProven: context.foregroundRestoreProven !== false,
    selectionElapsedMs: Number.isFinite(context.selectionElapsedMs) ? context.selectionElapsedMs : null
  };
}

async function _pr810StoredRecord() {
  try {
    const stored = await chrome.storage.local.get(PR810_MODEL_PROFILE_STORAGE_KEY);
    const value = stored?.[PR810_MODEL_PROFILE_STORAGE_KEY];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

executeNativeTurn = async function _executeNativeTurnWithModelProfile(message) {
  if (message?.characterizeProductModelProfileSupport === true) {
    if (_pr810QueryConflict(message)) throw new Error("PR8_10_MODEL_PROFILE_SUPPORT_FLAG_CONFLICT");
    return {
      modelProfileSelectionSupported: true,
      modelProfileSelectionSchemaVersion: PR810_MODEL_PROFILE_SCHEMA_VERSION,
      supportedProductModes: ["INSTANT", "MEDIUM", "HIGH"],
      sliderIndices: {...PR810_MODEL_MODE_INDEX},
      strictPrewriteVerification: true,
      boundedInitialModeAcquisition: true,
      initialModeAcquisitionTimeoutMs: PR810_INITIAL_MODE_ACQUISITION_TIMEOUT_MS,
      maxProfileMapped: false
    };
  }

  if (message?.characterizeProductModelProfileSelectionRecord === true) {
    if (_pr810QueryConflict(message)) throw new Error("PR8_10_MODEL_PROFILE_RECORD_FLAG_CONFLICT");
    const expectedLease = _pr810Lease(message?.expectedBrowserAuthorityLeaseId);
    const record = await _pr810StoredRecord();
    if (!record) throw new Error("PR8_10_MODEL_PROFILE_RECORD_UNAVAILABLE");
    if (expectedLease && record.browserAuthorityLeaseId !== expectedLease) {
      throw new Error("PR8_10_MODEL_PROFILE_LEASE_MISMATCH");
    }
    return {
      modelProfileSelectionSupported: true,
      modelProfileSelection: record
    };
  }

  const requestedRaw = message?.requiredModelMode;
  const requestedMode = _pr810Mode(requestedRaw);
  const leaseId = _pr810Lease(message?.browserAuthorityLeaseId);
  const ordinaryWrite = typeof message?.text === "string" && Boolean(message.text.trim()) && leaseId !== null;
  if (!ordinaryWrite || requestedRaw == null) return _pr810ModelProfilePriorExecuteNativeTurn(message);
  if (requestedMode === null) throw new Error(`PR8_10_MODEL_MODE_UNSUPPORTED:${String(requestedRaw)}`);
  if (_pr810ModelProfileContext !== null) throw new Error("PR8_10_MODEL_PROFILE_CONTEXT_ALREADY_ACTIVE");

  const context = {
    leaseId,
    requestedModelMode: requestedMode,
    selectionChecked: false,
    selectionComplete: false,
    conversationWriteBeforeSelection: false,
    writeBoundaryListener: null
  };
  _pr810ModelProfileContext = context;
  try {
    const result = await _pr810ModelProfilePriorExecuteNativeTurn(message);
    if (context.selectionComplete !== true || context.selectedModeAfterProven !== true || context.selectedModeAfter !== requestedMode) {
      throw new Error("PR8_10_MODEL_PROFILE_PREWRITE_PROOF_MISSING");
    }
    const record = _pr810Record(context);
    try {
      await chrome.storage.local.set({[PR810_MODEL_PROFILE_STORAGE_KEY]: record});
    } catch {}
    return {...result, modelProfileSelection: record};
  } finally {
    if (context.writeBoundaryListener) {
      try { chrome.debugger.onEvent.removeListener(context.writeBoundaryListener); } catch {}
    }
    _pr810ModelProfileContext = null;
  }
};
/* END legacy source: service_worker_model_profile_selection_pr8_10.js */


/* BEGIN legacy source: service_worker_safe_browser_response_stream_pr8_9.js */
// PR8.9 Candidate B: bounded safe browser response-stream characterization.
//
// Diagnostic-only. It never changes request payloads, never pauses or fulfills
// network requests, and never exports raw response bytes, headers, cookies,
// credentials, or protection material. It observes only the one official
// conversation response already owned by the page and reduces it browser-locally
// to revision-safe assistant-text metadata.

const PR89_BROWSER_STREAM_SCHEMA_VERSION = 1;
const PR89_BROWSER_STREAM_MAX_OBSERVATIONS = 64;
const PR89_BROWSER_STREAM_MAX_PREVIEW_CHARS = 160;
const PR89_BROWSER_STREAM_MAX_SSE_BUFFER_CHARS = 262144;

const _pr89BrowserStreamPriorExecuteNativeTurn = executeNativeTurn;
const _pr89BrowserStreamPriorExecuteOfficialPageTurn = executeOfficialPageTurn;

let _pr89BrowserStreamContext = null;

function _pr89BrowserStreamElapsedMs(context) {
  return Math.max(0, Math.round(performance.now() - context.startedAt));
}

function _pr89BrowserStreamPreview(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (compact.length <= PR89_BROWSER_STREAM_MAX_PREVIEW_CHARS) return compact;
  return compact.slice(0, PR89_BROWSER_STREAM_MAX_PREVIEW_CHARS - 1) + "…";
}

function _pr89BrowserStreamBase64Bytes(value) {
  if (typeof value !== "string" || !value) return new Uint8Array(0);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function _pr89BrowserStreamSha256(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function _pr89BrowserStreamFinishReason(message) {
  const metadata = message?.metadata;
  const finishDetails = metadata && typeof metadata === "object"
    ? metadata.finish_details
    : null;
  if (finishDetails && typeof finishDetails === "object" &&
      typeof finishDetails.type === "string" && finishDetails.type.trim()) {
    return finishDetails.type.trim();
  }
  if (metadata && typeof metadata.finish_reason === "string" &&
      metadata.finish_reason.trim()) {
    return metadata.finish_reason.trim();
  }
  return typeof message?.finish_reason === "string" && message.finish_reason.trim()
    ? message.finish_reason.trim()
    : null;
}

function _pr89BrowserStreamVisibleAssistantText(message) {
  if (!message || typeof message !== "object") return null;
  if (message?.author?.role !== "assistant") return null;
  if (message?.metadata?.is_visually_hidden_from_conversation === true) return null;

  const recipient = typeof message.recipient === "string"
    ? message.recipient.trim()
    : "";
  if (recipient && recipient !== "all") return null;

  const content = message.content;
  if (!content || typeof content !== "object") return null;
  const contentType = typeof content.content_type === "string"
    ? content.content_type.trim()
    : "";
  if (contentType && contentType !== "text" && contentType !== "multimodal_text") {
    return null;
  }

  const parts = Array.isArray(content.parts) ? content.parts : [];
  let text = "";
  for (const part of parts) {
    if (typeof part === "string") {
      text += part;
    } else if (part && typeof part === "object" && typeof part.text === "string") {
      text += part.text;
    }
  }
  if (!text.trim() && typeof content.text === "string") {
    text = content.text;
  }
  if (!text.trim()) return null;

  const messageId = typeof message.id === "string" && message.id.trim()
    ? message.id.trim()
    : null;
  return {
    messageKey: messageId || "assistant-current",
    messageId,
    contentType: contentType || null,
    text,
    finishReason: _pr89BrowserStreamFinishReason(message)
  };
}

function _pr89BrowserStreamCollectAssistantMessages(value, output, depth = 0) {
  if (depth > 7 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 128)) {
      _pr89BrowserStreamCollectAssistantMessages(item, output, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") return;

  const candidate = _pr89BrowserStreamVisibleAssistantText(value);
  if (candidate) output.push(candidate);

  for (const key of ["message", "messages", "data", "result", "payload", "turn"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      _pr89BrowserStreamCollectAssistantMessages(value[key], output, depth + 1);
    }
  }
}

async function _pr89BrowserStreamRecordAssistant(context, candidate) {
  const text = candidate.text;
  const previous = context.lastTextByKey.get(candidate.messageKey);
  if (previous === text) return;

  let kind = "SNAPSHOT";
  let delta = null;
  if (previous != null) {
    if (text.startsWith(previous)) {
      kind = "DELTA";
      delta = text.slice(previous.length);
    } else {
      kind = "REVISION";
    }
  }

  context.lastTextByKey.set(candidate.messageKey, text);
  context.assistantTextEventCount += 1;
  const observedAtMs = _pr89BrowserStreamElapsedMs(context);
  if (context.firstTextObservedMs === null) context.firstTextObservedMs = observedAtMs;
  context.lastTextObservedMs = observedAtMs;
  if (context.loadingFinishedMs === null) context.preNetworkCompleteTextObserved = true;

  const textSha256 = await _pr89BrowserStreamSha256(text);
  const previousTextSha256 = previous == null
    ? null
    : await _pr89BrowserStreamSha256(previous);
  const deltaSha256 = delta ? await _pr89BrowserStreamSha256(delta) : null;

  if (context.observations.length < PR89_BROWSER_STREAM_MAX_OBSERVATIONS) {
    context.observations.push({
      sequence: context.assistantTextEventCount,
      kind,
      observedAtMs,
      messageKey: candidate.messageKey,
      messageId: candidate.messageId,
      contentType: candidate.contentType,
      textLength: text.length,
      textSha256,
      textPreview: _pr89BrowserStreamPreview(text),
      deltaLength: delta == null ? null : delta.length,
      deltaSha256,
      deltaPreview: delta == null ? null : _pr89BrowserStreamPreview(delta),
      previousTextSha256,
      finishReason: candidate.finishReason,
      beforeNetworkComplete: context.loadingFinishedMs === null
    });
  } else {
    context.observationsTruncated = true;
  }
}

async function _pr89BrowserStreamProcessSseEvent(context, block) {
  const lines = String(block || "").split(/\r?\n/);
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return;
  context.sseEventCount += 1;

  const data = dataLines.join("\n").trim();
  if (!data || data === "[DONE]") return;

  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    context.nonJsonSseEventCount += 1;
    return;
  }
  context.jsonEventCount += 1;

  const candidates = [];
  _pr89BrowserStreamCollectAssistantMessages(payload, candidates);
  for (const candidate of candidates) {
    await _pr89BrowserStreamRecordAssistant(context, candidate);
  }
}

async function _pr89BrowserStreamProcessBytes(context, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return;
  const decoded = context.decoder.decode(bytes, { stream: true });
  if (!decoded) return;
  context.sseBuffer += decoded;

  if (context.sseBuffer.length > PR89_BROWSER_STREAM_MAX_SSE_BUFFER_CHARS) {
    context.sseBuffer = context.sseBuffer.slice(-PR89_BROWSER_STREAM_MAX_SSE_BUFFER_CHARS);
    context.sseBufferTruncated = true;
  }

  while (true) {
    const match = /\r?\n\r?\n/.exec(context.sseBuffer);
    if (!match) break;
    const block = context.sseBuffer.slice(0, match.index);
    context.sseBuffer = context.sseBuffer.slice(match.index + match[0].length);
    await _pr89BrowserStreamProcessSseEvent(context, block);
  }
}

function _pr89BrowserStreamEnqueueBase64(context, base64Data, source) {
  if (typeof base64Data !== "string" || !base64Data) return;
  let bytes;
  try {
    bytes = _pr89BrowserStreamBase64Bytes(base64Data);
  } catch {
    context.decodeErrorCount += 1;
    return;
  }
  if (source === "buffered") context.bufferedByteLength += bytes.length;
  else context.dataByteLength += bytes.length;

  context.processing = context.processing
    .then(() => _pr89BrowserStreamProcessBytes(context, bytes))
    .catch(() => {
      context.processingErrorCount += 1;
    });
}

async function _pr89BrowserStreamEnable(debuggee, context) {
  if (context.streamResourceContentAttempted) return;
  context.streamResourceContentAttempted = true;
  try {
    const result = await chrome.debugger.sendCommand(
      debuggee,
      "Network.streamResourceContent",
      { requestId: context.conversationRequestId }
    );
    context.streamResourceContentSupported = true;
    context.streamResourceContentEnabledMs = _pr89BrowserStreamElapsedMs(context);
    _pr89BrowserStreamEnqueueBase64(context, result?.bufferedData, "buffered");

    context.streamResourceContentReady = true;
    const pending = context.pendingData.splice(0);
    for (const value of pending) {
      _pr89BrowserStreamEnqueueBase64(context, value, "data");
    }
  } catch (error) {
    context.streamResourceContentSupported = false;
    context.streamResourceContentError = error instanceof Error ? error.message : String(error);
    context.pendingData.length = 0;
  }
}

function _pr89BrowserStreamCreateContext() {
  return {
    startedAt: performance.now(),
    conversationRequestId: null,
    responseStatus: null,
    responseMimeType: null,
    responseReceivedMs: null,
    loadingFinishedMs: null,
    streamResourceContentAttempted: false,
    streamResourceContentSupported: null,
    streamResourceContentReady: false,
    streamResourceContentEnabledMs: null,
    streamResourceContentError: null,
    bufferedByteLength: 0,
    dataEventCount: 0,
    dataByteLength: 0,
    pendingData: [],
    decoder: new TextDecoder("utf-8"),
    sseBuffer: "",
    sseBufferTruncated: false,
    sseEventCount: 0,
    jsonEventCount: 0,
    nonJsonSseEventCount: 0,
    decodeErrorCount: 0,
    processingErrorCount: 0,
    assistantTextEventCount: 0,
    firstTextObservedMs: null,
    lastTextObservedMs: null,
    preNetworkCompleteTextObserved: false,
    lastTextByKey: new Map(),
    observations: [],
    observationsTruncated: false,
    processing: Promise.resolve()
  };
}

function _pr89BrowserStreamSafeResult(context) {
  const first = context.firstTextObservedMs;
  const networkDone = context.loadingFinishedMs;
  return {
    schemaVersion: PR89_BROWSER_STREAM_SCHEMA_VERSION,
    source: "CDP_NETWORK_STREAM_RESOURCE_CONTENT",
    experimentalCdpMethod: true,
    conversationRequestObserved: typeof context.conversationRequestId === "string",
    responseStatus: Number.isFinite(context.responseStatus) ? context.responseStatus : null,
    responseMimeType: typeof context.responseMimeType === "string" ? context.responseMimeType : null,
    responseReceivedMs: context.responseReceivedMs,
    loadingFinishedMs: networkDone,
    streamResourceContentAttempted: context.streamResourceContentAttempted,
    streamResourceContentSupported: context.streamResourceContentSupported,
    streamResourceContentEnabledMs: context.streamResourceContentEnabledMs,
    streamResourceContentError: context.streamResourceContentError,
    bufferedByteLength: context.bufferedByteLength,
    dataEventCount: context.dataEventCount,
    dataByteLength: context.dataByteLength,
    sseEventCount: context.sseEventCount,
    jsonEventCount: context.jsonEventCount,
    nonJsonSseEventCount: context.nonJsonSseEventCount,
    decodeErrorCount: context.decodeErrorCount,
    processingErrorCount: context.processingErrorCount,
    assistantTextEventCount: context.assistantTextEventCount,
    firstTextObservedMs: first,
    lastTextObservedMs: context.lastTextObservedMs,
    preNetworkCompleteTextObserved: context.preNetworkCompleteTextObserved,
    firstTextLeadBeforeNetworkCompleteMs: (
      first !== null && networkDone !== null && networkDone >= first
    ) ? networkDone - first : null,
    observationCount: context.observations.length,
    observationsTruncated: context.observationsTruncated,
    sseBufferTruncated: context.sseBufferTruncated,
    observations: context.observations
  };
}

executeOfficialPageTurn = async function _executeOfficialPageTurnWithSafeBrowserStream(args) {
  const context = _pr89BrowserStreamContext;
  if (context === null) return _pr89BrowserStreamPriorExecuteOfficialPageTurn(args);

  const tabId = args?.tabId;
  const debuggee = { tabId };
  let listenerInstalled = false;

  const observer = (source, method, params) => {
    try {
      if (source?.tabId !== tabId) return;

      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (
          context.conversationRequestId === null &&
          isConversationWrite(request?.url || "", request?.method || "")
        ) {
          context.conversationRequestId = params.requestId;
        }
        return;
      }

      if (
        context.conversationRequestId === null ||
        params?.requestId !== context.conversationRequestId
      ) return;

      if (method === "Network.responseReceived") {
        context.responseStatus = params?.response?.status ?? null;
        context.responseMimeType = typeof params?.response?.mimeType === "string"
          ? params.response.mimeType
          : null;
        context.responseReceivedMs = _pr89BrowserStreamElapsedMs(context);
        void _pr89BrowserStreamEnable(debuggee, context);
        return;
      }

      if (method === "Network.dataReceived") {
        context.dataEventCount += 1;
        if (typeof params?.data !== "string" || !params.data) return;
        if (!context.streamResourceContentReady) context.pendingData.push(params.data);
        else _pr89BrowserStreamEnqueueBase64(context, params.data, "data");
        return;
      }

      if (method === "Network.loadingFinished") {
        context.loadingFinishedMs = _pr89BrowserStreamElapsedMs(context);
      }
    } catch {
      context.processingErrorCount += 1;
    }
  };

  try {
    chrome.debugger.onEvent.addListener(observer);
    listenerInstalled = true;
  } catch {
    listenerInstalled = false;
  }

  try {
    return await _pr89BrowserStreamPriorExecuteOfficialPageTurn(args);
  } finally {
    if (listenerInstalled) {
      try {
        chrome.debugger.onEvent.removeListener(observer);
      } catch {
        // Diagnostic cleanup only.
      }
    }
    try {
      await context.processing;
      const tail = context.decoder.decode();
      if (tail) context.sseBuffer += tail;
      if (context.sseBuffer.trim()) {
        await _pr89BrowserStreamProcessSseEvent(context, context.sseBuffer);
        context.sseBuffer = "";
      }
    } catch {
      context.processingErrorCount += 1;
    }
  }
};

executeNativeTurn = async function _executeNativeTurnWithSafeBrowserStream(message) {
  if (message?.characterizeSafeBrowserResponseStreamingSupport === true) {
    if (message?.text != null || message?.conversationId != null) {
      throw new Error("PR8_9_BROWSER_STREAM_SUPPORT_FLAG_CONFLICT");
    }
    return {
      probeContext: "pr8_9_safe_browser_response_streaming_support",
      readOnly: true,
      safeBrowserResponseStreamingSupported: true,
      schemaVersion: PR89_BROWSER_STREAM_SCHEMA_VERSION,
      cdpMethod: "Network.streamResourceContent",
      experimentalCdpMethod: true
    };
  }

  if (message?.characterizeSafeBrowserResponseStreaming !== true) {
    return _pr89BrowserStreamPriorExecuteNativeTurn(message);
  }

  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const leaseId = typeof message?.browserAuthorityLeaseId === "string"
    ? message.browserAuthorityLeaseId.trim()
    : "";
  if (!text || !leaseId) {
    throw new Error("PR8_9_BROWSER_STREAM_REQUIRES_ORDINARY_LEASED_WRITE");
  }
  if (_pr89BrowserStreamContext !== null) {
    throw new Error("PR8_9_BROWSER_STREAM_CONTEXT_ALREADY_ACTIVE");
  }

  const context = _pr89BrowserStreamCreateContext();
  _pr89BrowserStreamContext = context;
  try {
    const result = await _pr89BrowserStreamPriorExecuteNativeTurn(message);
    await context.processing;
    return {
      ...result,
      safeBrowserResponseStreaming: _pr89BrowserStreamSafeResult(context)
    };
  } finally {
    _pr89BrowserStreamContext = null;
  }
};
/* END legacy source: service_worker_safe_browser_response_stream_pr8_9.js */


/* BEGIN legacy source: service_worker_safe_browser_response_patch_protocol_pr8_9.js */
// PR8.9.2a: product patch-stream compatibility for Candidate-B response observation.
//
// The first live Candidate-B run proved that Network.streamResourceContent exposes
// the conversation SSE reliably, but the browser-local reducer expected full
// nested message snapshots. The existing Python web-stream parser already proves
// that this product route uses a compact {p, v} patch protocol. This layer adds
// the same bounded semantics without exporting raw SSE or changing the write.

const _pr89PatchPriorSafeResult = _pr89BrowserStreamSafeResult;

function _pr89PatchEnsureState(context) {
  if (context.patchProtocolInitialized === true) return;
  context.patchProtocolInitialized = true;
  context.patchProtocolEventCount = 0;
  context.patchTextDeltaCount = 0;
  context.patchMessageSkeletonCount = 0;
  context.patchMetadataUpdateCount = 0;
  context.patchAssistantActive = false;
  context.patchRecipient = "all";
  context.patchMessageId = null;
  context.patchMessageKey = "assistant-current";
  context.patchContentType = "text";
  context.patchFinishReason = null;
  context.patchTextByKey = new Map();
}

function _pr89PatchOptionalString(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function _pr89PatchMetadataFinishReason(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const details = metadata.finish_details;
  if (details && typeof details === "object") {
    const value = _pr89PatchOptionalString(details.type);
    if (value) return value;
  }
  return _pr89PatchOptionalString(metadata.finish_reason);
}

function _pr89PatchVisibleContentType(message) {
  const value = _pr89PatchOptionalString(message?.content?.content_type);
  if (value === "text" || value === "multimodal_text") return value;
  return value || "text";
}

async function _pr89PatchSelectMessage(context, message) {
  _pr89PatchEnsureState(context);
  if (!message || typeof message !== "object") return;

  context.patchMessageSkeletonCount += 1;
  const role = _pr89PatchOptionalString(message?.author?.role);
  const recipient = _pr89PatchOptionalString(message?.recipient) || "all";
  const hidden = message?.metadata?.is_visually_hidden_from_conversation === true;
  const contentType = _pr89PatchVisibleContentType(message);
  const visibleType = contentType === "text" || contentType === "multimodal_text";

  context.patchRecipient = recipient;
  context.patchAssistantActive = (
    role === "assistant" &&
    recipient === "all" &&
    !hidden &&
    visibleType
  );
  context.patchMessageId = _pr89PatchOptionalString(message?.id);
  context.patchMessageKey = context.patchMessageId || "assistant-current";
  context.patchContentType = contentType;
  context.patchFinishReason = _pr89BrowserStreamFinishReason(message);

  if (!context.patchAssistantActive) return;

  const full = _pr89BrowserStreamVisibleAssistantText(message);
  if (!full || !full.text) {
    if (!context.patchTextByKey.has(context.patchMessageKey)) {
      context.patchTextByKey.set(context.patchMessageKey, "");
    }
    return;
  }

  context.patchTextByKey.set(context.patchMessageKey, full.text);
  await _pr89BrowserStreamRecordAssistant(context, full);
}

async function _pr89PatchAppendText(context, token) {
  _pr89PatchEnsureState(context);
  if (
    context.patchAssistantActive !== true ||
    context.patchRecipient !== "all" ||
    typeof token !== "string" ||
    token.length === 0
  ) {
    return;
  }

  const key = context.patchMessageKey || "assistant-current";
  const previous = context.patchTextByKey.get(key) || "";
  const text = previous + token;
  context.patchTextByKey.set(key, text);
  context.patchTextDeltaCount += 1;

  await _pr89BrowserStreamRecordAssistant(context, {
    messageKey: key,
    messageId: context.patchMessageId,
    contentType: context.patchContentType || "text",
    text,
    finishReason: context.patchFinishReason
  });
}

function _pr89PatchApplyMetadata(context, metadata) {
  _pr89PatchEnsureState(context);
  if (!metadata || typeof metadata !== "object") return;
  context.patchMetadataUpdateCount += 1;
  const finishReason = _pr89PatchMetadataFinishReason(metadata);
  if (finishReason) context.patchFinishReason = finishReason;
}

async function _pr89PatchApplyPayload(context, payload) {
  _pr89PatchEnsureState(context);
  if (!payload || typeof payload !== "object") return false;

  const hasPatchEnvelope = (
    Object.prototype.hasOwnProperty.call(payload, "v") ||
    Object.prototype.hasOwnProperty.call(payload, "p")
  );
  if (!hasPatchEnvelope) return false;

  context.patchProtocolEventCount += 1;
  const value = payload.v;
  const path = payload.p;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = value.message;
    if (message && typeof message === "object") {
      await _pr89PatchSelectMessage(context, message);
    }
    return true;
  }

  if (typeof value === "string") {
    if (path == null || path === "/message/content/parts/0") {
      await _pr89PatchAppendText(context, value);
    }
    return true;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      if (item.p === "/message/content/parts/0" && typeof item.v === "string") {
        await _pr89PatchAppendText(context, item.v);
      } else if (item.p === "/message/metadata") {
        _pr89PatchApplyMetadata(context, item.v);
      }
    }
    return true;
  }

  if (payload.type === "server_ste_metadata") {
    _pr89PatchApplyMetadata(context, payload.metadata);
  }
  return true;
}

_pr89BrowserStreamProcessSseEvent =
  async function _pr89BrowserStreamProcessSseEventWithPatchProtocol(context, block) {
    const lines = String(block || "").split(/\r?\n/);
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    context.sseEventCount += 1;

    const data = dataLines.join("\n").trim();
    if (!data || data === "[DONE]") return;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      context.nonJsonSseEventCount += 1;
      return;
    }
    context.jsonEventCount += 1;

    const patchHandled = await _pr89PatchApplyPayload(context, payload);
    if (patchHandled) return;

    // Retain the original full-envelope compatibility path for any route that
    // emits complete message objects rather than p/v patches.
    const candidates = [];
    _pr89BrowserStreamCollectAssistantMessages(payload, candidates);
    for (const candidate of candidates) {
      await _pr89BrowserStreamRecordAssistant(context, candidate);
    }
  };

_pr89BrowserStreamSafeResult =
  function _pr89BrowserStreamSafeResultWithPatchProtocol(context) {
    _pr89PatchEnsureState(context);
    return {
      ..._pr89PatchPriorSafeResult(context),
      patchProtocolEventCount: context.patchProtocolEventCount,
      patchTextDeltaCount: context.patchTextDeltaCount,
      patchMessageSkeletonCount: context.patchMessageSkeletonCount,
      patchMetadataUpdateCount: context.patchMetadataUpdateCount,
      patchAssistantMessageIdObserved: Boolean(context.patchMessageId)
    };
  };
/* END legacy source: service_worker_safe_browser_response_patch_protocol_pr8_9.js */


/* BEGIN legacy source: service_worker_revision_safe_text_delivery_pr8_9.js */
// PR8.9.3: production revision-safe assistant-text event delivery.
//
// This layer reuses the proven Candidate-B CDP response observer and product
// patch-stream parser. It exports only reduced assistant text events for the
// active request_id; raw SSE, headers, cookies, request bodies and protection
// material never leave the browser worker.

const _pr89DeliveryPriorRecordAssistant = _pr89BrowserStreamRecordAssistant;
const _pr89DeliveryPriorExecuteNativeTurn = executeNativeTurn;

let _pr89DeliveryRequestId = null;

function _pr89DeliveryEventType(kind) {
  if (kind === "SNAPSHOT") return "assistant_text_snapshot";
  if (kind === "DELTA") return "assistant_text_delta";
  return "assistant_text_revision";
}

_pr89BrowserStreamRecordAssistant = async function _pr89RecordAssistantWithDelivery(context, candidate) {
  const text = candidate?.text;
  const key = candidate?.messageKey;
  if (typeof text !== "string" || typeof key !== "string" || !key) {
    return _pr89DeliveryPriorRecordAssistant(context, candidate);
  }

  const previous = context.lastTextByKey.get(key);
  if (previous === text) return;

  let kind = "SNAPSHOT";
  let delta = null;
  if (previous != null) {
    if (text.startsWith(previous)) {
      kind = "DELTA";
      delta = text.slice(previous.length);
    } else {
      kind = "REVISION";
    }
  }

  await _pr89DeliveryPriorRecordAssistant(context, candidate);

  const requestId = _pr89DeliveryRequestId;
  if (typeof requestId !== "string" || !requestId) return;

  const channel = candidate?.channel === "final" || candidate?.channel === "commentary"
    ? candidate.channel
    : null;
  const event = {
    type: _pr89DeliveryEventType(kind),
    sequence: context.assistantTextEventCount,
    observed_at_ms: _pr89BrowserStreamElapsedMs(context),
    message_id: candidate.messageId || null,
    content_type: candidate.contentType || null,
    channel,
    text_length: text.length,
    finish_reason: candidate.finishReason || null,
    before_network_complete: context.loadingFinishedMs === null
  };
  if (kind === "DELTA") event.delta = delta || "";
  else event.text = text;

  postNative({
    protocol: BRIDGE_PROTOCOL_VERSION,
    type: "turn_event",
    request_id: requestId,
    event
  });
};

executeNativeTurn = async function _executeNativeTurnWithRevisionSafeTextDelivery(message) {
  if (message?.streamTextObservations !== true) {
    return _pr89DeliveryPriorExecuteNativeTurn(message);
  }
  const requestId = typeof message?.request_id === "string" ? message.request_id.trim() : "";
  if (!requestId) throw new Error("PR8_9_STREAM_DELIVERY_REQUEST_ID_REQUIRED");
  if (_pr89DeliveryRequestId !== null) {
    throw new Error("PR8_9_STREAM_DELIVERY_ALREADY_ACTIVE");
  }

  const alreadyCharacterizing = message?.characterizeSafeBrowserResponseStreaming === true;
  _pr89DeliveryRequestId = requestId;
  try {
    const result = await _pr89DeliveryPriorExecuteNativeTurn(
      alreadyCharacterizing
        ? message
        : { ...message, characterizeSafeBrowserResponseStreaming: true }
    );
    if (alreadyCharacterizing || !result || typeof result !== "object") return result;
    const { safeBrowserResponseStreaming: _diagnosticOnly, ...productionResult } = result;
    return productionResult;
  } finally {
    _pr89DeliveryRequestId = null;
  }
};

/* END legacy source: service_worker_revision_safe_text_delivery_pr8_9.js */


/* BEGIN legacy source: service_worker_post_answer_tail_timing_pr8_11.js */
// PR8.11: bounded post-answer tail latency attribution.
//
// Observability only. This layer records numeric timing boundaries for one
// leased ordinary product turn and never changes prompt insertion, submit,
// model selection, Browser Authority, canonical finality, or retry behavior.
// Raw assistant text, raw SSE, request bodies, cookies and auth material are
// never persisted or returned by this surface.

const PR811_TAIL_TIMING_SCHEMA_VERSION = 1;
const PR811_TAIL_TIMING_STORAGE_KEY = "browserAuthorityLastPostAnswerTailTimingV1";

const _pr811TailPriorRecordAssistant = _pr89BrowserStreamRecordAssistant;
const _pr811TailPriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr811TailPriorExecuteNativeTurn = executeNativeTurn;

let _pr811TailContext = null;

function _pr811TailLeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

function _pr811TailDurationMs(startedAt, endedAt) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return null;
  }
  return Math.max(0, Math.round(endedAt - startedAt));
}

function _pr811TailQueryConflict(message) {
  return (
    message?.text != null ||
    message?.conversationId != null ||
    message?.browserAuthorityLeaseId != null ||
    message?.canonicalCompleted === true
  );
}

_pr89BrowserStreamRecordAssistant = async function _pr811RecordAssistantTailTiming(
  context,
  candidate
) {
  const text = candidate?.text;
  const key = candidate?.messageKey;
  const previous = (
    context?.lastTextByKey instanceof Map && typeof key === "string"
  ) ? context.lastTextByKey.get(key) : undefined;

  await _pr811TailPriorRecordAssistant(context, candidate);

  const active = _pr811TailContext;
  if (
    active === null ||
    typeof text !== "string" ||
    typeof key !== "string" ||
    !key ||
    previous === text
  ) {
    return;
  }
  active.lastAssistantTextObservedAt = performance.now();
  active.assistantTextObservationCount += 1;
};

executeOfficialPageTurn = async function _executeOfficialPageTurnWithPostAnswerTailTiming(args) {
  const context = _pr811TailContext;
  if (context === null) {
    return _pr811TailPriorExecuteOfficialPageTurn(args);
  }

  const tabId = args?.tabId;
  let conversationRequestId = null;
  let listenerInstalled = false;

  const observer = (source, method, params) => {
    try {
      if (source?.tabId !== tabId) return;
      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (
          conversationRequestId === null &&
          isConversationWrite(request?.url || "", request?.method || "")
        ) {
          conversationRequestId = params.requestId;
          context.writeDelegatedAt = performance.now();
        }
        return;
      }
      if (
        conversationRequestId !== null &&
        params?.requestId === conversationRequestId &&
        method === "Network.loadingFinished"
      ) {
        context.networkCompleteAt = performance.now();
      }
    } catch {
      // Timing observability must never perturb the product write.
    }
  };

  try {
    chrome.debugger.onEvent.addListener(observer);
    listenerInstalled = true;
  } catch {
    listenerInstalled = false;
  }

  try {
    return await _pr811TailPriorExecuteOfficialPageTurn(args);
  } finally {
    context.nativeCompleteAt = performance.now();
    if (listenerInstalled) {
      try {
        chrome.debugger.onEvent.removeListener(observer);
      } catch {
        // Observability cleanup only.
      }
    }
  }
};

async function _pr811StoredTailTimingRecord() {
  try {
    const stored = await chrome.storage.local.get(PR811_TAIL_TIMING_STORAGE_KEY);
    const value = stored?.[PR811_TAIL_TIMING_STORAGE_KEY];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

executeNativeTurn = async function _executeNativeTurnWithPostAnswerTailTiming(message) {
  if (message?.characterizePostAnswerTailTimingSupport === true) {
    if (_pr811TailQueryConflict(message)) {
      throw new Error("PR8_11_TAIL_TIMING_SUPPORT_FLAG_CONFLICT");
    }
    return {
      postAnswerTailTimingSupported: true,
      postAnswerTailTimingSchemaVersion: PR811_TAIL_TIMING_SCHEMA_VERSION,
      numericOnly: true,
      changesWriteSemantics: false
    };
  }

  if (message?.characterizePostAnswerTailTiming === true) {
    if (_pr811TailQueryConflict(message)) {
      throw new Error("PR8_11_TAIL_TIMING_QUERY_FLAG_CONFLICT");
    }
    const expectedLeaseId = _pr811TailLeaseId(
      message?.expectedBrowserAuthorityLeaseId
    );
    if (expectedLeaseId === null) {
      throw new Error("PR8_11_TAIL_TIMING_EXPECTED_LEASE_REQUIRED");
    }
    const record = await _pr811StoredTailTimingRecord();
    if (record === null) {
      throw new Error("PR8_11_TAIL_TIMING_RECORD_NOT_AVAILABLE");
    }
    if (_pr811TailLeaseId(record.browserAuthorityLeaseId) !== expectedLeaseId) {
      throw new Error("PR8_11_TAIL_TIMING_RECORD_LEASE_MISMATCH");
    }
    return {
      postAnswerTailTimingSupported: true,
      postAnswerTailTiming: record
    };
  }

  const leaseId = _pr811TailLeaseId(message?.browserAuthorityLeaseId);
  const ordinaryWrite = (
    typeof message?.text === "string" &&
    Boolean(message.text.trim()) &&
    leaseId !== null
  );
  if (!ordinaryWrite) {
    return _pr811TailPriorExecuteNativeTurn(message);
  }
  if (_pr811TailContext !== null) {
    throw new Error("PR8_11_TAIL_TIMING_CONTEXT_ALREADY_ACTIVE");
  }

  const context = {
    leaseId,
    startedAt: performance.now(),
    writeDelegatedAt: null,
    lastAssistantTextObservedAt: null,
    networkCompleteAt: null,
    nativeCompleteAt: null,
    assistantTextObservationCount: 0
  };
  _pr811TailContext = context;

  try {
    const result = await _pr811TailPriorExecuteNativeTurn(message);
    const record = {
      schemaVersion: PR811_TAIL_TIMING_SCHEMA_VERSION,
      browserAuthorityLeaseId: leaseId,
      assistantTextObservationCount: context.assistantTextObservationCount,
      writeDelegatedMs: _pr811TailDurationMs(context.startedAt, context.writeDelegatedAt),
      lastAssistantTextObservedMs: _pr811TailDurationMs(
        context.startedAt,
        context.lastAssistantTextObservedAt
      ),
      networkCompleteMs: _pr811TailDurationMs(context.startedAt, context.networkCompleteAt),
      nativeCompleteMs: _pr811TailDurationMs(context.startedAt, context.nativeCompleteAt),
      lastTextToNetworkCompleteMs: _pr811TailDurationMs(
        context.lastAssistantTextObservedAt,
        context.networkCompleteAt
      ),
      networkCompleteToNativeCompleteMs: _pr811TailDurationMs(
        context.networkCompleteAt,
        context.nativeCompleteAt
      ),
      lastTextToNativeCompleteMs: _pr811TailDurationMs(
        context.lastAssistantTextObservedAt,
        context.nativeCompleteAt
      )
    };
    try {
      await chrome.storage.local.set({
        [PR811_TAIL_TIMING_STORAGE_KEY]: record
      });
    } catch {
      // Optional observability must not change a successful turn.
    }
    return result;
  } finally {
    _pr811TailContext = null;
  }
};

/* END legacy source: service_worker_post_answer_tail_timing_pr8_11.js */


/* BEGIN legacy source: service_worker_early_product_completion_pr8_11_1.js */
// PR8.11.1: early product-completion signal characterization.
//
// Read-only characterization layered over the proven PR8.9 response stream and
// PR8.11 timing surface. It records only bounded timestamps, counts and small
// terminal enums. Prompt/assistant text, raw SSE, response bodies, headers,
// cookies, credentials and DOM/HTML are never persisted or returned.

const PR8111_EARLY_COMPLETION_SCHEMA_VERSION = 1;
const PR8111_EARLY_COMPLETION_STORAGE_KEY = "browserAuthorityLastEarlyProductCompletionV1";
const PR8111_COMPOSER_POLL_INTERVAL_MS = 100;
const PR8111_COMPOSER_POLL_TIMEOUT_MS = 120000;

const _pr8111PriorProcessSseEvent = _pr89BrowserStreamProcessSseEvent;
const _pr8111PriorRecordAssistant = _pr89BrowserStreamRecordAssistant;
const _pr8111PriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr8111PriorExecuteNativeTurn = executeNativeTurn;

let _pr8111Context = null;

function _pr8111LeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

function _pr8111ElapsedMs(context, at = performance.now()) {
  if (!context || !Number.isFinite(context.startedAt) || !Number.isFinite(at)) return null;
  return Math.max(0, Math.round(at - context.startedAt));
}

function _pr8111DurationMs(startedAt, endedAt) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return null;
  }
  return Math.max(0, Math.round(endedAt - startedAt));
}

function _pr8111RecordFirst(context, field, at = performance.now()) {
  if (!context || Number.isFinite(context[field])) return;
  context[field] = at;
}

function _pr8111NormalizedStatus(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function _pr8111RecordFinishReason(context, value, at = performance.now()) {
  const finishReason = typeof value === "string" ? value.trim() : "";
  if (!finishReason) return;
  _pr8111RecordFirst(context, "assistantFinishReasonAt", at);
  if (context.assistantFinishReason === null) context.assistantFinishReason = finishReason;
}

function _pr8111InspectMetadata(context, metadata, at = performance.now()) {
  if (!metadata || typeof metadata !== "object") return;
  const details = metadata.finish_details;
  if (details && typeof details === "object") {
    _pr8111RecordFinishReason(context, details.type, at);
  }
  _pr8111RecordFinishReason(context, metadata.finish_reason, at);
  if (metadata.is_complete === true) {
    _pr8111RecordFirst(context, "assistantIsCompleteAt", at);
  }
}

function _pr8111RecordCompletedStatus(context, value, at = performance.now()) {
  const status = _pr8111NormalizedStatus(value);
  if (!["completed", "complete", "finished", "finished_successfully", "done"].includes(status)) {
    return;
  }
  _pr8111RecordFirst(context, "assistantCompletedStatusAt", at);
  if (context.assistantCompletedStatus === null) context.assistantCompletedStatus = status;
}

function _pr8111VisibleAssistant(message) {
  if (!message || typeof message !== "object") return false;
  if (message?.author?.role !== "assistant") return false;
  if (message?.metadata?.is_visually_hidden_from_conversation === true) return false;
  const recipient = typeof message.recipient === "string" ? message.recipient.trim() : "";
  return !recipient || recipient === "all";
}

function _pr8111InspectAssistantTerminal(context, message) {
  if (!_pr8111VisibleAssistant(message)) return;
  const now = performance.now();
  _pr8111RecordFinishReason(context, _pr89BrowserStreamFinishReason(message), now);
  if (message.end_turn === true) {
    _pr8111RecordFirst(context, "assistantEndTurnAt", now);
  }
  _pr8111InspectMetadata(context, message.metadata, now);
  _pr8111RecordCompletedStatus(context, message.status, now);
}

function _pr8111InspectValue(context, value, depth = 0) {
  if (depth > 7 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 128)) _pr8111InspectValue(context, item, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  const type = typeof value.type === "string" ? value.type.trim() : "";
  if (type === "stream_handoff") _pr8111RecordFirst(context, "streamHandoffAt");
  if (type === "message_marker") _pr8111RecordFirst(context, "messageMarkerAt");

  if (value?.author?.role === "assistant") {
    _pr8111InspectAssistantTerminal(context, value);
  }

  for (const key of ["message", "messages", "data", "result", "payload", "turn", "v", "value"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      _pr8111InspectValue(context, value[key], depth + 1);
    }
  }
}

function _pr8111InspectPatchItem(active, streamContext, item) {
  if (!item || typeof item !== "object") return;
  const assistantActive = streamContext?.patchAssistantActive === true;
  const path = typeof item.p === "string" ? item.p : null;
  const value = item.v;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = value.message;
    if (message && typeof message === "object") {
      _pr8111InspectAssistantTerminal(active, message);
    }
  }
  if (!assistantActive || path === null) return;

  const now = performance.now();
  if (path === "/message/metadata") {
    _pr8111InspectMetadata(active, value, now);
  } else if (path === "/message/end_turn" && value === true) {
    _pr8111RecordFirst(active, "assistantEndTurnAt", now);
  } else if (path === "/message/status") {
    _pr8111RecordCompletedStatus(active, value, now);
  }
}

function _pr8111InspectPatchEnvelope(active, streamContext, payload) {
  if (!payload || typeof payload !== "object") return;
  _pr8111InspectPatchItem(active, streamContext, payload);
  if (Array.isArray(payload.v)) {
    for (const item of payload.v.slice(0, 128)) {
      _pr8111InspectPatchItem(active, streamContext, item);
    }
  }
}

_pr89BrowserStreamProcessSseEvent = async function _pr8111ProcessSseEvent(context, block) {
  const active = _pr8111Context;
  let data = "";
  let payload = null;
  if (active !== null) {
    try {
      const lines = String(block || "").split(/\r?\n/);
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      data = dataLines.join("\n").trim();
      if (data && data !== "[DONE]") {
        try {
          payload = JSON.parse(data);
        } catch {
          payload = null;
        }
      }
    } catch {
      active.characterizationErrorCount += 1;
    }
  }

  const result = await _pr8111PriorProcessSseEvent(context, block);

  if (active !== null) {
    try {
      if (data === "[DONE]") {
        _pr8111RecordFirst(active, "doneSentinelAt");
      } else if (payload !== null) {
        _pr8111InspectValue(active, payload);
        _pr8111InspectPatchEnvelope(active, context, payload);
      }
    } catch {
      active.characterizationErrorCount += 1;
    }
  }
  return result;
};

_pr89BrowserStreamRecordAssistant = async function _pr8111RecordAssistant(context, candidate) {
  const active = _pr8111Context;
  const text = candidate?.text;
  const key = candidate?.messageKey;
  const previous = (
    context?.lastTextByKey instanceof Map && typeof key === "string"
  ) ? context.lastTextByKey.get(key) : undefined;

  await _pr8111PriorRecordAssistant(context, candidate);

  if (active === null) return;
  _pr8111RecordFinishReason(active, candidate?.finishReason);
  if (
    typeof text === "string" &&
    typeof key === "string" &&
    key &&
    previous !== text
  ) {
    const now = performance.now();
    _pr8111RecordFirst(active, "firstAssistantTextObservedAt", now);
    active.lastAssistantTextObservedAt = now;
    active.assistantTextObservationCount += 1;
  }
};

async function _pr8111PollComposerReadiness(debuggee, context) {
  const pollStartedAt = performance.now();
  let consecutiveReady = 0;
  while (
    context.stopComposerPoll !== true &&
    performance.now() - pollStartedAt < PR8111_COMPOSER_POLL_TIMEOUT_MS
  ) {
    if (Number.isFinite(context.lastAssistantTextObservedAt)) {
      try {
        const state = await queryComposerReadiness(debuggee);
        context.composerProbeCount += 1;
        if (state?.ready === true) {
          const now = performance.now();
          _pr8111RecordFirst(context, "firstComposerReadyAfterTextAt", now);
          consecutiveReady += 1;
          if (consecutiveReady >= 2) {
            _pr8111RecordFirst(context, "consecutiveComposerReadyAfterTextAt", now);
          }
        } else {
          consecutiveReady = 0;
        }
      } catch {
        consecutiveReady = 0;
        context.composerProbeErrorCount += 1;
      }
    }
    await sleep(PR8111_COMPOSER_POLL_INTERVAL_MS);
  }
}

executeOfficialPageTurn = async function _pr8111ExecuteOfficialPageTurn(args) {
  const context = _pr8111Context;
  if (context === null) return _pr8111PriorExecuteOfficialPageTurn(args);

  const tabId = args?.tabId;
  const debuggee = { tabId };
  let conversationRequestId = null;
  let listenerInstalled = false;

  const observer = (source, method, params) => {
    try {
      if (source?.tabId !== tabId) return;
      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (
          conversationRequestId === null &&
          isConversationWrite(request?.url || "", request?.method || "")
        ) {
          conversationRequestId = params.requestId;
          _pr8111RecordFirst(context, "writeDelegatedAt");
        }
        return;
      }
      if (
        conversationRequestId !== null &&
        params?.requestId === conversationRequestId &&
        method === "Network.loadingFinished"
      ) {
        _pr8111RecordFirst(context, "networkCompleteAt");
      }
    } catch {
      context.characterizationErrorCount += 1;
    }
  };

  try {
    chrome.debugger.onEvent.addListener(observer);
    listenerInstalled = true;
  } catch {
    listenerInstalled = false;
  }

  const composerPoll = _pr8111PollComposerReadiness(debuggee, context).catch(() => {
    context.composerProbeErrorCount += 1;
  });

  try {
    return await _pr8111PriorExecuteOfficialPageTurn(args);
  } finally {
    _pr8111RecordFirst(context, "officialPageTurnCompleteAt");
    context.stopComposerPoll = true;
    try {
      await composerPoll;
    } catch {
      // Observational poll cleanup only.
    }
    if (listenerInstalled) {
      try {
        chrome.debugger.onEvent.removeListener(observer);
      } catch {
        // Observational listener cleanup only.
      }
    }
  }
};

function _pr8111QueryConflict(message) {
  return (
    message?.text != null ||
    message?.conversationId != null ||
    message?.browserAuthorityLeaseId != null ||
    message?.canonicalCompleted === true
  );
}

async function _pr8111StoredRecord() {
  try {
    const stored = await chrome.storage.local.get(PR8111_EARLY_COMPLETION_STORAGE_KEY);
    const value = stored?.[PR8111_EARLY_COMPLETION_STORAGE_KEY];
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function _pr8111FirstTerminal(context) {
  const signals = [
    ["assistant_finish_reason", context.assistantFinishReasonAt],
    ["assistant_end_turn", context.assistantEndTurnAt],
    ["assistant_is_complete", context.assistantIsCompleteAt],
    ["assistant_completed_status", context.assistantCompletedStatusAt],
    ["done_sentinel", context.doneSentinelAt]
  ].filter(([, at]) => Number.isFinite(at));
  if (!signals.length) return { kind: null, at: null };
  signals.sort((left, right) => left[1] - right[1]);
  return { kind: signals[0][0], at: signals[0][1] };
}

function _pr8111Record(context) {
  const terminal = _pr8111FirstTerminal(context);
  const lastText = context.lastAssistantTextObservedAt;
  const networkDone = context.networkCompleteAt;
  return {
    schemaVersion: PR8111_EARLY_COMPLETION_SCHEMA_VERSION,
    browserAuthorityLeaseId: context.leaseId,
    assistantTextObservationCount: context.assistantTextObservationCount,
    composerProbeCount: context.composerProbeCount,
    composerProbeErrorCount: context.composerProbeErrorCount,
    characterizationErrorCount: context.characterizationErrorCount,
    writeDelegatedMs: _pr8111ElapsedMs(context, context.writeDelegatedAt),
    firstAssistantTextObservedMs: _pr8111ElapsedMs(context, context.firstAssistantTextObservedAt),
    lastAssistantTextObservedMs: _pr8111ElapsedMs(context, lastText),
    assistantFinishReasonObservedMs: _pr8111ElapsedMs(context, context.assistantFinishReasonAt),
    assistantFinishReason: context.assistantFinishReason,
    assistantEndTurnObservedMs: _pr8111ElapsedMs(context, context.assistantEndTurnAt),
    assistantIsCompleteObservedMs: _pr8111ElapsedMs(context, context.assistantIsCompleteAt),
    assistantCompletedStatusObservedMs: _pr8111ElapsedMs(context, context.assistantCompletedStatusAt),
    assistantCompletedStatus: context.assistantCompletedStatus,
    messageMarkerObservedMs: _pr8111ElapsedMs(context, context.messageMarkerAt),
    streamHandoffObservedMs: _pr8111ElapsedMs(context, context.streamHandoffAt),
    doneSentinelObservedMs: _pr8111ElapsedMs(context, context.doneSentinelAt),
    firstComposerReadyAfterTextMs: _pr8111ElapsedMs(context, context.firstComposerReadyAfterTextAt),
    consecutiveComposerReadyAfterTextMs: _pr8111ElapsedMs(
      context,
      context.consecutiveComposerReadyAfterTextAt
    ),
    networkCompleteMs: _pr8111ElapsedMs(context, networkDone),
    officialPageTurnCompleteMs: _pr8111ElapsedMs(context, context.officialPageTurnCompleteAt),
    earliestTerminalSignalKind: terminal.kind,
    earliestTerminalSignalMs: _pr8111ElapsedMs(context, terminal.at),
    lastTextToEarliestTerminalSignalMs: _pr8111DurationMs(lastText, terminal.at),
    lastTextToComposerReadyMs: _pr8111DurationMs(
      lastText,
      context.consecutiveComposerReadyAfterTextAt
    ),
    earliestTerminalSignalToNetworkCompleteMs: _pr8111DurationMs(terminal.at, networkDone),
    composerReadyToNetworkCompleteMs: _pr8111DurationMs(
      context.consecutiveComposerReadyAfterTextAt,
      networkDone
    ),
    lastTextToNetworkCompleteMs: _pr8111DurationMs(lastText, networkDone)
  };
}

executeNativeTurn = async function _pr8111ExecuteNativeTurn(message) {
  if (message?.characterizeEarlyProductCompletionSupport === true) {
    if (_pr8111QueryConflict(message)) {
      throw new Error("PR8_11_1_EARLY_COMPLETION_SUPPORT_FLAG_CONFLICT");
    }
    return {
      earlyProductCompletionSupported: true,
      earlyProductCompletionSchemaVersion: PR8111_EARLY_COMPLETION_SCHEMA_VERSION,
      readOnlyCharacterization: true,
      composerPollIntervalMs: PR8111_COMPOSER_POLL_INTERVAL_MS,
      changesWriteSemantics: false,
      changesCanonicalFinality: false
    };
  }

  if (message?.characterizeEarlyProductCompletion === true) {
    if (_pr8111QueryConflict(message)) {
      throw new Error("PR8_11_1_EARLY_COMPLETION_QUERY_FLAG_CONFLICT");
    }
    const expectedLeaseId = _pr8111LeaseId(message?.expectedBrowserAuthorityLeaseId);
    if (expectedLeaseId === null) {
      throw new Error("PR8_11_1_EARLY_COMPLETION_EXPECTED_LEASE_REQUIRED");
    }
    const record = await _pr8111StoredRecord();
    if (record === null) {
      throw new Error("PR8_11_1_EARLY_COMPLETION_RECORD_NOT_AVAILABLE");
    }
    if (_pr8111LeaseId(record.browserAuthorityLeaseId) !== expectedLeaseId) {
      throw new Error("PR8_11_1_EARLY_COMPLETION_RECORD_LEASE_MISMATCH");
    }
    return {
      earlyProductCompletionSupported: true,
      earlyProductCompletion: record
    };
  }

  const leaseId = _pr8111LeaseId(message?.browserAuthorityLeaseId);
  const ordinaryWrite = (
    typeof message?.text === "string" &&
    Boolean(message.text.trim()) &&
    leaseId !== null
  );
  if (!ordinaryWrite) return _pr8111PriorExecuteNativeTurn(message);
  if (_pr8111Context !== null) {
    throw new Error("PR8_11_1_EARLY_COMPLETION_CONTEXT_ALREADY_ACTIVE");
  }

  const context = {
    leaseId,
    startedAt: performance.now(),
    writeDelegatedAt: null,
    firstAssistantTextObservedAt: null,
    lastAssistantTextObservedAt: null,
    assistantTextObservationCount: 0,
    assistantFinishReasonAt: null,
    assistantFinishReason: null,
    assistantEndTurnAt: null,
    assistantIsCompleteAt: null,
    assistantCompletedStatusAt: null,
    assistantCompletedStatus: null,
    messageMarkerAt: null,
    streamHandoffAt: null,
    doneSentinelAt: null,
    firstComposerReadyAfterTextAt: null,
    consecutiveComposerReadyAfterTextAt: null,
    composerProbeCount: 0,
    composerProbeErrorCount: 0,
    networkCompleteAt: null,
    officialPageTurnCompleteAt: null,
    stopComposerPoll: false,
    characterizationErrorCount: 0
  };
  _pr8111Context = context;

  try {
    const result = await _pr8111PriorExecuteNativeTurn(message);
    const record = _pr8111Record(context);
    try {
      await chrome.storage.local.set({
        [PR8111_EARLY_COMPLETION_STORAGE_KEY]: record
      });
    } catch {
      // Characterization persistence must never change a successful turn.
    }
    return result;
  } finally {
    _pr8111Context = null;
  }
};

/* END legacy source: service_worker_early_product_completion_pr8_11_1.js */


/* BEGIN legacy source: service_worker_early_product_completion_repair_pr8_11_1.js */
// PR8.11.1 production repair: wire proven visible-assistant terminal evidence
// into the fail-closed page-turn completion hook installed below PR8.8/PR8.9.
//
// The live characterization proved that current-answer finish_reason, end_turn
// and is_complete arrive with the final visible text, while a generic
// finished_successfully status can appear before the first assistant text.
// Therefore the early boundary requires visible assistant text plus a
// finish_reason and at least one independent terminal bit (end_turn or
// is_complete). Canonical HTTP readback remains authoritative afterwards.

const _pr8111RepairPriorProcessSseEvent = _pr89BrowserStreamProcessSseEvent;
const _pr8111RepairPriorRecordAssistant = _pr89BrowserStreamRecordAssistant;
const _pr8111RepairPriorFirstTerminal = _pr8111FirstTerminal;
const _pr8111RepairPriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr8111RepairPriorExecuteNativeTurn = executeNativeTurn;

let _pr8111RepairContext = null;

function _pr8111RepairFinishReason(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function _pr8111RepairResolveTerminal(finishReason, completionEvidence) {
  const active = _pr8111RepairContext;
  if (active === null || active.terminalResolved === true) return;
  if (!Number.isFinite(active.firstVisibleAssistantTextAt)) return;
  if (_pr8111RepairFinishReason(finishReason) === null) return;
  if (completionEvidence !== "end_turn" && completionEvidence !== "is_complete" && completionEvidence !== "end_turn+is_complete") {
    return;
  }

  active.terminalResolved = true;
  active.terminalKind = "assistant_terminal_conjunction";
  active.terminalFinishReason = finishReason;
  active.terminalCompletionEvidence = completionEvidence;
  active.terminalResolvedAt = performance.now();
  active.resolveTerminal({
    kind: active.terminalKind,
    finishReason,
    completionEvidence
  });
}

_pr89BrowserStreamRecordAssistant = async function _pr8111RepairRecordAssistant(
  context,
  candidate
) {
  const active = _pr8111RepairContext;
  const text = candidate?.text;
  const key = candidate?.messageKey;
  const previous = (
    context?.lastTextByKey instanceof Map && typeof key === "string"
  ) ? context.lastTextByKey.get(key) : undefined;

  await _pr8111RepairPriorRecordAssistant(context, candidate);

  if (
    active === null ||
    typeof text !== "string" ||
    typeof key !== "string" ||
    !key ||
    previous === text
  ) {
    return;
  }

  const now = performance.now();
  if (!Number.isFinite(active.firstVisibleAssistantTextAt)) {
    active.firstVisibleAssistantTextAt = now;
  }
  active.lastVisibleAssistantTextAt = now;
  active.lastVisibleAssistantMessageKey = key;
};

// Resolve only after the complete SSE block has passed through the established
// PR8.9 patch/full-message parser and the PR8.11.1 characterization layer. This
// lets us require two independent current-answer terminal signals without
// changing raw SSE parsing or exporting any additional content.
_pr89BrowserStreamProcessSseEvent = async function _pr8111RepairProcessSseEvent(
  streamContext,
  block
) {
  const result = await _pr8111RepairPriorProcessSseEvent(streamContext, block);
  const active = _pr8111RepairContext;
  const characterized = _pr8111Context;
  if (active === null || characterized === null || active.terminalResolved === true) {
    return result;
  }

  const firstText = active.firstVisibleAssistantTextAt;
  if (!Number.isFinite(firstText)) return result;

  const finishReason = _pr8111RepairFinishReason(characterized.assistantFinishReason);
  const finishAt = characterized.assistantFinishReasonAt;
  const endTurnAt = characterized.assistantEndTurnAt;
  const isCompleteAt = characterized.assistantIsCompleteAt;
  const finishCurrent = Number.isFinite(finishAt) && finishAt >= firstText;
  const endTurnCurrent = Number.isFinite(endTurnAt) && endTurnAt >= firstText;
  const isCompleteCurrent = Number.isFinite(isCompleteAt) && isCompleteAt >= firstText;

  if (finishReason !== null && finishCurrent && (endTurnCurrent || isCompleteCurrent)) {
    const completionEvidence = endTurnCurrent && isCompleteCurrent
      ? "end_turn+is_complete"
      : endTurnCurrent
      ? "end_turn"
      : "is_complete";
    _pr8111RepairResolveTerminal(finishReason, completionEvidence);
  }
  return result;
};

// Generic status / marker observations remain useful diagnostics, but a signal
// timestamp that predates the first visible assistant text cannot characterize
// completion of the current visible answer.
_pr8111FirstTerminal = function _pr8111RepairFirstTerminal(context) {
  const firstText = context?.firstAssistantTextObservedAt;
  if (!Number.isFinite(firstText)) return { kind: null, at: null };

  const signals = [
    ["assistant_finish_reason", context.assistantFinishReasonAt],
    ["assistant_end_turn", context.assistantEndTurnAt],
    ["assistant_is_complete", context.assistantIsCompleteAt],
    ["assistant_completed_status", context.assistantCompletedStatusAt],
    ["done_sentinel", context.doneSentinelAt]
  ].filter(([, at]) => Number.isFinite(at) && at >= firstText);

  if (!signals.length) return { kind: null, at: null };
  signals.sort((left, right) => left[1] - right[1]);
  return { kind: signals[0][0], at: signals[0][1] };
};

executeOfficialPageTurn = async function _pr8111RepairExecuteOfficialPageTurn(args) {
  const active = _pr8111RepairContext;
  if (active === null) return _pr8111RepairPriorExecuteOfficialPageTurn(args);

  const restore = _cwaInstallOfficialPageEarlyCompletionSignal(active.terminalPromise);
  try {
    return await _pr8111RepairPriorExecuteOfficialPageTurn(args);
  } finally {
    restore();
  }
};

function _pr8111RepairLeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

executeNativeTurn = async function _pr8111RepairExecuteNativeTurn(message) {
  const leaseId = _pr8111RepairLeaseId(message?.browserAuthorityLeaseId);
  const ordinaryWrite = (
    typeof message?.text === "string" &&
    Boolean(message.text.trim()) &&
    leaseId !== null
  );
  if (!ordinaryWrite) return _pr8111RepairPriorExecuteNativeTurn(message);
  if (_pr8111RepairContext !== null) {
    throw new Error("PR8_11_1_EARLY_COMPLETION_REPAIR_CONTEXT_ALREADY_ACTIVE");
  }

  let resolveTerminal;
  const terminalPromise = new Promise((resolve) => {
    resolveTerminal = resolve;
  });
  const context = {
    leaseId,
    terminalPromise,
    resolveTerminal,
    terminalResolved: false,
    terminalKind: null,
    terminalFinishReason: null,
    terminalCompletionEvidence: null,
    terminalResolvedAt: null,
    firstVisibleAssistantTextAt: null,
    lastVisibleAssistantTextAt: null,
    lastVisibleAssistantMessageKey: null
  };
  _pr8111RepairContext = context;

  try {
    return await _pr8111RepairPriorExecuteNativeTurn(message);
  } finally {
    _pr8111RepairContext = null;
  }
};
/* END legacy source: service_worker_early_product_completion_repair_pr8_11_1.js */


/* BEGIN legacy source: service_worker_normalized_activity_stream_pr8_12.js */
// PR8.12: normalized user-visible activity / tool-progress streaming.
//
// This layer extends the proven PR8.9 response observer without changing write,
// retry, Browser Authority, early-completion, or canonical-finality semantics.
// It exports only bounded normalized activity events and explicitly user-visible
// recap/display text. Raw tool arguments/results, raw SSE, hidden messages,
// credentials, DOM/HTML, and private `thoughts` content never leave the worker.

const PR812_ACTIVITY_SCHEMA_VERSION = 1;
const PR812_MAX_ACTIVITY_TEXT_CHARS = 12000;
const PR812_MAX_OPERATION_DEPTH = 7;

const _pr812PriorProcessSseEvent = _pr89BrowserStreamProcessSseEvent;
const _pr812PriorExecuteNativeTurn = executeNativeTurn;

let _pr812RequestId = null;
let _pr812Sequence = 0;
const _pr812StateByStreamContext = new WeakMap();

function _pr812OptionalString(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function _pr812SafeEnum(value) {
  const normalized = _pr812OptionalString(value);
  if (!normalized) return null;
  const safe = normalized.toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
  return safe.slice(0, 96) || null;
}

function _pr812State(context) {
  let state = _pr812StateByStreamContext.get(context);
  if (state) return state;
  state = {
    currentPatchMessage: null,
    started: new Set(),
    completed: new Set(),
    textByActivity: new Map(),
    syntheticCounter: 0
  };
  _pr812StateByStreamContext.set(context, state);
  return state;
}

function _pr812ElapsedMs(context) {
  if (!context || !Number.isFinite(context.startedAt)) return null;
  return Math.max(0, Math.round(performance.now() - context.startedAt));
}

function _pr812Emit(context, event) {
  const requestId = _pr812RequestId;
  if (typeof requestId !== "string" || !requestId) return;
  _pr812Sequence += 1;
  postNative({
    protocol: BRIDGE_PROTOCOL_VERSION,
    type: "turn_event",
    request_id: requestId,
    event: {
      schema: PR812_ACTIVITY_SCHEMA_VERSION,
      sequence: _pr812Sequence,
      observed_at_ms: _pr812ElapsedMs(context),
      ...event
    }
  });
}

function _pr812ActivityId(state, message, prefix) {
  const id = _pr812OptionalString(message?.id);
  if (id) return `${prefix}:${id}`;
  state.syntheticCounter += 1;
  return `${prefix}:synthetic-${state.syntheticCounter}`;
}

function _pr812ActivityKindFromToolName(name) {
  const value = (_pr812OptionalString(name) || "").toLowerCase();
  if (!value) return "tool";
  if (value.includes("web") || value.includes("browser")) return "web";
  if (value.includes("file_search") || value.includes("files")) return "file_search";
  if (value.includes("research")) return "research";
  if (value.includes("python") || value.includes("code") || value.includes("jupyter")) return "code";
  if (value.includes("image")) return "image";
  if (value.includes("product")) return "product_search";
  if (value.includes("business") || value.includes("local")) return "local_search";
  return "tool";
}

function _pr812OperationFromObject(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > PR812_MAX_OPERATION_DEPTH) return null;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 64)) {
      const found = _pr812OperationFromObject(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const keys = Object.keys(value);
  const known = [
    "search_query", "image_query", "product_query", "businesses_query",
    "availability_query", "open", "click", "find", "screenshot",
    "calculator", "weather", "finance", "sports", "time"
  ];
  for (const key of known) {
    if (keys.includes(key)) return key;
  }
  const type = _pr812OptionalString(value.type);
  if (type && known.includes(type)) return type;
  const command = _pr812OptionalString(value.command);
  if (command && known.includes(command)) return command;

  for (const key of ["message", "data", "payload", "result", "tool", "arguments", "args"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = _pr812OperationFromObject(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function _pr812OperationFromText(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 200000 || !trimmed.startsWith("{")) return null;
  try {
    return _pr812OperationFromObject(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function _pr812Label(kind, operation = null, completed = false) {
  const done = completed ? " complete" : "…";
  switch (operation) {
    case "search_query": return completed ? "Web search complete" : "Searching the web…";
    case "open":
    case "click":
    case "find":
    case "screenshot": return completed ? "Source reading complete" : "Reading sources…";
    case "image_query": return completed ? "Image search complete" : "Searching images…";
    case "product_query": return completed ? "Product search complete" : "Searching products…";
    case "businesses_query": return completed ? "Place search complete" : "Searching places…";
    case "availability_query": return completed ? "Availability check complete" : "Checking availability…";
    case "calculator": return completed ? "Calculation complete" : "Calculating…";
    case "weather": return completed ? "Weather check complete" : "Checking weather…";
    case "finance": return completed ? "Market check complete" : "Checking market data…";
    case "sports": return completed ? "Sports check complete" : "Checking sports data…";
    case "time": return completed ? "Time check complete" : "Checking time…";
    default: break;
  }
  if (kind === "web") return completed ? "Web activity complete" : "Using the web…";
  if (kind === "file_search") return completed ? "File search complete" : "Searching files…";
  if (kind === "research") return completed ? "Research step complete" : "Researching…";
  if (kind === "code") return completed ? "Code execution complete" : "Running code…";
  if (kind === "image") return completed ? "Image step complete" : "Working with images…";
  if (kind === "product_search") return completed ? "Product search complete" : "Searching products…";
  if (kind === "local_search") return completed ? "Place search complete" : "Searching places…";
  if (kind === "reasoning") return completed ? "Reasoning summary complete" : "Reasoning…";
  if (kind === "browsing_display") return completed ? "Browsing update complete" : "Browsing…";
  return completed ? `Tool activity${done}` : "Using a tool…";
}

function _pr812BoundedText(value) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\u0000/g, "");
  if (text.length <= PR812_MAX_ACTIVITY_TEXT_CHARS) return text;
  return text.slice(0, PR812_MAX_ACTIVITY_TEXT_CHARS);
}

function _pr812VisibleActivityText(content) {
  if (!content || typeof content !== "object") return "";
  const contentType = _pr812OptionalString(content.content_type) || "";

  // `thoughts` is intentionally excluded: PR8.12 never exports private/raw
  // reasoning. `reasoning_recap` is a distinct user-facing recap surface.
  if (contentType === "reasoning_recap") {
    const direct = _pr812OptionalString(content.content);
    if (direct) return _pr812BoundedText(direct);
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return _pr812BoundedText(parts.filter((part) => typeof part === "string").join(""));
  }

  if (contentType === "tether_browsing_display") {
    const pieces = [];
    for (const key of ["title", "text", "content"]) {
      const value = _pr812OptionalString(content[key]);
      if (value) pieces.push(value);
    }
    const parts = Array.isArray(content.parts) ? content.parts : [];
    for (const part of parts.slice(0, 16)) {
      if (typeof part === "string" && part.trim()) pieces.push(part);
      else if (part && typeof part === "object" && typeof part.text === "string" && part.text.trim()) {
        pieces.push(part.text);
      }
    }
    return _pr812BoundedText(Array.from(new Set(pieces)).join("\n"));
  }

  return "";
}

function _pr812RawTextForClassification(content) {
  if (!content || typeof content !== "object") return "";
  const parts = Array.isArray(content.parts) ? content.parts : [];
  let text = "";
  for (const part of parts.slice(0, 32)) {
    if (typeof part === "string") text += part;
    else if (part && typeof part === "object" && typeof part.text === "string") text += part.text;
  }
  if (!text && typeof content.text === "string") text = content.text;
  // Classification-only. This string is never put into a turn_event.
  return text;
}

function _pr812Start(context, state, activityId, kind, label, fields = {}) {
  if (state.started.has(activityId)) return;
  state.started.add(activityId);
  _pr812Emit(context, {
    type: "activity_started",
    activity_id: activityId,
    activity_kind: kind,
    label,
    ...fields
  });
}

function _pr812Complete(context, state, activityId, kind, label, fields = {}) {
  if (state.completed.has(activityId)) return;
  state.completed.add(activityId);
  _pr812Emit(context, {
    type: "activity_completed",
    activity_id: activityId,
    activity_kind: kind,
    label,
    ...fields
  });
}

function _pr812RecordActivityText(context, state, activityId, kind, label, text) {
  text = _pr812BoundedText(text);
  if (!text.trim()) return;
  _pr812Start(context, state, activityId, kind, label);

  const previous = state.textByActivity.get(activityId);
  if (previous === text) return;
  let type = "activity_text_snapshot";
  const event = {
    type,
    activity_id: activityId,
    activity_kind: kind,
    label
  };
  if (previous != null && text.startsWith(previous)) {
    event.type = "activity_text_delta";
    event.delta = text.slice(previous.length);
  } else if (previous != null) {
    event.type = "activity_text_revision";
    event.text = text;
  } else {
    event.text = text;
  }
  state.textByActivity.set(activityId, text);
  _pr812Emit(context, event);
}

function _pr812InspectMessage(context, state, message) {
  if (!message || typeof message !== "object") return;
  if (message?.metadata?.is_visually_hidden_from_conversation === true) return;

  const role = _pr812OptionalString(message?.author?.role) || "";
  const authorName = _pr812OptionalString(message?.author?.name);
  const recipient = _pr812OptionalString(message.recipient) || "all";
  const content = message.content && typeof message.content === "object" ? message.content : {};
  const contentType = _pr812OptionalString(content.content_type) || "";

  if (role === "assistant" && contentType === "thoughts") {
    const activityId = _pr812ActivityId(state, message, "thinking");
    _pr812Start(context, state, activityId, "reasoning", "Thinking…", {
      source_content_type: "thoughts"
    });
    return;
  }

  if (role === "assistant" && recipient === "all" && contentType === "reasoning_recap") {
    const activityId = _pr812ActivityId(state, message, "reasoning");
    const text = _pr812VisibleActivityText(content);
    _pr812RecordActivityText(context, state, activityId, "reasoning", "Reasoning summary", text);
    if (message.end_turn === true || message.status === "finished_successfully" || message.status === "completed") {
      _pr812Complete(context, state, activityId, "reasoning", "Reasoning summary complete");
    }
    return;
  }

  if (contentType === "tether_browsing_display") {
    const activityId = _pr812ActivityId(state, message, "browsing-display");
    const text = _pr812VisibleActivityText(content);
    _pr812RecordActivityText(context, state, activityId, "browsing_display", "Browsing update", text);
    if (message.end_turn === true || message.status === "finished_successfully" || role === "tool") {
      _pr812Complete(context, state, activityId, "browsing_display", "Browsing update complete");
    }
    return;
  }

  if (role === "assistant" && recipient !== "all") {
    const kind = _pr812ActivityKindFromToolName(recipient);
    const raw = _pr812RawTextForClassification(content);
    const operation = _pr812OperationFromText(raw) || _pr812OperationFromObject(message?.metadata);
    const activityId = _pr812ActivityId(state, message, `tool-${kind}`);
    _pr812Start(context, state, activityId, kind, _pr812Label(kind, operation, false), {
      tool_name: _pr812SafeEnum(recipient),
      operation: _pr812SafeEnum(operation)
    });
    return;
  }

  if (role === "tool") {
    const toolName = authorName || recipient;
    const kind = _pr812ActivityKindFromToolName(toolName);
    const operation = _pr812OperationFromObject(message?.metadata) ||
      _pr812OperationFromText(_pr812RawTextForClassification(content));
    const activityId = _pr812ActivityId(state, message, `tool-result-${kind}`);
    _pr812Complete(context, state, activityId, kind, _pr812Label(kind, operation, true), {
      tool_name: _pr812SafeEnum(toolName),
      operation: _pr812SafeEnum(operation),
      source_content_type: _pr812SafeEnum(contentType)
    });
  }
}

function _pr812CollectMessages(value, output, depth = 0) {
  if (value == null || depth > 7) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 128)) _pr812CollectMessages(item, output, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  if (value.author && value.content) output.push(value);
  for (const key of ["message", "messages", "data", "result", "payload", "turn", "v", "value"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      _pr812CollectMessages(value[key], output, depth + 1);
    }
  }
}

function _pr812PatchSelect(state, message) {
  if (!message || typeof message !== "object") return;
  state.currentPatchMessage = {
    ...message,
    content: message.content && typeof message.content === "object"
      ? { ...message.content }
      : { content_type: "text", parts: [] }
  };
}

function _pr812PatchApplyItem(context, state, item) {
  if (!item || typeof item !== "object") return;
  const path = typeof item.p === "string" ? item.p : null;
  const value = item.v;
  if (value && typeof value === "object" && !Array.isArray(value) && value.message) {
    _pr812PatchSelect(state, value.message);
    _pr812InspectMessage(context, state, state.currentPatchMessage);
    return;
  }
  if (!state.currentPatchMessage || path == null) return;

  if (path === "/message/content/parts/0" && typeof value === "string") {
    const content = state.currentPatchMessage.content || {};
    const parts = Array.isArray(content.parts) ? [...content.parts] : [];
    const previous = typeof parts[0] === "string" ? parts[0] : "";
    parts[0] = previous + value;
    state.currentPatchMessage.content = { ...content, parts };
    _pr812InspectMessage(context, state, state.currentPatchMessage);
  } else if (path === "/message/content" && value && typeof value === "object") {
    state.currentPatchMessage.content = { ...value };
    _pr812InspectMessage(context, state, state.currentPatchMessage);
  } else if (path === "/message/status") {
    state.currentPatchMessage.status = value;
    _pr812InspectMessage(context, state, state.currentPatchMessage);
  } else if (path === "/message/end_turn") {
    state.currentPatchMessage.end_turn = value;
    _pr812InspectMessage(context, state, state.currentPatchMessage);
  } else if (path === "/message/metadata" && value && typeof value === "object") {
    state.currentPatchMessage.metadata = {
      ...(state.currentPatchMessage.metadata || {}),
      ...value
    };
    _pr812InspectMessage(context, state, state.currentPatchMessage);
  }
}

function _pr812InspectPatch(context, state, payload) {
  if (!payload || typeof payload !== "object") return;
  _pr812PatchApplyItem(context, state, payload);
  if (Array.isArray(payload.v)) {
    for (const item of payload.v.slice(0, 128)) _pr812PatchApplyItem(context, state, item);
  }
}

function _pr812InspectTypedOperation(context, state, payload) {
  if (!payload || typeof payload !== "object") return;
  const type = _pr812OptionalString(payload.type);
  if (!type || ["message_marker", "stream_handoff", "server_ste_metadata"].includes(type)) return;
  const operation = _pr812OperationFromObject(payload);
  if (!operation) return;
  state.syntheticCounter += 1;
  const kind = _pr812ActivityKindFromToolName(type.includes("web") ? "web" : type);
  const activityId = `typed-${kind}:${state.syntheticCounter}`;
  _pr812Start(context, state, activityId, kind, _pr812Label(kind, operation, false), {
    operation: _pr812SafeEnum(operation),
    source_event_type: _pr812SafeEnum(type)
  });
}

_pr89BrowserStreamProcessSseEvent = async function _pr812ProcessSseEvent(context, block) {
  const result = await _pr812PriorProcessSseEvent(context, block);
  if (_pr812RequestId === null) return result;

  let data = "";
  try {
    const dataLines = String(block || "").split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    data = dataLines.join("\n").trim();
  } catch {
    return result;
  }
  if (!data || data === "[DONE]") return result;

  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return result;
  }

  const state = _pr812State(context);
  try {
    const messages = [];
    _pr812CollectMessages(payload, messages);
    const seen = new Set();
    for (const message of messages) {
      if (seen.has(message)) continue;
      seen.add(message);
      _pr812InspectMessage(context, state, message);
    }
    _pr812InspectPatch(context, state, payload);
    _pr812InspectTypedOperation(context, state, payload);
  } catch {
    // Activity observation is best-effort and can never perturb the write path.
  }
  return result;
};

executeNativeTurn = async function _pr812ExecuteNativeTurn(message) {
  const streaming = message?.streamTextObservations === true;
  if (!streaming) return _pr812PriorExecuteNativeTurn(message);

  const requestId = typeof message?.request_id === "string" ? message.request_id.trim() : "";
  if (!requestId) return _pr812PriorExecuteNativeTurn(message);
  if (_pr812RequestId !== null) {
    throw new Error("PR8_12_ACTIVITY_STREAM_ALREADY_ACTIVE");
  }

  _pr812RequestId = requestId;
  _pr812Sequence = 0;
  try {
    return await _pr812PriorExecuteNativeTurn(message);
  } finally {
    _pr812RequestId = null;
  }
};

/* END legacy source: service_worker_normalized_activity_stream_pr8_12.js */


/* BEGIN legacy source: service_worker_normalized_activity_patch_protocol_pr8_12.js */
// PR8.12 patch-protocol compatibility hardening.
//
// The proven PR8.9 product stream can append text with either an explicit
// /message/content/parts/0 path or a compact null path after selecting the
// current message. Keep PR8.12 activity text aligned with that behavior.

const _pr812PatchProtocolPriorPatchSelect = _pr812PatchSelect;
const _pr812PatchProtocolPriorPatchApplyItem = _pr812PatchApplyItem;

_pr812PatchSelect = function _pr812PatchSelectWithStableSyntheticId(state, message) {
  if (!message || typeof message !== "object") return;
  let selected = message;
  if (!_pr812OptionalString(message.id)) {
    state.syntheticCounter += 1;
    selected = {
      ...message,
      id: `pr812-patch-${state.syntheticCounter}`
    };
  }
  _pr812PatchProtocolPriorPatchSelect(state, selected);
};

_pr812PatchApplyItem = function _pr812PatchApplyItemWithCompactNullPath(
  context,
  state,
  item
) {
  if (!item || typeof item !== "object") return;
  const path = typeof item.p === "string" ? item.p : null;
  const value = item.v;

  if (
    path === null &&
    typeof value === "string" &&
    value.length > 0 &&
    state.currentPatchMessage
  ) {
    const content = state.currentPatchMessage.content || {};
    const parts = Array.isArray(content.parts) ? [...content.parts] : [];
    const previous = typeof parts[0] === "string" ? parts[0] : "";
    parts[0] = previous + value;
    state.currentPatchMessage.content = { ...content, parts };
    _pr812InspectMessage(context, state, state.currentPatchMessage);
    return;
  }

  return _pr812PatchProtocolPriorPatchApplyItem(context, state, item);
};

/* END legacy source: service_worker_normalized_activity_patch_protocol_pr8_12.js */


/* BEGIN legacy source: service_worker_answer_channel_pr8_12.js */
// PR8.12: bounded assistant output-channel propagation for final-only streaming.
//
// Modern OpenAI assistant turns can distinguish user-visible `commentary`
// preambles from the terminal `final` answer. ChatGPT web payloads do not always
// expose this marker, so this layer treats it as optional evidence only. It
// exports a small normalized enum when present and never exports raw metadata.

const _pr812ChannelPriorVisibleAssistantText = _pr89BrowserStreamVisibleAssistantText;
const _pr812ChannelPriorRecordAssistant = _pr89BrowserStreamRecordAssistant;

function _pr812NormalizedAssistantChannel(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "final" || normalized === "commentary") return normalized;
  return null;
}

function _pr812AssistantChannel(message) {
  if (!message || typeof message !== "object") return null;
  const metadata = message.metadata && typeof message.metadata === "object"
    ? message.metadata
    : {};
  for (const value of [
    message.channel,
    metadata.channel,
    metadata.output_channel,
    metadata.message_channel,
  ]) {
    const channel = _pr812NormalizedAssistantChannel(value);
    if (channel) return channel;
  }
  return null;
}

_pr89BrowserStreamVisibleAssistantText = function _pr812VisibleAssistantTextWithChannel(message) {
  const candidate = _pr812ChannelPriorVisibleAssistantText(message);
  if (!candidate) return candidate;
  return {
    ...candidate,
    channel: _pr812AssistantChannel(message),
  };
};

_pr89BrowserStreamRecordAssistant = async function _pr812RecordAssistantWithChannel(context, candidate) {
  if (!context || !candidate || typeof candidate !== "object") {
    return _pr812ChannelPriorRecordAssistant(context, candidate);
  }

  if (!(context.pr812AnswerChannelByKey instanceof Map)) {
    context.pr812AnswerChannelByKey = new Map();
  }

  const key = typeof candidate.messageKey === "string" && candidate.messageKey
    ? candidate.messageKey
    : null;
  const explicit = _pr812NormalizedAssistantChannel(candidate.channel);
  if (key && explicit) context.pr812AnswerChannelByKey.set(key, explicit);

  const remembered = key ? context.pr812AnswerChannelByKey.get(key) || null : null;
  return _pr812ChannelPriorRecordAssistant(context, {
    ...candidate,
    channel: explicit || remembered,
  });
};

/* END legacy source: service_worker_answer_channel_pr8_12.js */


/* BEGIN legacy source: service_worker_temporary_chat_production_pr8_13.js */
// PR8.13: production Temporary Chat write routing and lifecycle authority.
//
// Temporary mode is never inferred from a URL/title alone. For every Temporary
// product write, the page-generated conversation POST is paused with CDP Fetch
// before it reaches the server. Only a request whose browser-local JSON payload
// proves `history_and_training_disabled === true` is allowed to continue.
// Raw request bodies never leave this worker and are never rewritten here.

const PR813_TEMPORARY_RUNTIME_TAB_KEY = "browserNativeTemporaryRuntimeTabIdV1";
const PR813_TEMPORARY_PROOF_TIMEOUT_MS = 10_000;
const _pr813PriorExecuteNativeTurn = executeNativeTurn;
const _pr813PriorEnsureRuntimeTab = ensureRuntimeTab;
const _pr813PriorSubmitOfficialPageTurn = submitOfficialPageTurn;

let _pr813LiveTemporaryLifecycle = null;
let _pr813TemporaryTurnContext = null;

function _pr813TemporaryToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  return token || null;
}

function _pr813ConversationId(value) {
  const conversationId = typeof value === "string" ? value.trim() : "";
  return conversationId || null;
}

async function _pr813StoredTemporaryTabId() {
  const value = await chrome.storage.local.get(PR813_TEMPORARY_RUNTIME_TAB_KEY);
  const tabId = value?.[PR813_TEMPORARY_RUNTIME_TAB_KEY];
  return Number.isInteger(tabId) ? tabId : null;
}

async function _pr813StoreTemporaryTabId(tabId) {
  if (!Number.isInteger(tabId)) throw new Error("PR8_13_TEMPORARY_TAB_ID_REQUIRED");
  await chrome.storage.local.set({ [PR813_TEMPORARY_RUNTIME_TAB_KEY]: tabId });
}

async function _pr813ClearStoredTemporaryTabId(expectedTabId = null) {
  const stored = await _pr813StoredTemporaryTabId();
  if (expectedTabId !== null && stored !== expectedTabId) return;
  await chrome.storage.local.remove(PR813_TEMPORARY_RUNTIME_TAB_KEY);
}

async function _pr813CloseTemporaryTab(tabId) {
  if (!Number.isInteger(tabId)) return false;
  try {
    await chrome.tabs.remove(tabId);
    return true;
  } catch {
    return false;
  }
}

async function _pr813RetireOwnedTemporaryTab() {
  const liveTabId = Number.isInteger(_pr813LiveTemporaryLifecycle?.tabId)
    ? _pr813LiveTemporaryLifecycle.tabId
    : null;
  const storedTabId = await _pr813StoredTemporaryTabId();
  const tabId = liveTabId ?? storedTabId;
  _pr813LiveTemporaryLifecycle = null;
  if (Number.isInteger(tabId)) await _pr813CloseTemporaryTab(tabId);
  await _pr813ClearStoredTemporaryTabId();
}

async function _pr813CreateTemporaryTab() {
  // A new Temporary lifecycle never reuses a prior CWA Temporary tab. The tab
  // id may survive a worker restart only so the next fresh lifecycle can clean
  // it up; it is never sufficient to restore write authority.
  await _pr813RetireOwnedTemporaryTab();
  const tab = await chrome.tabs.create({
    url: `${CHATGPT_ORIGIN}/?temporary-chat=true`,
    active: false,
  });
  if (!Number.isInteger(tab?.id)) throw new Error("PR8_13_TEMPORARY_TAB_CREATE_FAILED");
  await _pr813StoreTemporaryTabId(tab.id);
  return waitForTabComplete(tab.id, 45_000);
}

async function _pr813RequireLiveTemporaryTab(context) {
  const tab = await chrome.tabs.get(context.tabId);
  if (!isChatGPTUrl(tab?.url || "")) {
    throw new Error("PR8_13_TEMPORARY_LIFECYCLE_TAB_NOT_CHATGPT");
  }
  return tab;
}

function _pr813NewProofPromise(context) {
  if (context.proofPromise) return context.proofPromise;
  context.proofPromise = new Promise((resolve, reject) => {
    context.resolveProof = resolve;
    context.rejectProof = reject;
  });
  return context.proofPromise;
}

function _pr813RejectProof(context, error) {
  if (context.proofSettled) return;
  context.proofSettled = true;
  if (typeof context.rejectProof === "function") context.rejectProof(error);
}

function _pr813ResolveProof(context, evidence) {
  if (context.proofSettled) return;
  context.proofSettled = true;
  context.prewriteProof = evidence;
  if (typeof context.resolveProof === "function") context.resolveProof(evidence);
}

function _pr813InspectPausedConversationRequest(context, request) {
  if (!request || !isConversationWrite(request.url || "", request.method || "")) {
    return { relevant: false };
  }
  if (typeof request.postData !== "string" || !request.postData) {
    return { relevant: true, proven: false, reason: "REQUEST_POST_DATA_MISSING" };
  }

  let payload;
  try {
    payload = JSON.parse(request.postData);
  } catch {
    return { relevant: true, proven: false, reason: "REQUEST_POST_DATA_NOT_JSON" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { relevant: true, proven: false, reason: "REQUEST_PAYLOAD_NOT_OBJECT" };
  }
  if (payload.history_and_training_disabled !== true) {
    return {
      relevant: true,
      proven: false,
      reason: "HISTORY_AND_TRAINING_DISABLED_NOT_TRUE",
    };
  }

  const payloadConversationId = _pr813ConversationId(payload.conversation_id);
  if (context.expectedConversationId === null) {
    if (payloadConversationId !== null) {
      return {
        relevant: true,
        proven: false,
        reason: "FRESH_TEMPORARY_REQUEST_HAS_CONVERSATION_ID",
      };
    }
  } else if (payloadConversationId !== context.expectedConversationId) {
    return {
      relevant: true,
      proven: false,
      reason: "TEMPORARY_CONTINUATION_CONVERSATION_MISMATCH",
    };
  }

  return {
    relevant: true,
    proven: true,
    evidence: {
      proofKind: "FETCH_PAUSED_HISTORY_AND_TRAINING_DISABLED_TRUE",
      continuationIdentityProven: context.expectedConversationId !== null,
    },
  };
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const context = _pr813TemporaryTurnContext;
  if (context === null || method !== "Fetch.requestPaused" || source?.tabId !== context.tabId) {
    return;
  }

  const inspection = _pr813InspectPausedConversationRequest(context, params?.request);
  if (inspection.relevant !== true) {
    chrome.debugger.sendCommand(source, "Fetch.continueRequest", { requestId: params.requestId })
      .catch(() => {});
    return;
  }

  context.pausedConversationWriteCount += 1;
  if (inspection.proven !== true) {
    context.modeViolation = inspection.reason || "TEMPORARY_MODE_NOT_PROVEN";
    chrome.debugger.sendCommand(source, "Fetch.failRequest", {
      requestId: params.requestId,
      errorReason: "Aborted",
    }).catch(() => {});
    _pr813RejectProof(
      context,
      new Error(`PR8_13_TEMPORARY_PREWRITE_PROOF_FAILED:${context.modeViolation}`)
    );
    return;
  }

  chrome.debugger.sendCommand(source, "Fetch.continueRequest", { requestId: params.requestId })
    .then(() => {
      if (!context.prewriteProof) context.prewriteProof = inspection.evidence;
      _pr813ResolveProof(context, inspection.evidence);
    })
    .catch((error) => {
      _pr813RejectProof(
        context,
        new Error(`PR8_13_TEMPORARY_REQUEST_CONTINUE_FAILED:${String(error)}`)
      );
    });
});

ensureRuntimeTab = async function _pr813EnsureRuntimeTab(conversationId) {
  const context = _pr813TemporaryTurnContext;
  if (context === null) return _pr813PriorEnsureRuntimeTab(conversationId);

  const requestedConversationId = _pr813ConversationId(conversationId);
  if (requestedConversationId !== context.expectedConversationId) {
    throw new Error("PR8_13_TEMPORARY_RUNTIME_CONVERSATION_MISMATCH");
  }
  return _pr813RequireLiveTemporaryTab(context);
};

submitOfficialPageTurn = async function _pr813SubmitOfficialPageTurn(debuggee, timeoutMs) {
  const context = _pr813TemporaryTurnContext;
  if (context === null || debuggee?.tabId !== context.tabId) {
    return _pr813PriorSubmitOfficialPageTurn(debuggee, timeoutMs);
  }

  const proofPromise = _pr813NewProofPromise(context);
  await sendCommand(debuggee, "Fetch.enable", {
    patterns: [
      {
        urlPattern: "*://chatgpt.com/backend-api/*conversation*",
        requestStage: "Request",
      },
    ],
  });

  const submit = await _pr813PriorSubmitOfficialPageTurn(debuggee, timeoutMs);
  await Promise.race([
    proofPromise,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error("PR8_13_TEMPORARY_PREWRITE_PROOF_TIMEOUT")),
      Math.min(PR813_TEMPORARY_PROOF_TIMEOUT_MS, Math.max(1000, timeoutMs))
    )),
  ]);
  if (!context.prewriteProof || context.modeViolation) {
    throw new Error(
      `PR8_13_TEMPORARY_PREWRITE_PROOF_FAILED:${context.modeViolation || "UNPROVEN"}`
    );
  }
  return submit;
};

async function _pr813EndTemporaryLifecycle(message) {
  const token = _pr813TemporaryToken(message?.temporaryLifecycleToken);
  const live = _pr813LiveTemporaryLifecycle;
  if (!token || !live || live.token !== token || live.state !== "LIVE") {
    throw new Error("PR8_13_TEMPORARY_LIFECYCLE_NOT_LIVE");
  }
  const conversationId = live.conversationId;
  const tabId = live.tabId;
  live.state = "ENDED";
  _pr813LiveTemporaryLifecycle = null;
  await _pr813CloseTemporaryTab(tabId);
  await _pr813ClearStoredTemporaryTabId(tabId);
  return {
    conversationMode: "temporary",
    conversationId,
    temporaryLifecycleState: "ENDED",
    temporaryLifecycleEnded: true,
    temporaryLiveWriteAuthorityProven: false,
  };
}

async function _pr813ExecuteTemporaryTurn(message) {
  const token = _pr813TemporaryToken(message?.temporaryLifecycleToken);
  if (!token) throw new Error("PR8_13_TEMPORARY_LIFECYCLE_TOKEN_REQUIRED");

  const expectedConversationId = _pr813ConversationId(message?.conversationId);
  let tab;
  if (expectedConversationId === null) {
    tab = await _pr813CreateTemporaryTab();
    _pr813LiveTemporaryLifecycle = {
      token,
      tabId: tab.id,
      conversationId: null,
      state: "LIVE",
    };
  } else {
    const live = _pr813LiveTemporaryLifecycle;
    if (
      !live ||
      live.state !== "LIVE" ||
      live.token !== token ||
      live.conversationId !== expectedConversationId ||
      !Number.isInteger(live.tabId)
    ) {
      throw new Error("PR8_13_TEMPORARY_LIFECYCLE_NOT_LIVE");
    }
    tab = await _pr813RequireLiveTemporaryTab({ tabId: live.tabId });
  }

  const context = {
    token,
    tabId: tab.id,
    expectedConversationId,
    proofPromise: null,
    resolveProof: null,
    rejectProof: null,
    proofSettled: false,
    prewriteProof: null,
    modeViolation: null,
    pausedConversationWriteCount: 0,
  };

  if (_pr813TemporaryTurnContext !== null) {
    throw new Error("PR8_13_TEMPORARY_TURN_ALREADY_ACTIVE");
  }
  _pr813TemporaryTurnContext = context;

  let delegated = false;
  try {
    const result = await _pr813PriorExecuteNativeTurn({
      ...message,
      conversationMode: "temporary",
    });
    delegated = context.prewriteProof !== null;
    if (!delegated || context.modeViolation) {
      throw new Error("PR8_13_TEMPORARY_PREWRITE_PROOF_NOT_RETAINED");
    }

    const resolvedConversationId = _pr813ConversationId(result?.conversationId);
    if (!resolvedConversationId) throw new Error("PR8_13_TEMPORARY_CONVERSATION_ID_MISSING");
    if (expectedConversationId && resolvedConversationId !== expectedConversationId) {
      throw new Error("PR8_13_TEMPORARY_RETURN_CONVERSATION_MISMATCH");
    }

    const live = _pr813LiveTemporaryLifecycle;
    if (!live || live.token !== token || live.tabId !== tab.id || live.state !== "LIVE") {
      throw new Error("PR8_13_TEMPORARY_LIFECYCLE_LOST_AFTER_WRITE");
    }
    live.conversationId = resolvedConversationId;

    return {
      ...result,
      conversationMode: "temporary",
      temporaryModeProven: true,
      temporaryPrewriteProof: context.prewriteProof.proofKind,
      temporaryContinuationIdentityProven: (
        context.prewriteProof.continuationIdentityProven === true
      ),
      temporaryLifecycleToken: token,
      temporaryLifecycleState: "LIVE",
      temporaryLiveWriteAuthorityProven: true,
      temporaryPausedConversationWriteCount: context.pausedConversationWriteCount,
    };
  } catch (error) {
    delegated = delegated || context.prewriteProof !== null;
    const live = _pr813LiveTemporaryLifecycle;
    if (live && live.token === token) {
      // Once a Temporary request may have reached the server, conversational
      // recovery cannot recreate authority. Invalidate the lifecycle and retain
      // the owned tab only for visible inspection/next-fresh cleanup.
      live.state = "ENDED";
      _pr813LiveTemporaryLifecycle = null;
    }
    if (!delegated) {
      await _pr813CloseTemporaryTab(tab.id);
      await _pr813ClearStoredTemporaryTabId(tab.id);
    }
    throw error;
  } finally {
    _pr813TemporaryTurnContext = null;
  }
}

executeNativeTurn = async function _pr813ExecuteNativeTurn(message) {
  if (message?.endTemporaryLifecycle === true) {
    return _pr813EndTemporaryLifecycle(message);
  }
  const mode = typeof message?.conversationMode === "string"
    ? message.conversationMode.trim().toLowerCase()
    : "normal";
  if (mode !== "temporary") return _pr813PriorExecuteNativeTurn(message);
  return _pr813ExecuteTemporaryTurn(message);
};

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const live = _pr813LiveTemporaryLifecycle;
  if (live && live.tabId === tabId) {
    live.state = "ENDED";
    _pr813LiveTemporaryLifecycle = null;
  }
  const stored = await _pr813StoredTemporaryTabId();
  if (stored === tabId) await _pr813ClearStoredTemporaryTabId(tabId);
});

/* END legacy source: service_worker_temporary_chat_production_pr8_13.js */


/* BEGIN legacy source: service_worker_temporary_session_identity_pr8_13.js */
// PR8.13 follow-up: recover Temporary backend routing identity from the already
// observed live SSE stream without reopening the conversation or waiting for the
// complete response body.
//
// A Temporary product conversation id is session-local routing metadata only.
// It is not a durable conversation handle and never grants continuation authority
// without the live PR8.13 lifecycle token/tab binding.

const _pr813SessionIdentityPriorProcessSseEvent = _pr89BrowserStreamProcessSseEvent;
const _pr813SessionIdentityPriorExecuteOfficialPageTurn = executeOfficialPageTurn;

function _pr813SessionIdentityDirect(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const conversationId = _pr813ConversationId(
    value.conversation_id ?? value.conversationId
  );
  if (!conversationId) return null;
  const turnExchangeId = typeof (value.turn_exchange_id ?? value.turnExchangeId) === "string" &&
    (value.turn_exchange_id ?? value.turnExchangeId).trim()
    ? (value.turn_exchange_id ?? value.turnExchangeId).trim()
    : null;
  return { conversationId, turnExchangeId };
}

function _pr813SessionIdentityFromPayload(payload) {
  const direct = _pr813SessionIdentityDirect(payload);
  if (direct) return direct;

  // Bounded envelope traversal only. Do not recursively inspect arbitrary tool,
  // message, metadata, or attachment objects for conversation-shaped strings.
  for (const key of ["payload", "data", "result", "turn"]) {
    const nested = _pr813SessionIdentityDirect(payload?.[key]);
    if (nested) return nested;
  }
  return null;
}

function _pr813SessionIdentityFromSseBlock(block) {
  const lines = String(block || "").split(/\r?\n/);
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;

  const data = dataLines.join("\n").trim();
  if (!data || data === "[DONE]") return null;

  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  return _pr813SessionIdentityFromPayload(payload);
}

_pr89BrowserStreamProcessSseEvent = async function _pr813ProcessSseWithTemporarySessionIdentity(
  context,
  block
) {
  const temporaryContext = _pr813TemporaryTurnContext;
  if (temporaryContext !== null) {
    const identity = _pr813SessionIdentityFromSseBlock(block);
    if (identity !== null) {
      if (
        temporaryContext.expectedConversationId !== null &&
        identity.conversationId !== temporaryContext.expectedConversationId
      ) {
        temporaryContext.modeViolation = "TEMPORARY_STREAM_IDENTITY_CONVERSATION_MISMATCH";
      } else {
        temporaryContext.ephemeralConversationId = identity.conversationId;
        if (identity.turnExchangeId) {
          temporaryContext.ephemeralTurnExchangeId = identity.turnExchangeId;
        }
      }
    }
  }

  return _pr813SessionIdentityPriorProcessSseEvent(context, block);
};

executeOfficialPageTurn = async function _pr813ExecuteOfficialPageTurnWithSessionIdentity(args) {
  const result = await _pr813SessionIdentityPriorExecuteOfficialPageTurn(args);
  const temporaryContext = _pr813TemporaryTurnContext;
  if (temporaryContext === null || !result || typeof result !== "object") return result;

  const conversationId = _pr813ConversationId(result.conversationId)
    || _pr813ConversationId(temporaryContext.ephemeralConversationId);
  const turnExchangeId = (
    typeof result.turnExchangeId === "string" && result.turnExchangeId.trim()
      ? result.turnExchangeId.trim()
      : typeof temporaryContext.ephemeralTurnExchangeId === "string" &&
        temporaryContext.ephemeralTurnExchangeId.trim()
        ? temporaryContext.ephemeralTurnExchangeId.trim()
        : null
  );

  return {
    ...result,
    conversationId,
    turnExchangeId,
  };
};

/* END legacy source: service_worker_temporary_session_identity_pr8_13.js */


/* BEGIN legacy source: service_worker_temporary_fresh_identity_flush_pr8_13.js */
// PR8.13 live repair: allow the established PR8.9 streaming reducer to finish
// processing a fresh Temporary response before the legacy ordinary-chat native
// turn boundary insists on a conversation id.
//
// The sentinel below is extension-local only. It is never written into the
// page-generated product request. For a fresh Temporary turn, the PR8.13
// conversation-id normalizer treats it as "not yet known" until the live SSE
// reducer has observed the real session-local routing identity. If the real
// identity is still unavailable after the stream reducer flushes, PR8.13 still
// fails closed.

const PR813_FRESH_TEMPORARY_IDENTITY_SENTINEL = "__cwa_pr813_live_temporary_identity_pending__";
const _pr813FreshIdentityPriorConversationId = _pr813ConversationId;
const _pr813FreshIdentityPriorExecuteNativeTurn = executeNativeTurn;

function _pr813FreshIdentityFromLiveContext() {
  const active = _pr813TemporaryTurnContext;
  const activeId = _pr813FreshIdentityPriorConversationId(
    active?.ephemeralConversationId
  );
  if (activeId) return activeId;

  const liveId = _pr813FreshIdentityPriorConversationId(
    _pr813LiveTemporaryLifecycle?.conversationId
  );
  return liveId || null;
}

_pr813ConversationId = function _pr813ConversationIdWithFreshIdentitySentinel(value) {
  if (value === PR813_FRESH_TEMPORARY_IDENTITY_SENTINEL) {
    return _pr813FreshIdentityFromLiveContext();
  }
  return _pr813FreshIdentityPriorConversationId(value);
};

executeNativeTurn = async function _pr813ExecuteNativeTurnWithFreshIdentityFlush(message) {
  const mode = typeof message?.conversationMode === "string"
    ? message.conversationMode.trim().toLowerCase()
    : "normal";
  const freshTemporary = (
    mode === "temporary" &&
    _pr813FreshIdentityPriorConversationId(message?.conversationId) === null
  );

  if (!freshTemporary) {
    return _pr813FreshIdentityPriorExecuteNativeTurn(message);
  }

  const result = await _pr813FreshIdentityPriorExecuteNativeTurn({
    ...message,
    // This satisfies only the legacy base native-turn identity assertion. The
    // PR8.13 ensureRuntimeTab/prewrite layers normalize this sentinel back to
    // null, so the page still performs a true fresh Temporary write with no
    // conversation_id in its request payload.
    conversationId: PR813_FRESH_TEMPORARY_IDENTITY_SENTINEL,
  });

  if (!result || typeof result !== "object") return result;
  if (result.conversationId !== PR813_FRESH_TEMPORARY_IDENTITY_SENTINEL) {
    return result;
  }

  const resolvedConversationId = _pr813FreshIdentityFromLiveContext();
  if (!resolvedConversationId) {
    throw new Error("PR8_13_TEMPORARY_SESSION_ROUTING_IDENTITY_MISSING_AFTER_STREAM_FLUSH");
  }

  return {
    ...result,
    conversationId: resolvedConversationId,
    temporarySessionRoutingIdentitySource: "LIVE_SSE_STREAM",
  };
};

/* END legacy source: service_worker_temporary_fresh_identity_flush_pr8_13.js */


/* BEGIN legacy source: service_worker_temporary_startup_readiness_pr8_13_2.js */
// PR8.13.2: fresh Temporary startup-readiness stabilization and abort diagnostics.
//
// This layer is deliberately non-authoritative. It may delay a fresh Temporary
// submit while the newly-created product page stabilizes, but it never grants
// Temporary write authority. The PR8.13 Fetch-paused proof of the page-generated
// request (`history_and_training_disabled === true`) remains the only prewrite
// authority gate.

const PR8132_FRESH_READINESS_TIMEOUT_MS = 5_000;
const PR8132_FRESH_READINESS_STABLE_MS = 750;
const PR8132_FRESH_READINESS_POLL_MS = 125;
const PR8132_FRESH_READINESS_REQUIRED_SAMPLES = 3;

const _pr8132PriorSubmitOfficialPageTurn = submitOfficialPageTurn;
const _pr8132PriorResolveProof = _pr813ResolveProof;
const _pr8132PriorRejectProof = _pr813RejectProof;
const _pr8132PriorExecuteNativeTurn = executeNativeTurn;

const _pr8132TurnDiagnostics = new Map();

function _pr8132ContextToken(context) {
  return _pr813TemporaryToken(context?.token);
}

function _pr8132UpdateDiagnostic(context, patch) {
  const token = _pr8132ContextToken(context);
  if (!token) return;
  const current = _pr8132TurnDiagnostics.get(token) || {};
  _pr8132TurnDiagnostics.set(token, {
    ...current,
    ...patch,
    pausedConversationWriteCount: Number.isInteger(context?.pausedConversationWriteCount)
      ? context.pausedConversationWriteCount
      : (current.pausedConversationWriteCount ?? 0),
    modeViolation: typeof context?.modeViolation === "string"
      ? context.modeViolation
      : (current.modeViolation ?? null),
  });
}

function _pr8132TemporaryUrlHint(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === CHATGPT_ORIGIN &&
      parsed.searchParams.get("temporary-chat") === "true";
  } catch {
    return false;
  }
}

async function _pr8132TemporaryControlHint(debuggee) {
  if (typeof _pr87TemporaryControlSnapshot !== "function") {
    return {
      available: false,
      controlFound: false,
      ambiguous: false,
      selected: null,
    };
  }
  try {
    const snapshot = await _pr87TemporaryControlSnapshot(debuggee);
    return {
      available: true,
      controlFound: snapshot?.controlFound === true,
      ambiguous: snapshot?.ambiguous === true,
      selected: typeof snapshot?.selected === "boolean" ? snapshot.selected : null,
    };
  } catch {
    return {
      available: false,
      controlFound: false,
      ambiguous: false,
      selected: null,
    };
  }
}

async function _pr8132FreshReadinessSample(debuggee) {
  let tab;
  try {
    tab = await chrome.tabs.get(debuggee.tabId);
  } catch {
    return {
      readyHint: false,
      reason: "temporary_tab_unavailable",
      urlTemporaryQueryTrue: false,
      composerReady: false,
      controlAvailable: false,
      controlFound: false,
      controlAmbiguous: false,
      controlSelected: null,
    };
  }

  let composer = { ready: false, reason: "composer_probe_failed" };
  try {
    composer = await queryComposerReadiness(debuggee);
  } catch {
    // Keep the readiness hint fail-closed. The authoritative Fetch proof has not
    // run yet and no product write is submitted from this probe.
  }

  const control = await _pr8132TemporaryControlHint(debuggee);
  const urlTemporaryQueryTrue = _pr8132TemporaryUrlHint(tab?.url || "");
  const explicitControlFalse = Boolean(
    control.available &&
    control.controlFound &&
    !control.ambiguous &&
    control.selected === false
  );
  const readyHint = Boolean(
    urlTemporaryQueryTrue &&
    composer?.ready === true &&
    !explicitControlFalse
  );

  let reason = "ready_hint";
  if (!urlTemporaryQueryTrue) reason = "temporary_url_hint_missing";
  else if (composer?.ready !== true) reason = `composer_${composer?.reason || "not_ready"}`;
  else if (explicitControlFalse) reason = "temporary_control_explicitly_false";

  return {
    readyHint,
    reason,
    urlTemporaryQueryTrue,
    composerReady: composer?.ready === true,
    controlAvailable: control.available,
    controlFound: control.controlFound,
    controlAmbiguous: control.ambiguous,
    controlSelected: control.selected,
  };
}

async function _pr8132WaitForFreshTemporaryReadiness(debuggee, timeoutMs) {
  const startedAt = performance.now();
  const budgetMs = Math.min(
    PR8132_FRESH_READINESS_TIMEOUT_MS,
    Math.max(1_000, Number.isFinite(timeoutMs) ? timeoutMs : PR8132_FRESH_READINESS_TIMEOUT_MS)
  );
  let stableStartedAt = null;
  let consecutiveReady = 0;
  let last = {
    readyHint: false,
    reason: "not_sampled",
    urlTemporaryQueryTrue: false,
    composerReady: false,
    controlAvailable: false,
    controlFound: false,
    controlAmbiguous: false,
    controlSelected: null,
  };

  while (performance.now() - startedAt < budgetMs) {
    last = await _pr8132FreshReadinessSample(debuggee);
    if (!last.readyHint) {
      stableStartedAt = null;
      consecutiveReady = 0;
    } else {
      if (stableStartedAt === null) stableStartedAt = performance.now();
      consecutiveReady += 1;
      const stableMs = Math.round(performance.now() - stableStartedAt);
      const explicitSelected = Boolean(
        last.controlAvailable &&
        last.controlFound &&
        !last.controlAmbiguous &&
        last.controlSelected === true
      );

      if (explicitSelected && consecutiveReady >= 2) {
        return {
          kind: "TEMPORARY_CONTROL_SELECTED_STABLE",
          waitMs: Math.round(performance.now() - startedAt),
          stableMs,
          consecutiveReady,
          ...last,
        };
      }

      if (
        consecutiveReady >= PR8132_FRESH_READINESS_REQUIRED_SAMPLES &&
        stableMs >= PR8132_FRESH_READINESS_STABLE_MS
      ) {
        return {
          kind: "TEMPORARY_URL_COMPOSER_STABLE_HINT",
          waitMs: Math.round(performance.now() - startedAt),
          stableMs,
          consecutiveReady,
          ...last,
        };
      }
    }
    await sleep(PR8132_FRESH_READINESS_POLL_MS);
  }

  throw new Error(
    `PR8_13_2_TEMPORARY_FRESH_READINESS_TIMEOUT:${last.reason || "unknown"}`
  );
}

_pr813ResolveProof = function _pr8132ResolveProofWithDiagnostics(context, evidence) {
  _pr8132UpdateDiagnostic(context, {
    prewriteProofKind: typeof evidence?.proofKind === "string" ? evidence.proofKind : null,
    prewriteProofResolved: true,
  });
  return _pr8132PriorResolveProof(context, evidence);
};

_pr813RejectProof = function _pr8132RejectProofWithDiagnostics(context, error) {
  _pr8132UpdateDiagnostic(context, {
    prewriteProofRejected: true,
    proofError: error instanceof Error ? error.message : String(error),
  });
  return _pr8132PriorRejectProof(context, error);
};

submitOfficialPageTurn = async function _pr8132SubmitOfficialPageTurn(debuggee, timeoutMs) {
  const context = _pr813TemporaryTurnContext;
  if (context === null || debuggee?.tabId !== context.tabId) {
    return _pr8132PriorSubmitOfficialPageTurn(debuggee, timeoutMs);
  }

  if (context.expectedConversationId === null) {
    const readiness = await _pr8132WaitForFreshTemporaryReadiness(debuggee, timeoutMs);
    context.pr8132FreshReadiness = readiness;
    _pr8132UpdateDiagnostic(context, {
      freshReadinessApplied: true,
      freshReadinessKind: readiness.kind,
      freshReadinessWaitMs: readiness.waitMs,
      freshReadinessStableMs: readiness.stableMs,
      freshReadinessControlSelected: readiness.controlSelected,
      freshReadinessUrlQueryTrue: readiness.urlTemporaryQueryTrue,
    });
  } else {
    _pr8132UpdateDiagnostic(context, {
      freshReadinessApplied: false,
    });
  }

  return _pr8132PriorSubmitOfficialPageTurn(debuggee, timeoutMs);
};

function _pr8132AbortError(error, diagnostic) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("CHATGPT_CONVERSATION_REQUEST_FAILED:net::ERR_ABORTED")) {
    return null;
  }

  if (typeof diagnostic?.modeViolation === "string" && diagnostic.modeViolation) {
    return new Error(
      `PR8_13_2_TEMPORARY_PREWRITE_ABORT:${diagnostic.modeViolation}:${message}`
    );
  }
  if (typeof diagnostic?.prewriteProofKind === "string" && diagnostic.prewriteProofKind) {
    return new Error(
      `PR8_13_2_TEMPORARY_ABORT_AFTER_PREWRITE_PROOF:${diagnostic.prewriteProofKind}:${message}`
    );
  }
  if ((diagnostic?.pausedConversationWriteCount ?? 0) > 0) {
    return new Error(
      `PR8_13_2_TEMPORARY_ABORT_WITHOUT_RETAINED_PROOF:paused=${diagnostic.pausedConversationWriteCount}:${message}`
    );
  }
  return new Error(
    `PR8_13_2_TEMPORARY_ABORT_BEFORE_FETCH_OBSERVATION:${message}`
  );
}

executeNativeTurn = async function _pr8132ExecuteNativeTurnWithStartupDiagnostics(message) {
  const mode = typeof message?.conversationMode === "string"
    ? message.conversationMode.trim().toLowerCase()
    : "normal";
  if (mode !== "temporary") {
    return _pr8132PriorExecuteNativeTurn(message);
  }

  const token = _pr813TemporaryToken(message?.temporaryLifecycleToken);
  if (token) _pr8132TurnDiagnostics.set(token, {});

  try {
    const result = await _pr8132PriorExecuteNativeTurn(message);
    if (!result || typeof result !== "object") return result;
    const diagnostic = token ? (_pr8132TurnDiagnostics.get(token) || {}) : {};
    return {
      ...result,
      temporaryFreshReadinessApplied: diagnostic.freshReadinessApplied === true,
      temporaryFreshReadinessKind: typeof diagnostic.freshReadinessKind === "string"
        ? diagnostic.freshReadinessKind
        : null,
      temporaryFreshReadinessWaitMs: Number.isInteger(diagnostic.freshReadinessWaitMs)
        ? diagnostic.freshReadinessWaitMs
        : null,
      temporaryFreshReadinessStableMs: Number.isInteger(diagnostic.freshReadinessStableMs)
        ? diagnostic.freshReadinessStableMs
        : null,
      temporaryFreshReadinessControlSelected: typeof diagnostic.freshReadinessControlSelected === "boolean"
        ? diagnostic.freshReadinessControlSelected
        : null,
      temporaryFreshReadinessUrlQueryTrue: diagnostic.freshReadinessUrlQueryTrue === true,
    };
  } catch (error) {
    const diagnostic = token ? (_pr8132TurnDiagnostics.get(token) || {}) : {};
    const enriched = _pr8132AbortError(error, diagnostic);
    if (enriched) throw enriched;
    throw error;
  } finally {
    if (token) _pr8132TurnDiagnostics.delete(token);
  }
};

/* END legacy source: service_worker_temporary_startup_readiness_pr8_13_2.js */

const _pr824aOriginalExecuteNativeTurn = executeNativeTurn;

async function _pr824aExistingRuntimeTabSnapshot() {
  const storedId = await storedRuntimeTabId();
  if (!Number.isInteger(storedId)) {
    return { tabId: null, preexisting: false };
  }
  try {
    const tab = await chrome.tabs.get(storedId);
    if (!isChatGPTUrl(tab?.url || "")) {
      return { tabId: null, preexisting: false };
    }
    return { tabId: storedId, preexisting: true };
  } catch {
    return { tabId: null, preexisting: false };
  }
}

executeNativeTurn = async function _executeNativeTurnWithProvisioningObservability(message) {
  const before = await _pr824aExistingRuntimeTabSnapshot();
  const activatedTabIds = new Set();
  const onActivated = (activeInfo) => {
    if (Number.isInteger(activeInfo?.tabId)) activatedTabIds.add(activeInfo.tabId);
  };
  chrome.tabs.onActivated.addListener(onActivated);

  try {
    const result = await _pr824aOriginalExecuteNativeTurn(message);
    const tabId = Number.isInteger(result?.tabId) ? result.tabId : null;
    let tabActiveAfter = null;
    if (tabId !== null) {
      try {
        const finalTab = await chrome.tabs.get(tabId);
        tabActiveAfter = Boolean(finalTab?.active);
      } catch {
        tabActiveAfter = null;
      }
    }

    const runtimeTabPreexisting = Boolean(before.preexisting && before.tabId === tabId);
    const runtimeTabCreatedForTurn = Boolean(tabId !== null && !runtimeTabPreexisting);
    const tabActivatedDuringTurn = Boolean(tabId !== null && activatedTabIds.has(tabId));
    const foregroundActivationObserved = Boolean(
      result?.tabWasActive === true ||
      tabActiveAfter === true ||
      tabActivatedDuringTurn
    );

    return {
      ...result,
      runtimeTabPreexisting,
      runtimeTabCreatedForTurn,
      tabActiveAfter,
      tabActivatedDuringTurn,
      foregroundActivationObserved
    };
  } finally {
    chrome.tabs.onActivated.removeListener(onActivated);
  }
};
/* END legacy source: service_worker_observability.js */

const _pr824a3RawStoredRuntimeTabId = storedRuntimeTabId;
let _pr824a3ValidationInFlight = null;

async function _pr824a3ClearStoredRuntimeTabIdIfMatches(expectedTabId) {
  const current = await _pr824a3RawStoredRuntimeTabId();
  if (current !== expectedTabId) return false;
  await chrome.storage.local.remove(RUNTIME_TAB_KEY);
  postNative({
    protocol: BRIDGE_PROTOCOL_VERSION,
    type: "runtime_state",
    runtimeTabId: null
  });
  return true;
}

async function _pr824a3ValidateStoredRuntimeTab() {
  if (_pr824a3ValidationInFlight !== null) return _pr824a3ValidationInFlight;

  _pr824a3ValidationInFlight = (async () => {
    const storedId = await _pr824a3RawStoredRuntimeTabId();
    if (!Number.isInteger(storedId)) {
      return { tabId: null, valid: false, stale: false };
    }

    try {
      const tab = await chrome.tabs.get(storedId);
      if (isChatGPTUrl(tab?.url || "")) {
        return { tabId: storedId, valid: true, stale: false };
      }
    } catch {
      // Missing Chrome tab is stale persistent state.
    }

    const cleared = await _pr824a3ClearStoredRuntimeTabIdIfMatches(storedId);
    if (!cleared) {
      const replacementId = await _pr824a3RawStoredRuntimeTabId();
      if (Number.isInteger(replacementId)) {
        try {
          const replacement = await chrome.tabs.get(replacementId);
          if (isChatGPTUrl(replacement?.url || "")) {
            return { tabId: replacementId, valid: true, stale: false };
          }
        } catch {
          // A concurrent replacement also went stale; the next read repairs it.
        }
      }
    }
    return { tabId: null, valid: false, stale: true };
  })();

  try {
    return await _pr824a3ValidationInFlight;
  } finally {
    _pr824a3ValidationInFlight = null;
  }
}

storedRuntimeTabId = async function _storedRuntimeTabIdWithLiveValidation() {
  const state = await _pr824a3ValidateStoredRuntimeTab();
  return state.tabId;
};

async function _pr824a3PublishValidatedRuntimeState() {
  const state = await _pr824a3ValidateStoredRuntimeTab();
  if (!state.stale) {
    postNative({
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "runtime_state",
      runtimeTabId: state.tabId
    });
  }
  return state;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (typeof changeInfo?.url !== "string") return;
  _pr824a3RawStoredRuntimeTabId().then(async (storedId) => {
    if (storedId !== tabId) return;
    const nextUrl = changeInfo.url || tab?.url || "";
    if (isChatGPTUrl(nextUrl)) return;
    await _pr824a3ClearStoredRuntimeTabIdIfMatches(tabId);
  }).catch(() => {});
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  _pr824a3RawStoredRuntimeTabId().then(async (storedId) => {
    if (storedId !== removedTabId) return;
    try {
      const replacement = await chrome.tabs.get(addedTabId);
      if (isChatGPTUrl(replacement?.url || "")) {
        await storeRuntimeTabId(addedTabId);
        return;
      }
    } catch {
      // Fall through to clearing the stale removed id.
    }
    await _pr824a3ClearStoredRuntimeTabIdIfMatches(removedTabId);
  }).catch(() => {});
});

_pr824a3PublishValidatedRuntimeState().catch(() => {});

// PR8.8 Browser Authority Lease fencing, CLOSE, and read-only live characterization.
const PR88_BROWSER_AUTHORITY_LEASE_KEY = "browserNativeRuntimeTabAuthorityLeaseId";
const PR88_RESOURCE_SAMPLE_MIN_MS = 1000;
const PR88_RESOURCE_SAMPLE_MAX_MS = 15000;
const _pr88PriorExecuteNativeTurn = executeNativeTurn;

function _pr88LeaseId(value) {
  const leaseId = typeof value === "string" ? value.trim() : "";
  return leaseId || null;
}

async function _pr88StoredLeaseId() {
  const value = await chrome.storage.local.get(PR88_BROWSER_AUTHORITY_LEASE_KEY);
  return _pr88LeaseId(value?.[PR88_BROWSER_AUTHORITY_LEASE_KEY]);
}

async function _pr88StoreLeaseId(leaseId) {
  await chrome.storage.local.set({
    [PR88_BROWSER_AUTHORITY_LEASE_KEY]: leaseId
  });
}

async function _pr88ClearLeaseIdIfMatches(expectedLeaseId) {
  const current = await _pr88StoredLeaseId();
  if (current !== expectedLeaseId) return false;
  await chrome.storage.local.remove(PR88_BROWSER_AUTHORITY_LEASE_KEY);
  return true;
}

function _pr88FiniteMetric(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function _pr88MetricValue(metrics, name) {
  const entry = Array.isArray(metrics)
    ? metrics.find((metric) => metric?.name === name)
    : null;
  return _pr88FiniteMetric(entry?.value);
}

async function _pr88PerformanceSnapshot(debuggee) {
  const performanceMetrics = await chrome.debugger.sendCommand(
    debuggee,
    "Performance.getMetrics"
  );
  let dom = null;
  try {
    dom = await chrome.debugger.sendCommand(debuggee, "Memory.getDOMCounters");
  } catch {
    dom = null;
  }
  const metrics = Array.isArray(performanceMetrics?.metrics)
    ? performanceMetrics.metrics
    : [];
  return {
    taskDurationS: _pr88MetricValue(metrics, "TaskDuration"),
    jsHeapUsedBytes: _pr88MetricValue(metrics, "JSHeapUsedSize"),
    jsHeapTotalBytes: _pr88MetricValue(metrics, "JSHeapTotalSize"),
    documents: Number.isInteger(dom?.documents)
      ? dom.documents
      : _pr88MetricValue(metrics, "Documents"),
    nodes: Number.isInteger(dom?.nodes)
      ? dom.nodes
      : _pr88MetricValue(metrics, "Nodes"),
    jsEventListeners: Number.isInteger(dom?.jsEventListeners)
      ? dom.jsEventListeners
      : _pr88MetricValue(metrics, "JSEventListeners")
  };
}

async function _pr88CharacterizationStatus(message) {
  if (
    message?.text != null ||
    message?.conversationId != null ||
    message?.browserAuthorityLeaseId != null
  ) {
    throw new Error("PR8_8_CHARACTERIZATION_STATUS_FLAG_CONFLICT");
  }
  const runtimeTabId = await storedRuntimeTabId();
  return {
    probeContext: "browser_authority_characterization_support",
    characterizationSupported: true,
    resourceSamplingSupported: true,
    runtimeTabReleaseSupported: true,
    runtimeTabId,
    leaseIdPresent: (await _pr88StoredLeaseId()) !== null,
    readOnly: true
  };
}

async function _pr88SampleRuntimeTabResources(message) {
  if (
    message?.text != null ||
    message?.conversationId != null ||
    message?.browserAuthorityLeaseId != null
  ) {
    throw new Error("PR8_8_RESOURCE_SAMPLE_FLAG_CONFLICT");
  }

  const requested = Number(message?.sampleMs);
  const sampleMs = Number.isFinite(requested)
    ? Math.max(
        PR88_RESOURCE_SAMPLE_MIN_MS,
        Math.min(PR88_RESOURCE_SAMPLE_MAX_MS, Math.round(requested))
      )
    : 5000;
  const runtimeTabId = await storedRuntimeTabId();
  if (!Number.isInteger(runtimeTabId)) {
    throw new Error("PR8_8_RESOURCE_SAMPLE_RUNTIME_TAB_REQUIRED");
  }

  const tabBefore = await chrome.tabs.get(runtimeTabId);
  if (!isChatGPTUrl(tabBefore?.url || "")) {
    throw new Error("PR8_8_RESOURCE_SAMPLE_RUNTIME_TAB_NOT_CHATGPT");
  }

  const debuggee = { tabId: runtimeTabId };
  const activatedTabIds = new Set();
  const onActivated = (activeInfo) => {
    if (Number.isInteger(activeInfo?.tabId)) {
      activatedTabIds.add(activeInfo.tabId);
    }
  };

  let attached = false;
  const startedAt = performance.now();
  chrome.tabs.onActivated.addListener(onActivated);

  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Performance.enable");
    const start = await _pr88PerformanceSnapshot(debuggee);
    await sleep(sampleMs);
    const end = await _pr88PerformanceSnapshot(debuggee);
    const tabAfter = await chrome.tabs.get(runtimeTabId);
    const tabActiveAfter = Boolean(tabAfter?.active);
    const observedSampleMs = elapsedMs(startedAt);
    const taskDelta = (
      start.taskDurationS !== null &&
      end.taskDurationS !== null &&
      end.taskDurationS >= start.taskDurationS
    )
      ? end.taskDurationS - start.taskDurationS
      : null;
    const taskFraction = taskDelta !== null && observedSampleMs > 0
      ? Math.max(0, taskDelta / (observedSampleMs / 1000))
      : null;

    return {
      probeContext: "browser_authority_runtime_tab_idle_resources",
      readOnly: true,
      runtimeTabId,
      requestedSampleMs: sampleMs,
      observedSampleMs,
      taskDurationStartS: start.taskDurationS,
      taskDurationEndS: end.taskDurationS,
      taskDurationDeltaS: taskDelta,
      taskTimeFraction: taskFraction,
      jsHeapUsedStartBytes: start.jsHeapUsedBytes,
      jsHeapUsedEndBytes: end.jsHeapUsedBytes,
      jsHeapUsedMaxBytes: (
        start.jsHeapUsedBytes !== null && end.jsHeapUsedBytes !== null
      )
        ? Math.max(start.jsHeapUsedBytes, end.jsHeapUsedBytes)
        : (start.jsHeapUsedBytes ?? end.jsHeapUsedBytes),
      jsHeapTotalStartBytes: start.jsHeapTotalBytes,
      jsHeapTotalEndBytes: end.jsHeapTotalBytes,
      documentsStart: Number.isInteger(start.documents) ? start.documents : null,
      documentsEnd: Number.isInteger(end.documents) ? end.documents : null,
      nodesStart: Number.isInteger(start.nodes) ? start.nodes : null,
      nodesEnd: Number.isInteger(end.nodes) ? end.nodes : null,
      jsEventListenersStart: Number.isInteger(start.jsEventListeners)
        ? start.jsEventListeners
        : null,
      jsEventListenersEnd: Number.isInteger(end.jsEventListeners)
        ? end.jsEventListeners
        : null,
      tabWasActive: Boolean(tabBefore?.active),
      tabActiveAfter,
      tabActivatedDuringSample: activatedTabIds.has(runtimeTabId),
      foregroundActivationObserved: Boolean(
        tabBefore?.active ||
        tabActiveAfter === true ||
        activatedTabIds.has(runtimeTabId)
      )
    };
  } finally {
    if (attached) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch {
        // Runtime tab may have disappeared during diagnostics.
      }
    }
    chrome.tabs.onActivated.removeListener(onActivated);
  }
}

executeNativeTurn = async function _executeNativeTurnWithBrowserAuthorityLease(message) {
  if (message?.characterizeBrowserAuthorityStatus === true) {
    return _pr88CharacterizationStatus(message);
  }
  if (message?.characterizeBrowserAuthorityResources === true) {
    const result = await _pr88SampleRuntimeTabResources(message);
    let debuggerAttachedAfter = null;
    try {
      const targets = await chrome.debugger.getTargets();
      debuggerAttachedAfter = Boolean(
        targets.find((target) => target.tabId === result.runtimeTabId)?.attached
      );
    } catch {
      debuggerAttachedAfter = null;
    }
    return {
      ...result,
      debuggerAttachedAfter
    };
  }

  const leaseId = _pr88LeaseId(message?.browserAuthorityLeaseId);
  if (leaseId !== null) {
    await _pr88StoreLeaseId(leaseId);
  }

  const result = await _pr88PriorExecuteNativeTurn(message);
  return {
    ...result,
    browserAuthorityLeaseId: leaseId
  };
};

async function _pr88ReleaseRuntimeTab(message) {
  const requestLeaseId = _pr88LeaseId(message?.browserAuthorityLeaseId);
  if (requestLeaseId === null) {
    throw new Error("BROWSER_NATIVE_AUTHORITY_LEASE_REQUIRED");
  }

  const storedLeaseId = await _pr88StoredLeaseId();
  if (storedLeaseId !== requestLeaseId) {
    throw new Error("BROWSER_NATIVE_AUTHORITY_LEASE_CHANGED");
  }

  const expectedTabId = Number.isInteger(message?.expectedRuntimeTabId)
    ? message.expectedRuntimeTabId
    : null;
  const storedTabId = await storedRuntimeTabId();

  if (storedTabId == null) {
    await _pr88ClearLeaseIdIfMatches(requestLeaseId);
    return {
      released: false,
      alreadyAbsent: true,
      runtimeTabId: null,
      browserAuthorityLeaseId: requestLeaseId
    };
  }

  if (expectedTabId !== null && storedTabId !== expectedTabId) {
    throw new Error("BROWSER_NATIVE_RUNTIME_TAB_CHANGED");
  }

  let tab;
  try {
    tab = await chrome.tabs.get(storedTabId);
  } catch {
    await _pr824a3ClearStoredRuntimeTabIdIfMatches(storedTabId);
    await _pr88ClearLeaseIdIfMatches(requestLeaseId);
    return {
      released: false,
      alreadyAbsent: true,
      runtimeTabId: null,
      browserAuthorityLeaseId: requestLeaseId
    };
  }

  if (!isChatGPTUrl(tab?.url || "")) {
    throw new Error("BROWSER_NATIVE_RUNTIME_TAB_NOT_CHATGPT");
  }

  const finalLeaseId = await _pr88StoredLeaseId();
  const finalTabId = await storedRuntimeTabId();
  if (finalLeaseId !== requestLeaseId) {
    throw new Error("BROWSER_NATIVE_AUTHORITY_LEASE_CHANGED");
  }
  if (finalTabId !== storedTabId) {
    throw new Error("BROWSER_NATIVE_RUNTIME_TAB_CHANGED");
  }

  await chrome.tabs.remove(storedTabId);
  await _pr824a3ClearStoredRuntimeTabIdIfMatches(storedTabId);
  await _pr88ClearLeaseIdIfMatches(requestLeaseId);

  return {
    released: true,
    alreadyAbsent: false,
    runtimeTabId: storedTabId,
    browserAuthorityLeaseId: requestLeaseId
  };
}

/* END legacy source: service_worker_runtime_tab_reconciliation.js */

const PR87_TEMPORARY_PROBE_DEFAULT_TIMEOUT_MS = 30_000;
const PR87_TEMPORARY_PROBE_MAX_TIMEOUT_MS = 120_000;
const PR87_TEMPORARY_SELECTION_TIMEOUT_MS = 5_000;
const _pr87OriginalExecuteNativeTurn = executeNativeTurn;

function _pr87ClampProbeTimeoutMs(value) {
  if (!Number.isFinite(value)) return PR87_TEMPORARY_PROBE_DEFAULT_TIMEOUT_MS;
  return Math.max(10_000, Math.min(Number(value), PR87_TEMPORARY_PROBE_MAX_TIMEOUT_MS));
}

function _pr87TemporaryControlSnapshotExpression() {
  return `(() => {
    const normalize = (value) => typeof value === 'string'
      ? value.trim().toLowerCase().replace(/\\s+/g, ' ')
      : '';
    const matchesTemporary = (value) => {
      const text = normalize(value);
      return text.includes('temporary') || text.includes('временн');
    };
    const explicitTrueStates = new Set(['on', 'checked', 'active', 'selected']);
    const explicitFalseStates = new Set(['off', 'unchecked', 'inactive', 'unselected']);
    const candidates = [];

    for (const element of Array.from(document.querySelectorAll('button,[role="button"]'))) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') {
        continue;
      }

      const fields = {
        text: element.innerText || element.textContent || '',
        aria_label: element.getAttribute('aria-label') || '',
        title: element.getAttribute('title') || '',
        data_testid: element.getAttribute('data-testid') || ''
      };
      const matchSignals = Object.entries(fields)
        .filter(([, value]) => matchesTemporary(value))
        .map(([name]) => name);
      if (!matchSignals.length) continue;

      const proofSignals = [];
      const falseSignals = [];
      const ariaPressed = normalize(element.getAttribute('aria-pressed'));
      const ariaChecked = normalize(element.getAttribute('aria-checked'));
      const ariaCurrent = normalize(element.getAttribute('aria-current'));
      const dataState = normalize(element.getAttribute('data-state'));
      const dataSelected = normalize(element.getAttribute('data-selected'));

      if (ariaPressed === 'true') proofSignals.push('aria-pressed:true');
      else if (ariaPressed === 'false') falseSignals.push('aria-pressed:false');
      if (ariaChecked === 'true') proofSignals.push('aria-checked:true');
      else if (ariaChecked === 'false') falseSignals.push('aria-checked:false');
      if (ariaCurrent === 'true') proofSignals.push('aria-current:true');
      if (explicitTrueStates.has(dataState)) proofSignals.push('data-state:' + dataState);
      else if (explicitFalseStates.has(dataState)) falseSignals.push('data-state:' + dataState);
      if (dataSelected === 'true') proofSignals.push('data-selected:true');
      else if (dataSelected === 'false') falseSignals.push('data-selected:false');

      const selected = proofSignals.length
        ? true
        : (falseSignals.length ? false : null);
      candidates.push({
        matchSignals,
        proofSignals,
        selected,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }

    const primary = candidates.length === 1 ? candidates[0] : null;
    return {
      candidateCount: candidates.length,
      controlFound: candidates.length > 0,
      ambiguous: candidates.length > 1,
      selected: primary ? primary.selected : null,
      matchSignals: primary ? primary.matchSignals : [],
      proofSignals: primary ? primary.proofSignals : [],
      point: primary ? { x: primary.x, y: primary.y } : null
    };
  })()`;
}

async function _pr87RawSendCommand(debuggee, method, params = undefined) {
  return chrome.debugger.sendCommand(debuggee, method, params);
}

async function _pr87TemporaryControlSnapshot(debuggee) {
  const result = await _pr87RawSendCommand(debuggee, "Runtime.evaluate", {
    expression: _pr87TemporaryControlSnapshotExpression(),
    returnByValue: true,
    awaitPromise: true
  });
  const value = result?.result?.value;
  return value && typeof value === "object"
    ? value
    : {
        candidateCount: 0,
        controlFound: false,
        ambiguous: false,
        selected: null,
        matchSignals: [],
        proofSignals: [],
        point: null
      };
}

async function _pr87ClickPoint(debuggee, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("TEMPORARY_CHAT_CONTROL_POINT_UNAVAILABLE");
  }
  await _pr87RawSendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y
  });
  await _pr87RawSendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  await _pr87RawSendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1
  });
}

async function _pr87WaitForSelectedTemporaryControl(debuggee, timeoutMs) {
  const startedAt = performance.now();
  let last = await _pr87TemporaryControlSnapshot(debuggee);
  while (Math.round(performance.now() - startedAt) < timeoutMs) {
    if (last?.selected === true) return last;
    await sleep(100);
    last = await _pr87TemporaryControlSnapshot(debuggee);
  }
  return last;
}

async function _pr87ExecuteTemporaryModeProbe(message) {
  const timeoutMs = _pr87ClampProbeTimeoutMs(message?.timeoutMs);
  const startedAt = performance.now();
  let tabId = null;
  let debuggee = null;
  let attached = false;
  let debuggerListener = null;
  let activationListener = null;
  let conversationWriteObserved = false;
  let tabWasActive = false;
  let tabActiveAfter = null;
  let tabActivatedDuringProbe = false;
  let probeTabClosed = false;
  let result = null;

  const activatedTabIds = new Set();
  activationListener = (activeInfo) => {
    if (Number.isInteger(activeInfo?.tabId)) activatedTabIds.add(activeInfo.tabId);
  };
  chrome.tabs.onActivated.addListener(activationListener);

  try {
    const tab = await chrome.tabs.create({ url: `${CHATGPT_ORIGIN}/`, active: false });
    if (!Number.isInteger(tab?.id)) throw new Error("TEMPORARY_CHAT_PROBE_TAB_CREATE_FAILED");
    tabId = tab.id;
    tabWasActive = Boolean(tab.active);
    await waitForTabComplete(tabId, Math.min(timeoutMs, 45_000));

    debuggee = { tabId };
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await _pr87RawSendCommand(debuggee, "Network.enable");
    await _pr87RawSendCommand(debuggee, "Runtime.enable");
    await waitForComposerReady(debuggee, Math.min(timeoutMs, DEFAULT_READY_TIMEOUT_MS));

    debuggerListener = (source, method, params) => {
      if (source?.tabId !== tabId || method !== "Network.requestWillBeSent") return;
      const request = params?.request;
      if (isConversationWrite(request?.url || "", request?.method || "")) {
        conversationWriteObserved = true;
      }
    };
    chrome.debugger.onEvent.addListener(debuggerListener);

    const before = await _pr87TemporaryControlSnapshot(debuggee);
    let after = before;
    let selectionAction = "none";
    let reason = "TEMPORARY_CHAT_SELECTION_NOT_PROVEN";

    if (!before.controlFound) {
      reason = "TEMPORARY_CHAT_CONTROL_NOT_FOUND";
    } else if (before.ambiguous) {
      reason = "TEMPORARY_CHAT_CONTROL_AMBIGUOUS";
    } else if (before.selected === true) {
      selectionAction = "already_selected";
      reason = "TEMPORARY_CHAT_SELECTED_STATE_OBSERVED";
    } else {
      selectionAction = "cdp_control_click";
      await _pr87ClickPoint(debuggee, before.point);
      after = await _pr87WaitForSelectedTemporaryControl(
        debuggee,
        Math.min(PR87_TEMPORARY_SELECTION_TIMEOUT_MS, timeoutMs)
      );
      reason = after?.selected === true
        ? "TEMPORARY_CHAT_SELECTION_PROVEN"
        : "TEMPORARY_CHAT_SELECTION_NOT_PROVEN";
    }

    await sleep(250);
    if (conversationWriteObserved) {
      throw new Error("TEMPORARY_CHAT_PROBE_UNEXPECTED_CONVERSATION_WRITE");
    }

    try {
      const finalTab = await chrome.tabs.get(tabId);
      tabActiveAfter = Boolean(finalTab?.active);
    } catch {
      tabActiveAfter = null;
    }
    tabActivatedDuringProbe = activatedTabIds.has(tabId);

    result = {
      probeContext: "isolated_new_chat",
      controlFound: Boolean(before.controlFound),
      candidateCount: Number.isInteger(before.candidateCount) ? before.candidateCount : 0,
      selectedBefore: typeof before.selected === "boolean" ? before.selected : null,
      selectedAfter: typeof after?.selected === "boolean" ? after.selected : null,
      modeSelectionProven: after?.selected === true,
      selectionAction,
      reason,
      matchSignals: Array.isArray(after?.matchSignals) ? after.matchSignals : [],
      selectionProofSignals: Array.isArray(after?.proofSignals) ? after.proofSignals : [],
      conversationWriteObserved,
      tabWasActive,
      tabActiveAfter,
      tabActivatedDuringProbe,
      foregroundActivationObserved: Boolean(
        tabWasActive || tabActiveAfter === true || tabActivatedDuringProbe
      ),
      elapsedMs: Math.round(performance.now() - startedAt)
    };
  } finally {
    if (debuggerListener) chrome.debugger.onEvent.removeListener(debuggerListener);
    if (attached && debuggee) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch {
        // The isolated probe tab may already have disappeared.
      }
    }
    if (activationListener) chrome.tabs.onActivated.removeListener(activationListener);
    if (Number.isInteger(tabId)) {
      try {
        await chrome.tabs.remove(tabId);
        probeTabClosed = true;
      } catch {
        probeTabClosed = false;
      }
    }
  }

  if (!result) throw new Error("TEMPORARY_CHAT_PROBE_NO_RESULT");
  return {
    ...result,
    probeTabClosed,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
}

executeNativeTurn = async function _executeNativeTurnWithTemporaryModeProbe(message) {
  if (message?.probeTemporaryMode !== true) {
    return _pr87OriginalExecuteNativeTurn(message);
  }
  if (message?.conversationId != null) {
    throw new Error("TEMPORARY_CHAT_PROBE_REQUIRES_NEW_CHAT");
  }
  if (message?.text != null) {
    throw new Error("TEMPORARY_CHAT_PROBE_MUST_NOT_INCLUDE_TEXT");
  }
  return _pr87ExecuteTemporaryModeProbe(message);
};

/* END legacy source: service_worker_temporary_chat.js */

// PR8.7 live probe repair: current ChatGPT exposed the Temporary control only
// through aria-label, without aria-pressed/data-state selected attributes.
// Treat accessibility action semantics as explicit state evidence when the
// label unambiguously describes the action that would change the current mode.
// Raw aria-label text still never leaves the browser context.

_pr87TemporaryControlSnapshotExpression = function _pr87TemporaryControlSnapshotExpressionWithAriaActionState() {
  return `(() => {
    const normalize = (value) => typeof value === 'string'
      ? value.trim().toLowerCase().replace(/\\s+/g, ' ')
      : '';
    const matchesTemporary = (value) => {
      const text = normalize(value);
      return text.includes('temporary') || text.includes('временн');
    };
    const explicitTrueStates = new Set(['on', 'checked', 'active', 'selected']);
    const explicitFalseStates = new Set(['off', 'unchecked', 'inactive', 'unselected']);

    const classifyAriaLabelActionState = (value) => {
      const text = normalize(value);
      if (!matchesTemporary(text)) return { selected: null, signal: null };

      // Accessibility labels commonly describe the action that activation will
      // perform. If the available action is to turn Temporary Chat OFF, then
      // Temporary is currently selected. Conversely, a turn-ON action means
      // the mode is currently not selected.
      const selectedActionPatterns = [
        ['turn off', 'aria-label:turn-off-action'],
        ['switch off', 'aria-label:switch-off-action'],
        ['disable', 'aria-label:disable-action'],
        ['deactivate', 'aria-label:deactivate-action'],
        ['leave temporary', 'aria-label:leave-temporary-action'],
        ['exit temporary', 'aria-label:exit-temporary-action'],
        ['выключ', 'aria-label:ru-turn-off-action'],
        ['отключ', 'aria-label:ru-disable-action']
      ];
      const unselectedActionPatterns = [
        ['turn on', 'aria-label:turn-on-action'],
        ['switch on', 'aria-label:switch-on-action'],
        ['enable', 'aria-label:enable-action'],
        ['activate', 'aria-label:activate-action'],
        ['start temporary', 'aria-label:start-temporary-action'],
        ['включ', 'aria-label:ru-turn-on-action']
      ];

      for (const [pattern, signal] of selectedActionPatterns) {
        if (text.includes(pattern)) return { selected: true, signal };
      }
      for (const [pattern, signal] of unselectedActionPatterns) {
        if (text.includes(pattern)) return { selected: false, signal };
      }
      return { selected: null, signal: 'aria-label:temporary-neutral' };
    };

    const candidates = [];
    for (const element of Array.from(document.querySelectorAll('button,[role="button"]'))) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') {
        continue;
      }

      const fields = {
        text: element.innerText || element.textContent || '',
        aria_label: element.getAttribute('aria-label') || '',
        title: element.getAttribute('title') || '',
        data_testid: element.getAttribute('data-testid') || ''
      };
      const matchSignals = Object.entries(fields)
        .filter(([, value]) => matchesTemporary(value))
        .map(([name]) => name);
      if (!matchSignals.length) continue;

      const proofSignals = [];
      const falseSignals = [];
      const stateSignals = [];
      const ariaPressed = normalize(element.getAttribute('aria-pressed'));
      const ariaChecked = normalize(element.getAttribute('aria-checked'));
      const ariaCurrent = normalize(element.getAttribute('aria-current'));
      const dataState = normalize(element.getAttribute('data-state'));
      const dataSelected = normalize(element.getAttribute('data-selected'));

      if (ariaPressed === 'true') proofSignals.push('aria-pressed:true');
      else if (ariaPressed === 'false') falseSignals.push('aria-pressed:false');
      if (ariaChecked === 'true') proofSignals.push('aria-checked:true');
      else if (ariaChecked === 'false') falseSignals.push('aria-checked:false');
      if (ariaCurrent === 'true') proofSignals.push('aria-current:true');
      if (explicitTrueStates.has(dataState)) proofSignals.push('data-state:' + dataState);
      else if (explicitFalseStates.has(dataState)) falseSignals.push('data-state:' + dataState);
      if (dataSelected === 'true') proofSignals.push('data-selected:true');
      else if (dataSelected === 'false') falseSignals.push('data-selected:false');

      const ariaActionState = classifyAriaLabelActionState(fields.aria_label);
      if (ariaActionState.signal) stateSignals.push(ariaActionState.signal);
      if (ariaActionState.selected === true) proofSignals.push(ariaActionState.signal);
      else if (ariaActionState.selected === false) falseSignals.push(ariaActionState.signal);

      const selected = proofSignals.length
        ? true
        : (falseSignals.length ? false : null);
      candidates.push({
        matchSignals,
        proofSignals,
        stateSignals,
        selected,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }

    const primary = candidates.length === 1 ? candidates[0] : null;
    return {
      candidateCount: candidates.length,
      controlFound: candidates.length > 0,
      ambiguous: candidates.length > 1,
      selected: primary ? primary.selected : null,
      matchSignals: primary ? primary.matchSignals : [],
      proofSignals: primary ? primary.proofSignals : [],
      stateSignals: primary ? primary.stateSignals : [],
      point: primary ? { x: primary.x, y: primary.y } : null
    };
  })()`;
};

// Add the newly observed safe structural state signal to probe results without
// changing normal production turn behavior.
const _pr87PriorExecuteNativeTurnStateSemantics = executeNativeTurn;
executeNativeTurn = async function _executeNativeTurnWithTemporaryStateSignalResult(message) {
  const result = await _pr87PriorExecuteNativeTurnStateSemantics(message);
  if (message?.probeTemporaryMode !== true || !result || typeof result !== "object") {
    return result;
  }

  // Re-observe only the already-open probe flow through the existing result.
  // The underlying probe closes its isolated tab before returning, so no raw
  // label or additional page data is exported here. proofSignals already carry
  // the action-semantic evidence when it proves selection.
  return {
    ...result,
    temporaryStateSemantics: "aria_label_action_v1"
  };
};

/* END legacy source: service_worker_temporary_chat_state_semantics.js */

// PR8.7 live characterization #2:
// DOM-selected attributes and aria-label action semantics did not expose the
// current Temporary Chat selected state. Add an Accessibility Tree observation
// layer. Only bounded structural roles/state properties leave the browser.
// Accessible names and raw AX nodes remain browser-local.

const _pr87AxOriginalTemporaryControlSnapshot = _pr87TemporaryControlSnapshot;
let _pr87AxCaptureSnapshots = null;

function _pr87AxNormalize(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase();
  return value ?? null;
}

function _pr87AxStateValue(node, propertyName) {
  const properties = Array.isArray(node?.properties) ? node.properties : [];
  const property = properties.find((item) => item?.name === propertyName);
  return _pr87AxNormalize(property?.value?.value);
}

function _pr87AxBooleanState(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function _pr87AxSafeStateSignal(name, value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return `${name}:${value ? "true" : "false"}`;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 32) return null;
  if (!/^[a-z0-9_-]+$/.test(normalized)) return null;
  return `${name}:${normalized}`;
}

async function _pr87AxTemporarySnapshot(debuggee) {
  try {
    await _pr87RawSendCommand(debuggee, "Accessibility.enable");
    const tree = await _pr87RawSendCommand(debuggee, "Accessibility.getFullAXTree");
    const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
    const actionableRoles = new Set([
      "button",
      "switch",
      "checkbox",
      "menuitemcheckbox",
      "menuitemradio",
      "radio",
      "tab"
    ]);
    const matchesTemporary = (value) => {
      if (typeof value !== "string") return false;
      const text = value.trim().toLowerCase().replace(/\s+/g, " ");
      return text.includes("temporary") || text.includes("временн");
    };

    const candidates = nodes.filter((node) => {
      if (node?.ignored === true) return false;
      return matchesTemporary(node?.name?.value);
    });
    const actionable = candidates.filter((node) => {
      const role = typeof node?.role?.value === "string"
        ? node.role.value.trim().toLowerCase()
        : "";
      return actionableRoles.has(role);
    });

    const roles = Array.from(new Set(
      candidates
        .map((node) => typeof node?.role?.value === "string"
          ? node.role.value.trim().toLowerCase()
          : "")
        .filter((value) => value && /^[a-z0-9_-]+$/.test(value))
    )).sort();

    const stateSignals = [];
    let selectionState = null;
    let selectionProofSignals = [];

    if (actionable.length === 1) {
      const node = actionable[0];
      const explicitSelectionStates = [];
      for (const propertyName of ["pressed", "checked", "selected"]) {
        const rawValue = _pr87AxStateValue(node, propertyName);
        const signal = _pr87AxSafeStateSignal(propertyName, rawValue);
        if (signal) stateSignals.push(signal);
        const booleanValue = _pr87AxBooleanState(rawValue);
        if (booleanValue !== null) {
          explicitSelectionStates.push({ propertyName, value: booleanValue });
        }
      }

      for (const propertyName of ["expanded", "haspopup", "disabled", "focused"]) {
        const signal = _pr87AxSafeStateSignal(
          propertyName,
          _pr87AxStateValue(node, propertyName)
        );
        if (signal) stateSignals.push(signal);
      }

      const trueStates = explicitSelectionStates.filter((item) => item.value === true);
      const falseStates = explicitSelectionStates.filter((item) => item.value === false);
      if (trueStates.length > 0 && falseStates.length === 0) {
        selectionState = true;
        selectionProofSignals = trueStates.map(
          (item) => `ax:${item.propertyName}:true`
        );
      } else if (falseStates.length > 0 && trueStates.length === 0) {
        selectionState = false;
      } else if (trueStates.length > 0 && falseStates.length > 0) {
        stateSignals.push("selection-source-conflict");
      }
    }

    return {
      candidateCount: candidates.length,
      actionableCandidateCount: actionable.length,
      roles,
      stateSignals: Array.from(new Set(stateSignals)).sort(),
      selectionState,
      selectionProofSignals
    };
  } catch {
    return {
      candidateCount: 0,
      actionableCandidateCount: 0,
      roles: [],
      stateSignals: ["ax-probe-failed"],
      selectionState: null,
      selectionProofSignals: []
    };
  }
}

_pr87TemporaryControlSnapshot = async function _pr87TemporaryControlSnapshotWithAX(debuggee) {
  const domSnapshot = await _pr87AxOriginalTemporaryControlSnapshot(debuggee);
  const axSnapshot = await _pr87AxTemporarySnapshot(debuggee);

  if (Array.isArray(_pr87AxCaptureSnapshots)) {
    _pr87AxCaptureSnapshots.push(axSnapshot);
  }

  const domSelected = typeof domSnapshot?.selected === "boolean"
    ? domSnapshot.selected
    : null;
  const axSelected = typeof axSnapshot?.selectionState === "boolean"
    ? axSnapshot.selectionState
    : null;

  let selected = domSelected;
  let proofSignals = Array.isArray(domSnapshot?.proofSignals)
    ? [...domSnapshot.proofSignals]
    : [];
  const stateSignals = Array.isArray(domSnapshot?.stateSignals)
    ? [...domSnapshot.stateSignals]
    : [];

  stateSignals.push(...axSnapshot.stateSignals.map((signal) => `ax:${signal}`));

  if (domSelected !== null && axSelected !== null && domSelected !== axSelected) {
    selected = null;
    proofSignals = [];
    stateSignals.push("selection-source-conflict:dom-vs-ax");
  } else if (axSelected !== null) {
    selected = axSelected;
    if (axSelected === true) {
      proofSignals.push(...axSnapshot.selectionProofSignals);
    }
  }

  return {
    ...domSnapshot,
    selected,
    proofSignals: Array.from(new Set(proofSignals)),
    stateSignals: Array.from(new Set(stateSignals)),
    axSnapshot
  };
};

const _pr87AxPriorExecuteNativeTurn = executeNativeTurn;
executeNativeTurn = async function _executeNativeTurnWithTemporaryAXEvidence(message) {
  if (message?.probeTemporaryMode !== true) {
    return _pr87AxPriorExecuteNativeTurn(message);
  }

  _pr87AxCaptureSnapshots = [];
  try {
    const result = await _pr87AxPriorExecuteNativeTurn(message);
    const snapshots = _pr87AxCaptureSnapshots;
    const before = snapshots.length > 0 ? snapshots[0] : null;
    const after = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    return {
      ...result,
      axBefore: before,
      axAfter: after,
      temporaryStateSemantics: "accessibility_tree_v1"
    };
  } finally {
    _pr87AxCaptureSnapshots = null;
  }
};

/* END legacy source: service_worker_temporary_chat_ax_semantics.js */

// PR8.7 live characterization #3:
// Current ChatGPT does not expose Temporary mode through DOM selected attrs or
// AX pressed/checked/selected state. Characterize the documented active-mode UI
// through bounded page-level semantic notice signals while keeping raw text,
// DOM, accessible names, and product payloads browser-local.
//
// PR8.7 live evidence later showed that a post-turn Temporary-looking document
// title can coexist with a conversation that is visible in ordinary history.
// Therefore title/URL/notice observations are UI mode markers only. They MUST
// NOT be promoted into selected-state proof or product Temporary semantics.

const _pr87SemanticPriorTemporaryControlSnapshot = _pr87TemporaryControlSnapshot;
const _pr87SemanticPriorClickPoint = _pr87ClickPoint;

function _pr87SemanticNoticeExpression() {
  return `(() => {
    const normalize = (value) => typeof value === 'string'
      ? value.trim().toLowerCase().replace(/\\s+/g, ' ')
      : '';

    const categoryPatterns = {
      temporary: ['temporary', 'временн'],
      history: ['history', 'истори'],
      memory: ['memory', 'memories', 'памят'],
      training: ['training', 'train our', 'improve our models', 'обуч', 'улучшать модели'],
      saved: ['not saved', "won't be saved", 'не сохраня', 'сохран'],
      privacy: ['privacy', 'private', 'приват', 'конфиденц']
    };

    const categoriesFor = (text) => {
      const normalized = normalize(text);
      if (!normalized) return [];
      return Object.entries(categoryPatterns)
        .filter(([, patterns]) => patterns.some((pattern) => normalized.includes(pattern)))
        .map(([name]) => name);
    };

    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    const isTooltipRelated = (element) => {
      if (!(element instanceof Element)) return false;
      return Boolean(element.closest('[role="tooltip"],[data-radix-popper-content-wrapper]'));
    };

    const isActionControl = (element) => {
      if (!(element instanceof Element)) return false;
      const role = normalize(element.getAttribute('role'));
      return element.matches('button,[role="button"],[role="switch"],[role="checkbox"]') ||
        ['button', 'switch', 'checkbox'].includes(role);
    };

    const semanticCandidates = [];
    const root = document.querySelector('main') || document.body;
    if (root) {
      for (const element of Array.from(root.querySelectorAll('div,p,section,aside,span,[role="status"],[role="alert"],[role="note"]'))) {
        if (!isVisible(element) || isTooltipRelated(element) || isActionControl(element)) continue;
        const text = element.innerText || element.textContent || '';
        if (typeof text !== 'string' || text.length < 4 || text.length > 1200) continue;
        const categories = categoriesFor(text);
        const categorySet = new Set(categories);
        const semanticPair = (
          categorySet.has('temporary') &&
          ['history', 'memory', 'training', 'saved', 'privacy'].some((name) => categorySet.has(name))
        ) || (
          categorySet.has('history') &&
          ['memory', 'training', 'saved'].some((name) => categorySet.has(name))
        );
        if (!semanticPair) continue;

        const childHasSameSignal = Array.from(element.children || []).some((child) => {
          if (!isVisible(child) || isTooltipRelated(child) || isActionControl(child)) return false;
          const childCategories = new Set(categoriesFor(child.innerText || child.textContent || ''));
          return (
            childCategories.has('temporary') &&
            ['history', 'memory', 'training', 'saved', 'privacy'].some((name) => childCategories.has(name))
          ) || (
            childCategories.has('history') &&
            ['memory', 'training', 'saved'].some((name) => childCategories.has(name))
          );
        });
        if (childHasSameSignal) continue;

        const role = normalize(element.getAttribute('role')) || element.tagName.toLowerCase();
        semanticCandidates.push({ categories: Array.from(categorySet).sort(), role });
      }
    }

    const categoryUnion = Array.from(new Set(
      semanticCandidates.flatMap((item) => item.categories)
    )).sort();
    const roles = Array.from(new Set(
      semanticCandidates
        .map((item) => item.role)
        .filter((value) => value && /^[a-z0-9_-]+$/.test(value))
    )).sort();

    const titleHasTemporary = (() => {
      const title = normalize(document.title);
      return title.includes('temporary') || title.includes('временн');
    })();
    const url = new URL(location.href);
    const urlHasTemporary = normalize(url.pathname + ' ' + url.search + ' ' + url.hash)
      .includes('temporary');

    const noticeObserved = semanticCandidates.length > 0;
    const modeMarkerObserved = Boolean(titleHasTemporary || urlHasTemporary || noticeObserved);
    const modeMarkerSignals = [];
    if (titleHasTemporary) modeMarkerSignals.push('semantic:document-title-temporary');
    if (urlHasTemporary) modeMarkerSignals.push('semantic:url-temporary');
    if (noticeObserved) modeMarkerSignals.push('semantic:product-notice');

    const stateSignals = [
      'semantic-candidate-count:' + semanticCandidates.length,
      ...categoryUnion.map((name) => 'semantic-category:' + name),
      ...roles.map((role) => 'semantic-role:' + role),
      'semantic-title-temporary:' + (titleHasTemporary ? 'true' : 'false'),
      'semantic-url-temporary:' + (urlHasTemporary ? 'true' : 'false')
    ];

    return {
      candidateCount: semanticCandidates.length,
      categories: categoryUnion,
      roles,
      titleHasTemporary,
      urlHasTemporary,
      noticeObserved,
      modeMarkerObserved,
      modeMarkerSignals,
      selectionProven: false,
      proofSignals: [],
      stateSignals
    };
  })()`;
}

async function _pr87SemanticNoticeSnapshot(debuggee) {
  try {
    const result = await _pr87RawSendCommand(debuggee, "Runtime.evaluate", {
      expression: _pr87SemanticNoticeExpression(),
      returnByValue: true,
      awaitPromise: true
    });
    const value = result?.result?.value;
    if (value && typeof value === "object") return value;
  } catch {
    // Fall through to a bounded failure marker.
  }
  return {
    candidateCount: 0,
    categories: [],
    roles: [],
    titleHasTemporary: false,
    urlHasTemporary: false,
    noticeObserved: false,
    modeMarkerObserved: false,
    modeMarkerSignals: [],
    selectionProven: false,
    proofSignals: [],
    stateSignals: ["semantic-probe-failed"]
  };
}

_pr87ClickPoint = async function _pr87ClickPointWithTooltipDismissal(debuggee, point) {
  await _pr87SemanticPriorClickPoint(debuggee, point);
  try {
    await _pr87RawSendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1,
      y: 1
    });
  } catch {
    // Pointer dismissal is characterization hygiene, not a write prerequisite.
  }
  await sleep(900);
};

_pr87TemporaryControlSnapshot = async function _pr87TemporaryControlSnapshotWithSemanticNotice(debuggee) {
  const base = await _pr87SemanticPriorTemporaryControlSnapshot(debuggee);
  const semantic = await _pr87SemanticNoticeSnapshot(debuggee);

  const semanticStateSignals = Array.isArray(semantic?.stateSignals)
    ? semantic.stateSignals.filter((value) => typeof value === "string")
    : [];
  if (base?.axSnapshot && Array.isArray(base.axSnapshot.stateSignals)) {
    base.axSnapshot.stateSignals = Array.from(new Set([
      ...base.axSnapshot.stateSignals,
      ...semanticStateSignals
    ])).sort();
  }

  const selected = typeof base?.selected === "boolean" ? base.selected : null;
  const proofSignals = Array.isArray(base?.proofSignals) ? [...base.proofSignals] : [];
  const stateSignals = Array.isArray(base?.stateSignals) ? [...base.stateSignals] : [];
  stateSignals.push(...semanticStateSignals);

  const modeMarkerSignals = Array.isArray(semantic?.modeMarkerSignals)
    ? semantic.modeMarkerSignals.filter((value) => typeof value === "string")
    : [];

  return {
    ...base,
    selected,
    proofSignals: Array.from(new Set(proofSignals)),
    stateSignals: Array.from(new Set(stateSignals)),
    modeMarkerObserved: semantic?.modeMarkerObserved === true,
    modeMarkerSignals: Array.from(new Set(modeMarkerSignals)),
    semanticSnapshot: semantic
  };
};

/* END legacy source: service_worker_temporary_chat_semantic_notice.js */

// PR8.7 live characterization #4:
// Pre-write DOM, aria-label, Accessibility Tree, and page-level semantic
// observations did not expose a durable selected-state proof for the current
// Temporary control. Add an explicitly diagnostic one-shot write experiment.
//
// This is NOT the production Temporary Chat path. It requires a dedicated
// request flag, uses a disposable new-chat tab, never reuses the production
// runtime tab, never retries an ambiguous write, and exports only bounded safe
// metadata. Raw prompt/assistant text, request headers, request bodies, response
// bodies, cookies, protection material, and raw DOM/AX data stay browser-local.

const PR87_TEMPORARY_TURN_PROBE_DEFAULT_TIMEOUT_MS = 150_000;
const PR87_TEMPORARY_TURN_PROBE_MAX_TIMEOUT_MS = 300_000;
const _pr87TurnProbePriorExecuteNativeTurn = executeNativeTurn;

function _pr87ClampTurnProbeTimeoutMs(value) {
  if (!Number.isFinite(value)) return PR87_TEMPORARY_TURN_PROBE_DEFAULT_TIMEOUT_MS;
  return Math.max(10_000, Math.min(Number(value), PR87_TEMPORARY_TURN_PROBE_MAX_TIMEOUT_MS));
}

function _pr87TurnProbeUrlKind(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== CHATGPT_ORIGIN) return "non_chatgpt";
    if (/^\/c\/[^/]+/.test(parsed.pathname)) return "conversation";
    if (parsed.pathname === "/" || parsed.pathname === "") return "new_chat_root";
    return "other_chatgpt";
  } catch {
    return "invalid";
  }
}

async function _pr87TurnProbeExecute(message) {
  const text = typeof message?.text === "string" ? message.text : "";
  if (!text.trim()) throw new Error("TEMPORARY_CHAT_TURN_PROBE_TEXT_REQUIRED");
  if (text.length > 20_000) throw new Error("TEMPORARY_CHAT_TURN_PROBE_TEXT_TOO_LARGE");

  const timeoutMs = _pr87ClampTurnProbeTimeoutMs(message?.timeoutMs);
  const startedAt = performance.now();
  let tabId = null;
  let debuggee = null;
  let attached = false;
  let eventListener = null;
  let activationListener = null;
  let tabWasActive = false;
  let tabActiveAfter = null;
  let tabActivatedDuringProbe = false;
  let probeTabClosed = false;
  let result = null;

  const activatedTabIds = new Set();
  activationListener = (activeInfo) => {
    if (Number.isInteger(activeInfo?.tabId)) activatedTabIds.add(activeInfo.tabId);
  };
  chrome.tabs.onActivated.addListener(activationListener);

  try {
    const tab = await chrome.tabs.create({ url: `${CHATGPT_ORIGIN}/`, active: false });
    if (!Number.isInteger(tab?.id)) {
      throw new Error("TEMPORARY_CHAT_TURN_PROBE_TAB_CREATE_FAILED");
    }
    tabId = tab.id;
    tabWasActive = Boolean(tab.active);
    await waitForTabComplete(tabId, Math.min(timeoutMs, 45_000));

    debuggee = { tabId };
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await _pr87RawSendCommand(debuggee, "Network.enable");
    await _pr87RawSendCommand(debuggee, "Runtime.enable");
    await _pr87RawSendCommand(debuggee, "Accessibility.enable");
    await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );

    const before = await _pr87TemporaryControlSnapshot(debuggee);
    if (!before?.controlFound) {
      throw new Error("TEMPORARY_CHAT_TURN_PROBE_CONTROL_NOT_FOUND");
    }
    if (before?.ambiguous || before?.candidateCount !== 1) {
      throw new Error("TEMPORARY_CHAT_TURN_PROBE_CONTROL_AMBIGUOUS");
    }
    if (!before?.point || !Number.isFinite(before.point.x) || !Number.isFinite(before.point.y)) {
      throw new Error("TEMPORARY_CHAT_TURN_PROBE_CONTROL_POINT_UNAVAILABLE");
    }

    let activationAction = "already_proven_selected";
    if (before.selected !== true) {
      activationAction = before.selected === false
        ? "click_known_unselected_control"
        : "click_unique_control_without_selected_state_proof";
      await _pr87ClickPoint(debuggee, before.point);
    }

    const afterActivation = await _pr87TemporaryControlSnapshot(debuggee);
    const selectionProvenBeforeWrite = afterActivation?.selected === true;
    const preWriteProofSignals = Array.isArray(afterActivation?.proofSignals)
      ? afterActivation.proofSignals.filter((value) => typeof value === "string")
      : [];
    const preWriteUiModeSignals = Array.isArray(afterActivation?.modeMarkerSignals)
      ? afterActivation.modeMarkerSignals.filter((value) => typeof value === "string")
      : [];

    let conversationRequestId = null;
    let conversationWriteCount = 0;
    let responseStatus = null;
    let responseMimeType = null;
    let resolveRequestSeen;
    let resolveCompleted;
    let rejectCompleted;
    const requestSeen = new Promise((resolve) => {
      resolveRequestSeen = resolve;
    });
    const completed = new Promise((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    eventListener = (source, method, params) => {
      if (source?.tabId !== tabId) return;
      const request = params?.request;
      if (method === "Network.requestWillBeSent" &&
          isConversationWrite(request?.url || "", request?.method || "")) {
        conversationWriteCount += 1;
        if (!conversationRequestId) {
          conversationRequestId = params.requestId;
          resolveRequestSeen(params.requestId);
        }
        return;
      }
      if (!conversationRequestId || params?.requestId !== conversationRequestId) return;
      if (method === "Network.responseReceived") {
        responseStatus = params?.response?.status ?? null;
        responseMimeType = params?.response?.mimeType ?? null;
        return;
      }
      if (method === "Network.loadingFailed") {
        rejectCompleted(new Error(
          `TEMPORARY_CHAT_TURN_PROBE_REQUEST_FAILED:${params?.errorText || "unknown"}`
        ));
        return;
      }
      if (method === "Network.loadingFinished") {
        resolveCompleted(conversationRequestId);
      }
    };
    chrome.debugger.onEvent.addListener(eventListener);

    await locateAndFocusComposer(debuggee);
    await clearComposer(debuggee);
    await _pr87RawSendCommand(debuggee, "Input.insertText", { text });

    const submitStartedAt = performance.now();
    const submit = await submitOfficialPageTurn(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_READY_TIMEOUT_MS)
    );

    await Promise.race([
      requestSeen,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`TEMPORARY_CHAT_TURN_PROBE_SUBMIT_NOT_OBSERVED:${submit.strategy}`)),
        Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_ACK_TIMEOUT_MS)
      ))
    ]);
    const submitAckMs = elapsedMs(submitStartedAt);

    const requestId = await Promise.race([
      completed,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("TEMPORARY_CHAT_TURN_PROBE_TIMEOUT")),
        remainingMs(startedAt, timeoutMs)
      ))
    ]);

    let safeMetadata = { conversationId: null, turnExchangeId: null };
    try {
      const response = await _pr87RawSendCommand(
        debuggee,
        "Network.getResponseBody",
        { requestId }
      );
      safeMetadata = extractSafeStreamMetadata(
        response?.body,
        Boolean(response?.base64Encoded)
      );
    } catch {
      // Safe identity metadata is optional characterization evidence.
    }

    await sleep(500);
    const completionReadyWaitMs = await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );

    const afterTurn = await _pr87TemporaryControlSnapshot(debuggee);
    const postTurnUiModeSignals = Array.isArray(afterTurn?.modeMarkerSignals)
      ? afterTurn.modeMarkerSignals.filter((value) => typeof value === "string")
      : [];
    const finalTab = await chrome.tabs.get(tabId);
    const urlConversationId = conversationIdFromUrl(finalTab.url || "");
    const resolvedConversationId = safeMetadata.conversationId || urlConversationId;

    if (!Number.isInteger(responseStatus) || responseStatus < 200 || responseStatus >= 300) {
      throw new Error(`TEMPORARY_CHAT_TURN_PROBE_HTTP_STATUS:${responseStatus}`);
    }
    if (conversationWriteCount !== 1) {
      throw new Error(`TEMPORARY_CHAT_TURN_PROBE_WRITE_COUNT:${conversationWriteCount}`);
    }

    try {
      tabActiveAfter = Boolean((await chrome.tabs.get(tabId))?.active);
    } catch {
      tabActiveAfter = null;
    }
    tabActivatedDuringProbe = activatedTabIds.has(tabId);

    result = {
      probeContext: "isolated_new_chat_temporary_turn",
      activationAction,
      selectionProvenBeforeWrite,
      selectedBefore: typeof before?.selected === "boolean" ? before.selected : null,
      selectedAfterActivation: typeof afterActivation?.selected === "boolean"
        ? afterActivation.selected
        : null,
      selectedAfterTurn: typeof afterTurn?.selected === "boolean" ? afterTurn.selected : null,
      preWriteProofSignals,
      postTurnProofSignals: Array.isArray(afterTurn?.proofSignals)
        ? afterTurn.proofSignals.filter((value) => typeof value === "string")
        : [],
      uiModeMarkerObservedBeforeWrite: afterActivation?.modeMarkerObserved === true,
      uiModeMarkerObservedAfterTurn: afterTurn?.modeMarkerObserved === true,
      preWriteUiModeSignals,
      postTurnUiModeSignals,
      conversationWriteCount,
      conversationId: typeof resolvedConversationId === "string" ? resolvedConversationId : null,
      turnExchangeId: typeof safeMetadata.turnExchangeId === "string"
        ? safeMetadata.turnExchangeId
        : null,
      responseStatus,
      responseMimeType: typeof responseMimeType === "string" ? responseMimeType : null,
      finalUrlKind: _pr87TurnProbeUrlKind(finalTab.url || ""),
      urlConversationIdPresent: typeof urlConversationId === "string" && urlConversationId.length > 0,
      submitStrategy: submit.strategy,
      submitAckMs,
      completionReadyWaitMs,
      tabWasActive,
      tabActiveAfter,
      tabActivatedDuringProbe,
      foregroundActivationObserved: Boolean(
        tabWasActive || tabActiveAfter === true || tabActivatedDuringProbe
      ),
      elapsedMs: elapsedMs(startedAt)
    };
  } finally {
    if (eventListener) chrome.debugger.onEvent.removeListener(eventListener);
    if (attached && debuggee) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch {
        // The disposable probe tab may already have disappeared.
      }
    }
    if (activationListener) chrome.tabs.onActivated.removeListener(activationListener);
    if (Number.isInteger(tabId)) {
      try {
        await chrome.tabs.remove(tabId);
        probeTabClosed = true;
      } catch {
        probeTabClosed = false;
      }
    }
  }

  if (!result) throw new Error("TEMPORARY_CHAT_TURN_PROBE_NO_RESULT");
  return {
    ...result,
    probeTabClosed,
    elapsedMs: elapsedMs(startedAt)
  };
}

executeNativeTurn = async function _executeNativeTurnWithTemporaryTurnCharacterization(message) {
  if (message?.characterizeTemporaryTurn !== true) {
    return _pr87TurnProbePriorExecuteNativeTurn(message);
  }
  if (message?.probeTemporaryMode === true) {
    throw new Error("TEMPORARY_CHAT_TURN_PROBE_FLAG_CONFLICT");
  }
  if (message?.conversationId != null) {
    throw new Error("TEMPORARY_CHAT_TURN_PROBE_REQUIRES_NEW_CHAT");
  }
  if (message?.acknowledgeDurableRisk !== true) {
    throw new Error("TEMPORARY_CHAT_TURN_PROBE_DURABLE_RISK_ACK_REQUIRED");
  }
  return _pr87TurnProbeExecute(message);
};

/* END legacy source: service_worker_temporary_chat_turn_probe.js */

// PR8.7 live characterization #5:
// A Temporary-candidate conversation can be briefly represented by an exact
// /c/<conversation_id> anchor while a fresh ChatGPT root page hydrates. A single
// early anchor observation is therefore NOT equivalent to durable user-history
// persistence. Observe the exact link across a bounded settling window and
// report transient vs stable presence without exporting titles, link text, raw
// DOM, or page payloads.
//
// Absence is evidence only after the history surface is semantically ready and
// a full settling window completes. If readiness is not proven, the result is
// explicitly INCONCLUSIVE rather than a negative history claim.

const _pr87HistoryProbePriorExecuteNativeTurn = executeNativeTurn;
const PR87_HISTORY_DEFAULT_TIMEOUT_MS = 30_000;
const PR87_HISTORY_MIN_SETTLE_MS = 8_000;
const PR87_HISTORY_MAX_SETTLE_MS = 15_000;
const PR87_HISTORY_SAMPLE_MS = 500;
const PR87_HISTORY_STABLE_SAMPLE_COUNT = 4;

function _pr87HistoryProbeExpression(conversationId) {
  const encodedId = JSON.stringify(conversationId);
  return `(() => {
    const targetId = ${encodedId};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    let conversationLinkCount = 0;
    let visibleConversationLinkCount = 0;
    let exactLinkPresent = false;
    let exactVisibleLinkPresent = false;
    for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
      let parsed;
      try {
        parsed = new URL(anchor.href, location.href);
      } catch {
        continue;
      }
      if (parsed.origin !== location.origin) continue;
      const match = parsed.pathname.match(/^\\/c\\/([^/]+)$/);
      if (!match) continue;
      conversationLinkCount += 1;
      if (isVisible(anchor)) visibleConversationLinkCount += 1;
      let id = match[1];
      try { id = decodeURIComponent(id); } catch {}
      if (id !== targetId) continue;
      exactLinkPresent = true;
      if (isVisible(anchor)) exactVisibleLinkPresent = true;
    }

    const mainPresent = Boolean(document.querySelector('main'));
    const navPresent = Boolean(document.querySelector('nav,aside'));
    const semanticHistoryContainerPresent = Boolean(document.querySelector([
      '[data-testid*="sidebar" i]',
      '[data-testid*="history" i]',
      '[id*="sidebar" i]',
      '[aria-label*="history" i]',
      '[aria-label*="истори" i]'
    ].join(',')));
    const documentComplete = document.readyState === 'complete';
    const hasEnumeratedHistoryLinks = conversationLinkCount > 0;
    const historySurfaceReady = Boolean(
      documentComplete &&
      mainPresent &&
      (navPresent || semanticHistoryContainerPresent || hasEnumeratedHistoryLinks)
    );
    const readinessSignals = [];
    if (documentComplete) readinessSignals.push('document-complete');
    if (mainPresent) readinessSignals.push('main-present');
    if (navPresent) readinessSignals.push('nav-or-aside-present');
    if (semanticHistoryContainerPresent) readinessSignals.push('semantic-history-container-present');
    if (hasEnumeratedHistoryLinks) readinessSignals.push('conversation-links-enumerated');

    return {
      exactLinkPresent,
      exactVisibleLinkPresent,
      conversationLinkCount,
      visibleConversationLinkCount,
      mainPresent,
      navPresent,
      semanticHistoryContainerPresent,
      documentComplete,
      historySurfaceReady,
      readinessSignals
    };
  })()`;
}

async function _pr87ProbeHistoryPresence(message) {
  const conversationId = typeof message?.conversationId === "string"
    ? message.conversationId.trim()
    : "";
  if (!conversationId || conversationId.includes("/") || conversationId.includes("?") || conversationId.includes("#")) {
    throw new Error("TEMPORARY_CHAT_HISTORY_PROBE_CONVERSATION_ID_REQUIRED");
  }

  const timeoutMs = Math.max(
    10_000,
    Math.min(60_000, Number(message?.timeoutMs) || PR87_HISTORY_DEFAULT_TIMEOUT_MS)
  );
  const settleWindowMs = Math.min(
    PR87_HISTORY_MAX_SETTLE_MS,
    Math.max(PR87_HISTORY_MIN_SETTLE_MS, timeoutMs - 5_000)
  );
  const startedAt = performance.now();
  let tabId = null;
  let debuggee = null;
  let attached = false;
  let activationListener = null;
  let tabWasActive = false;
  let tabActiveAfter = null;
  let tabActivatedDuringProbe = false;
  let probeTabClosed = false;
  let lastSnapshot = null;
  let historyReadyAtMs = null;
  let firstSeenMs = null;
  let lastSeenMs = null;
  let seenSampleCount = 0;
  let absentSampleCount = 0;
  let disappearedAfterSeen = false;
  let seenPreviously = false;
  const finalVisibleSamples = [];

  const activatedTabIds = new Set();
  activationListener = (activeInfo) => {
    if (Number.isInteger(activeInfo?.tabId)) activatedTabIds.add(activeInfo.tabId);
  };
  chrome.tabs.onActivated.addListener(activationListener);

  try {
    const tab = await chrome.tabs.create({ url: `${CHATGPT_ORIGIN}/`, active: false });
    if (!Number.isInteger(tab?.id)) throw new Error("TEMPORARY_CHAT_HISTORY_PROBE_TAB_CREATE_FAILED");
    tabId = tab.id;
    tabWasActive = Boolean(tab.active);
    await waitForTabComplete(tabId, Math.min(timeoutMs, 45_000));

    debuggee = { tabId };
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await _pr87RawSendCommand(debuggee, "Runtime.enable");

    const expression = _pr87HistoryProbeExpression(conversationId);
    while (elapsedMs(startedAt) < timeoutMs) {
      const evaluated = await _pr87RawSendCommand(debuggee, "Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      const value = evaluated?.result?.value;
      if (value && typeof value === "object") lastSnapshot = value;

      const nowMs = elapsedMs(startedAt);
      const historyReady = lastSnapshot?.historySurfaceReady === true;
      if (historyReady && historyReadyAtMs == null) historyReadyAtMs = nowMs;

      if (historyReady) {
        const visible = lastSnapshot?.exactVisibleLinkPresent === true;
        if (visible) {
          seenSampleCount += 1;
          if (firstSeenMs == null) firstSeenMs = nowMs;
          lastSeenMs = nowMs;
          seenPreviously = true;
        } else {
          absentSampleCount += 1;
          if (seenPreviously) disappearedAfterSeen = true;
        }
        finalVisibleSamples.push(visible);
        if (finalVisibleSamples.length > PR87_HISTORY_STABLE_SAMPLE_COUNT) {
          finalVisibleSamples.shift();
        }
      }

      if (
        historyReadyAtMs != null &&
        nowMs - historyReadyAtMs >= settleWindowMs &&
        finalVisibleSamples.length >= PR87_HISTORY_STABLE_SAMPLE_COUNT
      ) {
        break;
      }
      await sleep(PR87_HISTORY_SAMPLE_MS);
    }

    try {
      tabActiveAfter = Boolean((await chrome.tabs.get(tabId))?.active);
    } catch {
      tabActiveAfter = null;
    }
    tabActivatedDuringProbe = activatedTabIds.has(tabId);
  } finally {
    if (attached && debuggee) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
    if (activationListener) chrome.tabs.onActivated.removeListener(activationListener);
    if (Number.isInteger(tabId)) {
      try {
        await chrome.tabs.remove(tabId);
        probeTabClosed = true;
      } catch {
        probeTabClosed = false;
      }
    }
  }

  const snapshot = lastSnapshot && typeof lastSnapshot === "object" ? lastSnapshot : {};
  const observationWindowMs = elapsedMs(startedAt);
  const historySurfaceReady = snapshot.historySurfaceReady === true;
  const settleCompleted = Boolean(
    historyReadyAtMs != null &&
    observationWindowMs - historyReadyAtMs >= settleWindowMs &&
    finalVisibleSamples.length >= PR87_HISTORY_STABLE_SAMPLE_COUNT
  );
  const stableHistoryPresence = Boolean(
    settleCompleted &&
    finalVisibleSamples.every((value) => value === true)
  );
  const transientHistoryPresence = firstSeenMs != null && disappearedAfterSeen;
  const historyAbsenceProven = Boolean(
    historySurfaceReady &&
    settleCompleted &&
    firstSeenMs == null &&
    finalVisibleSamples.every((value) => value === false)
  );

  let historyEvidenceStatus = "INCONCLUSIVE";
  if (stableHistoryPresence) {
    historyEvidenceStatus = "STABLE_PRESENT";
  } else if (transientHistoryPresence && settleCompleted) {
    historyEvidenceStatus = "TRANSIENT_PRESENT";
  } else if (historyAbsenceProven) {
    historyEvidenceStatus = "STABLE_ABSENT";
  }

  return {
    probeContext: "fresh_root_history_settling",
    conversationId,
    historyLinkPresent: firstSeenMs != null,
    historyVisibleLinkPresent: firstSeenMs != null,
    finalHistoryLinkPresent: snapshot.exactLinkPresent === true,
    finalHistoryVisibleLinkPresent: snapshot.exactVisibleLinkPresent === true,
    stableHistoryPresence,
    transientHistoryPresence,
    historyAbsenceProven,
    historyEvidenceStatus,
    disappearedAfterSeen,
    firstSeenMs,
    lastSeenMs,
    seenSampleCount,
    absentSampleCount,
    settleWindowMs,
    settleCompleted,
    observationWindowMs,
    conversationLinkCount: Number.isInteger(snapshot.conversationLinkCount)
      ? snapshot.conversationLinkCount
      : 0,
    visibleConversationLinkCount: Number.isInteger(snapshot.visibleConversationLinkCount)
      ? snapshot.visibleConversationLinkCount
      : 0,
    historySurfaceReady,
    historyReadinessSignals: Array.isArray(snapshot.readinessSignals)
      ? snapshot.readinessSignals.filter((value) => typeof value === "string")
      : [],
    tabWasActive,
    tabActiveAfter,
    tabActivatedDuringProbe,
    foregroundActivationObserved: Boolean(
      tabWasActive || tabActiveAfter === true || tabActivatedDuringProbe
    ),
    probeTabClosed,
    elapsedMs: elapsedMs(startedAt)
  };
}

executeNativeTurn = async function _executeNativeTurnWithTemporaryHistoryCharacterization(message) {
  if (message?.probeTemporaryHistoryPresence !== true) {
    return _pr87HistoryProbePriorExecuteNativeTurn(message);
  }
  if (message?.probeTemporaryMode === true || message?.characterizeTemporaryTurn === true) {
    throw new Error("TEMPORARY_CHAT_HISTORY_PROBE_FLAG_CONFLICT");
  }
  return _pr87ProbeHistoryPresence(message);
};

/* END legacy source: service_worker_temporary_chat_history_probe.js */

// PR8.7 manual ground-truth characterization:
// Automated activation produced an ordinary durable chat and therefore cannot
// serve as Temporary evidence. This diagnostic intentionally DOES NOT click the
// Temporary control. The human operator must first enable Temporary Chat in the
// visible product UI and leave that fresh new-chat tab selected in Chrome.
//
// The probe then writes exactly one smoke turn through that already prepared
// page, captures bounded identity/finality metadata, verifies bounded visible
// turn evidence without exporting message text/DOM, detaches, and leaves the
// source tab open. It performs no canonical read and no history probe itself so
// later experiments can observe history BEFORE any direct-id readback.

const _pr87ManualPriorExecuteNativeTurn = executeNativeTurn;
const PR87_MANUAL_DEFAULT_TIMEOUT_MS = 150_000;
const PR87_MANUAL_MAX_TIMEOUT_MS = 300_000;

function _pr87ManualClampTimeoutMs(value) {
  if (!Number.isFinite(value)) return PR87_MANUAL_DEFAULT_TIMEOUT_MS;
  return Math.max(10_000, Math.min(Number(value), PR87_MANUAL_MAX_TIMEOUT_MS));
}

function _pr87ManualUrlEvidence(url) {
  try {
    const parsed = new URL(url);
    const normalized = `${parsed.pathname} ${parsed.search} ${parsed.hash}`.toLowerCase();
    const urlConversationId = conversationIdFromUrl(url || "");
    return {
      kind: _pr87TurnProbeUrlKind(url),
      temporaryMarker: normalized.includes("temporary"),
      temporaryQueryTrue: parsed.searchParams.get("temporary-chat") === "true",
      conversationIdPresent: typeof urlConversationId === "string" && urlConversationId.length > 0
    };
  } catch {
    return {
      kind: "invalid",
      temporaryMarker: false,
      temporaryQueryTrue: false,
      conversationIdPresent: false
    };
  }
}

function _pr87ManualTurnSurfaceExpression(userText, expectedAssistantText) {
  const encodedUserText = JSON.stringify(userText);
  const encodedExpectedAssistantText = JSON.stringify(expectedAssistantText || "");
  return `(() => {
    const expectedUser = ${encodedUserText};
    const expectedAssistant = ${encodedExpectedAssistantText};
    const normalize = (value) => typeof value === 'string'
      ? value.trim().replace(/\\s+/g, ' ')
      : '';
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const cleanedText = (element) => {
      if (!(element instanceof Element)) return '';
      const clone = element.cloneNode(true);
      for (const removable of Array.from(clone.querySelectorAll(
        'button,nav,[role="toolbar"],script,style,[aria-hidden="true"]'
      ))) {
        removable.remove();
      }
      return normalize(clone.innerText || clone.textContent || '');
    };

    const main = document.querySelector('main');
    if (!main) {
      return {
        surfaceReady: false,
        turnCount: 0,
        userMatchCount: 0,
        assistantCandidateCount: 0,
        assistantExpectedMatchCount: 0,
        userMessageVisible: false,
        assistantMessageVisible: false,
        assistantExactExpectedReplyVisible: false,
        orderedUserThenAssistant: false,
        selectorKind: 'none'
      };
    }

    let selectorKind = 'conversation-testid';
    let turns = Array.from(main.querySelectorAll('[data-testid^="conversation-turn-"]'));
    if (turns.length === 0) {
      selectorKind = 'article-fallback';
      turns = Array.from(main.querySelectorAll('article'));
    }
    turns = Array.from(new Set(turns)).filter((element) => {
      if (!isVisible(element)) return false;
      if (element.closest('form')) return false;
      return true;
    });

    const userNormalized = normalize(expectedUser);
    const assistantNormalized = normalize(expectedAssistant);
    const turnTexts = turns.map((element) => cleanedText(element));
    const userIndexes = [];
    for (let index = 0; index < turnTexts.length; index += 1) {
      const text = turnTexts[index];
      if (userNormalized && text.includes(userNormalized)) userIndexes.push(index);
    }

    const firstUserIndex = userIndexes.length > 0 ? userIndexes[0] : -1;
    const assistantCandidateIndexes = [];
    const assistantExpectedIndexes = [];
    if (firstUserIndex >= 0) {
      for (let index = firstUserIndex + 1; index < turnTexts.length; index += 1) {
        const text = turnTexts[index];
        if (text) assistantCandidateIndexes.push(index);
        if (assistantNormalized && text === assistantNormalized) {
          assistantExpectedIndexes.push(index);
        }
      }
    }

    const assistantMessageVisible = assistantCandidateIndexes.length > 0;
    const assistantExactExpectedReplyVisible = assistantExpectedIndexes.length > 0;
    return {
      surfaceReady: true,
      turnCount: turns.length,
      userMatchCount: userIndexes.length,
      assistantCandidateCount: assistantCandidateIndexes.length,
      assistantExpectedMatchCount: assistantExpectedIndexes.length,
      userMessageVisible: userIndexes.length > 0,
      assistantMessageVisible,
      assistantExactExpectedReplyVisible,
      orderedUserThenAssistant: firstUserIndex >= 0 && assistantMessageVisible,
      selectorKind
    };
  })()`;
}

async function _pr87ManualTurnSurfaceSnapshot(debuggee, userText, expectedAssistantText) {
  try {
    const result = await _pr87RawSendCommand(debuggee, "Runtime.evaluate", {
      expression: _pr87ManualTurnSurfaceExpression(userText, expectedAssistantText),
      returnByValue: true,
      awaitPromise: true
    });
    const value = result?.result?.value;
    if (value && typeof value === "object") return value;
  } catch {
    // Visible-turn evidence is diagnostic. Failure stays INCONCLUSIVE.
  }
  return {
    surfaceReady: false,
    turnCount: 0,
    userMatchCount: 0,
    assistantCandidateCount: 0,
    assistantExpectedMatchCount: 0,
    userMessageVisible: false,
    assistantMessageVisible: false,
    assistantExactExpectedReplyVisible: false,
    orderedUserThenAssistant: false,
    selectorKind: "unavailable"
  };
}

async function _pr87ManualPreparedTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const candidates = tabs.filter((tab) => {
    if (!Number.isInteger(tab?.id) || typeof tab?.url !== "string") return false;
    try {
      return new URL(tab.url).origin === CHATGPT_ORIGIN;
    } catch {
      return false;
    }
  });
  if (candidates.length !== 1) {
    throw new Error(`TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_TAB_COUNT:${candidates.length}`);
  }
  const tab = candidates[0];
  const parsed = new URL(tab.url);
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error("TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_REQUIRES_FRESH_NEW_CHAT");
  }
  if (parsed.searchParams.get("temporary-chat") !== "true") {
    throw new Error("TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_REQUIRES_TEMPORARY_URL");
  }
  return tab;
}

async function _pr87ManualGroundTruthTurn(message) {
  const text = typeof message?.text === "string" ? message.text : "";
  if (!text.trim()) throw new Error("TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_TEXT_REQUIRED");
  if (text.length > 20_000) throw new Error("TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_TEXT_TOO_LARGE");
  if (message?.manualTemporaryConfirmed !== true) {
    throw new Error("TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_CONFIRMATION_REQUIRED");
  }
  const expectedAssistantText = typeof message?.expectedAssistantText === "string"
    ? message.expectedAssistantText.trim()
    : "";
  if (expectedAssistantText.length > 20_000) {
    throw new Error("TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_EXPECTED_TEXT_TOO_LARGE");
  }

  const timeoutMs = _pr87ManualClampTimeoutMs(message?.timeoutMs);
  const startedAt = performance.now();
  const tab = await _pr87ManualPreparedTab();
  const tabId = tab.id;
  const initialUrlEvidence = _pr87ManualUrlEvidence(tab.url || "");
  const debuggee = { tabId };
  let attached = false;
  let eventListener = null;
  let conversationRequestId = null;
  let conversationWriteCount = 0;
  let responseStatus = null;
  let responseMimeType = null;

  let resolveRequestSeen;
  let resolveCompleted;
  let rejectCompleted;
  const requestSeen = new Promise((resolve) => { resolveRequestSeen = resolve; });
  const completed = new Promise((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await _pr87RawSendCommand(debuggee, "Network.enable");
    await _pr87RawSendCommand(debuggee, "Runtime.enable");
    await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );
    const beforeSurface = await _pr87ManualTurnSurfaceSnapshot(
      debuggee,
      text,
      expectedAssistantText
    );

    eventListener = (source, method, params) => {
      if (source?.tabId !== tabId) return;
      const request = params?.request;
      if (method === "Network.requestWillBeSent" &&
          isConversationWrite(request?.url || "", request?.method || "")) {
        conversationWriteCount += 1;
        if (!conversationRequestId) {
          conversationRequestId = params.requestId;
          resolveRequestSeen(params.requestId);
        }
        return;
      }
      if (!conversationRequestId || params?.requestId !== conversationRequestId) return;
      if (method === "Network.responseReceived") {
        responseStatus = params?.response?.status ?? null;
        responseMimeType = params?.response?.mimeType ?? null;
        return;
      }
      if (method === "Network.loadingFailed") {
        rejectCompleted(new Error(
          `TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_REQUEST_FAILED:${params?.errorText || "unknown"}`
        ));
        return;
      }
      if (method === "Network.loadingFinished") resolveCompleted(conversationRequestId);
    };
    chrome.debugger.onEvent.addListener(eventListener);

    await locateAndFocusComposer(debuggee);
    await clearComposer(debuggee);
    await _pr87RawSendCommand(debuggee, "Input.insertText", { text });

    const submitStartedAt = performance.now();
    const submit = await submitOfficialPageTurn(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_READY_TIMEOUT_MS)
    );

    await Promise.race([
      requestSeen,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_SUBMIT_NOT_OBSERVED:${submit.strategy}`)),
        Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_ACK_TIMEOUT_MS)
      ))
    ]);
    const submitAckMs = elapsedMs(submitStartedAt);

    const requestId = await Promise.race([
      completed,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_TIMEOUT")),
        remainingMs(startedAt, timeoutMs)
      ))
    ]);

    let safeMetadata = { conversationId: null, turnExchangeId: null };
    try {
      const response = await _pr87RawSendCommand(debuggee, "Network.getResponseBody", { requestId });
      safeMetadata = extractSafeStreamMetadata(response?.body, Boolean(response?.base64Encoded));
    } catch {
      // Identity metadata is optional; raw response data never leaves this context.
    }

    await sleep(500);
    const completionReadyWaitMs = await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );
    const afterSurface = await _pr87ManualTurnSurfaceSnapshot(
      debuggee,
      text,
      expectedAssistantText
    );
    const afterTurn = await _pr87TemporaryControlSnapshot(debuggee);
    const finalTab = await chrome.tabs.get(tabId);
    const finalUrlEvidence = _pr87ManualUrlEvidence(finalTab.url || "");
    const urlConversationId = conversationIdFromUrl(finalTab.url || "");
    const resolvedConversationId = safeMetadata.conversationId || urlConversationId;
    const sameSourceTab = finalTab.id === tabId;
    const turnCountGrowth = Number.isInteger(afterSurface?.turnCount) && Number.isInteger(beforeSurface?.turnCount)
      ? afterSurface.turnCount - beforeSurface.turnCount
      : null;
    const visibleTurnGroundTruthProven = Boolean(
      sameSourceTab &&
      initialUrlEvidence.temporaryQueryTrue === true &&
      finalUrlEvidence.temporaryQueryTrue === true &&
      afterSurface?.surfaceReady === true &&
      afterSurface?.userMessageVisible === true &&
      afterSurface?.assistantMessageVisible === true &&
      afterSurface?.orderedUserThenAssistant === true &&
      turnCountGrowth != null && turnCountGrowth >= 2
    );

    if (!Number.isInteger(responseStatus) || responseStatus < 200 || responseStatus >= 300) {
      throw new Error(`TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_HTTP_STATUS:${responseStatus}`);
    }
    if (conversationWriteCount !== 1) {
      throw new Error(`TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_WRITE_COUNT:${conversationWriteCount}`);
    }

    return {
      probeContext: "manual_temporary_ground_truth_turn",
      manualTemporaryConfirmed: true,
      sourceTabId: tabId,
      sourceTabLeftOpen: true,
      sameSourceTab,
      initialUrlKind: initialUrlEvidence.kind,
      initialUrlTemporaryMarker: initialUrlEvidence.temporaryMarker,
      initialUrlTemporaryQueryTrue: initialUrlEvidence.temporaryQueryTrue,
      initialUrlConversationIdPresent: initialUrlEvidence.conversationIdPresent,
      conversationWriteCount,
      conversationId: typeof resolvedConversationId === "string" ? resolvedConversationId : null,
      turnExchangeId: typeof safeMetadata.turnExchangeId === "string" ? safeMetadata.turnExchangeId : null,
      responseStatus,
      responseMimeType: typeof responseMimeType === "string" ? responseMimeType : null,
      finalUrlKind: finalUrlEvidence.kind,
      finalUrlTemporaryMarker: finalUrlEvidence.temporaryMarker,
      finalUrlTemporaryQueryTrue: finalUrlEvidence.temporaryQueryTrue,
      urlConversationIdPresent: finalUrlEvidence.conversationIdPresent,
      submitStrategy: submit.strategy,
      submitAckMs,
      completionReadyWaitMs,
      conversationTurnCountBefore: Number.isInteger(beforeSurface?.turnCount) ? beforeSurface.turnCount : null,
      conversationTurnCountAfter: Number.isInteger(afterSurface?.turnCount) ? afterSurface.turnCount : null,
      turnCountGrowth,
      matchingUserMessageCount: Number.isInteger(afterSurface?.userMatchCount)
        ? afterSurface.userMatchCount
        : 0,
      assistantMessageCandidateCount: Number.isInteger(afterSurface?.assistantCandidateCount)
        ? afterSurface.assistantCandidateCount
        : 0,
      matchingExpectedAssistantMessageCount: Number.isInteger(afterSurface?.assistantExpectedMatchCount)
        ? afterSurface.assistantExpectedMatchCount
        : 0,
      userMessageVisibleAfterTurn: afterSurface?.userMessageVisible === true,
      assistantMessageVisibleAfterTurn: afterSurface?.assistantMessageVisible === true,
      assistantExactExpectedReplyVisible: afterSurface?.assistantExactExpectedReplyVisible === true,
      visibleTurnGroundTruthProven,
      turnSurfaceEvidenceStatus: visibleTurnGroundTruthProven ? "PROVEN" : "INCONCLUSIVE",
      turnSurfaceSelectorKind: typeof afterSurface?.selectorKind === "string"
        ? afterSurface.selectorKind
        : "unavailable",
      uiModeMarkerObservedAfterTurn: afterTurn?.modeMarkerObserved === true,
      postTurnUiModeSignals: Array.isArray(afterTurn?.modeMarkerSignals)
        ? afterTurn.modeMarkerSignals.filter((value) => typeof value === "string")
        : [],
      elapsedMs: elapsedMs(startedAt)
    };
  } finally {
    if (eventListener) chrome.debugger.onEvent.removeListener(eventListener);
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
    // Intentionally do NOT close or activate the manually prepared source tab.
  }
}

executeNativeTurn = async function _executeNativeTurnWithManualTemporaryGroundTruth(message) {
  if (message?.characterizeManualTemporaryGroundTruth !== true) {
    return _pr87ManualPriorExecuteNativeTurn(message);
  }
  if (
    message?.probeTemporaryMode === true ||
    message?.characterizeTemporaryTurn === true ||
    message?.probeTemporaryHistoryPresence === true ||
    message?.conversationId != null
  ) {
    throw new Error("TEMPORARY_CHAT_MANUAL_GROUND_TRUTH_FLAG_CONFLICT");
  }
  return _pr87ManualGroundTruthTurn(message);
};

/* END legacy source: service_worker_temporary_chat_manual_ground_truth.js */

// PR8.7 T7b characterization:
// Open the exact /c/<ephemeral-backend-id> product route only after the original
// true Temporary source tab has been explicitly confirmed closed. Sample route
// settling and bounded visible-turn evidence over time. This probe never types,
// submits, continues, canonically reads, or exports message text / raw DOM.
//
// A single transient /c/<id> URL is not stable reopenability. Recovery evidence
// requires visible conversation turns while the exact target route is observed.

const _pr87RouteReopenPriorExecuteNativeTurn = executeNativeTurn;
const PR87_ROUTE_REOPEN_DEFAULT_TIMEOUT_MS = 30_000;
const PR87_ROUTE_REOPEN_MAX_OBSERVATION_MS = 15_000;
const PR87_ROUTE_REOPEN_SAMPLE_MS = 250;
const PR87_ROUTE_REOPEN_STABLE_SAMPLE_COUNT = 8;

function _pr87RouteReopenValidateId(value) {
  const conversationId = typeof value === "string" ? value.trim() : "";
  if (
    !conversationId ||
    conversationId.includes("/") ||
    conversationId.includes("?") ||
    conversationId.includes("#")
  ) {
    throw new Error("TEMPORARY_CHAT_ROUTE_REOPEN_BACKEND_ID_REQUIRED");
  }
  return conversationId;
}

function _pr87RouteReopenClassifyUrl(url, targetId) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== CHATGPT_ORIGIN) return "other_origin";
    const match = parsed.pathname.match(/^\/c\/([^/]+)$/);
    if (match) {
      let id = match[1];
      try { id = decodeURIComponent(id); } catch {}
      return id === targetId ? "exact_target" : "other_conversation";
    }
    if (parsed.pathname === "/" || parsed.pathname === "") return "root";
    return "other_chatgpt";
  } catch {
    return "invalid";
  }
}

function _pr87RouteReopenSurfaceExpression() {
  return `(() => {
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const main = document.querySelector('main');
    if (!main) {
      return { surfaceReady: false, visibleTurnCount: 0, selectorKind: 'none' };
    }
    let selectorKind = 'conversation-testid';
    let turns = Array.from(main.querySelectorAll('[data-testid^="conversation-turn-"]'));
    if (turns.length === 0) {
      selectorKind = 'article-fallback';
      turns = Array.from(main.querySelectorAll('article'));
    }
    turns = Array.from(new Set(turns)).filter((element) => {
      if (!isVisible(element)) return false;
      if (element.closest('form')) return false;
      return true;
    });
    return {
      surfaceReady: true,
      visibleTurnCount: turns.length,
      selectorKind
    };
  })()`;
}

async function _pr87RouteReopenSurfaceSnapshot(debuggee) {
  try {
    const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: _pr87RouteReopenSurfaceExpression(),
      returnByValue: true,
      awaitPromise: true
    });
    const value = result?.result?.value;
    if (value && typeof value === "object") return value;
  } catch {
    // Navigation can invalidate an execution context between samples.
  }
  return { surfaceReady: false, visibleTurnCount: 0, selectorKind: "unavailable" };
}

async function _pr87ProbeTemporaryRouteReopen(message) {
  const conversationId = _pr87RouteReopenValidateId(message?.conversationId);
  if (message?.sourceTemporaryTabConfirmedClosed !== true) {
    throw new Error("TEMPORARY_CHAT_ROUTE_REOPEN_SOURCE_CLOSED_CONFIRMATION_REQUIRED");
  }
  if (
    message?.probeTemporaryMode === true ||
    message?.characterizeTemporaryTurn === true ||
    message?.probeTemporaryHistoryPresence === true ||
    message?.characterizeManualTemporaryGroundTruth === true ||
    message?.text != null
  ) {
    throw new Error("TEMPORARY_CHAT_ROUTE_REOPEN_FLAG_CONFLICT");
  }

  const timeoutMs = Math.max(
    10_000,
    Math.min(60_000, Number(message?.timeoutMs) || PR87_ROUTE_REOPEN_DEFAULT_TIMEOUT_MS)
  );
  const observationWindowMs = Math.min(timeoutMs, PR87_ROUTE_REOPEN_MAX_OBSERVATION_MS);
  const targetUrl = `${CHATGPT_ORIGIN}/c/${encodeURIComponent(conversationId)}`;
  const startedAt = performance.now();

  let tabId = null;
  let debuggee = null;
  let attached = false;
  let debuggerAttachedAfter = null;
  let activationListener = null;
  let networkListener = null;
  let tabWasActive = false;
  let tabActiveAfter = null;
  let tabActivatedDuringProbe = false;
  let probeTabClosed = false;
  let conversationWriteCount = 0;

  let targetRouteObserved = false;
  let targetRouteFirstSeenMs = null;
  let targetRouteLastSeenMs = null;
  let targetRouteSampleCount = 0;
  let rootRouteObserved = false;
  let rootRouteSampleCount = 0;
  let otherRouteSampleCount = 0;
  let redirectAwayFromTargetObserved = false;
  let targetPreviouslySeen = false;

  let visibleTurnSurfaceObserved = false;
  let maxVisibleTurnCount = 0;
  let finalVisibleTurnCount = 0;
  let turnSurfaceSelectorKind = "unavailable";
  let recoveredSampleCount = 0;
  let firstRecoveredMs = null;
  let lastRecoveredMs = null;
  const finalRecoveredSamples = [];
  let outcome = null;

  const activatedTabIds = new Set();
  activationListener = (activeInfo) => {
    if (Number.isInteger(activeInfo?.tabId)) activatedTabIds.add(activeInfo.tabId);
  };
  chrome.tabs.onActivated.addListener(activationListener);

  try {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    if (!Number.isInteger(tab?.id)) {
      throw new Error("TEMPORARY_CHAT_ROUTE_REOPEN_TAB_CREATE_FAILED");
    }
    tabId = tab.id;
    tabWasActive = Boolean(tab.active);
    debuggee = { tabId };

    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Runtime.enable");
    await chrome.debugger.sendCommand(debuggee, "Network.enable");

    networkListener = (source, method, params) => {
      if (source?.tabId !== tabId || method !== "Network.requestWillBeSent") return;
      const request = params?.request;
      if (isConversationWrite(request?.url || "", request?.method || "")) {
        conversationWriteCount += 1;
      }
    };
    chrome.debugger.onEvent.addListener(networkListener);

    while (elapsedMs(startedAt) < observationWindowMs) {
      let currentTab = null;
      try {
        currentTab = await chrome.tabs.get(tabId);
      } catch {
        break;
      }
      const routeKind = _pr87RouteReopenClassifyUrl(currentTab?.url || "", conversationId);
      const nowMs = elapsedMs(startedAt);
      const exactTarget = routeKind === "exact_target";

      if (exactTarget) {
        targetRouteObserved = true;
        targetRouteSampleCount += 1;
        if (targetRouteFirstSeenMs == null) targetRouteFirstSeenMs = nowMs;
        targetRouteLastSeenMs = nowMs;
        targetPreviouslySeen = true;
      } else {
        if (routeKind === "root") {
          rootRouteObserved = true;
          rootRouteSampleCount += 1;
        } else {
          otherRouteSampleCount += 1;
        }
        if (targetPreviouslySeen) redirectAwayFromTargetObserved = true;
      }

      const surface = await _pr87RouteReopenSurfaceSnapshot(debuggee);
      const visibleTurnCount = Number.isInteger(surface?.visibleTurnCount)
        ? surface.visibleTurnCount
        : 0;
      finalVisibleTurnCount = visibleTurnCount;
      maxVisibleTurnCount = Math.max(maxVisibleTurnCount, visibleTurnCount);
      if (visibleTurnCount > 0) visibleTurnSurfaceObserved = true;
      if (typeof surface?.selectorKind === "string") {
        turnSurfaceSelectorKind = surface.selectorKind;
      }

      const recoveredNow = exactTarget && visibleTurnCount >= 2;
      if (recoveredNow) {
        recoveredSampleCount += 1;
        if (firstRecoveredMs == null) firstRecoveredMs = nowMs;
        lastRecoveredMs = nowMs;
      }
      finalRecoveredSamples.push(recoveredNow);
      if (finalRecoveredSamples.length > PR87_ROUTE_REOPEN_STABLE_SAMPLE_COUNT) {
        finalRecoveredSamples.shift();
      }

      await sleep(PR87_ROUTE_REOPEN_SAMPLE_MS);
    }

    if (conversationWriteCount !== 0) {
      throw new Error(
        `TEMPORARY_CHAT_ROUTE_REOPEN_UNEXPECTED_CONVERSATION_WRITE:${conversationWriteCount}`
      );
    }

    try {
      const finalTab = await chrome.tabs.get(tabId);
      tabActiveAfter = Boolean(finalTab?.active);
      const finalRouteKind = _pr87RouteReopenClassifyUrl(
        finalTab?.url || "",
        conversationId
      );
      const stableRecovered = Boolean(
        finalRecoveredSamples.length >= PR87_ROUTE_REOPEN_STABLE_SAMPLE_COUNT &&
        finalRecoveredSamples.every((value) => value === true)
      );
      const transientRecovered = recoveredSampleCount > 0 && !stableRecovered;

      let recoveryEvidenceStatus = "INCONCLUSIVE";
      if (stableRecovered) {
        recoveryEvidenceStatus = "STABLE_RECOVERED";
      } else if (transientRecovered) {
        recoveryEvidenceStatus = "TRANSIENT_RECOVERED";
      } else if (targetRouteObserved && redirectAwayFromTargetObserved) {
        recoveryEvidenceStatus = "TRANSIENT_ROUTE_NO_RECOVERY";
      } else if (finalRouteKind === "root") {
        recoveryEvidenceStatus = "REDIRECTED_TO_ROOT";
      } else if (targetRouteObserved) {
        recoveryEvidenceStatus = "TARGET_ROUTE_NO_VISIBLE_TURNS";
      }

      tabActivatedDuringProbe = activatedTabIds.has(tabId);

      outcome = {
        probeContext: "temporary_product_route_reopen_after_source_close",
        conversationId,
        sourceTemporaryTabConfirmedClosed: true,
        productRouteOpenAttempted: true,
        canonicalHttpReadPerformed: false,
        conversationAttachPerformed: false,
        writePerformed: false,
        conversationWriteCount,
        observationWindowMs: elapsedMs(startedAt),
        targetRouteObserved,
        targetRouteFirstSeenMs,
        targetRouteLastSeenMs,
        targetRouteSampleCount,
        rootRouteObserved,
        rootRouteSampleCount,
        otherRouteSampleCount,
        redirectAwayFromTargetObserved,
        finalUrlKind: finalRouteKind,
        finalUrlConversationIdMatchesTarget: finalRouteKind === "exact_target",
        visibleTurnSurfaceObserved,
        maxVisibleTurnCount,
        finalVisibleTurnCount,
        turnSurfaceSelectorKind,
        recoveredSampleCount,
        firstRecoveredMs,
        lastRecoveredMs,
        stableRecovered,
        transientRecovered,
        recoveryEvidenceStatus,
        tabWasActive,
        tabActiveAfter,
        tabActivatedDuringProbe,
        foregroundActivationObserved: Boolean(
          tabWasActive || tabActiveAfter === true || tabActivatedDuringProbe
        )
      };
    } catch {
      throw new Error("TEMPORARY_CHAT_ROUTE_REOPEN_FINAL_TAB_UNAVAILABLE");
    }
  } finally {
    if (networkListener) chrome.debugger.onEvent.removeListener(networkListener);
    if (attached && debuggee) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
    if (debuggee) {
      try {
        const targets = await chrome.debugger.getTargets();
        debuggerAttachedAfter = Boolean(
          targets.find((target) => target.tabId === tabId)?.attached
        );
      } catch {
        debuggerAttachedAfter = null;
      }
    }
    if (activationListener) chrome.tabs.onActivated.removeListener(activationListener);
    if (Number.isInteger(tabId)) {
      try {
        await chrome.tabs.remove(tabId);
        probeTabClosed = true;
      } catch {
        probeTabClosed = false;
      }
    }
  }

  if (!outcome) {
    throw new Error("TEMPORARY_CHAT_ROUTE_REOPEN_NO_OUTCOME");
  }
  return {
    ...outcome,
    debuggerAttachedAfter,
    probeTabClosed
  };
}

executeNativeTurn = async function _executeNativeTurnWithTemporaryRouteReopenProbe(message) {
  if (message?.probeTemporaryRouteReopen !== true) {
    return _pr87RouteReopenPriorExecuteNativeTurn(message);
  }
  return _pr87ProbeTemporaryRouteReopen(message);
};

// PR9.2 adds rich-input staging only after the full PR8 worker chain above has
// been assembled. The manifest entrypoint and historical worker ordering remain
// unchanged; text-only turns still delegate through the exact prior path.

/* BEGIN legacy source: service_worker_rich_input_pr9_2.js */
// PR9.2 rich-input overlay.
//
// This file is imported by the existing final PR8.7 worker after that worker has
// assembled the full prior service-worker chain. Attachment bytes never cross
// Native Messaging. The Python side sends only validated local file paths. The
// overlay stages those paths only after PR8.11 stale-UI recovery has completed,
// then delegates the actual product turn to the previously-proven browser-owned
// chain. The official page therefore remains responsible for upload semantics,
// Sentinel/proof handling, request construction, and the protected write.

const _pr92RichInputPriorExecuteNativeTurn = executeNativeTurn;
const _pr92PriorMaybeRecoverStaleRuntimeUi = (
  typeof _pr811MaybeRecoverStaleRuntimeUi === "function"
    ? _pr811MaybeRecoverStaleRuntimeUi
    : null
);
const _pr92PriorReloadRuntimeTabAndWait = (
  typeof _pr811ReloadRuntimeTabAndWait === "function"
    ? _pr811ReloadRuntimeTabAndWait
    : null
);
const _pr92PriorWaitForTabComplete = (
  typeof waitForTabComplete === "function" ? waitForTabComplete : null
);
const _pr92PriorExecuteOfficialPageTurn = (
  typeof executeOfficialPageTurn === "function" ? executeOfficialPageTurn : null
);
const PR92_RICH_INPUT_SCHEMA = 1;
const PR92_MAX_ATTACHMENT_COUNT = 32;
const PR92_DIRTY_ATTACHMENT_STORAGE_KEY = "pr92DirtyAttachmentFenceV1";
const PR92_STALE_UI_RELOAD_TIMEOUT_CAP_MS = 45_000;
const PR92_TOTAL_DEADLINE_HOOKS_AVAILABLE = Boolean(
  _pr92PriorMaybeRecoverStaleRuntimeUi &&
  _pr92PriorReloadRuntimeTabAndWait &&
  _pr92PriorWaitForTabComplete &&
  _pr92PriorExecuteOfficialPageTurn
);

let _pr92ActiveTurnContext = null;
let _pr92ActiveRichInputContext = null;
let _pr92DirtyAttachmentTabId = null;

function _pr92NormalizeAttachmentPaths(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("PR9_2_ATTACHMENT_PATHS_ARRAY_REQUIRED");
  if (value.length > PR92_MAX_ATTACHMENT_COUNT) {
    throw new Error("PR9_2_ATTACHMENT_COUNT_EXCEEDED");
  }
  return value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error("PR9_2_ATTACHMENT_PATH_INVALID");
    }
    return item;
  });
}

function _pr92TurnTimeoutMs(message) {
  if (!Number.isFinite(message?.timeoutMs)) return DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number(message.timeoutMs);
  if (timeoutMs <= 0) throw new Error("PR9_2_TURN_TIMEOUT_MUST_BE_POSITIVE");
  return Math.min(timeoutMs, MAX_TURN_TIMEOUT_MS);
}

function _pr92CreateTurnContext(message) {
  const timeoutMs = _pr92TurnTimeoutMs(message);
  const startedAt = performance.now();
  return {
    startedAt,
    timeoutMs,
    deadlineAt: startedAt + timeoutMs,
    attachmentPaths: [],
    staged: false,
    stagedTabId: null,
    attachmentCount: 0
  };
}

function _pr92RemainingTurnMs(context, stage) {
  const remaining = Math.ceil(context.deadlineAt - performance.now());
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new Error(`PR9_2_TOTAL_TURN_TIMEOUT:${stage}`);
  }
  return remaining;
}

function _pr92RemainingTurnMsOrZero(context) {
  const remaining = Math.ceil(context.deadlineAt - performance.now());
  return Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
}

function _pr92CapTimeoutToTurn(context, requestedMs, stage) {
  const remaining = _pr92RemainingTurnMs(context, stage);
  if (!Number.isFinite(requestedMs)) return remaining;
  return Math.max(1, Math.min(Number(requestedMs), remaining));
}

async function _pr92BoundedSleep(context, requestedMs, stage) {
  const duration = _pr92CapTimeoutToTurn(context, requestedMs, stage);
  await sleep(duration);
  _pr92RemainingTurnMs(context, stage);
}

// The prior worker chain contains waits which predate PR9.2 and therefore own
// their own local timeouts. While a PR9.2 turn is active, cap those waits to the
// single outer RPC deadline. Text-only turns outside this overlay context retain
// the exact prior behavior.
if (_pr92PriorWaitForTabComplete) {
  waitForTabComplete = async function _pr92WaitForTabCompleteWithinTurn(
    tabId,
    timeoutMs = 45_000
  ) {
    const context = _pr92ActiveTurnContext;
    if (context === null) {
      return _pr92PriorWaitForTabComplete(tabId, timeoutMs);
    }
    return _pr92PriorWaitForTabComplete(
      tabId,
      _pr92CapTimeoutToTurn(context, timeoutMs, "TAB_LOAD")
    );
  };
}

if (_pr92PriorExecuteOfficialPageTurn) {
  executeOfficialPageTurn = async function _pr92ExecuteOfficialPageTurnWithinTurn(args) {
    const context = _pr92ActiveTurnContext;
    if (context === null) return _pr92PriorExecuteOfficialPageTurn(args);
    return _pr92PriorExecuteOfficialPageTurn({
      ...args,
      timeoutMs: _pr92CapTimeoutToTurn(
        context,
        args?.timeoutMs,
        "PROTECTED_PAGE_DISPATCH"
      )
    });
  };
}

// PR8.11 stale-UI recovery has a fixed 45s reload timer. Reproduce that bounded
// reload under an active PR9.2 turn so recovery cannot consume a fresh timeout
// before attachment staging. No retry is introduced and a timeout occurs before
// attachment selection/write authority.
if (_pr92PriorReloadRuntimeTabAndWait) {
  _pr811ReloadRuntimeTabAndWait = async function _pr92ReloadRuntimeTabWithinTurn(
    tabId,
    expectedConversationId
  ) {
    const context = _pr92ActiveTurnContext;
    if (context === null) {
      return _pr92PriorReloadRuntimeTabAndWait(tabId, expectedConversationId);
    }

    const startedAt = performance.now();
    const reloadTimeoutMs = _pr92CapTimeoutToTurn(
      context,
      PR92_STALE_UI_RELOAD_TIMEOUT_CAP_MS,
      "STALE_UI_RELOAD"
    );
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(
        () => finish(new Error("CHATGPT_STALE_UI_RELOAD_TIMEOUT")),
        reloadTimeoutMs
      );
      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") finish();
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.reload(tabId).catch((error) => finish(error));
    });

    _pr92RemainingTurnMs(context, "STALE_UI_RELOAD_VERIFY");
    const reloadedTab = await chrome.tabs.get(tabId);
    _pr92RemainingTurnMs(context, "STALE_UI_RELOAD_VERIFY");
    const conversationId = conversationIdFromUrl(reloadedTab.url || "");
    if (conversationId !== expectedConversationId) {
      throw new Error("CHATGPT_STALE_UI_RELOAD_CONVERSATION_MISMATCH");
    }
    return Math.round(performance.now() - startedAt);
  };
}

async function _pr92ReadDirtyAttachmentFence() {
  try {
    const stored = await chrome.storage.local.get(PR92_DIRTY_ATTACHMENT_STORAGE_KEY);
    const record = stored?.[PR92_DIRTY_ATTACHMENT_STORAGE_KEY];
    const tabId = Number.isInteger(record?.tabId) ? record.tabId : null;
    _pr92DirtyAttachmentTabId = tabId;
    return tabId;
  } catch {
    // A storage read failure means we cannot prove that a previous worker did not
    // leave a staged file in the persistent composer. Fail closed before any turn.
    throw new Error("PR9_2_STALE_ATTACHMENT_FENCE_READ_FAILED");
  }
}

async function _pr92PersistDirtyAttachmentFence(tabId) {
  if (!Number.isInteger(tabId)) {
    throw new Error("PR9_2_STALE_ATTACHMENT_FENCE_TAB_REQUIRED");
  }
  try {
    // Persist BEFORE DOM.setFileInputFiles. A worker crash after the file selection
    // can therefore never erase the authority fence while the runtime tab survives.
    await chrome.storage.local.set({
      [PR92_DIRTY_ATTACHMENT_STORAGE_KEY]: {
        schema: 1,
        tabId
      }
    });
  } catch {
    throw new Error("PR9_2_STALE_ATTACHMENT_FENCE_PERSIST_FAILED");
  }
  _pr92DirtyAttachmentTabId = tabId;
}

async function _pr92TryClearDirtyAttachmentFence() {
  try {
    await chrome.storage.local.remove(PR92_DIRTY_ATTACHMENT_STORAGE_KEY);
    _pr92DirtyAttachmentTabId = null;
    return true;
  } catch {
    // Retaining the fence is safe: the next turn will retry cleanup before write.
    return false;
  }
}

function _pr92FindFileInputExpression() {
  return `(() => {
    const seen = new Set();
    const visit = (root) => {
      if (!root || seen.has(root)) return null;
      seen.add(root);
      try {
        const direct = root.querySelector && root.querySelector('input[type="file"]');
        if (direct) return direct;
        const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
        for (const element of elements) {
          if (element && element.shadowRoot) {
            const nested = visit(element.shadowRoot);
            if (nested) return nested;
          }
        }
      } catch {}
      return null;
    };
    return visit(document);
  })()`;
}

async function _pr92FindFileInputObjectId(debuggee) {
  const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
    expression: _pr92FindFileInputExpression(),
    returnByValue: false,
    awaitPromise: true
  });
  const objectId = result?.result?.objectId;
  return typeof objectId === "string" && objectId ? objectId : null;
}

async function _pr92TryRevealFileInput(debuggee, context) {
  try {
    _pr92RemainingTurnMs(context, "REVEAL_FILE_INPUT");
    await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: `(() => {
        const selectors = [
          'button[data-testid="composer-plus-btn"]',
          'button[data-testid="composer-button-add-files"]',
          'button[aria-label*="Attach"]',
          'button[aria-label*="attach"]',
          'button[aria-label*="Upload"]',
          'button[aria-label*="Add files"]',
          'button[aria-label*="Прикреп"]'
        ];
        for (const selector of selectors) {
          const button = document.querySelector(selector);
          if (!button) continue;
          const rect = button.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          button.click();
          return selector;
        }
        return null;
      })()`,
      returnByValue: true,
      awaitPromise: true
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PR9_2_TOTAL_TURN_TIMEOUT:")) {
      throw error;
    }
    // The bounded hidden-input path is preferred; reveal is only a compatibility aid.
  }
  await _pr92BoundedSleep(context, 100, "REVEAL_FILE_INPUT_SETTLE");
}

async function _pr92StageOfficialPageAttachments(tabId, attachmentPaths, context) {
  if (attachmentPaths.length === 0) return 0;
  const debuggee = { tabId };
  const stageTimeoutMs = _pr92RemainingTurnMs(context, "ATTACHMENT_STAGE");
  const startedAt = performance.now();
  let attached = false;
  let objectId = null;
  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    _pr92RemainingTurnMs(context, "ATTACHMENT_STAGE");
    await chrome.debugger.sendCommand(debuggee, "Runtime.enable");
    await chrome.debugger.sendCommand(debuggee, "DOM.enable");
    await waitForComposerReady(
      debuggee,
      Math.min(
        remainingMs(startedAt, stageTimeoutMs, 1),
        _pr92RemainingTurnMs(context, "ATTACHMENT_STAGE_READY"),
        DEFAULT_READY_TIMEOUT_MS
      )
    );

    _pr92RemainingTurnMs(context, "ATTACHMENT_FILE_INPUT_LOOKUP");
    objectId = await _pr92FindFileInputObjectId(debuggee);
    if (!objectId) {
      await _pr92TryRevealFileInput(debuggee, context);
      objectId = await _pr92FindFileInputObjectId(debuggee);
    }
    if (!objectId) throw new Error("PR9_2_FILE_INPUT_NOT_FOUND");

    // The persistent fence is authoritative across Manifest V3 worker restarts.
    // It must exist before the browser is allowed to select any local file.
    _pr92RemainingTurnMs(context, "ATTACHMENT_FENCE_PERSIST");
    await _pr92PersistDirtyAttachmentFence(tabId);
    _pr92RemainingTurnMs(context, "ATTACHMENT_FILE_SELECTION");
    await chrome.debugger.sendCommand(debuggee, "DOM.setFileInputFiles", {
      files: attachmentPaths,
      objectId
    });
    await _pr92BoundedSleep(context, 100, "ATTACHMENT_SELECTION_SETTLE");
    return attachmentPaths.length;
  } catch (error) {
    if (error instanceof Error && error.message === "PR9_2_FILE_INPUT_NOT_FOUND") {
      throw error;
    }
    if (
      error instanceof Error &&
      (
        error.message.startsWith("PR9_2_STALE_ATTACHMENT_FENCE_") ||
        error.message.startsWith("PR9_2_TOTAL_TURN_TIMEOUT:")
      )
    ) {
      throw error;
    }
    throw new Error("PR9_2_ATTACHMENT_STAGE_FAILED");
  } finally {
    if (objectId) {
      try {
        await chrome.debugger.sendCommand(debuggee, "Runtime.releaseObject", { objectId });
      } catch {}
    }
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
  }
}

async function _pr92ClearOfficialPageAttachments(tabId, timeoutMs) {
  if (!Number.isInteger(tabId) || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return false;
  }
  try {
    await chrome.tabs.get(tabId);
  } catch {
    // A removed tab cannot retain a stale composer attachment.
    return true;
  }

  try {
    await waitForTabComplete(tabId, Math.max(1, Math.min(timeoutMs, 10_000)));
  } catch {
    return false;
  }

  const debuggee = { tabId };
  let attached = false;
  let objectId = null;
  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Runtime.enable");
    await chrome.debugger.sendCommand(debuggee, "DOM.enable");
    objectId = await _pr92FindFileInputObjectId(debuggee);
    if (!objectId) return false;
    await chrome.debugger.sendCommand(debuggee, "DOM.setFileInputFiles", {
      files: [],
      objectId
    });
    return true;
  } catch {
    return false;
  } finally {
    if (objectId) {
      try {
        await chrome.debugger.sendCommand(debuggee, "Runtime.releaseObject", { objectId });
      } catch {}
    }
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
  }
}

async function _pr92RequireCleanAttachmentState(context) {
  _pr92RemainingTurnMs(context, "STALE_ATTACHMENT_FENCE_READ");
  const dirtyTabId = await _pr92ReadDirtyAttachmentFence();
  if (!Number.isInteger(dirtyTabId)) return;

  const cleared = await _pr92ClearOfficialPageAttachments(
    dirtyTabId,
    _pr92RemainingTurnMs(context, "STALE_ATTACHMENT_CLEANUP")
  );
  if (!cleared) {
    throw new Error("PR9_2_STALE_ATTACHMENT_CLEANUP_REQUIRED");
  }
  _pr92RemainingTurnMs(context, "STALE_ATTACHMENT_FENCE_CLEAR");
  if (!await _pr92TryClearDirtyAttachmentFence()) {
    throw new Error("PR9_2_STALE_ATTACHMENT_FENCE_CLEAR_FAILED");
  }
}

// Recovery is the last operation that is allowed to reload the runtime tab before
// the core page turn. Hook immediately after it rather than staging in the outer
// executeNativeTurn wrapper. This preserves PR8.11 recovery semantics while the
// active PR9.2 context makes recovery + staging + dispatch share one deadline.
if (_pr92PriorMaybeRecoverStaleRuntimeUi) {
  _pr811MaybeRecoverStaleRuntimeUi = async function _pr92RecoverThenStage(message) {
    const recovery = await _pr92PriorMaybeRecoverStaleRuntimeUi(message);
    const context = _pr92ActiveRichInputContext;
    if (context === null) return recovery;
    if (context.staged === true) {
      throw new Error("PR9_2_ATTACHMENT_STAGE_REENTRANCY");
    }

    _pr92RemainingTurnMs(context, "POST_RECOVERY");
    const conversationId = typeof message?.conversationId === "string" && message.conversationId.trim()
      ? message.conversationId.trim()
      : null;
    const tab = await ensureRuntimeTab(conversationId);
    _pr92RemainingTurnMs(context, "POST_RECOVERY_TAB");
    if (!Number.isInteger(tab?.id)) throw new Error("CHATGPT_RUNTIME_TAB_MISSING_ID");

    const count = await _pr92StageOfficialPageAttachments(
      tab.id,
      context.attachmentPaths,
      context
    );
    context.staged = true;
    context.stagedTabId = tab.id;
    context.attachmentCount = count;

    // The prior core worker snapshots message.timeoutMs only after this recovery
    // hook returns. Hand it the remaining outer budget, not a fresh full turn.
    message.timeoutMs = _pr92RemainingTurnMs(context, "PRE_DISPATCH");
    return recovery;
  };
}

executeNativeTurn = async function _executeNativeTurnWithPr92RichInput(message) {
  if (message?.characterizeRichInputSupport === true) {
    if (message?.text != null || message?.attachmentPaths != null) {
      throw new Error("PR9_2_RICH_INPUT_SUPPORT_PROBE_MUST_BE_NO_WRITE");
    }
    return {
      richInputSupported: true,
      richInputSchemaVersion: PR92_RICH_INPUT_SCHEMA,
      stagingPrimitive: "DOM.setFileInputFiles",
      maxAttachmentCount: PR92_MAX_ATTACHMENT_COUNT,
      nativeMessagingCarriesAttachmentBytes: false,
      officialPageOwnsUpload: true,
      officialPageOwnsProtectedWrite: true,
      recoveryBeforeAttachmentStaging: true,
      staleAttachmentFailureFence: true,
      staleAttachmentFencePersistentAcrossWorkerRestart: true,
      singleTotalTurnDeadline: PR92_TOTAL_DEADLINE_HOOKS_AVAILABLE,
      automaticWriteRetry: false,
      fallbackTransport: null,
      writePerformed: false
    };
  }

  if (_pr92ActiveTurnContext !== null) {
    throw new Error("PR9_2_TURN_CONTEXT_BUSY");
  }

  const context = _pr92CreateTurnContext(message);
  _pr92ActiveTurnContext = context;
  try {
    await _pr92RequireCleanAttachmentState(context);

    const attachmentPaths = _pr92NormalizeAttachmentPaths(message?.attachmentPaths);
    message.timeoutMs = _pr92RemainingTurnMs(context, "POST_PREFLIGHT");
    if (attachmentPaths.length === 0) {
      return await _pr92RichInputPriorExecuteNativeTurn(message);
    }

    if (
      message?.probeTemporaryMode === true ||
      message?.characterizeTemporaryTurn === true ||
      message?.probeTemporaryHistoryPresence === true ||
      message?.characterizeManualTemporaryGroundTruth === true ||
      message?.probeTemporaryRouteReopen === true ||
      message?.characterizeProductModelProfileSupport === true ||
      message?.characterizeProductModelProfileSelectionRecord === true
    ) {
      throw new Error("PR9_2_ATTACHMENT_PROBE_FLAG_CONFLICT");
    }
    if (!PR92_TOTAL_DEADLINE_HOOKS_AVAILABLE) {
      throw new Error("PR9_2_TOTAL_DEADLINE_HOOK_UNAVAILABLE");
    }
    if (_pr92ActiveRichInputContext !== null) {
      throw new Error("PR9_2_RICH_INPUT_CONTEXT_BUSY");
    }

    context.attachmentPaths = attachmentPaths;
    _pr92ActiveRichInputContext = context;
    try {
      const result = await _pr92RichInputPriorExecuteNativeTurn(message);
      if (context.staged !== true || context.attachmentCount !== attachmentPaths.length) {
        throw new Error("PR9_2_ATTACHMENT_STAGE_NOT_PROVEN");
      }

      // A completed write must not erase the persistent fence merely by returning.
      // Cleanup consumes only the outer budget. If no budget remains, retain the
      // durable fence and return the already-completed write; the next turn is
      // blocked until cleanup is proven instead of fabricating response ambiguity.
      const cleanupBudget = _pr92RemainingTurnMsOrZero(context);
      if (
        Number.isInteger(context.stagedTabId) &&
        cleanupBudget > 0 &&
        await _pr92ClearOfficialPageAttachments(context.stagedTabId, cleanupBudget)
      ) {
        if (_pr92RemainingTurnMsOrZero(context) > 0) {
          await _pr92TryClearDirtyAttachmentFence();
        }
      }
      return {
        ...result,
        attachmentCount: context.attachmentCount
      };
    } catch (error) {
      // No retry after delegation. Spend only remaining budget on best-effort
      // cleanup. If the durable fence remains, surface cleanup-unproven and keep
      // the fence authoritative for the next turn/worker generation.
      const dirtyTabId = _pr92DirtyAttachmentTabId;
      const cleanupBudget = _pr92RemainingTurnMsOrZero(context);
      if (
        Number.isInteger(dirtyTabId) &&
        cleanupBudget > 0 &&
        await _pr92ClearOfficialPageAttachments(dirtyTabId, cleanupBudget)
      ) {
        if (_pr92RemainingTurnMsOrZero(context) > 0) {
          await _pr92TryClearDirtyAttachmentFence();
        }
      }
      if (Number.isInteger(_pr92DirtyAttachmentTabId)) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`PR9_2_DOWNSTREAM_FAILED_AND_ATTACHMENT_CLEANUP_UNPROVEN:${detail}`);
      }
      throw error;
    } finally {
      _pr92ActiveRichInputContext = null;
    }
  } finally {
    _pr92ActiveTurnContext = null;
  }
};

/* END legacy source: service_worker_rich_input_pr9_2.js */

// PR9.2 deadline/fence repair layer.

/* BEGIN legacy source: service_worker_rich_input_deadline_repair_pr9_2.js */
// PR9.2 deadline-boundary repair overlay.
//
// Loaded after service_worker_rich_input_pr9_2.js. The original PR9.2 overlay
// owns recovery-before-staging and the durable stale-attachment fence; this
// final layer closes the remaining authority gaps at the exact protected-submit
// boundary and across post-write cleanup without changing text-only behavior.

const _pr92DeadlineRepairPriorClickSendButton = clickSendButton;
const _pr92DeadlineRepairPriorSubmitWithEnter = submitWithEnter;
const _pr92DeadlineRepairPriorSubmitOfficialPageTurn = submitOfficialPageTurn;
const _pr92DeadlineRepairPriorTryClearDirtyAttachmentFence = (
  _pr92TryClearDirtyAttachmentFence
);
const _pr92DeadlineRepairPriorExecuteNativeTurn = executeNativeTurn;
const PR92_DEADLINE_REPAIR_SCHEMA = 4;

function _pr92DeadlineRepairTimeoutError(stage) {
  return new Error(`PR9_2_TOTAL_TURN_TIMEOUT:${stage}`);
}

function _pr92DeadlineRepairRemainingMs(deadlineAt, stage) {
  const remaining = Math.ceil(deadlineAt - performance.now());
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw _pr92DeadlineRepairTimeoutError(stage);
  }
  return remaining;
}

function _pr92DeadlineRepairDeadlineFromBudget(timeoutMs) {
  const now = performance.now();
  let deadlineAt = now + Math.max(1, Number(timeoutMs) || 1);
  const context = _pr92ActiveTurnContext;
  if (context && Number.isFinite(context.deadlineAt)) {
    deadlineAt = Math.min(deadlineAt, context.deadlineAt);
  }
  return deadlineAt;
}

async function _pr92DeadlineRepairRunUntil(deadlineAt, stage, operation) {
  const remaining = _pr92DeadlineRepairRemainingMs(deadlineAt, stage);
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(_pr92DeadlineRepairTimeoutError(stage)),
          remaining
        );
      })
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function _pr92DeadlineRepairRichContext() {
  return _pr92ActiveRichInputContext;
}

function _pr92DeadlineRepairIsTimeoutError(error) {
  return Boolean(
    error instanceof Error &&
    error.message.startsWith("PR9_2_TOTAL_TURN_TIMEOUT:")
  );
}

function _pr92DeadlineRepairIsMissingTabError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /no tab with id|invalid tab id|tab not found/i.test(message);
}

// The actual conversation write can be triggered by mouse release or Enter.
// Guard those exact CDP input events, rather than trusting nested timeoutMs
// values in the older page-turn chain whose prewrite waits can floor an expired
// budget back to one second.
clickSendButton = async function _pr92ClickSendButtonWithinDeadline(debuggee, point) {
  const context = _pr92DeadlineRepairRichContext();
  if (context === null) {
    return _pr92DeadlineRepairPriorClickSendButton(debuggee, point);
  }

  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("CHATGPT_SEND_BUTTON_POINT_INVALID");
  }

  await _pr92DeadlineRepairRunUntil(
    context.deadlineAt,
    "PRE_SUBMIT_MOUSE_MOVE",
    () => chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none"
    })
  );
  await _pr92DeadlineRepairRunUntil(
    context.deadlineAt,
    "PRE_SUBMIT_MOUSE_PRESS",
    () => chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1
    })
  );
  await _pr92DeadlineRepairRunUntil(
    context.deadlineAt,
    "PRE_SUBMIT_MOUSE_RELEASE",
    () => chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1
    })
  );
};

submitWithEnter = async function _pr92SubmitWithEnterWithinDeadline(debuggee) {
  const context = _pr92DeadlineRepairRichContext();
  if (context === null) {
    return _pr92DeadlineRepairPriorSubmitWithEnter(debuggee);
  }

  // keyDown is the protected write boundary. If it succeeds, the conversation may
  // already be delegated. A later keyUp must therefore never convert that submitted
  // outcome into a local timeout/error. Dispatch release best-effort and return
  // immediately so post-submit housekeeping cannot consume the remaining RPC budget.
  await _pr92DeadlineRepairRunUntil(
    context.deadlineAt,
    "PRE_SUBMIT_ENTER_KEY_DOWN",
    () => chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13
    })
  );
  try {
    chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13
    }).catch(() => {});
  } catch {}
};

// The historical submit helper treats any mouse-click failure as permission to
// fall back to Enter. That is safe only before the mouse release is attempted.
// Once mouseReleased has been delegated, an ACK loss/timeout can coexist with a
// real conversation write. Never issue a second submit in that state.
submitOfficialPageTurn = async function _pr92SubmitOfficialPageTurnWithoutPostBoundaryRetry(
  debuggee,
  timeoutMs
) {
  const context = _pr92DeadlineRepairRichContext();
  if (context === null) {
    return _pr92DeadlineRepairPriorSubmitOfficialPageTurn(debuggee, timeoutMs);
  }

  let point = null;
  try {
    const readyBudget = Math.min(
      _pr92DeadlineRepairRemainingMs(context.deadlineAt, "SUBMIT_BUTTON_READY"),
      Number.isFinite(timeoutMs) ? Math.max(1, Number(timeoutMs)) : DEFAULT_SUBMIT_READY_TIMEOUT_MS,
      DEFAULT_SUBMIT_READY_TIMEOUT_MS
    );
    point = await _pr92DeadlineRepairRunUntil(
      context.deadlineAt,
      "SUBMIT_BUTTON_READY",
      () => waitForSendButtonPoint(debuggee, readyBudget)
    );
  } catch {
    // No mouse protected-write boundary has been attempted, so the historical
    // Enter fallback remains valid. Its focus and keyDown are still outer-deadline bounded.
    await _pr92DeadlineRepairRunUntil(
      context.deadlineAt,
      "ENTER_FALLBACK_FOCUS",
      () => locateAndFocusComposer(debuggee)
    );
    await submitWithEnter(debuggee);
    return { strategy: "enter_fallback", selector: null };
  }

  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("CHATGPT_SEND_BUTTON_POINT_INVALID");
  }

  let mouseReleaseAttempted = false;
  try {
    await _pr92DeadlineRepairRunUntil(
      context.deadlineAt,
      "PRE_SUBMIT_MOUSE_MOVE",
      () => chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: "none"
      })
    );
    await _pr92DeadlineRepairRunUntil(
      context.deadlineAt,
      "PRE_SUBMIT_MOUSE_PRESS",
      () => chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1
      })
    );
    mouseReleaseAttempted = true;
    await _pr92DeadlineRepairRunUntil(
      context.deadlineAt,
      "PRE_SUBMIT_MOUSE_RELEASE",
      () => chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1
      })
    );
    return { strategy: "send_button_click", selector: point.selector };
  } catch (error) {
    if (mouseReleaseAttempted) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`PR9_2_MOUSE_RELEASE_OUTCOME_UNCONFIRMED:${detail}`);
    }

    // Mouse release was never attempted, so no click-based write boundary exists.
    // Enter remains a single allowed submit path, still bounded by the same deadline.
    await _pr92DeadlineRepairRunUntil(
      context.deadlineAt,
      "ENTER_FALLBACK_FOCUS",
      () => locateAndFocusComposer(debuggee)
    );
    await submitWithEnter(debuggee);
    return { strategy: "enter_fallback", selector: null };
  }
};

async function _pr92DeadlineRepairProveTabAbsent(tabId, deadlineAt) {
  try {
    await _pr92DeadlineRepairRunUntil(
      deadlineAt,
      "CLEANUP_RUNTIME_TAB_ABSENCE_CONFIRM",
      () => chrome.tabs.get(tabId)
    );
    return false;
  } catch (error) {
    if (_pr92DeadlineRepairIsTimeoutError(error)) return false;
    return _pr92DeadlineRepairIsMissingTabError(error);
  }
}

// Clearing input.files is not sufficient cleanup authority: the product page may
// already have ingested the file into composer/upload state. For a durable dirty
// fence, the only generic proof available without reconstructing product internals
// is destruction of the dedicated runtime tab followed by explicit absence proof.
// The same rich turn never performs that destructive cleanup; it returns/throws
// with the fence intact. The next prewrite closes the dirty tab under its own outer
// deadline, proves it no longer exists, and only then may clear the durable fence.
_pr92ClearOfficialPageAttachments = async function _pr92ClearAttachmentsWithinDeadline(
  tabId,
  timeoutMs
) {
  if (!Number.isInteger(tabId) || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return false;
  }

  const richContext = _pr92ActiveRichInputContext;
  if (richContext !== null && richContext.staged === true) {
    return false;
  }

  const deadlineAt = _pr92DeadlineRepairDeadlineFromBudget(timeoutMs);
  try {
    await _pr92DeadlineRepairRunUntil(
      deadlineAt,
      "CLEANUP_RUNTIME_TAB_LOOKUP",
      () => chrome.tabs.get(tabId)
    );
  } catch (error) {
    if (_pr92DeadlineRepairIsTimeoutError(error)) return false;
    return _pr92DeadlineRepairIsMissingTabError(error);
  }

  try {
    await _pr92DeadlineRepairRunUntil(
      deadlineAt,
      "CLEANUP_RUNTIME_TAB_CLOSE",
      () => chrome.tabs.remove(tabId)
    );
  } catch (error) {
    if (_pr92DeadlineRepairIsTimeoutError(error)) return false;
    // A concurrent close can race this call. Only explicit subsequent absence
    // proof can turn that race into successful cleanup authority.
  }

  return _pr92DeadlineRepairProveTabAbsent(tabId, deadlineAt);
};

// Never remove the durable fence in the same rich turn after attachment staging.
// Even after cleanup succeeds, returning the completed write takes priority over
// a late storage mutation. The next turn re-proves cleanup before clearing the
// fence and before any subsequent write authority is available.
_pr92TryClearDirtyAttachmentFence = async function _pr92ClearFenceWithinDeadline() {
  const richContext = _pr92ActiveRichInputContext;
  if (richContext !== null && richContext.staged === true) {
    return false;
  }

  const context = _pr92ActiveTurnContext;
  if (context === null) {
    return _pr92DeadlineRepairPriorTryClearDirtyAttachmentFence();
  }

  try {
    return await _pr92DeadlineRepairRunUntil(
      context.deadlineAt,
      "STALE_ATTACHMENT_FENCE_CLEAR",
      async () => {
        await chrome.storage.local.remove(PR92_DIRTY_ATTACHMENT_STORAGE_KEY);
        _pr92DirtyAttachmentTabId = null;
        return true;
      }
    );
  } catch {
    return false;
  }
};

// Advance the no-write support contract so an installed pre-repair overlay cannot
// satisfy the authenticated live gate merely because ordinary writes do not hit
// the deadline edge cases during that run.
executeNativeTurn = async function _executeNativeTurnWithPr92DeadlineRepair(message) {
  const result = await _pr92DeadlineRepairPriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_DEADLINE_REPAIR_SCHEMA,
    preSubmitDeadlineGuard: true,
    deadlineBoundedPostWriteCleanup: true,
    postWriteFenceRetainedUntilNextPrewrite: true,
    enterKeyReleaseAffectsSubmittedOutcome: false,
    mouseToEnterFallbackAfterReleaseAttempt: false,
    mouseReleaseOutcomeAmbiguityFailsClosed: true,
    staleAttachmentCleanupProof: "RUNTIME_TAB_REMOVED_AND_ABSENCE_CONFIRMED"
  };
};

/* END legacy source: service_worker_rich_input_deadline_repair_pr9_2.js */

// PR9.2 final closure repair: page-owned attachment evidence and page-side
// deadline-guarded rich submission. Loaded last so raw CDP Input cannot regain
// protected-write authority for rich turns.

/* BEGIN legacy source: service_worker_rich_input_closure_repair_pr9_2.js */
// PR9.2 final closure repair overlay.
//
// Loaded after the rich-input and deadline-repair overlays. This layer closes two
// remaining authority gaps without changing text-only behavior:
//   1. protected rich-input submission never relies on a non-cancellable CDP
//      Input command; the official page performs a deadline-guarded Send click;
//   2. attachmentCount is accepted only after stable page-owned composer evidence
//      for every requested basename, and that evidence is revalidated immediately
//      before protected submission.

const _pr92ClosurePriorStageOfficialPageAttachments = _pr92StageOfficialPageAttachments;
const _pr92ClosurePriorClickSendButton = clickSendButton;
const _pr92ClosurePriorSubmitWithEnter = submitWithEnter;
const _pr92ClosurePriorSubmitOfficialPageTurn = submitOfficialPageTurn;
const _pr92ClosurePriorExecuteNativeTurn = executeNativeTurn;
const PR92_CLOSURE_REPAIR_SCHEMA = 6;
const PR92_PAGE_ATTACHMENT_EVIDENCE_SOURCE = "PAGE_OWNED_COMPOSER_ATTACHMENT_STATE";
const PR92_PAGE_ATTACHMENT_STABLE_POLLS = 2;
const PR92_PAGE_ATTACHMENT_POLL_MS = 150;
const PR92_PAGE_SUBMIT_DEADLINE_SAFETY_MS = 75;
const PR92_PAGE_GUARDED_SUBMIT_PRIMITIVE = "PAGE_DEADLINE_GUARDED_SEND_BUTTON_CLICK";

function _pr92ClosureExpectedBasenames(attachmentPaths) {
  return attachmentPaths.map((rawPath) => {
    const normalized = String(rawPath || "").replace(/\\/g, "/");
    const parts = normalized.split("/");
    const name = parts[parts.length - 1] || "";
    if (!name) throw new Error("PR9_2_ATTACHMENT_BASENAME_REQUIRED");
    return name;
  });
}

function _pr92ClosureAttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]') ||
      document.querySelector('[contenteditable="true"]');
    const composer = (prompt && prompt.closest('form')) || document.querySelector('form') || document.body;
    if (!composer) {
      return { ready: false, rejected: false, matchedCount: 0, evidenceKind: 'composer-missing' };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const groupLabels = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);
    const removalLabels = Array.from(
      composer.querySelectorAll('button[aria-label], [role="button"][aria-label]')
    )
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter((label) => /remove|delete|discard|удал/i.test(label));

    const matchesExpected = (labels) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => label === name || label.includes(name));
        if (index < 0) return { ready: false, matched };
        pool.splice(index, 1);
        matched += 1;
      }
      return { ready: matched === expected.length, matched };
    };

    const groups = matchesExpected(groupLabels);
    const removals = matchesExpected(removalLabels);
    const ready = groups.ready || removals.ready;
    const matchedCount = Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready,
      rejected,
      matchedCount,
      evidenceKind: groups.ready ? 'role-group-aria-label' :
        (removals.ready ? 'remove-control-aria-label' : 'not-ready')
    };
  })()`;
}

async function _pr92ClosureReadPageOwnedAttachmentEvidence(
  debuggee,
  expectedNames,
  context
) {
  _pr92RemainingTurnMs(context, "PAGE_ATTACHMENT_EVIDENCE_READ");
  const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
    expression: _pr92ClosureAttachmentEvidenceExpression(expectedNames),
    returnByValue: true,
    awaitPromise: true
  });
  _pr92RemainingTurnMs(context, "PAGE_ATTACHMENT_EVIDENCE_READ");
  const value = result?.result?.value;
  if (!value || typeof value !== "object") {
    throw new Error("PR9_2_PAGE_ATTACHMENT_EVIDENCE_INVALID");
  }
  return value;
}

async function _pr92ClosureWaitForPageOwnedAttachmentEvidence(
  debuggee,
  attachmentPaths,
  context,
  stablePolls = PR92_PAGE_ATTACHMENT_STABLE_POLLS
) {
  const expectedNames = _pr92ClosureExpectedBasenames(attachmentPaths);
  let stable = 0;
  while (true) {
    const evidence = await _pr92ClosureReadPageOwnedAttachmentEvidence(
      debuggee,
      expectedNames,
      context
    );
    if (evidence.rejected === true) {
      throw new Error("PR9_2_PAGE_ATTACHMENT_REJECTED");
    }
    if (
      evidence.ready === true &&
      Number(evidence.matchedCount) === expectedNames.length
    ) {
      stable += 1;
      if (stable >= stablePolls) return expectedNames.length;
    } else {
      stable = 0;
    }
    await _pr92BoundedSleep(
      context,
      PR92_PAGE_ATTACHMENT_POLL_MS,
      "PAGE_ATTACHMENT_EVIDENCE_WAIT"
    );
  }
}

// The primary overlay stages with DOM.setFileInputFiles. Do not accept its path
// count as confirmation. Reattach only to observe the official page's composer and
// return a count derived from stable attachment chips/controls instead.
_pr92StageOfficialPageAttachments = async function _pr92StageWithPageOwnedEvidence(
  tabId,
  attachmentPaths,
  context
) {
  const stagedCount = await _pr92ClosurePriorStageOfficialPageAttachments(
    tabId,
    attachmentPaths,
    context
  );
  if (stagedCount !== attachmentPaths.length) {
    throw new Error("PR9_2_ATTACHMENT_STAGE_COUNT_MISMATCH");
  }

  const debuggee = { tabId };
  let attached = false;
  try {
    _pr92RemainingTurnMs(context, "PAGE_ATTACHMENT_EVIDENCE_ATTACH");
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Runtime.enable");
    const pageOwnedCount = await _pr92ClosureWaitForPageOwnedAttachmentEvidence(
      debuggee,
      attachmentPaths,
      context,
      PR92_PAGE_ATTACHMENT_STABLE_POLLS
    );
    if (pageOwnedCount !== attachmentPaths.length) {
      throw new Error("PR9_2_PAGE_ATTACHMENT_COUNT_MISMATCH");
    }
    return pageOwnedCount;
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message.startsWith("PR9_2_TOTAL_TURN_TIMEOUT:") ||
        error.message === "PR9_2_PAGE_ATTACHMENT_REJECTED" ||
        error.message === "PR9_2_PAGE_ATTACHMENT_COUNT_MISMATCH"
      )
    ) {
      throw error;
    }
    throw new Error("PR9_2_PAGE_ATTACHMENT_EVIDENCE_FAILED");
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
  }
};

function _pr92ClosurePageGuardedSubmitExpression(selector, deadlineEpochMs) {
  const encodedSelector = JSON.stringify(selector);
  const encodedDeadline = JSON.stringify(deadlineEpochMs);
  return `(() => {
    const deadlineEpochMs = ${encodedDeadline};
    if (!Number.isFinite(deadlineEpochMs) || Date.now() >= deadlineEpochMs) {
      return { clicked: false, reason: 'deadline-expired' };
    }
    const button = document.querySelector(${encodedSelector});
    if (!(button instanceof HTMLElement)) {
      return { clicked: false, reason: 'send-button-missing' };
    }
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const visible = rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    const disabled = Boolean(button.disabled) || button.getAttribute('aria-disabled') === 'true';
    if (!visible || disabled) {
      return { clicked: false, reason: 'send-button-not-ready' };
    }
    if (Date.now() >= deadlineEpochMs) {
      return { clicked: false, reason: 'deadline-expired' };
    }
    button.click();
    return { clicked: true, reason: 'page-owned-click' };
  })()`;
}

// Raw CDP Input events are non-cancellable after dispatch. They are therefore not
// a valid protected-submit primitive for rich turns: a Promise.race timeout can
// report failure while the queued mouse/key command later reaches the page. Keep
// historical behavior only for text-only turns and fail closed if an older rich
// path somehow tries to invoke these primitives.
clickSendButton = async function _pr92ClosureRejectRawMouseSubmit(debuggee, point) {
  if (_pr92ActiveRichInputContext !== null) {
    throw new Error("PR9_2_RICH_INPUT_RAW_MOUSE_SUBMIT_FORBIDDEN");
  }
  return _pr92ClosurePriorClickSendButton(debuggee, point);
};

submitWithEnter = async function _pr92ClosureRejectRawEnterSubmit(debuggee) {
  if (_pr92ActiveRichInputContext !== null) {
    throw new Error("PR9_2_RICH_INPUT_RAW_ENTER_SUBMIT_FORBIDDEN");
  }
  return _pr92ClosurePriorSubmitWithEnter(debuggee);
};

submitOfficialPageTurn = async function _pr92ClosurePageDeadlineGuardedSubmit(
  debuggee,
  timeoutMs
) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) {
    return _pr92ClosurePriorSubmitOfficialPageTurn(debuggee, timeoutMs);
  }

  // Validate page-owned attachment state before waiting for the Send control. This
  // fails early when staging was rejected, but is not the final authority because
  // upload/composer state may still change while Send readiness is being polled.
  const revalidatedCount = await _pr92ClosureWaitForPageOwnedAttachmentEvidence(
    debuggee,
    context.attachmentPaths,
    context,
    1
  );
  if (revalidatedCount !== context.attachmentPaths.length) {
    throw new Error("PR9_2_PRE_SUBMIT_ATTACHMENT_EVIDENCE_MISMATCH");
  }

  const remaining = _pr92RemainingTurnMs(context, "PAGE_GUARDED_SUBMIT_READY");
  const readyBudget = Math.min(
    remaining,
    Number.isFinite(timeoutMs) ? Math.max(1, Number(timeoutMs)) : DEFAULT_SUBMIT_READY_TIMEOUT_MS,
    DEFAULT_SUBMIT_READY_TIMEOUT_MS
  );
  let point;
  try {
    point = await waitForSendButtonPoint(debuggee, readyBudget);
  } catch (error) {
    _pr92RemainingTurnMs(context, "PAGE_GUARDED_SUBMIT_READY");
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`PR9_2_RICH_INPUT_SEND_BUTTON_NOT_READY:${detail}`);
  }

  const selector = typeof point?.selector === "string" && point.selector
    ? point.selector
    : null;
  if (!selector) throw new Error("PR9_2_SEND_BUTTON_SELECTOR_REQUIRED");

  // Send-readiness polling can outlive an asynchronously rejected upload. Re-read
  // page-owned composer evidence AFTER that wait and immediately before the only
  // protected-submit command. A text-only Send control can therefore never inherit
  // a stale attachmentCount from the earlier staging/readiness phase.
  const postReadinessCount = await _pr92ClosureWaitForPageOwnedAttachmentEvidence(
    debuggee,
    context.attachmentPaths,
    context,
    1
  );
  if (postReadinessCount !== context.attachmentPaths.length) {
    throw new Error("PR9_2_POST_READINESS_ATTACHMENT_EVIDENCE_MISMATCH");
  }

  const submitRemaining = _pr92RemainingTurnMs(context, "PAGE_GUARDED_SUBMIT");
  if (submitRemaining <= PR92_PAGE_SUBMIT_DEADLINE_SAFETY_MS) {
    throw new Error("PR9_2_TOTAL_TURN_TIMEOUT:PAGE_GUARDED_SUBMIT_RESERVE");
  }
  const pageDeadlineEpochMs = Date.now() +
    submitRemaining - PR92_PAGE_SUBMIT_DEADLINE_SAFETY_MS;

  const result = await _pr92DeadlineRepairRunUntil(
    context.deadlineAt,
    "PAGE_GUARDED_SUBMIT",
    () => chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: _pr92ClosurePageGuardedSubmitExpression(
        selector,
        pageDeadlineEpochMs
      ),
      returnByValue: true,
      awaitPromise: true
    })
  );
  const value = result?.result?.value;
  if (value?.clicked !== true) {
    if (value?.reason === "deadline-expired") {
      throw new Error("PR9_2_TOTAL_TURN_TIMEOUT:PAGE_GUARDED_SUBMIT_PAGE_DEADLINE");
    }
    throw new Error(`PR9_2_PAGE_GUARDED_SUBMIT_FAILED:${value?.reason || 'unknown'}`);
  }
  return { strategy: "page_deadline_guarded_send_button_click", selector };
};

executeNativeTurn = async function _executeNativeTurnWithPr92ClosureRepair(message) {
  const result = await _pr92ClosurePriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport === true) {
    return {
      ...result,
      richInputSchemaVersion: PR92_CLOSURE_REPAIR_SCHEMA,
      attachmentCountEvidence: PR92_PAGE_ATTACHMENT_EVIDENCE_SOURCE,
      attachmentEvidenceStablePollCount: PR92_PAGE_ATTACHMENT_STABLE_POLLS,
      preSubmitAttachmentRevalidation: true,
      postSendReadinessAttachmentRevalidation: true,
      protectedSubmitPrimitive: PR92_PAGE_GUARDED_SUBMIT_PRIMITIVE,
      richInputRawCdpInputSubmitDisabled: true,
      richInputEnterFallbackEnabled: false,
      lateProtectedSubmitExecutionPreventedByPageDeadline: true
    };
  }

  if (
    Array.isArray(message?.attachmentPaths) &&
    message.attachmentPaths.length > 0 &&
    result &&
    typeof result === "object"
  ) {
    return {
      ...result,
      attachmentEvidenceSource: PR92_PAGE_ATTACHMENT_EVIDENCE_SOURCE
    };
  }
  return result;
};

/* END legacy source: service_worker_rich_input_closure_repair_pr9_2.js */

// PR9.2 schema-7 final authority repair: atomic attachment validation+submit,
// non-awaited post-click debugger acknowledgement, and session-bound fenced-tab
// identity before destructive cleanup. Loaded last.

/* BEGIN legacy source: service_worker_rich_input_schema7_repair_pr9_2.js */
// PR9.2 schema compatibility loader.
//
// Keep the historical entrypoint import stable while preserving reviewed schema
// generations as immutable layers. PR9.2 schema 29 remains the final rich-input
// authority layer; later product-observation overlays may load after it but do
// not acquire write authority.

/* BEGIN legacy source: service_worker_rich_input_schema7_core_pr9_2.js */
// PR9.2 schema-7 final authority repair.
//
// Loaded after the schema-6 closure overlay. This layer closes the final three
// reviewed races without changing text-only behavior:
//   1. final attachment validation and Send click execute atomically in one
//      page-side expression;
//   2. the debugger acknowledgement of that click is never awaited, so a slow
//      synchronous click handler cannot turn an already-issued write into a local
//      timeout; the existing Network.requestWillBeSent observation remains the
//      first authoritative post-submit proof;
//   3. destructive stale-composer cleanup closes a tab only when a browser-session
//      identity proves that the numeric tab id still belongs to the fenced
//      extension-managed ChatGPT runtime.

const _pr92Schema7PriorPersistDirtyAttachmentFence = _pr92PersistDirtyAttachmentFence;
const _pr92Schema7PriorTryClearDirtyAttachmentFence = _pr92TryClearDirtyAttachmentFence;
const _pr92Schema7PriorClearOfficialPageAttachments = _pr92ClearOfficialPageAttachments;
const _pr92Schema7PriorSubmitOfficialPageTurn = submitOfficialPageTurn;
const _pr92Schema7PriorExecuteNativeTurn = executeNativeTurn;

const PR92_SCHEMA7_REPAIR_SCHEMA = 7;
const PR92_SCHEMA7_SESSION_IDENTITY_KEY = "pr92DirtyAttachmentSessionIdentityV1";
const PR92_SCHEMA7_SUBMIT_OBSERVATION_RESERVE_MS = DEFAULT_SUBMIT_ACK_TIMEOUT_MS + 500;
const PR92_SCHEMA7_PROTECTED_SUBMIT_PRIMITIVE =
  "PAGE_DEADLINE_GUARDED_ATOMIC_ATTACHMENT_VALIDATE_AND_CLICK";
const PR92_SCHEMA7_POST_SUBMIT_PROOF = "NETWORK_REQUEST_OBSERVATION";

function _pr92Schema7NewRuntimeIdentity() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const words = new Uint32Array(4);
  crypto.getRandomValues(words);
  return Array.from(words, (word) => word.toString(16).padStart(8, "0")).join("");
}

async function _pr92Schema7RunUntil(deadlineAt, stage, operation) {
  return _pr92DeadlineRepairRunUntil(deadlineAt, stage, operation);
}

async function _pr92Schema7ReadFenceRecords(deadlineAt) {
  if (!chrome.storage?.session) {
    throw new Error("PR9_2_STALE_ATTACHMENT_SESSION_IDENTITY_UNAVAILABLE");
  }
  const local = await _pr92Schema7RunUntil(
    deadlineAt,
    "CLEANUP_FENCE_LOCAL_IDENTITY_READ",
    () => chrome.storage.local.get(PR92_DIRTY_ATTACHMENT_STORAGE_KEY)
  );
  const session = await _pr92Schema7RunUntil(
    deadlineAt,
    "CLEANUP_FENCE_SESSION_IDENTITY_READ",
    () => chrome.storage.session.get(PR92_SCHEMA7_SESSION_IDENTITY_KEY)
  );
  return {
    local: local?.[PR92_DIRTY_ATTACHMENT_STORAGE_KEY] || null,
    session: session?.[PR92_SCHEMA7_SESSION_IDENTITY_KEY] || null
  };
}

_pr92PersistDirtyAttachmentFence = async function _pr92PersistFenceWithSessionIdentity(tabId) {
  if (!Number.isInteger(tabId)) {
    throw new Error("PR9_2_STALE_ATTACHMENT_FENCE_TAB_REQUIRED");
  }
  if (!chrome.storage?.session) {
    throw new Error("PR9_2_STALE_ATTACHMENT_SESSION_IDENTITY_UNAVAILABLE");
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new Error("PR9_2_STALE_ATTACHMENT_RUNTIME_IDENTITY_UNAVAILABLE");
  }
  if (!isChatGPTUrl(tab?.url || "")) {
    throw new Error("PR9_2_STALE_ATTACHMENT_RUNTIME_IDENTITY_MISMATCH");
  }

  const runtimeIdentity = _pr92Schema7NewRuntimeIdentity();
  try {
    // Browser-session storage deliberately does not survive a browser restart.
    // Local storage remains the durable fence; the session token is only the
    // authority required before destructively closing a still-live tab id.
    await chrome.storage.session.set({
      [PR92_SCHEMA7_SESSION_IDENTITY_KEY]: {
        schema: 1,
        tabId,
        runtimeIdentity
      }
    });
    await chrome.storage.local.set({
      [PR92_DIRTY_ATTACHMENT_STORAGE_KEY]: {
        schema: 2,
        tabId,
        runtimeIdentity
      }
    });
  } catch {
    try { await chrome.storage.session.remove(PR92_SCHEMA7_SESSION_IDENTITY_KEY); } catch {}
    throw new Error("PR9_2_STALE_ATTACHMENT_FENCE_PERSIST_FAILED");
  }
  _pr92DirtyAttachmentTabId = tabId;
};

async function _pr92Schema7ClearFenceStorage() {
  if (!chrome.storage?.session) return false;
  try {
    // Remove the non-authoritative session token first. If the durable local
    // mutation then fails, the local fence remains and the next turn fails closed.
    await chrome.storage.session.remove(PR92_SCHEMA7_SESSION_IDENTITY_KEY);
    await chrome.storage.local.remove(PR92_DIRTY_ATTACHMENT_STORAGE_KEY);
    _pr92DirtyAttachmentTabId = null;
    return true;
  } catch {
    return false;
  }
}

_pr92TryClearDirtyAttachmentFence = async function _pr92Schema7TryClearDirtyAttachmentFence() {
  const richContext = _pr92ActiveRichInputContext;
  if (richContext !== null && richContext.staged === true) return false;

  const context = _pr92ActiveTurnContext;
  if (context === null) return _pr92Schema7ClearFenceStorage();
  try {
    return await _pr92Schema7RunUntil(
      context.deadlineAt,
      "STALE_ATTACHMENT_SCHEMA7_FENCE_CLEAR",
      _pr92Schema7ClearFenceStorage
    );
  } catch {
    return false;
  }
};

_pr92ClearOfficialPageAttachments = async function _pr92Schema7ClearFencedRuntimeTab(
  tabId,
  timeoutMs
) {
  if (!Number.isInteger(tabId) || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return false;
  }

  const richContext = _pr92ActiveRichInputContext;
  if (richContext !== null && richContext.staged === true) {
    return false;
  }

  const deadlineAt = _pr92DeadlineRepairDeadlineFromBudget(timeoutMs);
  let candidate;
  try {
    candidate = await _pr92Schema7RunUntil(
      deadlineAt,
      "CLEANUP_RUNTIME_TAB_LOOKUP",
      () => chrome.tabs.get(tabId)
    );
  } catch (error) {
    if (_pr92DeadlineRepairIsTimeoutError(error)) return false;
    return _pr92DeadlineRepairIsMissingTabError(error);
  }

  // A reused numeric id that now points outside ChatGPT cannot contain the old
  // fenced composer. Treat it as absence of the old runtime and never close it.
  if (!isChatGPTUrl(candidate?.url || "")) return true;

  let currentRuntimeTabId;
  try {
    currentRuntimeTabId = await _pr92Schema7RunUntil(
      deadlineAt,
      "CLEANUP_RUNTIME_IDENTITY_CURRENT_ID",
      () => storedRuntimeTabId()
    );
  } catch {
    return false;
  }
  if (currentRuntimeTabId !== tabId) {
    // The candidate is still a ChatGPT tab. A different current runtime id is not
    // enough evidence that this candidate cannot retain the fenced composer, so
    // retain the durable fence and require explicit/manual recovery.
    return false;
  }

  let records;
  try {
    records = await _pr92Schema7ReadFenceRecords(deadlineAt);
  } catch {
    return false;
  }
  const localIdentity = records.local?.runtimeIdentity;
  const sessionIdentity = records.session?.runtimeIdentity;
  if (
    !Number.isInteger(records.local?.tabId) ||
    records.local.tabId !== tabId ||
    typeof localIdentity !== "string" ||
    !localIdentity
  ) {
    return false;
  }

  if (records.session == null) {
    // Browser restart clears storage.session while the durable local fence remains.
    // A restored/reused ChatGPT tab with the same numeric id is therefore not safe
    // to close automatically. Keep the fence and fail closed instead.
    return false;
  }
  if (
    records.session?.tabId !== tabId ||
    typeof sessionIdentity !== "string" ||
    sessionIdentity !== localIdentity
  ) {
    // A still-live ChatGPT candidate with mismatched identity is ambiguous, not
    // proof of absence. Never close it and never retire the durable fence.
    return false;
  }

  try {
    await _pr92Schema7RunUntil(
      deadlineAt,
      "CLEANUP_RUNTIME_TAB_CLOSE",
      () => chrome.tabs.remove(tabId)
    );
  } catch (error) {
    if (_pr92DeadlineRepairIsTimeoutError(error)) return false;
    // Concurrent removal is acceptable only after explicit absence proof below.
  }
  return _pr92DeadlineRepairProveTabAbsent(tabId, deadlineAt);
};

function _pr92Schema7AtomicAttachmentSubmitExpression(
  selector,
  deadlineEpochMs,
  expectedNames
) {
  const encodedSelector = JSON.stringify(selector);
  const encodedDeadline = JSON.stringify(deadlineEpochMs);
  const encodedExpected = JSON.stringify(expectedNames);
  const evidenceExpression = _pr92ClosureAttachmentEvidenceExpression(expectedNames);
  return `(() => {
    const deadlineEpochMs = ${encodedDeadline};
    const expected = ${encodedExpected};
    if (!Number.isFinite(deadlineEpochMs) || Date.now() >= deadlineEpochMs) {
      return { clicked: false, reason: 'deadline-expired' };
    }

    const evidence = ${evidenceExpression};
    if (evidence && evidence.rejected === true) {
      return { clicked: false, reason: 'attachment-rejected' };
    }
    if (!evidence || evidence.ready !== true || Number(evidence.matchedCount) !== expected.length) {
      return { clicked: false, reason: 'attachment-evidence-missing' };
    }

    const button = document.querySelector(${encodedSelector});
    if (!(button instanceof HTMLElement)) {
      return { clicked: false, reason: 'send-button-missing' };
    }
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const visible = rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    const disabled = Boolean(button.disabled) || button.getAttribute('aria-disabled') === 'true';
    if (!visible || disabled) {
      return { clicked: false, reason: 'send-button-not-ready' };
    }
    if (Date.now() >= deadlineEpochMs) {
      return { clicked: false, reason: 'deadline-expired' };
    }

    // Validation and click are synchronous in this one page task. No page task can
    // remove an attachment between the final evidence check and button.click().
    button.click();
    return { clicked: true, reason: 'atomic-page-owned-click', matchedCount: expected.length };
  })()`;
}

submitOfficialPageTurn = async function _pr92Schema7AtomicAttachmentSubmit(
  debuggee,
  timeoutMs
) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) {
    return _pr92Schema7PriorSubmitOfficialPageTurn(debuggee, timeoutMs);
  }

  // Keep the early page-owned evidence check to fail before a readiness wait when
  // the upload is already rejected. The final authority still lives inside the
  // single atomic page expression below.
  const earlyCount = await _pr92ClosureWaitForPageOwnedAttachmentEvidence(
    debuggee,
    context.attachmentPaths,
    context,
    1
  );
  if (earlyCount !== context.attachmentPaths.length) {
    throw new Error("PR9_2_PRE_SUBMIT_ATTACHMENT_EVIDENCE_MISMATCH");
  }

  const remaining = _pr92RemainingTurnMs(context, "SCHEMA7_SEND_READY");
  const readyBudget = Math.min(
    remaining,
    Number.isFinite(timeoutMs) ? Math.max(1, Number(timeoutMs)) : DEFAULT_SUBMIT_READY_TIMEOUT_MS,
    DEFAULT_SUBMIT_READY_TIMEOUT_MS
  );
  let point;
  try {
    point = await waitForSendButtonPoint(debuggee, readyBudget);
  } catch (error) {
    _pr92RemainingTurnMs(context, "SCHEMA7_SEND_READY");
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`PR9_2_RICH_INPUT_SEND_BUTTON_NOT_READY:${detail}`);
  }

  const selector = typeof point?.selector === "string" && point.selector
    ? point.selector
    : null;
  if (!selector) throw new Error("PR9_2_SEND_BUTTON_SELECTOR_REQUIRED");

  const submitRemaining = _pr92RemainingTurnMs(context, "SCHEMA7_ATOMIC_SUBMIT");
  if (submitRemaining <= PR92_SCHEMA7_SUBMIT_OBSERVATION_RESERVE_MS) {
    throw new Error("PR9_2_TOTAL_TURN_TIMEOUT:SCHEMA7_SUBMIT_OBSERVATION_RESERVE");
  }
  const pageDeadlineEpochMs = Date.now() +
    submitRemaining - PR92_SCHEMA7_SUBMIT_OBSERVATION_RESERVE_MS;
  const expectedNames = _pr92ClosureExpectedBasenames(context.attachmentPaths);
  const expression = _pr92Schema7AtomicAttachmentSubmitExpression(
    selector,
    pageDeadlineEpochMs,
    expectedNames
  );

  // Do not await the debugger acknowledgement after a command that can click.
  // The page-side absolute deadline prevents late execution, while the existing
  // Network.requestWillBeSent listener (installed before submission) proves that
  // a protected conversation write actually occurred. No retry is introduced.
  try {
    const pending = chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: false
    });
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`PR9_2_ATOMIC_SUBMIT_DISPATCH_FAILED:${detail}`);
  }

  return {
    strategy: "page_deadline_guarded_atomic_attachment_validate_and_click",
    selector
  };
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema7Repair(message) {
  const result = await _pr92Schema7PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA7_REPAIR_SCHEMA,
    postSendReadinessAttachmentRevalidation: true,
    atomicAttachmentValidationAndSubmit: true,
    protectedSubmitPrimitive: PR92_SCHEMA7_PROTECTED_SUBMIT_PRIMITIVE,
    postClickDebuggerAckRequired: false,
    protectedSubmitOutcomeProof: PR92_SCHEMA7_POST_SUBMIT_PROOF,
    submitObservationReserveMs: PR92_SCHEMA7_SUBMIT_OBSERVATION_RESERVE_MS,
    staleAttachmentCleanupRequiresSessionRuntimeIdentity: true,
    staleAttachmentIdentityMismatchClosesTab: false,
    staleAttachmentIdentityMismatchFailsClosed: true,
    staleAttachmentUnprovenIdentityFailsClosed: true
  };
};

/* END legacy source: service_worker_rich_input_schema7_core_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema8_repair_pr9_2.js */
// PR9.2 schema-8 closure repair.
//
// Loaded after schema 7. This layer closes two final review findings while
// preserving every previous rich-input authority boundary:
//   1. the composer must be attachment-clean before staging and page-owned
//      attachment evidence must describe the exact requested set, not merely a
//      requested subset;
//   2. destructive stale-runtime cleanup revalidates URL/runtime/fence ownership
//      immediately before tab removal and aborts if ownership changes while the
//      proof is being assembled.

const _pr92Schema8PriorStageOfficialPageAttachments = _pr92StageOfficialPageAttachments;
const _pr92Schema8PriorExecuteNativeTurn = executeNativeTurn;

const PR92_SCHEMA8_REPAIR_SCHEMA = 8;
const PR92_SCHEMA8_PRESTAGE_CLEAN_STABLE_POLLS = 2;

function _pr92Schema8AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]') ||
      document.querySelector('[contenteditable="true"]');
    const composer = (prompt && prompt.closest('form')) || document.querySelector('form') || document.body;
    if (!composer) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        evidenceKind: 'composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const groupLabels = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);
    const removalLabels = Array.from(
      composer.querySelectorAll('button[aria-label], [role="button"][aria-label]')
    )
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter((label) => /remove|delete|discard|удал/i.test(label));

    const matchesExpectedExactly = (labels) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => label === name || label.includes(name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels);
    const removals = matchesExpectedExactly(removalLabels);
    const candidateCountsWithinExpected =
      groupLabels.length <= expected.length && removalLabels.length <= expected.length;
    const exactAttachmentSet = candidateCountsWithinExpected &&
      (groups.exact || removals.exact);
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      evidenceKind: groups.exact ? 'exact-role-group-aria-label-set' :
        (removals.exact ? 'exact-remove-control-aria-label-set' : 'not-ready')
    };
  })()`;
}

// Every later evidence read—including schema 7's atomic final validator—uses the
// exact-set expression. An old same-name chip cannot satisfy the turn because the
// schema-8 staging wrapper first proves the composer contains no attachment evidence.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema8AttachmentEvidenceExpression;

async function _pr92Schema8RequireAttachmentCleanComposerBeforeStaging(tabId, context) {
  const debuggee = { tabId };
  let attached = false;
  try {
    _pr92RemainingTurnMs(context, "SCHEMA8_PRESTAGE_CLEAN_ATTACH");
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await chrome.debugger.sendCommand(debuggee, "Runtime.enable");

    let stable = 0;
    while (stable < PR92_SCHEMA8_PRESTAGE_CLEAN_STABLE_POLLS) {
      const evidence = await _pr92ClosureReadPageOwnedAttachmentEvidence(
        debuggee,
        [],
        context
      );
      const groupCount = Number(evidence?.groupLabelCount);
      const removalCount = Number(evidence?.removalLabelCount);
      const clean = evidence?.exactAttachmentSet === true &&
        groupCount === 0 && removalCount === 0;
      if (!clean) {
        throw new Error("PR9_2_PREEXISTING_COMPOSER_ATTACHMENT_PRESENT");
      }
      stable += 1;
      if (stable < PR92_SCHEMA8_PRESTAGE_CLEAN_STABLE_POLLS) {
        await _pr92BoundedSleep(
          context,
          PR92_PAGE_ATTACHMENT_POLL_MS,
          "SCHEMA8_PRESTAGE_CLEAN_STABILITY"
        );
      }
    }
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
  }
}

_pr92StageOfficialPageAttachments = async function _pr92Schema8StageFromCleanComposer(
  tabId,
  attachmentPaths,
  context
) {
  if (attachmentPaths.length === 0) return 0;
  await _pr92Schema8RequireAttachmentCleanComposerBeforeStaging(tabId, context);
  return _pr92Schema8PriorStageOfficialPageAttachments(tabId, attachmentPaths, context);
};

function _pr92Schema8FenceIdentityMatches(records, tabId) {
  const localIdentity = records?.local?.runtimeIdentity;
  const sessionIdentity = records?.session?.runtimeIdentity;
  return Boolean(
    Number.isInteger(records?.local?.tabId) &&
    records.local.tabId === tabId &&
    Number.isInteger(records?.session?.tabId) &&
    records.session.tabId === tabId &&
    typeof localIdentity === "string" &&
    localIdentity &&
    typeof sessionIdentity === "string" &&
    sessionIdentity === localIdentity
  );
}

_pr92ClearOfficialPageAttachments = async function _pr92Schema8ClearFencedRuntimeTab(
  tabId,
  timeoutMs
) {
  if (!Number.isInteger(tabId) || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return false;
  }

  const richContext = _pr92ActiveRichInputContext;
  if (richContext !== null && richContext.staged === true) return false;

  const deadlineAt = _pr92DeadlineRepairDeadlineFromBudget(timeoutMs);
  let candidate;
  try {
    candidate = await _pr92Schema7RunUntil(
      deadlineAt,
      "CLEANUP_RUNTIME_TAB_LOOKUP",
      () => chrome.tabs.get(tabId)
    );
  } catch (error) {
    if (_pr92DeadlineRepairIsTimeoutError(error)) return false;
    return _pr92DeadlineRepairIsMissingTabError(error);
  }

  // A non-ChatGPT reused numeric id cannot contain the old ChatGPT composer and
  // is never destructively closed.
  if (!isChatGPTUrl(candidate?.url || "")) return true;

  let ownershipInvalidated = false;
  let closeDispatched = false;
  const onUpdated = (updatedTabId, changeInfo) => {
    if (
      !closeDispatched &&
      updatedTabId === tabId &&
      (typeof changeInfo?.url === "string" || changeInfo?.status === "loading")
    ) {
      ownershipInvalidated = true;
    }
  };
  const onRemoved = (removedTabId) => {
    if (!closeDispatched && removedTabId === tabId) ownershipInvalidated = true;
  };
  const onStorageChanged = (changes, areaName) => {
    if (closeDispatched) return;
    if (
      areaName === "local" &&
      (Object.prototype.hasOwnProperty.call(changes, RUNTIME_TAB_KEY) ||
       Object.prototype.hasOwnProperty.call(changes, PR92_DIRTY_ATTACHMENT_STORAGE_KEY))
    ) {
      ownershipInvalidated = true;
    }
    if (
      areaName === "session" &&
      Object.prototype.hasOwnProperty.call(changes, PR92_SCHEMA7_SESSION_IDENTITY_KEY)
    ) {
      ownershipInvalidated = true;
    }
  };

  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);
  if (chrome.storage?.onChanged) chrome.storage.onChanged.addListener(onStorageChanged);

  try {
    let currentRuntimeTabId;
    let records;
    try {
      currentRuntimeTabId = await _pr92Schema7RunUntil(
        deadlineAt,
        "CLEANUP_RUNTIME_IDENTITY_CURRENT_ID",
        () => storedRuntimeTabId()
      );
      records = await _pr92Schema7ReadFenceRecords(deadlineAt);
    } catch {
      return false;
    }
    if (
      ownershipInvalidated ||
      currentRuntimeTabId !== tabId ||
      !_pr92Schema8FenceIdentityMatches(records, tabId)
    ) {
      return false;
    }

    // Re-read every destructive authority input after the potentially slow record
    // reads. The final tab snapshot is deliberately the last awaited proof before
    // chrome.tabs.remove() is dispatched.
    let finalRecords;
    let finalRuntimeTabId;
    let finalCandidate;
    try {
      finalRecords = await _pr92Schema7ReadFenceRecords(deadlineAt);
      finalRuntimeTabId = await _pr92Schema7RunUntil(
        deadlineAt,
        "CLEANUP_RUNTIME_IDENTITY_FINAL_ID",
        () => storedRuntimeTabId()
      );
      finalCandidate = await _pr92Schema7RunUntil(
        deadlineAt,
        "CLEANUP_RUNTIME_TAB_FINAL_LOOKUP",
        () => chrome.tabs.get(tabId)
      );
    } catch {
      return false;
    }

    if (
      ownershipInvalidated ||
      finalRuntimeTabId !== tabId ||
      !_pr92Schema8FenceIdentityMatches(finalRecords, tabId) ||
      !isChatGPTUrl(finalCandidate?.url || "") ||
      finalCandidate.url !== candidate.url
    ) {
      return false;
    }

    // No await occurs between the last authority check and dispatch of the close.
    closeDispatched = true;
    let removal;
    try {
      removal = chrome.tabs.remove(tabId);
    } catch {
      return false;
    }
    try {
      await _pr92Schema7RunUntil(
        deadlineAt,
        "CLEANUP_RUNTIME_TAB_CLOSE",
        () => removal
      );
    } catch (error) {
      if (_pr92DeadlineRepairIsTimeoutError(error)) return false;
      // A concurrent close is accepted only after explicit absence proof below.
    }
    return _pr92DeadlineRepairProveTabAbsent(tabId, deadlineAt);
  } finally {
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
    if (chrome.storage?.onChanged) chrome.storage.onChanged.removeListener(onStorageChanged);
  }
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema8Repair(message) {
  const result = await _pr92Schema8PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA8_REPAIR_SCHEMA,
    preStageComposerAttachmentClean: true,
    exactComposerAttachmentSetRequired: true,
    destructiveCleanupAuthorityRevalidatedAtClose: true,
    destructiveCleanupOwnershipChangeFailsClosed: true
  };
};

/* END legacy source: service_worker_rich_input_schema8_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema9_repair_pr9_2.js */
// PR9.2 schema-9 exact-evidence repair.
//
// Schema 8 correctly required a clean composer before staging and exactness within
// each page-owned evidence channel, but its final OR allowed one exact channel to
// mask a different non-exact channel. Example: groupLabels=[requested] and
// removalLabels=[extra] could still satisfy groups.exact || removals.exact.
// Schema 9 requires every non-empty evidence channel to be exact, so no observed
// extra/partial attachment evidence can be hidden by another channel.

const _pr92Schema9PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA9_REPAIR_SCHEMA = 9;

function _pr92Schema9AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]') ||
      document.querySelector('[contenteditable="true"]');
    const composer = (prompt && prompt.closest('form')) || document.querySelector('form') || document.body;
    if (!composer) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        crossEvidenceChannelExact: false,
        evidenceKind: 'composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const groupLabels = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);
    const removalLabels = Array.from(
      composer.querySelectorAll('button[aria-label], [role="button"][aria-label]')
    )
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter((label) => /remove|delete|discard|удал/i.test(label));

    const matchesExpectedExactly = (labels) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => label === name || label.includes(name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels);
    const removals = matchesExpectedExactly(removalLabels);
    const groupsCompatible = groupLabels.length === 0 || groups.exact;
    const removalsCompatible = removalLabels.length === 0 || removals.exact;
    const atLeastOneExpectedChannelExact = groups.exact || removals.exact;
    const crossEvidenceChannelExact = expected.length === 0
      ? groups.exact && removals.exact
      : groupsCompatible && removalsCompatible && atLeastOneExpectedChannelExact;
    const exactAttachmentSet = crossEvidenceChannelExact;
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      crossEvidenceChannelExact,
      evidenceKind: groups.exact && removals.exact ? 'exact-both-evidence-channels' :
        (groups.exact && removalLabels.length === 0 ? 'exact-role-group-channel' :
          (removals.exact && groupLabels.length === 0 ? 'exact-remove-control-channel' : 'not-ready'))
    };
  })()`;
}

// This late override is consumed dynamically by schema 8 pre-stage checks,
// post-stage stable evidence, and schema 7's synchronous atomic final validator.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema9AttachmentEvidenceExpression;

executeNativeTurn = async function _executeNativeTurnWithPr92Schema9Repair(message) {
  const result = await _pr92Schema9PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA9_REPAIR_SCHEMA,
    crossEvidenceChannelExactness: true
  };
};

/* END legacy source: service_worker_rich_input_schema9_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema10_repair_pr9_2.js */
// PR9.2 schema-10 official-composer / basename / pre-stage deadline repair.
//
// Loaded after schema 9. This layer closes three fresh closure-review findings:
//   1. page-owned attachment evidence is unavailable until the official prompt
//      composer is mounted; document.body or an arbitrary form is never clean proof;
//   2. requested basenames are associated without substring aliases such as
//      report.txt <- old-report.txt;
//   3. pre-stage debugger attach/Runtime.enable are bounded by the one outer rich
//      turn deadline, and a late attach completion is followed by best-effort detach.

const _pr92Schema10PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA10_REPAIR_SCHEMA = 10;
const PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS = 2;

function _pr92Schema10AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]');
    const composer = prompt instanceof Element ? prompt.closest('form') : null;
    if (!(prompt instanceof Element) || !(composer instanceof Element)) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        crossEvidenceChannelExact: false,
        officialComposerMounted: false,
        exactBasenameAssociation: false,
        evidenceKind: 'official-composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const groupLabels = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);
    const removalLabels = Array.from(
      composer.querySelectorAll('button[aria-label], [role="button"][aria-label]')
    )
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter((label) => /remove|delete|discard|удал/i.test(label));

    const exactGroupBasename = (label, name) => label === name;
    const exactRemovalBasename = (label, name) => {
      if (label === name) return true;
      if (!label.endsWith(name)) return false;
      const prefix = label.slice(0, label.length - name.length);
      if (!prefix) return true;
      // A whole-basename association may be preceded by whitespace or UI quoting,
      // but never by filename characters such as '-', '_', '.', or alphanumerics.
      return /[\\s\"'(:\\[]$/.test(prefix);
    };

    const matchesExpectedExactly = (labels, matcher) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => matcher(label, name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels, exactGroupBasename);
    const removals = matchesExpectedExactly(removalLabels, exactRemovalBasename);
    const groupsCompatible = groupLabels.length === 0 || groups.exact;
    const removalsCompatible = removalLabels.length === 0 || removals.exact;
    const atLeastOneExpectedChannelExact = groups.exact || removals.exact;
    const crossEvidenceChannelExact = expected.length === 0
      ? groups.exact && removals.exact
      : groupsCompatible && removalsCompatible && atLeastOneExpectedChannelExact;
    const exactAttachmentSet = crossEvidenceChannelExact;
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      crossEvidenceChannelExact,
      officialComposerMounted: true,
      exactBasenameAssociation: true,
      evidenceKind: groups.exact && removals.exact ? 'exact-both-evidence-channels' :
        (groups.exact && removalLabels.length === 0 ? 'exact-role-group-channel' :
          (removals.exact && groupLabels.length === 0 ? 'exact-remove-control-channel' : 'not-ready'))
    };
  })()`;
}

// Every schema-8/9 clean/stable read and schema-7 atomic final validation resolves
// this binding at call time, so all later evidence uses schema-10 semantics.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema10AttachmentEvidenceExpression;

function _pr92Schema10BestEffortDetach(debuggee) {
  try {
    const pending = chrome.debugger.detach(debuggee);
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {}
}

async function _pr92Schema10RequireOfficialCleanComposerBeforeStaging(tabId, context) {
  const debuggee = { tabId };
  let attached = false;
  let attachPending = null;
  try {
    _pr92RemainingTurnMs(context, "SCHEMA10_PRESTAGE_CLEAN_ATTACH");
    try {
      attachPending = chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    } catch (error) {
      throw error;
    }
    if (attachPending && typeof attachPending.catch === "function") {
      attachPending.catch(() => {});
    }
    try {
      await _pr92Schema7RunUntil(
        context.deadlineAt,
        "SCHEMA10_PRESTAGE_CLEAN_DEBUGGER_ATTACH",
        () => attachPending
      );
      attached = true;
    } catch (error) {
      // Runtime debugger commands are not cancellable. If the attach itself wins
      // after our deadline race already failed, immediately relinquish that late
      // ownership instead of leaving the next turn blocked by a ghost attachment.
      if (attachPending && typeof attachPending.then === "function") {
        attachPending.then(
          () => _pr92Schema10BestEffortDetach(debuggee),
          () => {}
        );
      }
      throw error;
    }

    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA10_PRESTAGE_CLEAN_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );

    let stable = 0;
    while (stable < PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS) {
      const evidence = await _pr92ClosureReadPageOwnedAttachmentEvidence(
        debuggee,
        [],
        context
      );
      const groupCount = Number(evidence?.groupLabelCount);
      const removalCount = Number(evidence?.removalLabelCount);
      const clean = evidence?.officialComposerMounted === true &&
        evidence?.exactBasenameAssociation === true &&
        evidence?.exactAttachmentSet === true &&
        groupCount === 0 && removalCount === 0;
      if (!clean) {
        throw new Error("PR9_2_OFFICIAL_COMPOSER_NOT_CLEAN_BEFORE_STAGING");
      }
      stable += 1;
      if (stable < PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS) {
        await _pr92BoundedSleep(
          context,
          PR92_PAGE_ATTACHMENT_POLL_MS,
          "SCHEMA10_PRESTAGE_CLEAN_STABILITY"
        );
      }
    }
  } finally {
    if (attached) _pr92Schema10BestEffortDetach(debuggee);
  }
}

// Bypass only schema 8's unbounded pre-stage wrapper. The captured schema-8 prior
// points to the already-governed staging implementation before schema 8 was loaded.
_pr92StageOfficialPageAttachments = async function _pr92Schema10StageFromOfficialCleanComposer(
  tabId,
  attachmentPaths,
  context
) {
  if (attachmentPaths.length === 0) return 0;
  await _pr92Schema10RequireOfficialCleanComposerBeforeStaging(tabId, context);
  return _pr92Schema8PriorStageOfficialPageAttachments(tabId, attachmentPaths, context);
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema10Repair(message) {
  const result = await _pr92Schema10PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA10_REPAIR_SCHEMA,
    officialComposerRequiredForAttachmentEvidence: true,
    exactBasenameAssociationRequired: true,
    preStageDebuggerSetupDeadlineBounded: true,
    latePreStageDebuggerAttachAutoDetached: true
  };
};

/* END legacy source: service_worker_rich_input_schema10_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema11_repair_pr9_2.js */
// PR9.2 schema-11 structured-basename / evidence-read deadline repair.
//
// Loaded after schema 10. This immutable layer closes the two fresh final-review
// findings without weakening any earlier rich-input authority contract:
//   1. removal-control evidence is parsed as a complete action payload and the
//      resulting basename must equal the requested basename exactly; suffix
//      aliases such as report.txt <- "Remove old report.txt" are impossible;
//   2. every page-owned attachment evidence read is raced against the one outer
//      rich-turn deadline instead of awaiting a raw Runtime.evaluate indefinitely.

const _pr92Schema11PriorExecuteNativeTurn = executeNativeTurn;
const _pr92Schema11PriorReadPageOwnedAttachmentEvidence =
  _pr92ClosureReadPageOwnedAttachmentEvidence;
const PR92_SCHEMA11_REPAIR_SCHEMA = 11;

function _pr92Schema11AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]');
    const composer = prompt instanceof Element ? prompt.closest('form') : null;
    if (!(prompt instanceof Element) || !(composer instanceof Element)) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        crossEvidenceChannelExact: false,
        officialComposerMounted: false,
        exactBasenameAssociation: false,
        structuredRemovalBasenameAssociation: false,
        evidenceKind: 'official-composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const groupLabels = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);
    const removalLabels = Array.from(
      composer.querySelectorAll('button[aria-label], [role="button"][aria-label]')
    )
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter((label) => /^(remove|delete|discard|удалить)(?:\\s+|:\\s*)/i.test(label));

    const exactGroupBasename = (label, name) => label === name;
    const removalControlBasename = (label) => {
      const value = normalize(label);
      const action = value.match(/^(?:remove|delete|discard|удалить)(?:\\s+|:\\s*)/i);
      if (!action) return '';
      // Treat the complete post-action payload literally. Do not strip quotes,
      // punctuation, prefixes, or suffixes: any ambiguity must fail closed.
      return value.slice(action[0].length).trim();
    };
    const exactRemovalBasename = (label, name) => removalControlBasename(label) === name;

    const matchesExpectedExactly = (labels, matcher) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => matcher(label, name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels, exactGroupBasename);
    const removals = matchesExpectedExactly(removalLabels, exactRemovalBasename);
    const groupsCompatible = groupLabels.length === 0 || groups.exact;
    const removalsCompatible = removalLabels.length === 0 || removals.exact;
    const atLeastOneExpectedChannelExact = groups.exact || removals.exact;
    const crossEvidenceChannelExact = expected.length === 0
      ? groups.exact && removals.exact
      : groupsCompatible && removalsCompatible && atLeastOneExpectedChannelExact;
    const exactAttachmentSet = crossEvidenceChannelExact;
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      crossEvidenceChannelExact,
      officialComposerMounted: true,
      exactBasenameAssociation: true,
      structuredRemovalBasenameAssociation: true,
      evidenceKind: groups.exact && removals.exact ? 'exact-both-evidence-channels' :
        (groups.exact && removalLabels.length === 0 ? 'exact-role-group-channel' :
          (removals.exact && groupLabels.length === 0 ? 'exact-structured-remove-control-channel' : 'not-ready'))
    };
  })()`;
}

// Schema-7 atomic submit and every schema-8/9/10 evidence poll resolve this
// binding at call time, so the structured association is authoritative everywhere.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema11AttachmentEvidenceExpression;

// Bound the shared evidence-read primitive itself. The historical implementation
// performs the Runtime.evaluate and value-shape validation; schema 11 only adds the
// missing outer-deadline race around that complete read. A late DOM read has no
// write authority and cannot change the already-reported timeout outcome.
_pr92ClosureReadPageOwnedAttachmentEvidence = async function _pr92Schema11ReadPageOwnedAttachmentEvidence(
  debuggee,
  expectedNames,
  context
) {
  return _pr92Schema7RunUntil(
    context.deadlineAt,
    "SCHEMA11_PAGE_ATTACHMENT_EVIDENCE_READ",
    () => _pr92Schema11PriorReadPageOwnedAttachmentEvidence(
      debuggee,
      expectedNames,
      context
    )
  );
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema11Repair(message) {
  const result = await _pr92Schema11PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA11_REPAIR_SCHEMA,
    structuredRemovalControlBasenameParsing: true,
    attachmentEvidenceReadsDeadlineBounded: true
  };
};

/* END legacy source: service_worker_rich_input_schema11_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema12_repair_pr9_2.js */
// PR9.2 schema-12 post-stage / send-readiness deadline repair.
//
// Loaded after schema 11. This immutable layer closes the two fresh exact-head
// closure-review findings without weakening any earlier rich-input authority:
//   1. the post-stage debugger attach + Runtime.enable used to observe page-owned
//      attachment evidence are bounded by the one outer rich-turn deadline, with
//      best-effort detach if a non-cancellable attach completes only after timeout;
//   2. the complete Send-readiness wait is bounded by that same outer deadline,
//      including any stalled Runtime.evaluate inside querySendButtonPoint.

const _pr92Schema12PriorExecuteNativeTurn = executeNativeTurn;
const _pr92Schema12PriorWaitForSendButtonPoint = waitForSendButtonPoint;
const PR92_SCHEMA12_REPAIR_SCHEMA = 12;

function _pr92Schema12BestEffortDetach(debuggee) {
  // Reuse schema 10's reviewed non-blocking detach semantics when available.
  if (typeof _pr92Schema10BestEffortDetach === "function") {
    _pr92Schema10BestEffortDetach(debuggee);
    return;
  }
  try {
    const pending = chrome.debugger.detach(debuggee);
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {}
}

async function _pr92Schema12ObservePostStageAttachmentEvidence(
  tabId,
  attachmentPaths,
  context
) {
  const debuggee = { tabId };
  let attached = false;
  let attachPending = null;
  try {
    _pr92RemainingTurnMs(context, "SCHEMA12_POSTSTAGE_EVIDENCE_ATTACH");
    attachPending = chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    if (attachPending && typeof attachPending.catch === "function") {
      attachPending.catch(() => {});
    }

    try {
      await _pr92Schema7RunUntil(
        context.deadlineAt,
        "SCHEMA12_POSTSTAGE_DEBUGGER_ATTACH",
        () => attachPending
      );
      attached = true;
    } catch (error) {
      // debugger.attach cannot be cancelled. If it acquires ownership after the
      // deadline race has already failed, relinquish that late ownership without
      // extending or changing the reported timeout outcome.
      if (attachPending && typeof attachPending.then === "function") {
        attachPending.then(
          () => _pr92Schema12BestEffortDetach(debuggee),
          () => {}
        );
      }
      throw error;
    }

    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA12_POSTSTAGE_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );

    const pageOwnedCount = await _pr92ClosureWaitForPageOwnedAttachmentEvidence(
      debuggee,
      attachmentPaths,
      context,
      PR92_PAGE_ATTACHMENT_STABLE_POLLS
    );
    if (pageOwnedCount !== attachmentPaths.length) {
      throw new Error("PR9_2_PAGE_ATTACHMENT_COUNT_MISMATCH");
    }
    return pageOwnedCount;
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message.startsWith("PR9_2_TOTAL_TURN_TIMEOUT:") ||
        error.message === "PR9_2_PAGE_ATTACHMENT_REJECTED" ||
        error.message === "PR9_2_PAGE_ATTACHMENT_COUNT_MISMATCH"
      )
    ) {
      throw error;
    }
    throw new Error("PR9_2_PAGE_ATTACHMENT_EVIDENCE_FAILED");
  } finally {
    if (attached) _pr92Schema12BestEffortDetach(debuggee);
  }
}

// Replace the schema-10 -> schema-8 -> closure staging path only at its post-stage
// observer boundary. Schema 10 still proves the official composer clean before any
// file selection. The closure-captured prior is the already-reviewed staging path
// that performs DOM.setFileInputFiles and persists the durable fence. After it
// returns, schema 12 performs the same stable latest-generation page-owned evidence
// proof with deadline-bounded debugger setup.
_pr92StageOfficialPageAttachments = async function _pr92Schema12StageWithBoundedPostStageEvidence(
  tabId,
  attachmentPaths,
  context
) {
  if (attachmentPaths.length === 0) return 0;

  await _pr92Schema10RequireOfficialCleanComposerBeforeStaging(tabId, context);
  const stagedCount = await _pr92ClosurePriorStageOfficialPageAttachments(
    tabId,
    attachmentPaths,
    context
  );
  if (stagedCount !== attachmentPaths.length) {
    throw new Error("PR9_2_ATTACHMENT_STAGE_COUNT_MISMATCH");
  }

  return _pr92Schema12ObservePostStageAttachmentEvidence(
    tabId,
    attachmentPaths,
    context
  );
};

// Schema 7 owns the final atomic attachment-validation + click implementation, but
// its readiness helper can internally await Runtime.evaluate beyond readyBudget.
// Bound the complete helper invocation by the authoritative outer rich-turn deadline.
// A late readiness read has no write authority and cannot trigger submission.
waitForSendButtonPoint = async function _pr92Schema12DeadlineBoundedSendReadiness(
  debuggee,
  timeoutMs
) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) {
    return _pr92Schema12PriorWaitForSendButtonPoint(debuggee, timeoutMs);
  }
  return _pr92Schema7RunUntil(
    context.deadlineAt,
    "SCHEMA12_SEND_READINESS_WAIT",
    () => _pr92Schema12PriorWaitForSendButtonPoint(debuggee, timeoutMs)
  );
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema12Repair(message) {
  const result = await _pr92Schema12PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA12_REPAIR_SCHEMA,
    postStageDebuggerSetupDeadlineBounded: true,
    latePostStageDebuggerAttachAutoDetached: true,
    sendReadinessWaitDeadlineBounded: true
  };
};

/* END legacy source: service_worker_rich_input_schema12_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema13_repair_pr9_2.js */
// PR9.2 schema-13 attachment-staging deadline repair.
//
// Loaded after schema 12. This immutable layer closes the fresh exact-head
// review finding that the *actual* file-selection staging primitive still used
// raw CDP awaits captured from schema 1. Every awaited staging phase is now
// governed by the one outer rich-turn deadline. Non-cancellable file selection
// is dispatched only after the durable stale-composer fence has been proven;
// if its acknowledgement loses the deadline race, the turn fails closed and
// the fence remains authoritative for the next prewrite cleanup.

const _pr92Schema13PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA13_REPAIR_SCHEMA = 13;

function _pr92Schema13BestEffortDetach(debuggee) {
  if (typeof _pr92Schema12BestEffortDetach === "function") {
    _pr92Schema12BestEffortDetach(debuggee);
    return;
  }
  try {
    const pending = chrome.debugger.detach(debuggee);
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {}
}

function _pr92Schema13BestEffortReleaseObject(debuggee, objectId) {
  if (typeof objectId !== "string" || !objectId) return;
  try {
    const pending = chrome.debugger.sendCommand(
      debuggee,
      "Runtime.releaseObject",
      { objectId }
    );
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {}
}

async function _pr92Schema13AttachWithinDeadline(debuggee, context) {
  _pr92RemainingTurnMs(context, "SCHEMA13_STAGE_DEBUGGER_ATTACH");
  let attachPending;
  try {
    attachPending = chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
  } catch (error) {
    throw error;
  }
  if (attachPending && typeof attachPending.catch === "function") {
    attachPending.catch(() => {});
  }

  try {
    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA13_STAGE_DEBUGGER_ATTACH",
      () => attachPending
    );
    return true;
  } catch (error) {
    // debugger.attach cannot be cancelled. If ownership is acquired only after
    // the local timeout, relinquish it without extending/changing the outcome.
    if (attachPending && typeof attachPending.then === "function") {
      attachPending.then(
        () => _pr92Schema13BestEffortDetach(debuggee),
        () => {}
      );
    }
    throw error;
  }
}

async function _pr92Schema13FindFileInputWithinDeadline(debuggee, context, stage) {
  return _pr92Schema7RunUntil(
    context.deadlineAt,
    stage,
    () => _pr92FindFileInputObjectId(debuggee)
  );
}

async function _pr92Schema13RevealFileInputWithinDeadline(debuggee, context) {
  const remaining = _pr92RemainingTurnMs(context, "SCHEMA13_REVEAL_FILE_INPUT");
  const pageDeadlineEpochMs = Date.now() + remaining;
  const encodedDeadline = JSON.stringify(pageDeadlineEpochMs);
  const expression = `(() => {
    const deadlineEpochMs = ${encodedDeadline};
    if (!Number.isFinite(deadlineEpochMs) || Date.now() >= deadlineEpochMs) {
      return null;
    }
    const selectors = [
      'button[data-testid="composer-plus-btn"]',
      'button[data-testid="composer-button-add-files"]',
      'button[aria-label*="Attach"]',
      'button[aria-label*="attach"]',
      'button[aria-label*="Upload"]',
      'button[aria-label*="Add files"]',
      'button[aria-label*="Прикреп"]'
    ];
    for (const selector of selectors) {
      if (Date.now() >= deadlineEpochMs) return null;
      const button = document.querySelector(selector);
      if (!(button instanceof HTMLElement)) continue;
      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = getComputedStyle(button);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
      if (Date.now() >= deadlineEpochMs) return null;
      button.click();
      return selector;
    }
    return null;
  })()`;

  try {
    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA13_REVEAL_FILE_INPUT_EVALUATE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: false
      })
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("PR9_2_TOTAL_TURN_TIMEOUT:")
    ) {
      throw error;
    }
    // Reveal remains only a compatibility aid. A non-timeout failure falls
    // through to the second bounded file-input lookup and fails closed there.
  }

  await _pr92BoundedSleep(
    context,
    100,
    "SCHEMA13_REVEAL_FILE_INPUT_SETTLE"
  );
}

async function _pr92Schema13StageFileSelection(tabId, attachmentPaths, context) {
  if (attachmentPaths.length === 0) return 0;

  const debuggee = { tabId };
  let attached = false;
  let objectId = null;
  try {
    attached = await _pr92Schema13AttachWithinDeadline(debuggee, context);

    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA13_STAGE_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );
    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA13_STAGE_DOM_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "DOM.enable")
    );

    const readyBudget = Math.min(
      _pr92RemainingTurnMs(context, "SCHEMA13_STAGE_COMPOSER_READY"),
      DEFAULT_READY_TIMEOUT_MS
    );
    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA13_STAGE_COMPOSER_READY",
      () => waitForComposerReady(debuggee, readyBudget)
    );

    objectId = await _pr92Schema13FindFileInputWithinDeadline(
      debuggee,
      context,
      "SCHEMA13_STAGE_FILE_INPUT_LOOKUP"
    );
    if (!objectId) {
      await _pr92Schema13RevealFileInputWithinDeadline(debuggee, context);
      objectId = await _pr92Schema13FindFileInputWithinDeadline(
        debuggee,
        context,
        "SCHEMA13_STAGE_FILE_INPUT_LOOKUP_AFTER_REVEAL"
      );
    }
    if (!objectId) throw new Error("PR9_2_FILE_INPUT_NOT_FOUND");

    // The fence is the authority that makes a late/non-cancellable file selection
    // fail closed. Do not dispatch DOM.setFileInputFiles until persistence itself
    // has completed inside the outer deadline.
    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA13_STAGE_FENCE_PERSIST",
      () => _pr92PersistDirtyAttachmentFence(tabId)
    );
    if (!Number.isInteger(_pr92DirtyAttachmentTabId) || _pr92DirtyAttachmentTabId !== tabId) {
      throw new Error("PR9_2_STALE_ATTACHMENT_FENCE_PERSIST_FAILED");
    }

    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA13_STAGE_FILE_SELECTION",
      () => chrome.debugger.sendCommand(debuggee, "DOM.setFileInputFiles", {
        files: attachmentPaths,
        objectId
      })
    );

    await _pr92BoundedSleep(
      context,
      100,
      "SCHEMA13_STAGE_SELECTION_SETTLE"
    );

    // A successful staging result must hand the post-stage observer a fully
    // detached debugger. Bound cleanup rather than fire-and-forget it, so normal
    // success cannot race the observer's next attach. If either cleanup command
    // loses the deadline race after file selection, this turn fails closed and
    // the durable fence remains; finally only dispatches best-effort cleanup.
    if (objectId) {
      await _pr92Schema7RunUntil(
        context.deadlineAt,
        "SCHEMA13_STAGE_RELEASE_OBJECT",
        () => chrome.debugger.sendCommand(
          debuggee,
          "Runtime.releaseObject",
          { objectId }
        )
      );
      objectId = null;
    }
    if (attached) {
      await _pr92Schema7RunUntil(
        context.deadlineAt,
        "SCHEMA13_STAGE_DEBUGGER_DETACH",
        () => chrome.debugger.detach(debuggee)
      );
      attached = false;
    }

    return attachmentPaths.length;
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message === "PR9_2_FILE_INPUT_NOT_FOUND" ||
        error.message.startsWith("PR9_2_STALE_ATTACHMENT_FENCE_") ||
        error.message.startsWith("PR9_2_TOTAL_TURN_TIMEOUT:")
      )
    ) {
      throw error;
    }
    throw new Error("PR9_2_ATTACHMENT_STAGE_FAILED");
  } finally {
    // Error/timeout cleanup never extends the RPC. On the success path objectId
    // and attached have already been cleared by bounded cleanup above.
    _pr92Schema13BestEffortReleaseObject(debuggee, objectId);
    if (attached) _pr92Schema13BestEffortDetach(debuggee);
  }
}

// Replace schema 12's staging wrapper at the exact primitive that selects files.
// Preserve schema-10 official-composer cleanliness before selection and schema-12
// deadline-bounded post-stage page-owned evidence after selection.
_pr92StageOfficialPageAttachments = async function _pr92Schema13FullyBoundedStage(
  tabId,
  attachmentPaths,
  context
) {
  if (attachmentPaths.length === 0) return 0;

  await _pr92Schema10RequireOfficialCleanComposerBeforeStaging(tabId, context);
  const stagedCount = await _pr92Schema13StageFileSelection(
    tabId,
    attachmentPaths,
    context
  );
  if (stagedCount !== attachmentPaths.length) {
    throw new Error("PR9_2_ATTACHMENT_STAGE_COUNT_MISMATCH");
  }

  return _pr92Schema12ObservePostStageAttachmentEvidence(
    tabId,
    attachmentPaths,
    context
  );
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema13Repair(message) {
  const result = await _pr92Schema13PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA13_REPAIR_SCHEMA,
    attachmentStagingPrimitiveDeadlineBounded: true,
    stagingDebuggerSetupDeadlineBounded: true,
    stagingComposerReadinessDeadlineBounded: true,
    stagingFileInputLookupDeadlineBounded: true,
    stagingFencePersistenceDeadlineBounded: true,
    stagingFileSelectionDeadlineBounded: true,
    stagingPostSelectionCleanupDeadlineBounded: true,
    lateStagingDebuggerAttachAutoDetached: true,
    lateFileSelectionFailsClosedBehindDurableFence: true,
    postSelectionCleanupBestEffortAfterTimeout: true
  };
};

/* END legacy source: service_worker_rich_input_schema13_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema14_repair_pr9_2.js */
// PR9.2 schema-14 rich-input/model-profile composition guard.
//
// Loaded after schema 13. PR9.2 proves one total deadline for the browser-owned
// rich-input path, while the independently proven PR8.10 model-profile selector
// still owns fixed/raw prewrite waits and CDP input operations. A turn carrying
// both attachment paths and requiredModelMode would therefore compose two proven
// features without a proven shared deadline. This layer fails that *new*
// combination closed before staging or write rather than widening PR8.10 inside
// PR9.2. Text-only model-profile turns and ordinary rich-input turns are unchanged.

const _pr92Schema14PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA14_REPAIR_SCHEMA = 14;

function _pr92Schema14HasAttachmentPaths(message) {
  return Array.isArray(message?.attachmentPaths) && message.attachmentPaths.length > 0;
}

function _pr92Schema14HasModelProfileRequirement(message) {
  return typeof message?.requiredModelMode === "string" && Boolean(message.requiredModelMode.trim());
}

executeNativeTurn = async function _executeNativeTurnWithPr92Schema14CompositionGuard(message) {
  if (
    message?.characterizeRichInputSupport !== true &&
    _pr92Schema14HasAttachmentPaths(message) &&
    _pr92Schema14HasModelProfileRequirement(message)
  ) {
    // This guard is intentionally outside the schema-13/prior chain. No PR9.2
    // turn context, durable fence, attachment staging, model-selector mutation,
    // or protected conversation write has been entered when this error is raised.
    throw new Error("PR9_2_RICH_INPUT_MODEL_PROFILE_COMBINATION_UNAVAILABLE");
  }

  const result = await _pr92Schema14PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA14_REPAIR_SCHEMA,
    richInputModelProfileCombinationSupported: false,
    richInputModelProfileCombinationFailsBeforeStaging: true,
    richInputModelProfileCombinationFailsBeforeWrite: true,
    pr810RawPrewriteSelectorExcludedFromRichInput: true
  };
};

/* END legacy source: service_worker_rich_input_schema14_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema15_repair_pr9_2.js */
// PR9.2 schema-15 debugger-ownership handoff repair.
//
// Loaded after schema 14. Schema 10 and schema 12 correctly bound debugger
// acquisition and evidence work, but their successful observer paths released
// debugger ownership with fire-and-forget detach. The next rich-input phase can
// immediately need the same tab and therefore race that still-pending detach.
// This immutable layer makes both *successful* ownership handoffs explicit:
// detach must complete inside the same outer rich-turn deadline before the next
// phase may attach. Error/timeout paths retain the reviewed best-effort detach
// semantics and cannot extend or rewrite the already reported failure outcome.

const _pr92Schema15PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA15_REPAIR_SCHEMA = 15;

async function _pr92Schema15DetachWithinDeadline(debuggee, context, stage) {
  _pr92RemainingTurnMs(context, stage);
  return _pr92Schema7RunUntil(
    context.deadlineAt,
    stage,
    () => chrome.debugger.detach(debuggee)
  );
}

_pr92Schema10RequireOfficialCleanComposerBeforeStaging = async function _pr92Schema15RequireOfficialCleanComposerBeforeStaging(
  tabId,
  context
) {
  const debuggee = { tabId };
  let attached = false;
  let attachPending = null;
  try {
    _pr92RemainingTurnMs(context, "SCHEMA15_PRESTAGE_CLEAN_ATTACH");
    attachPending = chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    if (attachPending && typeof attachPending.catch === "function") {
      attachPending.catch(() => {});
    }

    try {
      await _pr92Schema7RunUntil(
        context.deadlineAt,
        "SCHEMA15_PRESTAGE_CLEAN_DEBUGGER_ATTACH",
        () => attachPending
      );
      attached = true;
    } catch (error) {
      // attach is non-cancellable. If it completes only after our deadline/error,
      // relinquish that late ownership without changing the failed outcome.
      if (attachPending && typeof attachPending.then === "function") {
        attachPending.then(
          () => _pr92Schema10BestEffortDetach(debuggee),
          () => {}
        );
      }
      throw error;
    }

    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA15_PRESTAGE_CLEAN_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );

    let stable = 0;
    while (stable < PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS) {
      const evidence = await _pr92ClosureReadPageOwnedAttachmentEvidence(
        debuggee,
        [],
        context
      );
      const groupCount = Number(evidence?.groupLabelCount);
      const removalCount = Number(evidence?.removalLabelCount);
      const clean = evidence?.officialComposerMounted === true &&
        evidence?.exactBasenameAssociation === true &&
        evidence?.exactAttachmentSet === true &&
        groupCount === 0 && removalCount === 0;
      if (!clean) {
        throw new Error("PR9_2_OFFICIAL_COMPOSER_NOT_CLEAN_BEFORE_STAGING");
      }
      stable += 1;
      if (stable < PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS) {
        await _pr92BoundedSleep(
          context,
          PR92_PAGE_ATTACHMENT_POLL_MS,
          "SCHEMA15_PRESTAGE_CLEAN_STABILITY"
        );
      }
    }

    // Success is not complete until debugger ownership is actually relinquished.
    // Schema 13 may attach for file selection immediately after this function.
    await _pr92Schema15DetachWithinDeadline(
      debuggee,
      context,
      "SCHEMA15_PRESTAGE_CLEAN_DEBUGGER_DETACH"
    );
    attached = false;
  } finally {
    // Only failure/timeout can arrive here still attached. Do not extend the
    // failed outcome; best-effort relinquish is sufficient on that path.
    if (attached) _pr92Schema10BestEffortDetach(debuggee);
  }
};

_pr92Schema12ObservePostStageAttachmentEvidence = async function _pr92Schema15ObservePostStageAttachmentEvidence(
  tabId,
  attachmentPaths,
  context
) {
  const debuggee = { tabId };
  let attached = false;
  let attachPending = null;
  try {
    _pr92RemainingTurnMs(context, "SCHEMA15_POSTSTAGE_EVIDENCE_ATTACH");
    attachPending = chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    if (attachPending && typeof attachPending.catch === "function") {
      attachPending.catch(() => {});
    }

    try {
      await _pr92Schema7RunUntil(
        context.deadlineAt,
        "SCHEMA15_POSTSTAGE_DEBUGGER_ATTACH",
        () => attachPending
      );
      attached = true;
    } catch (error) {
      // As above, a late successful non-cancellable attach is released without
      // changing the already failed/expired turn outcome.
      if (attachPending && typeof attachPending.then === "function") {
        attachPending.then(
          () => _pr92Schema12BestEffortDetach(debuggee),
          () => {}
        );
      }
      throw error;
    }

    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA15_POSTSTAGE_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );

    const pageOwnedCount = await _pr92ClosureWaitForPageOwnedAttachmentEvidence(
      debuggee,
      attachmentPaths,
      context,
      PR92_PAGE_ATTACHMENT_STABLE_POLLS
    );
    if (pageOwnedCount !== attachmentPaths.length) {
      throw new Error("PR9_2_PAGE_ATTACHMENT_COUNT_MISMATCH");
    }

    // The inherited protected-dispatch path attaches this debugger next. Do not
    // return page-owned evidence until the observer has fully relinquished it.
    await _pr92Schema15DetachWithinDeadline(
      debuggee,
      context,
      "SCHEMA15_POSTSTAGE_DEBUGGER_DETACH"
    );
    attached = false;
    return pageOwnedCount;
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message.startsWith("PR9_2_TOTAL_TURN_TIMEOUT:") ||
        error.message === "PR9_2_PAGE_ATTACHMENT_REJECTED" ||
        error.message === "PR9_2_PAGE_ATTACHMENT_COUNT_MISMATCH"
      )
    ) {
      throw error;
    }
    throw new Error("PR9_2_PAGE_ATTACHMENT_EVIDENCE_FAILED");
  } finally {
    // A successful observer cleared `attached` only after bounded detach.
    // Error/timeout cleanup remains deliberately non-authoritative/best-effort.
    if (attached) _pr92Schema12BestEffortDetach(debuggee);
  }
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema15Repair(message) {
  const result = await _pr92Schema15PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA15_REPAIR_SCHEMA,
    preStageSuccessfulDebuggerDetachDeadlineBounded: true,
    postStageSuccessfulDebuggerDetachDeadlineBounded: true,
    debuggerOwnershipHandoffCompletedBeforeNextAttach: true,
    failurePathDebuggerDetachBestEffort: true
  };
};

/* END legacy source: service_worker_rich_input_schema15_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema16_repair_pr9_2.js */
// PR9.2 schema-16 outer-deadline / post-write teardown closure.
//
// Loaded after schema 15. This immutable layer closes three remaining gaps in
// the original PR9.2 wrapper without changing text-only product semantics:
//   1. the mandatory durable-fence read is raced against the one outer turn
//      deadline, so a stalled storage read cannot keep the worker turn busy;
//   2. rich runtime-tab acquisition is raced as one complete helper operation,
//      covering its raw storage/tabs calls as well as the already-bounded load;
//   3. once Network.requestWillBeSent proves the protected conversation POST,
//      inherited debugger detach/getTargets teardown becomes best-effort and can
//      no longer convert an already-submitted write into a response-lost timeout.

const _pr92Schema16PriorEnsureRuntimeTab = ensureRuntimeTab;
const _pr92Schema16PriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr92Schema16PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA16_REPAIR_SCHEMA = 16;

_pr92ReadDirtyAttachmentFence = async function _pr92Schema16ReadDirtyAttachmentFenceWithinDeadline() {
  const context = _pr92ActiveTurnContext;
  try {
    const stored = context === null
      ? await chrome.storage.local.get(PR92_DIRTY_ATTACHMENT_STORAGE_KEY)
      : await _pr92Schema7RunUntil(
          context.deadlineAt,
          "SCHEMA16_STALE_ATTACHMENT_FENCE_READ",
          () => chrome.storage.local.get(PR92_DIRTY_ATTACHMENT_STORAGE_KEY)
        );
    const record = stored?.[PR92_DIRTY_ATTACHMENT_STORAGE_KEY];
    const tabId = Number.isInteger(record?.tabId) ? record.tabId : null;
    _pr92DirtyAttachmentTabId = tabId;
    return tabId;
  } catch (error) {
    if (_pr92DeadlineRepairIsTimeoutError(error)) throw error;
    // A non-timeout storage failure still means we cannot prove clean state.
    throw new Error("PR9_2_STALE_ATTACHMENT_FENCE_READ_FAILED");
  }
};

ensureRuntimeTab = async function _pr92Schema16EnsureRuntimeTabWithinRichDeadline(
  conversationId
) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) {
    return _pr92Schema16PriorEnsureRuntimeTab(conversationId);
  }
  return _pr92Schema7RunUntil(
    context.deadlineAt,
    "SCHEMA16_RUNTIME_TAB_ACQUISITION",
    () => _pr92Schema16PriorEnsureRuntimeTab(conversationId)
  );
};

function _pr92Schema16DispatchPostWriteDebuggerTeardown(debuggee) {
  // After the POST is observed, teardown has no authority over the submitted
  // outcome. Dispatch both diagnostics operations best-effort and never await
  // them; the durable attachment fence remains the next-turn recovery authority.
  try {
    const detachPending = chrome.debugger.detach(debuggee);
    if (detachPending && typeof detachPending.catch === "function") {
      detachPending.catch(() => {});
    }
  } catch {}
  try {
    const targetsPending = chrome.debugger.getTargets();
    if (targetsPending && typeof targetsPending.catch === "function") {
      targetsPending.catch(() => {});
    }
  } catch {}
}

async function _pr92Schema16ExecuteOfficialPageTurn(args) {
  const { tabId, text, timeoutMs } = args || {};
  if (!Number.isInteger(tabId)) throw new Error("TAB_ID_REQUIRED");
  if (typeof text !== "string" || !text.trim()) throw new Error("TEXT_REQUIRED");
  if (text.length > 200_000) throw new Error("TEXT_TOO_LARGE_FOR_BROWSER_NATIVE_TURN");

  const context = _pr92ActiveRichInputContext;
  if (context === null) {
    return _pr92Schema16PriorExecuteOfficialPageTurn(args);
  }

  const startedAt = performance.now();
  const tab = await chrome.tabs.get(tabId);
  if (!isChatGPTUrl(tab.url || "")) throw new Error("RUNTIME_TAB_IS_NOT_CHATGPT");
  const debuggee = { tabId };
  const diagnostics = {
    tabId,
    tabWasActive: Boolean(tab.active),
    composerStrategy: null,
    submitStrategy: null,
    submitButtonSelector: null,
    submitAckMs: null,
    responseStatus: null,
    responseMimeType: null,
    conversationRequestSeen: false,
    conversationResponseSeen: false,
    loadingFinished: false,
    completionReadyWaitMs: null,
    debuggerAttachedAfter: null,
    elapsedMs: null
  };

  let attached = false;
  let eventListener = null;
  try {
    await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    attached = true;
    await sendCommand(debuggee, "Network.enable");
    await sendCommand(debuggee, "Runtime.enable");
    await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );

    let conversationRequestId = null;
    let resolveRequestSeen;
    let resolveCompleted;
    let rejectCompleted;
    const requestSeen = new Promise((resolve) => {
      resolveRequestSeen = resolve;
    });
    const completed = new Promise((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    eventListener = (source, method, params) => {
      if (source.tabId !== tabId) return;
      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (!conversationRequestId && isConversationWrite(request?.url || "", request?.method || "")) {
          conversationRequestId = params.requestId;
          diagnostics.conversationRequestSeen = true;
          resolveRequestSeen(params.requestId);
        }
        return;
      }
      if (!conversationRequestId || params?.requestId !== conversationRequestId) return;
      if (method === "Network.responseReceived") {
        diagnostics.conversationResponseSeen = true;
        diagnostics.responseStatus = params?.response?.status ?? null;
        diagnostics.responseMimeType = params?.response?.mimeType ?? null;
        return;
      }
      if (method === "Network.loadingFailed") {
        rejectCompleted(new Error(`CHATGPT_CONVERSATION_REQUEST_FAILED:${params?.errorText || "unknown"}`));
        return;
      }
      if (method === "Network.loadingFinished") {
        diagnostics.loadingFinished = true;
        resolveCompleted(conversationRequestId);
      }
    };
    chrome.debugger.onEvent.addListener(eventListener);

    diagnostics.composerStrategy = await locateAndFocusComposer(debuggee);
    await clearComposer(debuggee);
    await sendCommand(debuggee, "Input.insertText", { text });

    const submitStartedAt = performance.now();
    const submit = await submitOfficialPageTurn(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_READY_TIMEOUT_MS)
    );
    diagnostics.submitStrategy = submit.strategy;
    diagnostics.submitButtonSelector = submit.selector;

    await Promise.race([
      requestSeen,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`CHATGPT_SUBMIT_NOT_OBSERVED:${submit.strategy}`)),
        Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_ACK_TIMEOUT_MS)
      ))
    ]);
    diagnostics.submitAckMs = elapsedMs(submitStartedAt);

    const requestId = await Promise.race([
      completed,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("CHATGPT_TURN_TIMEOUT")),
        remainingMs(startedAt, timeoutMs)
      ))
    ]);

    let safeMetadata = { conversationId: null, turnExchangeId: null };
    try {
      const response = await sendCommand(debuggee, "Network.getResponseBody", { requestId });
      safeMetadata = extractSafeStreamMetadata(response?.body, Boolean(response?.base64Encoded));
    } catch {
      // Optional safe metadata only.
    }

    diagnostics.completionReadyWaitMs = await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );

    const finalTab = await chrome.tabs.get(tabId);
    const urlConversationId = conversationIdFromUrl(finalTab.url || "");
    diagnostics.elapsedMs = elapsedMs(startedAt);
    return {
      diagnostics,
      finalUrl: finalTab.url || "",
      conversationId: safeMetadata.conversationId || urlConversationId,
      turnExchangeId: safeMetadata.turnExchangeId
    };
  } finally {
    if (eventListener) chrome.debugger.onEvent.removeListener(eventListener);

    if (diagnostics.conversationRequestSeen === true) {
      // The write has already crossed the protected boundary. Never await the
      // inherited teardown operations or let them rewrite this submitted outcome.
      if (attached) _pr92Schema16DispatchPostWriteDebuggerTeardown(debuggee);
      diagnostics.debuggerAttachedAfter = null;
    } else {
      // Before write proof exists, debugger release remains governed by the same
      // outer deadline. Failure cleanup is non-authoritative after that deadline.
      if (attached) {
        try {
          await _pr92Schema7RunUntil(
            context.deadlineAt,
            "SCHEMA16_PREWRITE_PAGE_TURN_DEBUGGER_DETACH",
            () => chrome.debugger.detach(debuggee)
          );
        } catch {}
      }
      try {
        const targets = await _pr92Schema7RunUntil(
          context.deadlineAt,
          "SCHEMA16_PREWRITE_PAGE_TURN_DEBUGGER_TARGETS",
          () => chrome.debugger.getTargets()
        );
        diagnostics.debuggerAttachedAfter = Boolean(
          targets.find((target) => target.tabId === tabId)?.attached
        );
      } catch {
        diagnostics.debuggerAttachedAfter = null;
      }
    }
  }
}

executeOfficialPageTurn = async function _pr92Schema16ExecuteOfficialPageTurnWithinTurn(args) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) return _pr92Schema16PriorExecuteOfficialPageTurn(args);
  const outerContext = _pr92ActiveTurnContext;
  if (outerContext === null) {
    throw new Error("PR9_2_RICH_INPUT_TURN_CONTEXT_REQUIRED");
  }
  return _pr92Schema16ExecuteOfficialPageTurn({
    ...args,
    timeoutMs: _pr92CapTimeoutToTurn(
      outerContext,
      args?.timeoutMs,
      "SCHEMA16_PROTECTED_PAGE_DISPATCH"
    )
  });
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema16Repair(message) {
  const result = await _pr92Schema16PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA16_REPAIR_SCHEMA,
    durableFenceReadDeadlineBounded: true,
    runtimeTabAcquisitionDeadlineBounded: true,
    inheritedPageTurnPostWriteTeardownNonBlocking: true,
    postWriteDebuggerDetachBestEffort: true,
    postWriteDebuggerTargetsProbeBestEffort: true,
    postWriteTeardownCanRewriteSubmittedOutcome: false
  };
};

/* END legacy source: service_worker_rich_input_schema16_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema17_repair_pr9_2.js */
// PR9.2 schema-17 complete page-turn deadline closure.
//
// Loaded after schema 16. This immutable layer closes the two fresh exact-head
// review findings without changing text-only behavior or write authority:
//   1. every pre-submit page-turn setup operation is raced against the same
//      outer rich-turn deadline, including late debugger-attach ownership;
//   2. after Network.loadingFinished proves the protected request completed,
//      response metadata, UI readiness, and final-tab refresh are optional,
//      short-budget diagnostics which cannot consume the RPC deadline or rewrite
//      the already-submitted outcome.

const _pr92Schema17PriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr92Schema17PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA17_REPAIR_SCHEMA = 17;
const PR92_SCHEMA17_OPTIONAL_POSTWRITE_CAP_MS = 1_000;
const PR92_SCHEMA17_RPC_RETURN_RESERVE_MS = 500;

function _pr92Schema17BestEffortDetach(debuggee) {
  try {
    const pending = chrome.debugger.detach(debuggee);
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {}
}

async function _pr92Schema17AttachWithinDeadline(debuggee, context) {
  _pr92RemainingTurnMs(context, "SCHEMA17_PAGE_TURN_DEBUGGER_ATTACH");
  let attachPending;
  try {
    attachPending = chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
  } catch (error) {
    throw error;
  }
  if (attachPending && typeof attachPending.catch === "function") {
    attachPending.catch(() => {});
  }

  try {
    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA17_PAGE_TURN_DEBUGGER_ATTACH",
      () => attachPending
    );
    return true;
  } catch (error) {
    // chrome.debugger.attach is non-cancellable. If it succeeds only after the
    // local deadline has already won, relinquish ownership best-effort without
    // extending or changing the reported timeout outcome.
    if (attachPending && typeof attachPending.then === "function") {
      attachPending.then(
        () => _pr92Schema17BestEffortDetach(debuggee),
        () => {}
      );
    }
    throw error;
  }
}

async function _pr92Schema17RunUntil(context, stage, operation) {
  _pr92RemainingTurnMs(context, stage);
  return _pr92Schema7RunUntil(context.deadlineAt, stage, operation);
}

async function _pr92Schema17OptionalPostWrite(
  context,
  stage,
  operation,
  capMs = PR92_SCHEMA17_OPTIONAL_POSTWRITE_CAP_MS
) {
  const remaining = _pr92RemainingTurnMsOrZero(context);
  const usable = remaining - PR92_SCHEMA17_RPC_RETURN_RESERVE_MS;
  if (!Number.isFinite(usable) || usable <= 0) {
    return { ok: false, value: null };
  }

  const localBudget = Math.max(1, Math.min(Number(capMs) || 1, usable));
  const localDeadlineAt = Math.min(
    context.deadlineAt - PR92_SCHEMA17_RPC_RETURN_RESERVE_MS,
    performance.now() + localBudget
  );
  try {
    const value = await _pr92Schema7RunUntil(localDeadlineAt, stage, operation);
    return { ok: true, value };
  } catch {
    // Optional post-write work has no authority over the submitted result.
    return { ok: false, value: null };
  }
}

async function _pr92Schema17ExecuteOfficialPageTurn(args) {
  const { tabId, text, timeoutMs } = args || {};
  if (!Number.isInteger(tabId)) throw new Error("TAB_ID_REQUIRED");
  if (typeof text !== "string" || !text.trim()) throw new Error("TEXT_REQUIRED");
  if (text.length > 200_000) throw new Error("TEXT_TOO_LARGE_FOR_BROWSER_NATIVE_TURN");

  const context = _pr92ActiveRichInputContext;
  if (context === null) {
    return _pr92Schema17PriorExecuteOfficialPageTurn(args);
  }

  const startedAt = performance.now();
  const debuggee = { tabId };
  const tab = await _pr92Schema17RunUntil(
    context,
    "SCHEMA17_PAGE_TURN_TAB_LOOKUP",
    () => chrome.tabs.get(tabId)
  );
  if (!isChatGPTUrl(tab?.url || "")) throw new Error("RUNTIME_TAB_IS_NOT_CHATGPT");

  let latestUrl = tab.url || "";
  const diagnostics = {
    tabId,
    tabWasActive: Boolean(tab.active),
    composerStrategy: null,
    submitStrategy: null,
    submitButtonSelector: null,
    submitAckMs: null,
    responseStatus: null,
    responseMimeType: null,
    conversationRequestSeen: false,
    conversationResponseSeen: false,
    loadingFinished: false,
    completionReadyWaitMs: null,
    debuggerAttachedAfter: null,
    elapsedMs: null
  };

  let attached = false;
  let eventListener = null;
  let tabUpdateListener = null;
  try {
    attached = await _pr92Schema17AttachWithinDeadline(debuggee, context);

    await _pr92Schema17RunUntil(
      context,
      "SCHEMA17_PAGE_TURN_NETWORK_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Network.enable")
    );
    await _pr92Schema17RunUntil(
      context,
      "SCHEMA17_PAGE_TURN_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );

    const readyBudget = Math.min(
      _pr92RemainingTurnMs(context, "SCHEMA17_PAGE_TURN_COMPOSER_READY"),
      DEFAULT_READY_TIMEOUT_MS
    );
    await _pr92Schema17RunUntil(
      context,
      "SCHEMA17_PAGE_TURN_COMPOSER_READY",
      () => waitForComposerReady(debuggee, readyBudget)
    );

    let conversationRequestId = null;
    let resolveRequestSeen;
    let resolveCompleted;
    let rejectCompleted;
    const requestSeen = new Promise((resolve) => {
      resolveRequestSeen = resolve;
    });
    const completed = new Promise((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    eventListener = (source, method, params) => {
      if (source.tabId !== tabId) return;
      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (!conversationRequestId && isConversationWrite(request?.url || "", request?.method || "")) {
          conversationRequestId = params.requestId;
          diagnostics.conversationRequestSeen = true;
          resolveRequestSeen(params.requestId);
        }
        return;
      }
      if (!conversationRequestId || params?.requestId !== conversationRequestId) return;
      if (method === "Network.responseReceived") {
        diagnostics.conversationResponseSeen = true;
        diagnostics.responseStatus = params?.response?.status ?? null;
        diagnostics.responseMimeType = params?.response?.mimeType ?? null;
        return;
      }
      if (method === "Network.loadingFailed") {
        rejectCompleted(new Error(`CHATGPT_CONVERSATION_REQUEST_FAILED:${params?.errorText || "unknown"}`));
        return;
      }
      if (method === "Network.loadingFinished") {
        diagnostics.loadingFinished = true;
        resolveCompleted(conversationRequestId);
      }
    };
    chrome.debugger.onEvent.addListener(eventListener);

    // Track route changes synchronously while the request is live. This removes
    // final chrome.tabs.get from conversation-id authority on the success path;
    // the later final-tab read is only an optional bounded refresh.
    tabUpdateListener = (updatedTabId, changeInfo, updatedTab) => {
      if (updatedTabId !== tabId) return;
      if (typeof changeInfo?.url === "string" && changeInfo.url) {
        latestUrl = changeInfo.url;
      } else if (typeof updatedTab?.url === "string" && updatedTab.url) {
        latestUrl = updatedTab.url;
      }
    };
    chrome.tabs.onUpdated.addListener(tabUpdateListener);

    diagnostics.composerStrategy = await _pr92Schema17RunUntil(
      context,
      "SCHEMA17_PAGE_TURN_COMPOSER_FOCUS",
      () => locateAndFocusComposer(debuggee)
    );
    await _pr92Schema17RunUntil(
      context,
      "SCHEMA17_PAGE_TURN_COMPOSER_CLEAR",
      () => clearComposer(debuggee)
    );
    await _pr92Schema17RunUntil(
      context,
      "SCHEMA17_PAGE_TURN_TEXT_INSERT",
      () => chrome.debugger.sendCommand(debuggee, "Input.insertText", { text })
    );

    const submitStartedAt = performance.now();
    const submit = await submitOfficialPageTurn(
      debuggee,
      Math.min(
        _pr92RemainingTurnMs(context, "SCHEMA17_PROTECTED_SUBMIT"),
        Number.isFinite(timeoutMs) ? Math.max(1, Number(timeoutMs)) : DEFAULT_SUBMIT_READY_TIMEOUT_MS,
        DEFAULT_SUBMIT_READY_TIMEOUT_MS
      )
    );
    diagnostics.submitStrategy = submit.strategy;
    diagnostics.submitButtonSelector = submit.selector;

    const submitAckBudget = Math.min(
      _pr92RemainingTurnMs(context, "SCHEMA17_SUBMIT_OBSERVATION"),
      DEFAULT_SUBMIT_ACK_TIMEOUT_MS
    );
    await Promise.race([
      requestSeen,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`CHATGPT_SUBMIT_NOT_OBSERVED:${submit.strategy}`)),
        submitAckBudget
      ))
    ]);
    diagnostics.submitAckMs = elapsedMs(submitStartedAt);

    const requestId = await _pr92Schema17RunUntil(
      context,
      "SCHEMA17_CONVERSATION_REQUEST_COMPLETION",
      () => completed
    );

    // The protected request is complete. Everything below is optional metadata
    // or UI diagnostics. Each operation gets at most a short local budget and is
    // skipped before the reserved RPC-return window. None may throw into success.
    let safeMetadata = { conversationId: null, turnExchangeId: null };
    const responseBodyAttempt = _pr92Schema17OptionalPostWrite(
      context,
      "SCHEMA17_POSTWRITE_RESPONSE_BODY",
      () => chrome.debugger.sendCommand(debuggee, "Network.getResponseBody", { requestId })
    );
    const finalTabAttempt = _pr92Schema17OptionalPostWrite(
      context,
      "SCHEMA17_POSTWRITE_FINAL_TAB",
      () => chrome.tabs.get(tabId),
      500
    );
    const [responseBodyResult, finalTabResult] = await Promise.all([
      responseBodyAttempt,
      finalTabAttempt
    ]);

    if (responseBodyResult.ok === true) {
      const response = responseBodyResult.value;
      safeMetadata = extractSafeStreamMetadata(
        response?.body,
        Boolean(response?.base64Encoded)
      );
    }
    if (finalTabResult.ok === true && typeof finalTabResult.value?.url === "string") {
      latestUrl = finalTabResult.value.url || latestUrl;
    }

    const readinessBudget = Math.min(
      Math.max(1, _pr92RemainingTurnMsOrZero(context) - PR92_SCHEMA17_RPC_RETURN_RESERVE_MS),
      PR92_SCHEMA17_OPTIONAL_POSTWRITE_CAP_MS,
      DEFAULT_READY_TIMEOUT_MS
    );
    if (_pr92RemainingTurnMsOrZero(context) > PR92_SCHEMA17_RPC_RETURN_RESERVE_MS) {
      const readinessResult = await _pr92Schema17OptionalPostWrite(
        context,
        "SCHEMA17_POSTWRITE_COMPOSER_READINESS",
        () => waitForComposerReady(debuggee, readinessBudget)
      );
      if (readinessResult.ok === true) {
        diagnostics.completionReadyWaitMs = readinessResult.value;
      }
    }

    const urlConversationId = conversationIdFromUrl(latestUrl);
    diagnostics.elapsedMs = elapsedMs(startedAt);
    return {
      diagnostics,
      finalUrl: latestUrl,
      conversationId: safeMetadata.conversationId || urlConversationId,
      turnExchangeId: safeMetadata.turnExchangeId
    };
  } finally {
    if (eventListener) chrome.debugger.onEvent.removeListener(eventListener);
    if (tabUpdateListener) chrome.tabs.onUpdated.removeListener(tabUpdateListener);

    if (diagnostics.conversationRequestSeen === true) {
      // Post-write debugger teardown remains schema-16 best-effort authority.
      if (attached) _pr92Schema16DispatchPostWriteDebuggerTeardown(debuggee);
      diagnostics.debuggerAttachedAfter = null;
    } else {
      if (attached) {
        try {
          await _pr92Schema17RunUntil(
            context,
            "SCHEMA17_PREWRITE_PAGE_TURN_DEBUGGER_DETACH",
            () => chrome.debugger.detach(debuggee)
          );
          attached = false;
        } catch {
          _pr92Schema17BestEffortDetach(debuggee);
        }
      }
      try {
        const targets = await _pr92Schema17RunUntil(
          context,
          "SCHEMA17_PREWRITE_PAGE_TURN_DEBUGGER_TARGETS",
          () => chrome.debugger.getTargets()
        );
        diagnostics.debuggerAttachedAfter = Boolean(
          targets.find((target) => target.tabId === tabId)?.attached
        );
      } catch {
        diagnostics.debuggerAttachedAfter = null;
      }
    }
  }
}

executeOfficialPageTurn = async function _pr92Schema17ExecuteOfficialPageTurnWithinTurn(args) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) return _pr92Schema17PriorExecuteOfficialPageTurn(args);
  const outerContext = _pr92ActiveTurnContext;
  if (outerContext === null) {
    throw new Error("PR9_2_RICH_INPUT_TURN_CONTEXT_REQUIRED");
  }
  return _pr92Schema17ExecuteOfficialPageTurn({
    ...args,
    timeoutMs: _pr92CapTimeoutToTurn(
      outerContext,
      args?.timeoutMs,
      "SCHEMA17_PROTECTED_PAGE_DISPATCH"
    )
  });
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema17Repair(message) {
  const result = await _pr92Schema17PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA17_REPAIR_SCHEMA,
    pageTurnPrewriteSetupDeadlineBounded: true,
    latePageTurnDebuggerAttachAutoDetached: true,
    postWriteResponseBodyDeadlineBounded: true,
    postWriteComposerReadinessDeadlineBounded: true,
    postWriteFinalTabReadDeadlineBounded: true,
    postWriteOptionalReadsNonAuthoritative: true,
    postWriteOptionalReadsCanRewriteSubmittedOutcome: false,
    postWriteRpcReturnReserveMs: PR92_SCHEMA17_RPC_RETURN_RESERVE_MS
  };
};

/* END legacy source: service_worker_rich_input_schema17_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema18_repair_pr9_2.js */
// PR9.2 schema-18 post-write conversation-identity closure.
//
// Loaded after schema 17. This immutable layer closes the fresh exact-head P1
// where a completed new-chat write could still be converted into an ambiguous
// failure if optional response-body/final-tab reads timed out before the SPA
// route exposed its generated conversation id.
//
// Schema 18 preserves two separate authorities:
//   * protected write completion remains Network.requestWillBeSent +
//     Network.loadingFinished;
//   * a successful new-chat transport return additionally requires a real
//     conversation id derived from the ChatGPT /c/<id> route (or the already
//     captured schema-17 safe stream metadata).
//
// Optional schema-17 post-write diagnostics are rebound to leave a dedicated
// identity-resolution reserve. If identity still cannot be established, the
// extension returns an explicit WRITE_COMPLETED_CONVERSATION_ID_UNRESOLVED
// state; the Python provider maps that to readback-incomplete semantics rather
// than WRITE_OUTCOME_UNKNOWN. No write retry or second submit path is added.

const _pr92Schema18PriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr92Schema18PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA18_REPAIR_SCHEMA = 18;
const PR92_SCHEMA18_IDENTITY_RESERVE_MS = 2_500;
const PR92_SCHEMA18_RPC_RETURN_RESERVE_MS = 500;
const PR92_SCHEMA18_IDENTITY_POLL_MS = 50;
const PR92_SCHEMA18_IDENTITY_TAB_READ_CAP_MS = 250;
const PR92_SCHEMA18_COMMITTED_IDENTITY_ERROR =
  "PR9_2_WRITE_COMPLETED_CONVERSATION_ID_UNRESOLVED";

// Schema 17's optional diagnostics are intentionally non-authoritative. Leave a
// larger reserve so they can never consume the time needed to resolve the new
// conversation identity before the transport reports success.
_pr92Schema17OptionalPostWrite = async function _pr92Schema18OptionalPostWriteWithIdentityReserve(
  context,
  stage,
  operation,
  capMs = PR92_SCHEMA17_OPTIONAL_POSTWRITE_CAP_MS
) {
  const remaining = _pr92RemainingTurnMsOrZero(context);
  const usable = remaining - PR92_SCHEMA18_IDENTITY_RESERVE_MS;
  if (!Number.isFinite(usable) || usable <= 0) {
    return { ok: false, value: null };
  }

  const localBudget = Math.max(1, Math.min(Number(capMs) || 1, usable));
  const localDeadlineAt = Math.min(
    context.deadlineAt - PR92_SCHEMA18_IDENTITY_RESERVE_MS,
    performance.now() + localBudget
  );
  try {
    const value = await _pr92Schema7RunUntil(localDeadlineAt, stage, operation);
    return { ok: true, value };
  } catch {
    return { ok: false, value: null };
  }
};

function _pr92Schema18ConversationIdentityFromUrl(url) {
  const conversationId = conversationIdFromUrl(url || "");
  return typeof conversationId === "string" && conversationId.trim()
    ? conversationId.trim()
    : null;
}

async function _pr92Schema18ResolvePostWriteConversationIdentity(
  tabId,
  initialUrl,
  context
) {
  let latestUrl = typeof initialUrl === "string" ? initialUrl : "";
  let conversationId = _pr92Schema18ConversationIdentityFromUrl(latestUrl);
  if (conversationId) return { conversationId, finalUrl: latestUrl };

  let resolveRoute;
  const routeObserved = new Promise((resolve) => {
    resolveRoute = resolve;
  });
  const routeListener = (updatedTabId, changeInfo, updatedTab) => {
    if (updatedTabId !== tabId) return;
    const candidateUrl =
      typeof changeInfo?.url === "string" && changeInfo.url
        ? changeInfo.url
        : (typeof updatedTab?.url === "string" ? updatedTab.url : "");
    const candidateId = _pr92Schema18ConversationIdentityFromUrl(candidateUrl);
    if (!candidateId) return;
    latestUrl = candidateUrl;
    resolveRoute({ conversationId: candidateId, finalUrl: candidateUrl });
  };
  chrome.tabs.onUpdated.addListener(routeListener);

  try {
    while (true) {
      const remaining = _pr92RemainingTurnMsOrZero(context);
      const usable = remaining - PR92_SCHEMA18_RPC_RETURN_RESERVE_MS;
      if (!Number.isFinite(usable) || usable <= 0) break;

      const tabReadBudget = Math.max(
        1,
        Math.min(PR92_SCHEMA18_IDENTITY_TAB_READ_CAP_MS, usable)
      );
      const tabReadDeadlineAt = Math.min(
        context.deadlineAt - PR92_SCHEMA18_RPC_RETURN_RESERVE_MS,
        performance.now() + tabReadBudget
      );
      try {
        const currentTab = await _pr92Schema7RunUntil(
          tabReadDeadlineAt,
          "SCHEMA18_POSTWRITE_CONVERSATION_ID_TAB_READ",
          () => chrome.tabs.get(tabId)
        );
        if (typeof currentTab?.url === "string" && currentTab.url) {
          latestUrl = currentTab.url;
          conversationId = _pr92Schema18ConversationIdentityFromUrl(latestUrl);
          if (conversationId) {
            return { conversationId, finalUrl: latestUrl };
          }
        }
      } catch {
        // A stalled/failed tab read has no write authority. Keep observing the
        // route until the reserved identity budget is exhausted.
      }

      const remainingAfterRead = _pr92RemainingTurnMsOrZero(context);
      const waitUsable = remainingAfterRead - PR92_SCHEMA18_RPC_RETURN_RESERVE_MS;
      if (!Number.isFinite(waitUsable) || waitUsable <= 0) break;
      const waitMs = Math.max(
        1,
        Math.min(PR92_SCHEMA18_IDENTITY_POLL_MS, waitUsable)
      );
      const observed = await Promise.race([
        routeObserved,
        new Promise((resolve) => setTimeout(() => resolve(null), waitMs))
      ]);
      if (observed?.conversationId) return observed;
    }
  } finally {
    chrome.tabs.onUpdated.removeListener(routeListener);
  }

  // The protected request is already known to have completed, so this is not an
  // unknown write outcome. Surface an explicit committed/readback-incomplete
  // state; the provider maps it without allowing any automatic retry.
  throw new Error(PR92_SCHEMA18_COMMITTED_IDENTITY_ERROR);
}

executeOfficialPageTurn = async function _pr92Schema18ExecuteOfficialPageTurnWithIdentityAuthority(
  args
) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) return _pr92Schema18PriorExecuteOfficialPageTurn(args);

  const result = await _pr92Schema18PriorExecuteOfficialPageTurn(args);
  if (typeof result?.conversationId === "string" && result.conversationId.trim()) {
    return result;
  }

  // A missing id is only eligible for post-write identity reconciliation after
  // schema 17 has already proven the protected conversation request completed.
  if (
    result?.diagnostics?.conversationRequestSeen !== true ||
    result?.diagnostics?.loadingFinished !== true
  ) {
    throw new Error("PR9_2_CONVERSATION_ID_MISSING_WITHOUT_WRITE_COMPLETION_PROOF");
  }

  const resolved = await _pr92Schema18ResolvePostWriteConversationIdentity(
    args?.tabId,
    result?.finalUrl,
    context
  );
  return {
    ...result,
    finalUrl: resolved.finalUrl || result.finalUrl,
    conversationId: resolved.conversationId
  };
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema18Repair(message) {
  let result;
  try {
    result = await _pr92Schema18PriorExecuteNativeTurn(message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes(PR92_SCHEMA18_COMMITTED_IDENTITY_ERROR)) {
      // Earlier rich-input layers may wrap downstream failures while retaining a
      // durable attachment fence. Preserve that fence, but normalize this one
      // post-write identity state so the provider can classify it as committed
      // readback-incomplete rather than an unknown write outcome.
      throw new Error(PR92_SCHEMA18_COMMITTED_IDENTITY_ERROR);
    }
    throw error;
  }
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA18_REPAIR_SCHEMA,
    newChatConversationIdentityRequiredBeforeSuccess: true,
    postWriteConversationIdentityResolutionDeadlineBounded: true,
    postWriteConversationIdentityDedicatedReserveMs: PR92_SCHEMA18_IDENTITY_RESERVE_MS,
    missingConversationIdentityCanReturnTransportSuccess: false,
    unresolvedConversationIdentitySignalsCommittedReadbackIncomplete: true,
    automaticWriteRetryAfterIdentityFailure: false
  };
};

/* END legacy source: service_worker_rich_input_schema18_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema19_repair_pr9_2.js */
// PR9.2 schema-19 request-bound conversation-identity closure.
//
// Loaded after schema 18. The schema-18 route reconciliation was still able to
// accept an unrelated /c/<id> if the persistent runtime tab was manually
// navigated during the post-write window. Schema 19 removes route state from
// new-chat identity authority entirely.
//
// For a rich new-chat write, the only accepted conversation id is the
// `stream_handoff.conversation_id` parsed from Network.getResponseBody for the
// exact requestId whose Network.requestWillBeSent + Network.loadingFinished
// already proved the protected conversation POST and its completion. A route
// may remain diagnostic UI state, but it can neither satisfy nor override the
// request-bound identity. If the causal stream metadata is unavailable before
// the outer deadline, the existing committed/readback-incomplete marker is
// returned and automatic write retry remains forbidden.

const _pr92Schema19PriorCreateTurnContext = _pr92CreateTurnContext;
const _pr92Schema19PriorExtractSafeStreamMetadata = extractSafeStreamMetadata;
const _pr92Schema19PriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr92Schema19PriorExecuteNativeTurn = executeNativeTurn;
const _pr92Schema19PriorOptionalPostWrite = _pr92Schema17OptionalPostWrite;
const PR92_SCHEMA19_REPAIR_SCHEMA = 19;
const PR92_SCHEMA19_CAUSAL_RESPONSE_BODY_CAP_MS = 2_000;
const PR92_SCHEMA19_RPC_RETURN_RESERVE_MS = 500;
const PR92_SCHEMA19_IDENTITY_AUTHORITY = "NETWORK_REQUEST_BOUND_STREAM_HANDOFF";

_pr92CreateTurnContext = function _pr92Schema19CreateTurnContext(message) {
  const context = _pr92Schema19PriorCreateTurnContext(message);
  const requestedConversationId =
    typeof message?.conversationId === "string" && message.conversationId.trim()
      ? message.conversationId.trim()
      : null;
  context.schema19RequestedConversationId = requestedConversationId;
  context.schema19CausalConversationId = null;
  context.schema19CausalTurnExchangeId = null;
  return context;
};

extractSafeStreamMetadata = function _pr92Schema19ExtractRequestBoundStreamMetadata(
  body,
  base64Encoded
) {
  const metadata = _pr92Schema19PriorExtractSafeStreamMetadata(body, base64Encoded);
  const context = _pr92ActiveRichInputContext;
  if (context !== null) {
    if (typeof metadata?.conversationId === "string" && metadata.conversationId.trim()) {
      context.schema19CausalConversationId = metadata.conversationId.trim();
    }
    if (typeof metadata?.turnExchangeId === "string" && metadata.turnExchangeId.trim()) {
      context.schema19CausalTurnExchangeId = metadata.turnExchangeId.trim();
    }
  }
  return metadata;
};

// For a new chat, response-body metadata is no longer optional identity
// decoration: it is the sole causal identity source. Give that exact-request
// read the schema-18 identity reserve while preserving the final 500 ms for the
// Native Messaging RPC return. Other post-write diagnostics keep schema-18's
// stricter optional/non-authoritative budget.
_pr92Schema17OptionalPostWrite = async function _pr92Schema19OptionalPostWrite(
  context,
  stage,
  operation,
  capMs = PR92_SCHEMA17_OPTIONAL_POSTWRITE_CAP_MS
) {
  const isNewChatCausalIdentityRead =
    stage === "SCHEMA17_POSTWRITE_RESPONSE_BODY" &&
    context?.schema19RequestedConversationId == null;
  if (!isNewChatCausalIdentityRead) {
    return _pr92Schema19PriorOptionalPostWrite(context, stage, operation, capMs);
  }

  const remaining = _pr92RemainingTurnMsOrZero(context);
  const usable = remaining - PR92_SCHEMA19_RPC_RETURN_RESERVE_MS;
  if (!Number.isFinite(usable) || usable <= 0) {
    return { ok: false, value: null };
  }

  const localBudget = Math.max(
    1,
    Math.min(PR92_SCHEMA19_CAUSAL_RESPONSE_BODY_CAP_MS, usable)
  );
  const localDeadlineAt = Math.min(
    context.deadlineAt - PR92_SCHEMA19_RPC_RETURN_RESERVE_MS,
    performance.now() + localBudget
  );
  try {
    const value = await _pr92Schema7RunUntil(localDeadlineAt, stage, operation);
    return { ok: true, value };
  } catch {
    return { ok: false, value: null };
  }
};

executeOfficialPageTurn = async function _pr92Schema19ExecuteOfficialPageTurnWithRequestBoundIdentity(
  args
) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) return _pr92Schema19PriorExecuteOfficialPageTurn(args);

  // Continuations already carry an explicit conversation identity before the
  // write and retain the complete schema-18 path. Schema 19 changes only the
  // missing-identity/new-chat case addressed by the exact-head review finding.
  if (context.schema19RequestedConversationId !== null) {
    return _pr92Schema19PriorExecuteOfficialPageTurn(args);
  }

  // Bypass schema 18's route-based fallback while retaining schema 17's exact
  // request tracking, completion proof, bounded response-body read, attachment
  // authority, and protected-submit invariants.
  const result = await _pr92Schema18PriorExecuteOfficialPageTurn(args);
  if (
    result?.diagnostics?.conversationRequestSeen !== true ||
    result?.diagnostics?.loadingFinished !== true
  ) {
    throw new Error("PR9_2_CONVERSATION_ID_MISSING_WITHOUT_WRITE_COMPLETION_PROOF");
  }

  const causalConversationId =
    typeof context.schema19CausalConversationId === "string" &&
    context.schema19CausalConversationId.trim()
      ? context.schema19CausalConversationId.trim()
      : null;
  if (!causalConversationId) {
    throw new Error(PR92_SCHEMA18_COMMITTED_IDENTITY_ERROR);
  }

  const routeConversationId = conversationIdFromUrl(result?.finalUrl || "");
  const routeMatchesCausalIdentity = routeConversationId === causalConversationId;
  const causalTurnExchangeId =
    typeof context.schema19CausalTurnExchangeId === "string" &&
    context.schema19CausalTurnExchangeId.trim()
      ? context.schema19CausalTurnExchangeId.trim()
      : null;

  return {
    ...result,
    // `finalUrl` means observed final tab state. Never fabricate a canonical URL
    // when the observed route is absent or belongs to another conversation.
    finalUrl: routeMatchesCausalIdentity ? result.finalUrl : null,
    conversationId: causalConversationId,
    turnExchangeId: causalTurnExchangeId || result?.turnExchangeId || null,
    diagnostics: {
      ...result.diagnostics,
      conversationIdentityAuthority: PR92_SCHEMA19_IDENTITY_AUTHORITY,
      routeConversationIdentityAuthoritative: false,
      routeConversationId: routeConversationId || null,
      routeMatchesCausalIdentity,
      causalConversationId
    }
  };
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema19Repair(message) {
  const result = await _pr92Schema19PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA19_REPAIR_SCHEMA,
    newChatConversationIdentityAuthority: PR92_SCHEMA19_IDENTITY_AUTHORITY,
    responseBodyConversationIdentityRequestBound: true,
    routeConversationIdentityAuthoritative: false,
    manualRouteNavigationCanSatisfyNewChatIdentity: false,
    causalConversationIdentityReadDeadlineBounded: true,
    causalConversationIdentityRpcReturnReserveMs: PR92_SCHEMA19_RPC_RETURN_RESERVE_MS,
    missingRequestBoundConversationIdentitySignalsCommittedReadbackIncomplete: true,
    automaticWriteRetryAfterCausalIdentityFailure: false
  };
};

/* END legacy source: service_worker_rich_input_schema19_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema20_repair_pr9_2.js */
// PR9.2 schema-20 protected-submit request-correlation closure.
//
// Loaded after schema 19. Schema 19 made new-chat identity request-bound, but
// schema 17 still selected the first conversation POST observed after Network
// setup. A manual/user conversation POST during composer setup could therefore
// become the request whose response stream supplied the causal conversation id.
//
// Schema 20 narrows request authority without changing the protected-submit
// primitive. A unique page-side arm marker is emitted inside the same synchronous
// Runtime.evaluate page task that then performs schema-7 attachment validation
// and button.click(). Schema-17 conversation-write authority remains closed until
// the extension observes that exact marker. A user page task cannot interleave
// between the marker and the click. A second observer records every raw
// conversation POST after the marker; transport success additionally requires
// exactly one such POST and it must not carry CDP's user-gesture bit. Ambiguous
// post-arm traffic fails closed as known-write/readback-incomplete, with no retry.

const _pr92Schema20PriorCreateTurnContext = _pr92CreateTurnContext;
const _pr92Schema20PriorAtomicAttachmentSubmitExpression =
  _pr92Schema7AtomicAttachmentSubmitExpression;
const _pr92Schema20PriorIsConversationWrite = isConversationWrite;
const _pr92Schema20PriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr92Schema20PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA20_REPAIR_SCHEMA = 20;
const PR92_SCHEMA20_REQUEST_CORRELATION =
  "PAGE_SIDE_ARMED_SINGLE_CONVERSATION_POST";
const PR92_SCHEMA20_IDENTITY_AUTHORITY =
  "PROTECTED_SUBMIT_BOUND_REQUEST_STREAM_HANDOFF";
const PR92_SCHEMA20_ARM_MARKER_PREFIX =
  "__PR92_SCHEMA20_PROTECTED_SUBMIT_ARM__:";

function _pr92Schema20RandomMarker() {
  let nonce = "";
  try {
    if (typeof crypto?.randomUUID === "function") nonce = crypto.randomUUID();
  } catch {}
  if (!nonce) {
    nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  return `${PR92_SCHEMA20_ARM_MARKER_PREFIX}${nonce}`;
}

_pr92CreateTurnContext = function _pr92Schema20CreateTurnContext(message) {
  const context = _pr92Schema20PriorCreateTurnContext(message);
  context.schema20ProtectedSubmitArmed = false;
  context.schema20ProtectedSubmitArmedAt = null;
  context.schema20ProtectedSubmitMarker = _pr92Schema20RandomMarker();
  context.schema20ProtectedSubmitMarkerObserved = false;
  context.schema20PostArmConversationRequests = [];
  return context;
};

// Schema 7 calls this expression builder immediately before dispatching the only
// Runtime.evaluate command that may click. Wrap that immutable expression so the
// unique marker is emitted in the renderer in the same synchronous page task as
// final attachment validation and button.click(). No page/user task can execute
// between the marker and the protected click.
_pr92Schema7AtomicAttachmentSubmitExpression = function _pr92Schema20PageSideArmProtectedSubmit(
  selector,
  deadlineEpochMs,
  expectedNames
) {
  const expression = _pr92Schema20PriorAtomicAttachmentSubmitExpression(
    selector,
    deadlineEpochMs,
    expectedNames
  );
  const context = _pr92ActiveRichInputContext;
  if (context === null) return expression;
  const encodedMarker = JSON.stringify(context.schema20ProtectedSubmitMarker);
  return `(() => {
    try { console.debug(${encodedMarker}); } catch {}
    return (${expression});
  })()`;
};

// Schema 17 calls this predicate from its Network.requestWillBeSent listener.
// During a rich turn, conversation writes have no authority until the exact
// page-side arm marker from the protected-submit task has been observed.
// Text-only behavior remains exactly the prior predicate.
isConversationWrite = function _pr92Schema20SubmitBoundConversationWrite(url, method) {
  if (!_pr92Schema20PriorIsConversationWrite(url, method)) return false;
  const context = _pr92ActiveRichInputContext;
  if (context === null) return true;
  return context.schema20ProtectedSubmitArmed === true;
};

function _pr92Schema20ObserveArmMarker(context, params) {
  if (context === null || context.schema20ProtectedSubmitArmed === true) return;
  const expected = context.schema20ProtectedSubmitMarker;
  if (typeof expected !== "string" || !expected) return;
  const args = Array.isArray(params?.args) ? params.args : [];
  const matched = args.some((arg) => arg?.value === expected);
  if (!matched) return;
  context.schema20ProtectedSubmitMarkerObserved = true;
  context.schema20ProtectedSubmitArmed = true;
  context.schema20ProtectedSubmitArmedAt = performance.now();
}

function _pr92Schema20RecordPostArmConversationRequest(context, params) {
  if (context === null || context.schema20ProtectedSubmitArmed !== true) return;
  const request = params?.request;
  if (
    !_pr92Schema20PriorIsConversationWrite(
      request?.url || "",
      request?.method || ""
    )
  ) {
    return;
  }
  const requestId = typeof params?.requestId === "string" ? params.requestId : "";
  if (!requestId) return;
  const existing = context.schema20PostArmConversationRequests.find(
    (entry) => entry.requestId === requestId
  );
  if (existing) return;
  context.schema20PostArmConversationRequests.push({
    requestId,
    hasUserGesture: params?.hasUserGesture === true
  });
}

executeOfficialPageTurn = async function _pr92Schema20ExecuteOfficialPageTurnWithSubmitBoundRequest(
  args
) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) return _pr92Schema20PriorExecuteOfficialPageTurn(args);

  const tabId = args?.tabId;
  const observer = (source, method, params) => {
    if (source?.tabId !== tabId) return;
    if (method === "Runtime.consoleAPICalled") {
      _pr92Schema20ObserveArmMarker(context, params);
      return;
    }
    if (method === "Network.requestWillBeSent") {
      _pr92Schema20RecordPostArmConversationRequest(context, params);
    }
  };
  chrome.debugger.onEvent.addListener(observer);

  try {
    const result = await _pr92Schema20PriorExecuteOfficialPageTurn(args);
    if (
      result?.diagnostics?.conversationRequestSeen !== true ||
      result?.diagnostics?.loadingFinished !== true
    ) {
      return result;
    }

    const observed = Array.isArray(context.schema20PostArmConversationRequests)
      ? context.schema20PostArmConversationRequests
      : [];
    const markerObserved = context.schema20ProtectedSubmitMarkerObserved === true;
    const exactlyOnePostArmRequest = observed.length === 1;
    const soleRequest = exactlyOnePostArmRequest ? observed[0] : null;
    const soleRequestHasUserGesture = soleRequest?.hasUserGesture === true;

    if (!markerObserved || !exactlyOnePostArmRequest || soleRequestHasUserGesture) {
      // A conversation write is already known to have completed, but its causal
      // ownership is not uniquely attributable to the protected page-side submit.
      // Never report the wrong conversation and never retry the write.
      throw new Error(PR92_SCHEMA18_COMMITTED_IDENTITY_ERROR);
    }

    return {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        protectedSubmitRequestCorrelation: PR92_SCHEMA20_REQUEST_CORRELATION,
        protectedSubmitArmMarkerObserved: true,
        protectedSubmitRequestId: soleRequest.requestId,
        postArmConversationRequestCount: observed.length,
        protectedSubmitRequestHadUserGesture: false,
        preArmConversationRequestsAuthoritative: false
      }
    };
  } finally {
    chrome.debugger.onEvent.removeListener(observer);
    context.schema20ProtectedSubmitArmed = false;
  }
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema20Repair(message) {
  const result = await _pr92Schema20PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA20_REPAIR_SCHEMA,
    newChatConversationIdentityAuthority: PR92_SCHEMA20_IDENTITY_AUTHORITY,
    protectedSubmitRequestCorrelation: PR92_SCHEMA20_REQUEST_CORRELATION,
    protectedSubmitRequestArmedByPageSideMarker: true,
    pageSideArmMarkerAndProtectedClickSameTask: true,
    preArmConversationRequestsAuthoritative: false,
    exactlyOnePostArmConversationRequestRequired: true,
    userGesturePostArmRequestCanSatisfyProtectedSubmit: false,
    ambiguousPostArmConversationRequestsSignalCommittedReadbackIncomplete: true,
    automaticWriteRetryAfterSubmitCorrelationFailure: false
  };
};

/* END legacy source: service_worker_rich_input_schema20_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema21_repair_pr9_2.js */
// PR9.2 schema-21 validated-click-boundary submit-arm closure.
//
// Loaded after schema 20. Schema 20 moved conversation-request authority into the
// same renderer task as schema-7's atomic attachment validation and click, but its
// wrapper emitted the page-side arm marker before schema 7 had completed the
// deadline, attachment-evidence, and Send-button checks. A failed validation could
// therefore leave request authority armed during the later observation window.
//
// Schema 21 bypasses only schema 20's early-marker expression wrapper and starts
// again from the immutable schema-7 expression captured by schema 20. The unique
// marker is injected exactly once immediately before button.click(), after every
// schema-7 validation and the final page-side deadline check have succeeded. The
// marker and click remain synchronous in the same Runtime.evaluate page task.

const _pr92Schema21PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA21_REPAIR_SCHEMA = 21;
const PR92_SCHEMA21_ARM_BOUNDARY =
  "AFTER_ALL_VALIDATION_IMMEDIATELY_BEFORE_BUTTON_CLICK";
const PR92_SCHEMA21_CLICK_NEEDLE = "    button.click();";

_pr92Schema7AtomicAttachmentSubmitExpression = function _pr92Schema21ValidatedClickBoundaryArm(
  selector,
  deadlineEpochMs,
  expectedNames
) {
  // Deliberately bypass schema 20's expression wrapper. Its captured prior binding
  // is the immutable schema-7 builder and therefore contains no early marker.
  const expression = _pr92Schema20PriorAtomicAttachmentSubmitExpression(
    selector,
    deadlineEpochMs,
    expectedNames
  );
  const context = _pr92ActiveRichInputContext;
  if (context === null) return expression;

  const firstClick = expression.indexOf(PR92_SCHEMA21_CLICK_NEEDLE);
  const secondClick =
    firstClick < 0
      ? -1
      : expression.indexOf(PR92_SCHEMA21_CLICK_NEEDLE, firstClick + 1);
  if (firstClick < 0 || secondClick >= 0) {
    throw new Error("PR9_2_SCHEMA21_ATOMIC_CLICK_BOUNDARY_NOT_UNIQUE");
  }

  const encodedMarker = JSON.stringify(context.schema20ProtectedSubmitMarker);
  const markerStatement =
    `    try { console.debug(${encodedMarker}); } catch {}\n`;
  return (
    expression.slice(0, firstClick) +
    markerStatement +
    expression.slice(firstClick)
  );
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema21Repair(message) {
  const result = await _pr92Schema21PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA21_REPAIR_SCHEMA,
    protectedSubmitArmBoundary: PR92_SCHEMA21_ARM_BOUNDARY,
    protectedSubmitArmAfterAllValidation: true,
    preValidationSubmitArmPossible: false
  };
};

/* END legacy source: service_worker_rich_input_schema21_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema22_repair_pr9_2.js */
// PR9.2 schema-22 live composer attachment-evidence classification repair.
//
// Loaded after schema 21. The first authenticated schema-21 live attempt failed
// closed before staging because the current ChatGPT composer exposes ordinary
// visible role=group/aria-label controls. Schema 11 treated every such group as
// attachment evidence, so a genuinely attachment-clean fresh composer was
// classified as dirty.
//
// Schema 22 keeps the exact-set / cross-channel / literal-basename authority but
// narrows role-group evidence to structurally attachment-owned groups: a group is
// eligible only when it contains a visible remove/delete/discard control. Global
// structured removal controls remain an independent evidence channel, so a manual
// or stale attachment still blocks pre-stage cleanliness even if its filename
// group is absent or arranged differently by the page.

const _pr92Schema22PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA22_REPAIR_SCHEMA = 22;

function _pr92Schema22AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]');
    const composer = prompt instanceof Element ? prompt.closest('form') : null;
    if (!(prompt instanceof Element) || !(composer instanceof Element)) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        rawGroupLabelCount: 0,
        ignoredComposerGroupLabelCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        crossEvidenceChannelExact: false,
        officialComposerMounted: false,
        exactBasenameAssociation: false,
        structuredRemovalBasenameAssociation: false,
        attachmentOwnedRoleGroupsOnly: true,
        evidenceKind: 'official-composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const isStructuredRemovalLabel = (label) =>
      /^(remove|delete|discard|удалить)(?:\\s+|:\\s*)/i.test(normalize(label));
    const removalControlSelector = 'button[aria-label], [role="button"][aria-label]';
    const hasVisibleStructuredRemovalControl = (group) =>
      Array.from(group.querySelectorAll(removalControlSelector))
        .filter(isVisible)
        .some((element) => isStructuredRemovalLabel(element.getAttribute('aria-label')));

    const rawGroupElements = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible);
    const groupLabels = rawGroupElements
      .filter(hasVisibleStructuredRemovalControl)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);
    const removalLabels = Array.from(composer.querySelectorAll(removalControlSelector))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(isStructuredRemovalLabel);

    const exactGroupBasename = (label, name) => label === name;
    const removalControlBasename = (label) => {
      const value = normalize(label);
      const action = value.match(/^(?:remove|delete|discard|удалить)(?:\\s+|:\\s*)/i);
      if (!action) return '';
      return value.slice(action[0].length).trim();
    };
    const exactRemovalBasename = (label, name) => removalControlBasename(label) === name;

    const matchesExpectedExactly = (labels, matcher) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => matcher(label, name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels, exactGroupBasename);
    const removals = matchesExpectedExactly(removalLabels, exactRemovalBasename);
    const groupsCompatible = groupLabels.length === 0 || groups.exact;
    const removalsCompatible = removalLabels.length === 0 || removals.exact;
    const atLeastOneExpectedChannelExact = groups.exact || removals.exact;
    const crossEvidenceChannelExact = expected.length === 0
      ? groups.exact && removals.exact
      : groupsCompatible && removalsCompatible && atLeastOneExpectedChannelExact;
    const exactAttachmentSet = crossEvidenceChannelExact;
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      rawGroupLabelCount: rawGroupElements.length,
      ignoredComposerGroupLabelCount: Math.max(0, rawGroupElements.length - groupLabels.length),
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      crossEvidenceChannelExact,
      officialComposerMounted: true,
      exactBasenameAssociation: true,
      structuredRemovalBasenameAssociation: true,
      attachmentOwnedRoleGroupsOnly: true,
      evidenceKind: groups.exact && removals.exact ? 'exact-both-evidence-channels' :
        (groups.exact && removalLabels.length === 0 ? 'exact-attachment-owned-role-group-channel' :
          (removals.exact && groupLabels.length === 0 ? 'exact-structured-remove-control-channel' : 'not-ready'))
    };
  })()`;
}

// All pre-stage clean polls, post-stage stable evidence reads, and schema-7's
// final synchronous validate+click resolve this binding at call time. Therefore
// the classification repair is consistent across every attachment authority
// boundary rather than being a special-case live-gate bypass.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema22AttachmentEvidenceExpression;

executeNativeTurn = async function _executeNativeTurnWithPr92Schema22Repair(message) {
  const result = await _pr92Schema22PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA22_REPAIR_SCHEMA,
    attachmentEvidenceRoleGroupsRequireRemovalControl: true,
    composerControlRoleGroupsExcludedFromAttachmentEvidence: true,
    preStageCleanUsesAttachmentOwnedEvidenceOnly: true
  };
};

/* END legacy source: service_worker_rich_input_schema22_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema23_repair_pr9_2.js */
// PR9.2 schema-23 independent filename-evidence / composer-control exclusion repair.
//
// Loaded after schema 22. Schema 22 fixed a real current-UI false positive by
// retaining role=group filename evidence only when the group contained a visible,
// recognized remove control. That made the filename channel depend on the removal
// channel and could hide a stale/manual attachment whose remove affordance was a
// sibling, hover-hidden, or differently localized.
//
// Schema 23 restores the filename role-group channel as independent authority.
// Instead of positively identifying attachments through remove controls, it
// excludes only role groups that are structurally proven to be ordinary official
// composer controls. Every other visible labelled role group is conservatively
// retained as attachment evidence. Therefore unknown/unclassified UI fails closed,
// while the current composer's prompt/control groups no longer create the schema-21
// clean-composer false positive. Structured removal controls remain a second,
// independent evidence channel exactly as before.

const _pr92Schema23PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA23_REPAIR_SCHEMA = 23;

function _pr92Schema23AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]');
    const composer = prompt instanceof Element ? prompt.closest('form') : null;
    if (!(prompt instanceof Element) || !(composer instanceof Element)) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        rawGroupLabelCount: 0,
        excludedComposerControlGroupCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        crossEvidenceChannelExact: false,
        officialComposerMounted: false,
        exactBasenameAssociation: false,
        structuredRemovalBasenameAssociation: false,
        filenameGroupIndependentOfRemovalControl: true,
        unknownRoleGroupsFailClosed: true,
        evidenceKind: 'official-composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const isStructuredRemovalLabel = (label) =>
      /^(remove|delete|discard|удалить)(?:\\s+|:\\s*)/i.test(normalize(label));
    const removalControlSelector = 'button[aria-label], [role="button"][aria-label]';

    // These selectors identify stable official composer actions already used by
    // the browser-owned runtime itself. A group is excluded only when structural
    // containment proves that it belongs to those controls; aria-label wording is
    // deliberately not used as an allowlist, so localization cannot turn an
    // unknown filename group into an ignored group.
    const officialComposerControlSelectors = [
      'button[data-testid="composer-plus-btn"]',
      'button[data-testid="composer-button-add-files"]',
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]'
    ];
    const isOfficialComposerControlGroup = (group) => {
      if (!(group instanceof Element)) return false;
      // A labelled group that wraps the prompt editor is composer chrome, not an
      // attachment chip. Attachment groups cannot legitimately contain the one
      // official prompt editor used to define this composer.
      if (group.contains(prompt)) return true;
      return officialComposerControlSelectors.some((selector) =>
        group.querySelector(selector) instanceof Element
      );
    };

    const rawGroupElements = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible);
    const attachmentGroupElements = rawGroupElements
      .filter((element) => !isOfficialComposerControlGroup(element));
    const groupLabels = attachmentGroupElements
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);

    // Keep removal evidence independent from role-group evidence. A removal
    // control may be nested, sibling-arranged, or the only structured channel.
    const removalLabels = Array.from(composer.querySelectorAll(removalControlSelector))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(isStructuredRemovalLabel);

    const exactGroupBasename = (label, name) => label === name;
    const removalControlBasename = (label) => {
      const value = normalize(label);
      const action = value.match(/^(?:remove|delete|discard|удалить)(?:\\s+|:\\s*)/i);
      if (!action) return '';
      return value.slice(action[0].length).trim();
    };
    const exactRemovalBasename = (label, name) => removalControlBasename(label) === name;

    const matchesExpectedExactly = (labels, matcher) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => matcher(label, name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels, exactGroupBasename);
    const removals = matchesExpectedExactly(removalLabels, exactRemovalBasename);
    const groupsCompatible = groupLabels.length === 0 || groups.exact;
    const removalsCompatible = removalLabels.length === 0 || removals.exact;
    const atLeastOneExpectedChannelExact = groups.exact || removals.exact;
    const crossEvidenceChannelExact = expected.length === 0
      ? groups.exact && removals.exact
      : groupsCompatible && removalsCompatible && atLeastOneExpectedChannelExact;
    const exactAttachmentSet = crossEvidenceChannelExact;
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      rawGroupLabelCount: rawGroupElements.length,
      excludedComposerControlGroupCount: Math.max(
        0,
        rawGroupElements.length - attachmentGroupElements.length
      ),
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      crossEvidenceChannelExact,
      officialComposerMounted: true,
      exactBasenameAssociation: true,
      structuredRemovalBasenameAssociation: true,
      filenameGroupIndependentOfRemovalControl: true,
      unknownRoleGroupsFailClosed: true,
      evidenceKind: groups.exact && removals.exact ? 'exact-both-evidence-channels' :
        (groups.exact && removalLabels.length === 0 ? 'exact-independent-role-group-channel' :
          (removals.exact && groupLabels.length === 0 ? 'exact-structured-remove-control-channel' : 'not-ready'))
    };
  })()`;
}

// Pre-stage clean polls, post-stage stable evidence, and schema-7's final atomic
// validate+click all resolve this binding dynamically. The same conservative
// classification therefore governs every attachment-authority boundary.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema23AttachmentEvidenceExpression;

executeNativeTurn = async function _executeNativeTurnWithPr92Schema23Repair(message) {
  const result = await _pr92Schema23PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA23_REPAIR_SCHEMA,
    // Explicitly supersede schema 22's too-strong ownership claim.
    attachmentEvidenceRoleGroupsRequireRemovalControl: false,
    attachmentFilenameGroupsIndependentOfRemovalControls: true,
    composerControlGroupExclusionUsesStructure: true,
    unclassifiedRoleGroupsFailClosedAsAttachmentEvidence: true,
    composerControlRoleGroupsExcludedFromAttachmentEvidence: true,
    preStageCleanUsesAttachmentOwnedEvidenceOnly: true
  };
};

/* END legacy source: service_worker_rich_input_schema23_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema24_repair_pr9_2.js */
// PR9.2 schema-24 official-composer mount race repair.
//
// Loaded after schema 23. Authenticated live validation showed a fresh inactive
// runtime tab can reach browser tab "complete" before ChatGPT's React composer has
// mounted. Schema 15's pre-stage clean proof immediately sampled attachment
// evidence after Runtime.enable and therefore treated `officialComposerMounted=false`
// as a dirty composer instead of a transient not-yet-mounted state.
//
// Schema 24 keeps every clean-composer safety invariant but first waits, through
// the same production page-owned attachment-evidence reader, until the official
// prompt + owning form are mounted. Only then do the two authoritative empty-set
// clean polls run. A mounted composer with any attachment evidence still fails
// closed immediately. The mount wait consumes the same single outer rich-turn
// deadline; there is no retry, staging, or protected-write authority in this phase.

const _pr92Schema24PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA24_REPAIR_SCHEMA = 24;

async function _pr92Schema24WaitForOfficialComposerMounted(debuggee, context) {
  while (true) {
    const evidence = await _pr92ClosureReadPageOwnedAttachmentEvidence(
      debuggee,
      [],
      context
    );
    if (evidence?.officialComposerMounted === true) return evidence;
    await _pr92BoundedSleep(
      context,
      PR92_PAGE_ATTACHMENT_POLL_MS,
      "SCHEMA24_PRESTAGE_OFFICIAL_COMPOSER_MOUNT_WAIT"
    );
  }
}

function _pr92Schema24EvidenceIsClean(evidence) {
  const groupCount = Number(evidence?.groupLabelCount);
  const removalCount = Number(evidence?.removalLabelCount);
  return evidence?.officialComposerMounted === true &&
    evidence?.exactBasenameAssociation === true &&
    evidence?.exactAttachmentSet === true &&
    groupCount === 0 && removalCount === 0;
}

_pr92Schema10RequireOfficialCleanComposerBeforeStaging = async function _pr92Schema24RequireOfficialCleanComposerBeforeStaging(
  tabId,
  context
) {
  const debuggee = { tabId };
  let attached = false;
  let attachPending = null;
  try {
    _pr92RemainingTurnMs(context, "SCHEMA24_PRESTAGE_CLEAN_ATTACH");
    attachPending = chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
    if (attachPending && typeof attachPending.catch === "function") {
      attachPending.catch(() => {});
    }

    try {
      await _pr92Schema7RunUntil(
        context.deadlineAt,
        "SCHEMA24_PRESTAGE_CLEAN_DEBUGGER_ATTACH",
        () => attachPending
      );
      attached = true;
    } catch (error) {
      // debugger.attach is non-cancellable. Preserve the reviewed late-success
      // best-effort release semantics without changing the failed outcome.
      if (attachPending && typeof attachPending.then === "function") {
        attachPending.then(
          () => _pr92Schema10BestEffortDetach(debuggee),
          () => {}
        );
      }
      throw error;
    }

    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA24_PRESTAGE_CLEAN_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );

    // Browser tab load completion is not composer-mount authority. Reuse the exact
    // production attachment-evidence reader and treat `officialComposerMounted=false`
    // as transient until the one outer turn deadline expires.
    let evidence = await _pr92Schema24WaitForOfficialComposerMounted(debuggee, context);

    // The evidence that first proves mount is also the first clean poll. If the
    // freshly mounted composer already contains any attachment evidence, fail
    // closed immediately rather than sleeping or attempting staging.
    let stable = 0;
    while (stable < PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS) {
      if (!_pr92Schema24EvidenceIsClean(evidence)) {
        throw new Error("PR9_2_OFFICIAL_COMPOSER_NOT_CLEAN_BEFORE_STAGING");
      }
      stable += 1;
      if (stable < PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS) {
        await _pr92BoundedSleep(
          context,
          PR92_PAGE_ATTACHMENT_POLL_MS,
          "SCHEMA24_PRESTAGE_CLEAN_STABILITY"
        );
        evidence = await _pr92ClosureReadPageOwnedAttachmentEvidence(
          debuggee,
          [],
          context
        );
      }
    }

    // Preserve schema 15's successful ownership handoff: staging may attach next,
    // so the clean observer must have fully relinquished debugger ownership first.
    await _pr92Schema15DetachWithinDeadline(
      debuggee,
      context,
      "SCHEMA24_PRESTAGE_CLEAN_DEBUGGER_DETACH"
    );
    attached = false;
  } finally {
    // Error/timeout cleanup remains non-authoritative and best-effort.
    if (attached) _pr92Schema10BestEffortDetach(debuggee);
  }
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema24Repair(message) {
  const result = await _pr92Schema24PriorExecuteNativeTurn(message);
  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA24_REPAIR_SCHEMA,
    preStageOfficialComposerMountAwaited: true,
    preStageOfficialComposerMountWaitDeadlineBounded: true,
    officialComposerMountUsesProductionAttachmentEvidenceReader: true,
    tabCompleteAloneCanProveComposerMounted: false,
    missingComposerBeforeMountClassifiedDirty: false,
    mountedAttachmentEvidenceStillFailsClosed: true
  };
};

/* END legacy source: service_worker_rich_input_schema24_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema23_diagnostic_pr9_2.js */
// PR9.2 live composer-evidence diagnostic overlay.
//
// Diagnostic-only. This file does not change the advertised rich-input schema or
// any attachment/write authority. It exposes one explicit no-write RPC that reads
// the current official composer DOM and executes the same schema-24 production
// mount wait + empty-set clean proof used before attachment staging.

const _pr92Schema23DiagnosticPriorExecuteNativeTurn = executeNativeTurn;

function _pr92Schema23DiagnosticBestEffortDetach(debuggee) {
  try {
    const pending = chrome.debugger.detach(debuggee);
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {}
}

function _pr92Schema23DiagnosticExpression() {
  return `(() => {
    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]');
    const composer = prompt instanceof Element ? prompt.closest('form') : null;
    if (!(prompt instanceof Element) || !(composer instanceof Element)) {
      return {
        officialComposerMounted: false,
        groups: [],
        buttons: []
      };
    }

    const stableComposerSelectors = [
      'button[data-testid="composer-plus-btn"]',
      'button[data-testid="composer-button-add-files"]',
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]'
    ];
    const classifyGroup = (group) => {
      const stableControls = stableComposerSelectors
        .filter((selector) => group.querySelector(selector) instanceof Element);
      const descendants = Array.from(
        group.querySelectorAll('button, [role="button"], [data-testid]')
      ).slice(0, 20).map((element) => ({
        tag: element.tagName.toLowerCase(),
        role: normalize(element.getAttribute('role')) || null,
        ariaLabel: normalize(element.getAttribute('aria-label')) || null,
        testId: normalize(element.getAttribute('data-testid')) || null,
        visible: isVisible(element)
      }));
      return {
        ariaLabel: normalize(group.getAttribute('aria-label')) || null,
        tag: group.tagName.toLowerCase(),
        testId: normalize(group.getAttribute('data-testid')) || null,
        className: typeof group.className === 'string' ? group.className.slice(0, 300) : null,
        containsPrompt: group.contains(prompt),
        stableComposerControls: stableControls,
        schema23ExcludedAsComposerControl:
          group.contains(prompt) || stableControls.length > 0,
        text: normalize(group.textContent).slice(0, 300),
        descendants
      };
    };

    const groups = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible)
      .map(classifyGroup);
    const buttons = Array.from(
      composer.querySelectorAll('button[aria-label], [role="button"][aria-label], button[data-testid]')
    ).filter(isVisible).slice(0, 40).map((element) => ({
      tag: element.tagName.toLowerCase(),
      role: normalize(element.getAttribute('role')) || null,
      ariaLabel: normalize(element.getAttribute('aria-label')) || null,
      testId: normalize(element.getAttribute('data-testid')) || null,
      text: normalize(element.textContent).slice(0, 160)
    }));

    return {
      officialComposerMounted: true,
      promptTag: prompt.tagName.toLowerCase(),
      promptTestId: normalize(prompt.getAttribute('data-testid')) || null,
      composerClassName: typeof composer.className === 'string' ? composer.className.slice(0, 300) : null,
      visibleRoleGroupCount: groups.length,
      schema23RetainedRoleGroupCount: groups.filter((group) => !group.schema23ExcludedAsComposerControl).length,
      groups,
      buttons
    };
  })()`;
}

executeNativeTurn = async function _executeNativeTurnWithPr92Schema23Diagnostic(message) {
  if (message?.diagnosePr92ComposerEvidence !== true) {
    return _pr92Schema23DiagnosticPriorExecuteNativeTurn(message);
  }
  if (message?.text != null || message?.attachmentPaths != null) {
    throw new Error("PR9_2_COMPOSER_DIAGNOSTIC_MUST_BE_NO_WRITE");
  }

  const timeoutMs = Number.isFinite(message?.timeoutMs)
    ? Math.max(1_000, Math.min(Number(message.timeoutMs), 30_000))
    : 10_000;
  const context = {
    deadlineAt: performance.now() + timeoutMs
  };
  const tab = await _pr92Schema7RunUntil(
    context.deadlineAt,
    "SCHEMA24_DIAGNOSTIC_RUNTIME_TAB",
    () => ensureRuntimeTab(null)
  );
  if (!Number.isInteger(tab?.id)) throw new Error("CHATGPT_RUNTIME_TAB_MISSING_ID");

  const debuggee = { tabId: tab.id };
  let attached = false;
  try {
    attached = await _pr92Schema13AttachWithinDeadline(debuggee, context);
    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA24_DIAGNOSTIC_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );

    // Exact schema-24 production dry-run: use the production mount wait and then
    // apply the production clean predicate to the mount evidence plus the second
    // stable poll. No text, files, staging, focus mutation, or submit is involved.
    let evidence = await _pr92Schema24WaitForOfficialComposerMounted(debuggee, context);
    const productionPolls = [];
    let stable = 0;
    while (stable < PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS) {
      const clean = _pr92Schema24EvidenceIsClean(evidence);
      productionPolls.push({ index: stable, clean, evidence });
      if (!clean) break;
      stable += 1;
      if (stable < PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS) {
        await _pr92BoundedSleep(
          context,
          PR92_PAGE_ATTACHMENT_POLL_MS,
          "SCHEMA24_DIAGNOSTIC_PRODUCTION_CLEAN_STABILITY"
        );
        evidence = await _pr92ClosureReadPageOwnedAttachmentEvidence(
          debuggee,
          [],
          context
        );
      }
    }

    const evaluated = await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA24_DIAGNOSTIC_EVIDENCE_READ",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
        expression: _pr92Schema23DiagnosticExpression(),
        returnByValue: true,
        awaitPromise: false
      })
    );
    const result = {
      diagnosticOnly: true,
      writePerformed: false,
      attachmentStagingPerformed: false,
      protectedSubmitAttempted: false,
      richInputSchemaVersion: PR92_SCHEMA24_REPAIR_SCHEMA,
      tabId: tab.id,
      productionCleanProof: {
        stablePollsRequired: PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS,
        allPollsClean: stable === PR92_SCHEMA10_PRESTAGE_CLEAN_STABLE_POLLS,
        polls: productionPolls
      },
      evidence: evaluated?.result?.value || null
    };

    // A successful diagnostic is not complete until debugger ownership has been
    // relinquished. Otherwise the immediately following real turn can race a
    // still-pending detach and fail its own attach despite a valid clean proof.
    await _pr92Schema15DetachWithinDeadline(
      debuggee,
      context,
      "SCHEMA24_DIAGNOSTIC_DEBUGGER_DETACH"
    );
    attached = false;
    return result;
  } finally {
    // Failure/timeout cleanup remains best-effort and cannot extend/rewrite the
    // already failed diagnostic outcome.
    if (attached) _pr92Schema23DiagnosticBestEffortDetach(debuggee);
  }
};

/* END legacy source: service_worker_rich_input_schema23_diagnostic_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema25_repair_pr9_2.js */
// PR9.2 schema-25 indexed removal-label normalization repair.
//
// Loaded after schema 24 and the diagnostic overlay. Authenticated schema-24 live
// validation proved staging succeeded and the real current UI exposed both exact
// filename-group evidence and a localized removal control:
//
//   role-group aria-label:  pr9_2_attachment_evidence.png
//   removal aria-label:     Удалить файл 1: pr9_2_attachment_evidence.png
//
// Schema 23 deliberately treated the two channels independently and required them
// to agree exactly, but its literal removal parser only stripped the action verb.
// It therefore compared `файл 1: <basename>` with `<basename>`, never reached exact
// cross-channel evidence, and timed out before any protected submit.
//
// Schema 25 keeps the same exact-set / cross-channel authority. It strips only an
// anchored, recognized UI metadata prefix consisting of a known file-like noun, a
// decimal ordinal, and a colon. Unknown wording remains part of the candidate and
// therefore fails exact basename comparison closed. No substring/suffix matching,
// write retry, fallback transport, or new submit authority is introduced.

const _pr92Schema25PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA25_REPAIR_SCHEMA = 25;

function _pr92Schema25RemovalControlBasename(label) {
  const normalize = (value) => typeof value === "string" ? value.trim() : "";
  const value = normalize(label);
  const action = value.match(/^(?:remove|delete|discard|удалить)(?:\s+|:\s*)/i);
  if (!action) return "";

  const payload = value.slice(action[0].length).trim();
  const indexedUiPrefix = payload.match(
    /^(?:file|image|attachment|document|файл|изображение|вложение|документ)\s+\d+\s*:\s*(.+)$/i
  );
  if (indexedUiPrefix) return normalize(indexedUiPrefix[1]);
  return payload;
}

function _pr92Schema25AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  const removalParser = _pr92Schema25RemovalControlBasename.toString();
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]');
    const composer = prompt instanceof Element ? prompt.closest('form') : null;
    if (!(prompt instanceof Element) || !(composer instanceof Element)) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        rawGroupLabelCount: 0,
        excludedComposerControlGroupCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        crossEvidenceChannelExact: false,
        officialComposerMounted: false,
        exactBasenameAssociation: false,
        structuredRemovalBasenameAssociation: false,
        filenameGroupIndependentOfRemovalControl: true,
        unknownRoleGroupsFailClosed: true,
        indexedRemovalUiPrefixNormalized: true,
        evidenceKind: 'official-composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const isStructuredRemovalLabel = (label) =>
      /^(remove|delete|discard|удалить)(?:\\s+|:\\s*)/i.test(normalize(label));
    const removalControlSelector = 'button[aria-label], [role="button"][aria-label]';

    const officialComposerControlSelectors = [
      'button[data-testid="composer-plus-btn"]',
      'button[data-testid="composer-button-add-files"]',
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]'
    ];
    const isOfficialComposerControlGroup = (group) => {
      if (!(group instanceof Element)) return false;
      if (group.contains(prompt)) return true;
      return officialComposerControlSelectors.some((selector) =>
        group.querySelector(selector) instanceof Element
      );
    };

    const rawGroupElements = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible);
    const attachmentGroupElements = rawGroupElements
      .filter((element) => !isOfficialComposerControlGroup(element));
    const groupLabels = attachmentGroupElements
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);

    const removalLabels = Array.from(composer.querySelectorAll(removalControlSelector))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(isStructuredRemovalLabel);

    const exactGroupBasename = (label, name) => label === name;
    const removalControlBasename = ${removalParser};
    const exactRemovalBasename = (label, name) => removalControlBasename(label) === name;

    const matchesExpectedExactly = (labels, matcher) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => matcher(label, name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels, exactGroupBasename);
    const removals = matchesExpectedExactly(removalLabels, exactRemovalBasename);
    const groupsCompatible = groupLabels.length === 0 || groups.exact;
    const removalsCompatible = removalLabels.length === 0 || removals.exact;
    const atLeastOneExpectedChannelExact = groups.exact || removals.exact;
    const crossEvidenceChannelExact = expected.length === 0
      ? groups.exact && removals.exact
      : groupsCompatible && removalsCompatible && atLeastOneExpectedChannelExact;
    const exactAttachmentSet = crossEvidenceChannelExact;
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      rawGroupLabelCount: rawGroupElements.length,
      excludedComposerControlGroupCount: Math.max(
        0,
        rawGroupElements.length - attachmentGroupElements.length
      ),
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      crossEvidenceChannelExact,
      officialComposerMounted: true,
      exactBasenameAssociation: true,
      structuredRemovalBasenameAssociation: true,
      filenameGroupIndependentOfRemovalControl: true,
      unknownRoleGroupsFailClosed: true,
      indexedRemovalUiPrefixNormalized: true,
      evidenceKind: groups.exact && removals.exact ? 'exact-both-evidence-channels' :
        (groups.exact && removalLabels.length === 0 ? 'exact-independent-role-group-channel' :
          (removals.exact && groupLabels.length === 0 ? 'exact-structured-remove-control-channel' : 'not-ready'))
    };
  })()`;
}

// The same dynamically bound expression is consumed by pre-stage cleanliness,
// post-stage stable evidence, revalidation after Send readiness, and schema-7's
// synchronous atomic validate+click boundary.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema25AttachmentEvidenceExpression;

function _pr92Schema25DiagnosticRemovalNormalization(result) {
  const groups = Array.isArray(result?.evidence?.groups)
    ? result.evidence.groups
        .filter((group) => group?.schema23ExcludedAsComposerControl !== true)
        .map((group) => typeof group?.ariaLabel === "string" ? group.ariaLabel.trim() : "")
        .filter(Boolean)
    : [];
  const buttons = Array.isArray(result?.evidence?.buttons) ? result.evidence.buttons : [];
  const removals = buttons
    .map((button) => typeof button?.ariaLabel === "string" ? button.ariaLabel.trim() : "")
    .filter((label) => /^(remove|delete|discard|удалить)(?:\s+|:\s*)/i.test(label))
    .map((label) => ({
      label,
      basename: _pr92Schema25RemovalControlBasename(label)
    }));
  const singleAttachmentCrossChannelExact =
    groups.length === 1 &&
    removals.length === 1 &&
    removals[0].basename === groups[0];
  return {
    groupBasenames: groups,
    removalControls: removals,
    singleAttachmentCrossChannelExact
  };
}

executeNativeTurn = async function _executeNativeTurnWithPr92Schema25Repair(message) {
  const result = await _pr92Schema25PriorExecuteNativeTurn(message);

  if (message?.diagnosePr92ComposerEvidence === true && result && typeof result === "object") {
    return {
      ...result,
      richInputSchemaVersion: PR92_SCHEMA25_REPAIR_SCHEMA,
      schema25RemovalNormalizationProof: _pr92Schema25DiagnosticRemovalNormalization(result)
    };
  }

  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA25_REPAIR_SCHEMA,
    indexedRemovalUiPrefixNormalizationSupported: true,
    indexedRemovalUiPrefixRequiresKnownNounOrdinalAndColon: true,
    indexedRemovalUiPrefixBasenameComparedExactly: true,
    unknownRemovalUiMetadataStillFailsClosed: true,
    removalNormalizationSharedByProductionAndDiagnostic: true
  };
};

/* END legacy source: service_worker_rich_input_schema25_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema26_repair_pr9_2.js */
// PR9.2 schema-26 ambiguity-safe indexed removal-label repair.
//
// Loaded after schema 25. Schema 25 correctly recognized the current localized UI
// form `Удалить файл 1: <basename>`, but it stripped the indexed noun/ordinal prefix
// unconditionally. That is ambiguous because a legitimate filename may itself be
// `file 1: report.txt`. Schema 26 therefore restores literal post-action payload
// semantics first and permits indexed-prefix interpretation only when an independent
// filename role-group corroborates the derived basename exactly.
//
// Consequences:
//   * `Remove file 1: report.txt` still proves the literal filename
//     `file 1: report.txt` in a removal-only layout;
//   * the same label may prove `report.txt` only when an independent visible
//     filename group is exactly `report.txt`;
//   * ambiguous indexed removal-only evidence for `report.txt` fails closed;
//   * exact-set, cross-channel, staging, deadline, fence, request-correlation and
//     protected-submit authority are otherwise unchanged.

const _pr92Schema26PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA26_REPAIR_SCHEMA = 26;

function _pr92Schema26RemovalPostActionPayload(label) {
  const normalize = (value) => typeof value === "string" ? value.trim() : "";
  const value = normalize(label);
  const action = value.match(/^(?:remove|delete|discard|удалить)(?:\s+|:\s*)/i);
  if (!action) return "";
  return normalize(value.slice(action[0].length));
}

function _pr92Schema26IndexedRemovalCandidate(payload) {
  const normalize = (value) => typeof value === "string" ? value.trim() : "";
  const value = normalize(payload);
  const indexedUiPrefix = value.match(
    /^(?:file|image|attachment|document|файл|изображение|вложение|документ)\s+\d+\s*:\s*(.+)$/i
  );
  return indexedUiPrefix ? normalize(indexedUiPrefix[1]) : "";
}

function _pr92Schema26AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  const payloadParser = _pr92Schema26RemovalPostActionPayload.toString();
  const indexedParser = _pr92Schema26IndexedRemovalCandidate.toString();
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]');
    const composer = prompt instanceof Element ? prompt.closest('form') : null;
    if (!(prompt instanceof Element) || !(composer instanceof Element)) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        rawGroupLabelCount: 0,
        excludedComposerControlGroupCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        crossEvidenceChannelExact: false,
        officialComposerMounted: false,
        exactBasenameAssociation: false,
        structuredRemovalBasenameAssociation: false,
        filenameGroupIndependentOfRemovalControl: true,
        unknownRoleGroupsFailClosed: true,
        indexedRemovalUiPrefixNormalized: true,
        indexedRemovalUiPrefixRequiresIndependentFilenameGroup: true,
        removalOnlyIndexedUiPrefixNormalizationAllowed: false,
        literalPostActionRemovalBasenamePreserved: true,
        evidenceKind: 'official-composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const isStructuredRemovalLabel = (label) =>
      /^(remove|delete|discard|удалить)(?:\\s+|:\\s*)/i.test(normalize(label));
    const removalControlSelector = 'button[aria-label], [role="button"][aria-label]';

    const officialComposerControlSelectors = [
      'button[data-testid="composer-plus-btn"]',
      'button[data-testid="composer-button-add-files"]',
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]'
    ];
    const isOfficialComposerControlGroup = (group) => {
      if (!(group instanceof Element)) return false;
      if (group.contains(prompt)) return true;
      return officialComposerControlSelectors.some((selector) =>
        group.querySelector(selector) instanceof Element
      );
    };

    const rawGroupElements = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible);
    const attachmentGroupElements = rawGroupElements
      .filter((element) => !isOfficialComposerControlGroup(element));
    const groupLabels = attachmentGroupElements
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);

    const removalLabels = Array.from(composer.querySelectorAll(removalControlSelector))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(isStructuredRemovalLabel);

    const exactGroupBasename = (label, name) => label === name;
    const removalPostActionPayload = ${payloadParser};
    const indexedRemovalCandidate = ${indexedParser};
    const exactRemovalBasename = (label, name) => {
      const payload = removalPostActionPayload(label);
      if (payload === name) return true;
      const candidate = indexedRemovalCandidate(payload);
      return candidate === name && groupLabels.includes(candidate);
    };

    const matchesExpectedExactly = (labels, matcher) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => matcher(label, name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels, exactGroupBasename);
    const removals = matchesExpectedExactly(removalLabels, exactRemovalBasename);
    const groupsCompatible = groupLabels.length === 0 || groups.exact;
    const removalsCompatible = removalLabels.length === 0 || removals.exact;
    const atLeastOneExpectedChannelExact = groups.exact || removals.exact;
    const crossEvidenceChannelExact = expected.length === 0
      ? groups.exact && removals.exact
      : groupsCompatible && removalsCompatible && atLeastOneExpectedChannelExact;
    const exactAttachmentSet = crossEvidenceChannelExact;
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      rawGroupLabelCount: rawGroupElements.length,
      excludedComposerControlGroupCount: Math.max(
        0,
        rawGroupElements.length - attachmentGroupElements.length
      ),
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      crossEvidenceChannelExact,
      officialComposerMounted: true,
      exactBasenameAssociation: true,
      structuredRemovalBasenameAssociation: true,
      filenameGroupIndependentOfRemovalControl: true,
      unknownRoleGroupsFailClosed: true,
      indexedRemovalUiPrefixNormalized: true,
      indexedRemovalUiPrefixRequiresIndependentFilenameGroup: true,
      removalOnlyIndexedUiPrefixNormalizationAllowed: false,
      literalPostActionRemovalBasenamePreserved: true,
      evidenceKind: groups.exact && removals.exact ? 'exact-both-evidence-channels' :
        (groups.exact && removalLabels.length === 0 ? 'exact-independent-role-group-channel' :
          (removals.exact && groupLabels.length === 0 ? 'exact-structured-remove-control-channel' : 'not-ready'))
    };
  })()`;
}

// All authority boundaries resolve this binding dynamically: pre-stage clean,
// post-stage stable evidence, pre-submit revalidation, and the atomic click task.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema26AttachmentEvidenceExpression;

function _pr92Schema26DiagnosticRemovalNormalization(result) {
  const groups = Array.isArray(result?.evidence?.groups)
    ? result.evidence.groups
        .filter((group) => group?.schema23ExcludedAsComposerControl !== true)
        .map((group) => typeof group?.ariaLabel === "string" ? group.ariaLabel.trim() : "")
        .filter(Boolean)
    : [];
  const buttons = Array.isArray(result?.evidence?.buttons) ? result.evidence.buttons : [];
  const removals = buttons
    .map((button) => typeof button?.ariaLabel === "string" ? button.ariaLabel.trim() : "")
    .filter((label) => /^(remove|delete|discard|удалить)(?:\s+|:\s*)/i.test(label))
    .map((label) => {
      const literalBasename = _pr92Schema26RemovalPostActionPayload(label);
      const indexedCandidate = _pr92Schema26IndexedRemovalCandidate(literalBasename);
      const corroboratedIndexedBasename =
        indexedCandidate && groups.includes(indexedCandidate) ? indexedCandidate : null;
      return {
        label,
        literalBasename,
        indexedCandidate: indexedCandidate || null,
        corroboratedIndexedBasename
      };
    });
  const singleAttachmentCrossChannelExact = groups.length === 1 && removals.length === 1 && (
    removals[0].literalBasename === groups[0] ||
    removals[0].corroboratedIndexedBasename === groups[0]
  );
  return {
    groupBasenames: groups,
    removalControls: removals,
    singleAttachmentCrossChannelExact
  };
}

executeNativeTurn = async function _executeNativeTurnWithPr92Schema26Repair(message) {
  const result = await _pr92Schema26PriorExecuteNativeTurn(message);

  if (message?.diagnosePr92ComposerEvidence === true && result && typeof result === "object") {
    return {
      ...result,
      richInputSchemaVersion: PR92_SCHEMA26_REPAIR_SCHEMA,
      schema26RemovalNormalizationProof: _pr92Schema26DiagnosticRemovalNormalization(result)
    };
  }

  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA26_REPAIR_SCHEMA,
    indexedRemovalUiPrefixRequiresIndependentFilenameGroup: true,
    removalOnlyIndexedUiPrefixNormalizationAllowed: false,
    literalPostActionRemovalBasenamePreserved: true,
    ambiguousIndexedRemovalLabelFailsClosedWithoutFilenameGroup: true,
    indexedRemovalCandidateStillComparedExactly: true
  };
};

/* END legacy source: service_worker_rich_input_schema26_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema26_staging_diagnostic_pr9_2.js */
// PR9.2 schema-26 staging-only live evidence diagnostic.
//
// This overlay does not advance the rich-input schema and grants no conversation
// write authority. Its explicit diagnostic RPC stages exactly one local fixture
// through the production attachment path, proves the schema-26 page-owned exact
// attachment evidence, snapshots the current composer DOM, and then invokes the
// existing durable-fence prewrite cleanup so the diagnostic cannot leave a usable
// stale attachment behind on a successful result.
//
// It never inserts text, never calls the prior page-turn chain, and never invokes a
// submit primitive. Staging may upload the selected file to the official page; that
// page mutation is reported explicitly and is distinct from a conversation write.

const _pr92Schema26StagingDiagnosticPriorExecuteNativeTurn = executeNativeTurn;

async function _pr92Schema26ReadStagedDiagnosticEvidence(tabId, attachmentPaths, context) {
  const debuggee = { tabId };
  let attached = false;
  try {
    attached = await _pr92Schema13AttachWithinDeadline(debuggee, context);
    await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA26_STAGING_DIAGNOSTIC_RUNTIME_ENABLE",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.enable")
    );
    const pageOwnedEvidence = await _pr92ClosureReadPageOwnedAttachmentEvidence(
      debuggee,
      _pr92ClosureExpectedBasenames(attachmentPaths),
      context
    );
    const raw = await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA26_STAGING_DIAGNOSTIC_RAW_DOM",
      () => chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
        expression: _pr92Schema23DiagnosticExpression(),
        returnByValue: true,
        awaitPromise: false
      })
    );
    const rawEvidence = raw?.result?.value || null;
    const normalizationProof = _pr92Schema26DiagnosticRemovalNormalization({
      evidence: rawEvidence
    });

    await _pr92Schema15DetachWithinDeadline(
      debuggee,
      context,
      "SCHEMA26_STAGING_DIAGNOSTIC_DEBUGGER_DETACH"
    );
    attached = false;
    return {
      pageOwnedEvidence,
      rawEvidence,
      normalizationProof
    };
  } finally {
    if (attached) _pr92Schema13BestEffortDetach(debuggee);
  }
}

executeNativeTurn = async function _executeNativeTurnWithPr92Schema26StagingDiagnostic(message) {
  if (message?.diagnosePr92StagedAttachmentEvidence !== true) {
    return _pr92Schema26StagingDiagnosticPriorExecuteNativeTurn(message);
  }
  if (message?.text != null) {
    throw new Error("PR9_2_SCHEMA26_STAGING_DIAGNOSTIC_TEXT_FORBIDDEN");
  }
  if (_pr92ActiveTurnContext !== null || _pr92ActiveRichInputContext !== null) {
    throw new Error("PR9_2_TURN_CONTEXT_BUSY");
  }

  const attachmentPaths = _pr92NormalizeAttachmentPaths(message?.attachmentPaths);
  if (attachmentPaths.length !== 1) {
    throw new Error("PR9_2_SCHEMA26_STAGING_DIAGNOSTIC_EXACTLY_ONE_ATTACHMENT_REQUIRED");
  }

  const context = _pr92CreateTurnContext(message);
  context.attachmentPaths = attachmentPaths;
  _pr92ActiveTurnContext = context;
  let staged = false;
  let stagedTabId = null;
  try {
    // Reuse normal fail-closed prewrite cleanup before creating any new staged state.
    await _pr92RequireCleanAttachmentState(context);

    const tab = await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA26_STAGING_DIAGNOSTIC_RUNTIME_TAB",
      () => ensureRuntimeTab(null)
    );
    if (!Number.isInteger(tab?.id)) throw new Error("CHATGPT_RUNTIME_TAB_MISSING_ID");
    stagedTabId = tab.id;

    const stagedCount = await _pr92StageOfficialPageAttachments(
      tab.id,
      attachmentPaths,
      context
    );
    if (stagedCount !== 1) {
      throw new Error("PR9_2_SCHEMA26_STAGING_DIAGNOSTIC_STAGE_COUNT_MISMATCH");
    }
    staged = true;

    const evidence = await _pr92Schema26ReadStagedDiagnosticEvidence(
      tab.id,
      attachmentPaths,
      context
    );
    const pageOwned = evidence.pageOwnedEvidence;
    if (
      pageOwned?.ready !== true ||
      pageOwned?.exactAttachmentSet !== true ||
      pageOwned?.crossEvidenceChannelExact !== true ||
      Number(pageOwned?.matchedCount) !== 1
    ) {
      throw new Error("PR9_2_SCHEMA26_STAGING_DIAGNOSTIC_EXACT_EVIDENCE_NOT_PROVEN");
    }
    if (evidence.normalizationProof?.singleAttachmentCrossChannelExact !== true) {
      throw new Error("PR9_2_SCHEMA26_STAGING_DIAGNOSTIC_CROSS_CHANNEL_NORMALIZATION_NOT_PROVEN");
    }

    // The normal staging path persisted the durable attachment fence before file
    // selection. Reuse the production stale-state cleanup while the same bounded
    // context is active; a successful diagnostic is not returned until cleanup is
    // proven and the persisted fence is gone.
    await _pr92RequireCleanAttachmentState(context);
    const remainingFence = await _pr92ReadDirtyAttachmentFence();
    if (Number.isInteger(remainingFence)) {
      throw new Error("PR9_2_SCHEMA26_STAGING_DIAGNOSTIC_CLEANUP_UNPROVEN");
    }

    return {
      diagnosticOnly: true,
      stagingOnly: true,
      fileUploadPerformed: true,
      writePerformed: false,
      conversationWritePerformed: false,
      textInsertionPerformed: false,
      protectedSubmitAttempted: false,
      automaticWriteRetry: false,
      fallbackTransport: null,
      richInputSchemaVersion: PR92_SCHEMA26_REPAIR_SCHEMA,
      tabId: stagedTabId,
      attachmentCount: stagedCount,
      expectedBasenames: _pr92ClosureExpectedBasenames(attachmentPaths),
      pageOwnedEvidence: pageOwned,
      rawEvidence: evidence.rawEvidence,
      schema26RemovalNormalizationProof: evidence.normalizationProof,
      cleanupProven: true,
      durableFenceCleared: true
    };
  } catch (error) {
    // If staging occurred and cleanup cannot be proven, deliberately retain the
    // durable fence. The next ordinary turn must execute the existing destructive
    // prewrite cleanup before it can obtain any write authority.
    if (staged) {
      try {
        if (_pr92RemainingTurnMsOrZero(context) > 0) {
          await _pr92RequireCleanAttachmentState(context);
        }
      } catch {}
    }
    throw error;
  } finally {
    _pr92ActiveTurnContext = null;
  }
};

/* END legacy source: service_worker_rich_input_schema26_staging_diagnostic_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema27_repair_pr9_2.js */
// PR9.2 schema-27 bidirectional indexed removal-label ambiguity repair.
//
// Loaded after schema 26. Schema 26 correctly stopped using the stripped indexed
// candidate without filename-group corroboration, but still accepted the complete
// post-action payload literally first. For a label such as
// `Remove file 1: report.txt`, that is still ambiguous in both directions: the
// actual basename may be `file 1: report.txt`, or the UI may be decorating the
// actual basename `report.txt` with file/ordinal metadata.
//
// Schema 27 therefore treats every post-action payload that matches the indexed UI
// grammar as intrinsically ambiguous. Neither the complete payload nor the stripped
// candidate can satisfy removal evidence alone. An indexed-looking removal label
// corroborates an expected basename only when an independent visible filename
// role-group equals that exact interpretation. Non-indexed removal payloads retain
// the schema-11 literal exact semantics.

const _pr92Schema27PriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA27_REPAIR_SCHEMA = 27;

function _pr92Schema27RemovalPostActionPayload(label) {
  const normalize = (value) => typeof value === "string" ? value.trim() : "";
  const value = normalize(label);
  const action = value.match(/^(?:remove|delete|discard|удалить)(?:\s+|:\s*)/i);
  if (!action) return "";
  return normalize(value.slice(action[0].length));
}

function _pr92Schema27IndexedRemovalCandidate(payload) {
  const normalize = (value) => typeof value === "string" ? value.trim() : "";
  const value = normalize(payload);
  const indexedUiPrefix = value.match(
    /^(?:file|image|attachment|document|файл|изображение|вложение|документ)\s+\d+\s*:\s*(.+)$/i
  );
  return indexedUiPrefix ? normalize(indexedUiPrefix[1]) : "";
}

function _pr92Schema27AttachmentEvidenceExpression(expectedNames) {
  const encodedNames = JSON.stringify(expectedNames);
  const payloadParser = _pr92Schema27RemovalPostActionPayload.toString();
  const indexedParser = _pr92Schema27IndexedRemovalCandidate.toString();
  return `(() => {
    const expected = ${encodedNames};
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const prompt = document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]');
    const composer = prompt instanceof Element ? prompt.closest('form') : null;
    if (!(prompt instanceof Element) || !(composer instanceof Element)) {
      return {
        ready: false,
        rejected: false,
        matchedCount: 0,
        groupLabelCount: 0,
        rawGroupLabelCount: 0,
        excludedComposerControlGroupCount: 0,
        removalLabelCount: 0,
        exactAttachmentSet: false,
        crossEvidenceChannelExact: false,
        officialComposerMounted: false,
        exactBasenameAssociation: false,
        structuredRemovalBasenameAssociation: false,
        filenameGroupIndependentOfRemovalControl: true,
        unknownRoleGroupsFailClosed: true,
        indexedRemovalUiPrefixNormalized: true,
        indexedRemovalUiPrefixRequiresIndependentFilenameGroup: true,
        removalOnlyIndexedUiPrefixNormalizationAllowed: false,
        indexedRemovalLiteralInterpretationRequiresIndependentFilenameGroup: true,
        indexedRemovalStrippedInterpretationRequiresIndependentFilenameGroup: true,
        indexedRemovalAmbiguityBidirectionalFailClosed: true,
        unindexedRemovalLiteralSemanticsPreserved: true,
        evidenceKind: 'official-composer-missing'
      };
    }

    const normalize = (value) => typeof value === 'string' ? value.trim() : '';
    const isStructuredRemovalLabel = (label) =>
      /^(remove|delete|discard|удалить)(?:\\s+|:\\s*)/i.test(normalize(label));
    const removalControlSelector = 'button[aria-label], [role="button"][aria-label]';

    const officialComposerControlSelectors = [
      'button[data-testid="composer-plus-btn"]',
      'button[data-testid="composer-button-add-files"]',
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]'
    ];
    const isOfficialComposerControlGroup = (group) => {
      if (!(group instanceof Element)) return false;
      if (group.contains(prompt)) return true;
      return officialComposerControlSelectors.some((selector) =>
        group.querySelector(selector) instanceof Element
      );
    };

    const rawGroupElements = Array.from(composer.querySelectorAll('[role="group"][aria-label]'))
      .filter(isVisible);
    const attachmentGroupElements = rawGroupElements
      .filter((element) => !isOfficialComposerControlGroup(element));
    const groupLabels = attachmentGroupElements
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(Boolean);

    const removalLabels = Array.from(composer.querySelectorAll(removalControlSelector))
      .filter(isVisible)
      .map((element) => normalize(element.getAttribute('aria-label')))
      .filter(isStructuredRemovalLabel);

    const exactGroupBasename = (label, name) => label === name;
    const removalPostActionPayload = ${payloadParser};
    const indexedRemovalCandidate = ${indexedParser};
    const exactRemovalBasename = (label, name) => {
      const payload = removalPostActionPayload(label);
      const candidate = indexedRemovalCandidate(payload);
      if (!candidate) return payload === name;

      // Indexed-looking payloads are ambiguous in both directions. The removal
      // channel may corroborate only the exact interpretation independently named
      // by a visible filename group; removal-only authority is deliberately zero.
      return (
        (payload === name && groupLabels.includes(payload)) ||
        (candidate === name && groupLabels.includes(candidate))
      );
    };

    const matchesExpectedExactly = (labels, matcher) => {
      const pool = labels.slice();
      let matched = 0;
      for (const name of expected) {
        const index = pool.findIndex((label) => matcher(label, name));
        if (index < 0) {
          return {
            exact: false,
            matched,
            totalCount: labels.length,
            unusedCount: pool.length
          };
        }
        pool.splice(index, 1);
        matched += 1;
      }
      return {
        exact: matched === expected.length && pool.length === 0,
        matched,
        totalCount: labels.length,
        unusedCount: pool.length
      };
    };

    const groups = matchesExpectedExactly(groupLabels, exactGroupBasename);
    const removals = matchesExpectedExactly(removalLabels, exactRemovalBasename);
    const groupsCompatible = groupLabels.length === 0 || groups.exact;
    const removalsCompatible = removalLabels.length === 0 || removals.exact;
    const atLeastOneExpectedChannelExact = groups.exact || removals.exact;
    const crossEvidenceChannelExact = expected.length === 0
      ? groups.exact && removals.exact
      : groupsCompatible && removalsCompatible && atLeastOneExpectedChannelExact;
    const exactAttachmentSet = crossEvidenceChannelExact;
    const matchedCount = exactAttachmentSet
      ? expected.length
      : Math.max(groups.matched, removals.matched);

    const statusNodes = Array.from(
      composer.querySelectorAll('[role="alert"], [aria-live], [data-testid*="error"], [aria-label]')
    ).filter(isVisible);
    const statusText = statusNodes.map((element) => {
      return normalize(element.getAttribute('aria-label')) + ' ' + normalize(element.textContent);
    }).join(' ');
    const rejected = /(upload|attachment|file).{0,40}(failed|error|unsupported|too large)|(failed|error|unsupported).{0,40}(upload|attachment|file)|(не удалось|ошибка).{0,40}(загруз|файл)/i.test(statusText);

    return {
      ready: exactAttachmentSet,
      rejected,
      matchedCount,
      groupLabelCount: groupLabels.length,
      rawGroupLabelCount: rawGroupElements.length,
      excludedComposerControlGroupCount: Math.max(
        0,
        rawGroupElements.length - attachmentGroupElements.length
      ),
      removalLabelCount: removalLabels.length,
      exactAttachmentSet,
      crossEvidenceChannelExact,
      officialComposerMounted: true,
      exactBasenameAssociation: true,
      structuredRemovalBasenameAssociation: true,
      filenameGroupIndependentOfRemovalControl: true,
      unknownRoleGroupsFailClosed: true,
      indexedRemovalUiPrefixNormalized: true,
      indexedRemovalUiPrefixRequiresIndependentFilenameGroup: true,
      removalOnlyIndexedUiPrefixNormalizationAllowed: false,
      indexedRemovalLiteralInterpretationRequiresIndependentFilenameGroup: true,
      indexedRemovalStrippedInterpretationRequiresIndependentFilenameGroup: true,
      indexedRemovalAmbiguityBidirectionalFailClosed: true,
      unindexedRemovalLiteralSemanticsPreserved: true,
      evidenceKind: groups.exact && removals.exact ? 'exact-both-evidence-channels' :
        (groups.exact && removalLabels.length === 0 ? 'exact-independent-role-group-channel' :
          (removals.exact && groupLabels.length === 0 ? 'exact-structured-remove-control-channel' : 'not-ready'))
    };
  })()`;
}

// Every existing authority boundary resolves this shared expression dynamically:
// pre-stage clean, post-stage stable evidence, pre-submit revalidation, and the
// schema-7 synchronous atomic attachment-validation + protected click task.
_pr92ClosureAttachmentEvidenceExpression = _pr92Schema27AttachmentEvidenceExpression;

function _pr92Schema27DiagnosticRemovalNormalization(result) {
  const groups = Array.isArray(result?.evidence?.groups)
    ? result.evidence.groups
        .filter((group) => group?.schema23ExcludedAsComposerControl !== true)
        .map((group) => typeof group?.ariaLabel === "string" ? group.ariaLabel.trim() : "")
        .filter(Boolean)
    : [];
  const buttons = Array.isArray(result?.evidence?.buttons) ? result.evidence.buttons : [];
  const removals = buttons
    .map((button) => typeof button?.ariaLabel === "string" ? button.ariaLabel.trim() : "")
    .filter((label) => /^(remove|delete|discard|удалить)(?:\s+|:\s*)/i.test(label))
    .map((label) => {
      const payload = _pr92Schema27RemovalPostActionPayload(label);
      const indexedCandidate = _pr92Schema27IndexedRemovalCandidate(payload);
      const indexedAmbiguous = Boolean(indexedCandidate);
      const corroboratedLiteralBasename =
        indexedAmbiguous && groups.includes(payload) ? payload : null;
      const corroboratedIndexedBasename =
        indexedAmbiguous && groups.includes(indexedCandidate) ? indexedCandidate : null;
      const unambiguousLiteralBasename = indexedAmbiguous ? null : payload;
      return {
        label,
        postActionPayload: payload,
        indexedCandidate: indexedCandidate || null,
        indexedAmbiguous,
        unambiguousLiteralBasename,
        corroboratedLiteralBasename,
        corroboratedIndexedBasename
      };
    });

  const singleAttachmentCrossChannelExact = groups.length === 1 && removals.length === 1 && (
    removals[0].unambiguousLiteralBasename === groups[0] ||
    removals[0].corroboratedLiteralBasename === groups[0] ||
    removals[0].corroboratedIndexedBasename === groups[0]
  );
  return {
    groupBasenames: groups,
    removalControls: removals,
    singleAttachmentCrossChannelExact
  };
}

executeNativeTurn = async function _executeNativeTurnWithPr92Schema27Repair(message) {
  const result = await _pr92Schema27PriorExecuteNativeTurn(message);

  if (message?.diagnosePr92ComposerEvidence === true && result && typeof result === "object") {
    return {
      ...result,
      richInputSchemaVersion: PR92_SCHEMA27_REPAIR_SCHEMA,
      schema27RemovalNormalizationProof: _pr92Schema27DiagnosticRemovalNormalization(result)
    };
  }

  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA27_REPAIR_SCHEMA,
    indexedRemovalAmbiguityBidirectionalFailClosed: true,
    indexedRemovalLiteralInterpretationRequiresIndependentFilenameGroup: true,
    indexedRemovalStrippedInterpretationRequiresIndependentFilenameGroup: true,
    indexedRemovalRemovalOnlyAuthorityAllowed: false,
    unindexedRemovalLiteralSemanticsPreserved: true,
    indexedRemovalInterpretationSelectedByExactFilenameGroupOnly: true
  };
};

/* END legacy source: service_worker_rich_input_schema27_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema27_staging_diagnostic_pr9_2.js */
// PR9.2 schema-27 staging-only live evidence diagnostic.
//
// Explicit diagnostic RPC only. It may stage/upload one generated local fixture on
// the official page, but it grants no conversation-write authority: no text is
// inserted and no submit primitive is invoked. It reuses production staging and the
// schema-27 page-owned evidence expression, then requires the schema-27 ambiguity
// proof before invoking the existing durable-fence destructive cleanup.

const _pr92Schema27StagingDiagnosticPriorExecuteNativeTurn = executeNativeTurn;

executeNativeTurn = async function _executeNativeTurnWithPr92Schema27StagingDiagnostic(message) {
  if (message?.diagnosePr92StagedAttachmentEvidenceSchema27 !== true) {
    return _pr92Schema27StagingDiagnosticPriorExecuteNativeTurn(message);
  }
  if (message?.text != null) {
    throw new Error("PR9_2_SCHEMA27_STAGING_DIAGNOSTIC_TEXT_FORBIDDEN");
  }
  if (_pr92ActiveTurnContext !== null || _pr92ActiveRichInputContext !== null) {
    throw new Error("PR9_2_TURN_CONTEXT_BUSY");
  }

  const attachmentPaths = _pr92NormalizeAttachmentPaths(message?.attachmentPaths);
  if (attachmentPaths.length !== 1) {
    throw new Error("PR9_2_SCHEMA27_STAGING_DIAGNOSTIC_EXACTLY_ONE_ATTACHMENT_REQUIRED");
  }

  const context = _pr92CreateTurnContext(message);
  context.attachmentPaths = attachmentPaths;
  _pr92ActiveTurnContext = context;
  let stagedTabId = null;
  try {
    await _pr92RequireCleanAttachmentState(context);

    const tab = await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA27_STAGING_DIAGNOSTIC_RUNTIME_TAB",
      () => ensureRuntimeTab(null)
    );
    if (!Number.isInteger(tab?.id)) throw new Error("CHATGPT_RUNTIME_TAB_MISSING_ID");
    stagedTabId = tab.id;

    // This production binding already performs the schema-24 clean proof, schema-13
    // durable-fenced DOM.setFileInputFiles staging, and stable page-owned evidence.
    // Because schema 27 rebound the shared evidence expression, every evidence read
    // inside this call uses the bidirectional ambiguity-safe matcher.
    const stagedCount = await _pr92StageOfficialPageAttachments(
      tab.id,
      attachmentPaths,
      context
    );
    if (stagedCount !== 1) {
      throw new Error("PR9_2_SCHEMA27_STAGING_DIAGNOSTIC_STAGE_COUNT_MISMATCH");
    }

    // Reuse the bounded diagnostic DOM observer only as a reader. Its historical
    // schema-26 normalization field is deliberately ignored; schema 27 recomputes
    // normalization from the raw DOM below.
    const evidence = await _pr92Schema26ReadStagedDiagnosticEvidence(
      tab.id,
      attachmentPaths,
      context
    );
    const pageOwned = evidence.pageOwnedEvidence;
    const schema27Normalization = _pr92Schema27DiagnosticRemovalNormalization({
      evidence: evidence.rawEvidence
    });

    if (
      pageOwned?.ready !== true ||
      pageOwned?.exactAttachmentSet !== true ||
      pageOwned?.crossEvidenceChannelExact !== true ||
      pageOwned?.indexedRemovalAmbiguityBidirectionalFailClosed !== true ||
      pageOwned?.indexedRemovalLiteralInterpretationRequiresIndependentFilenameGroup !== true ||
      pageOwned?.indexedRemovalStrippedInterpretationRequiresIndependentFilenameGroup !== true ||
      Number(pageOwned?.matchedCount) !== 1
    ) {
      throw new Error("PR9_2_SCHEMA27_STAGING_DIAGNOSTIC_EXACT_EVIDENCE_NOT_PROVEN");
    }
    if (schema27Normalization?.singleAttachmentCrossChannelExact !== true) {
      throw new Error("PR9_2_SCHEMA27_STAGING_DIAGNOSTIC_NORMALIZATION_NOT_PROVEN");
    }

    // The durable fence was persisted before file selection. Successful diagnostic
    // completion reuses production prewrite recovery, which may destructively close
    // only the exact extension-managed fenced runtime tab under its identity guards
    // and clears the fence only after tab absence is proven.
    await _pr92RequireCleanAttachmentState(context);
    const remainingFence = await _pr92ReadDirtyAttachmentFence();
    if (Number.isInteger(remainingFence)) {
      throw new Error("PR9_2_SCHEMA27_STAGING_DIAGNOSTIC_CLEANUP_UNPROVEN");
    }

    return {
      diagnosticOnly: true,
      stagingOnly: true,
      fileUploadPerformed: true,
      writePerformed: false,
      conversationWritePerformed: false,
      textInsertionPerformed: false,
      protectedSubmitAttempted: false,
      automaticWriteRetry: false,
      fallbackTransport: null,
      richInputSchemaVersion: PR92_SCHEMA27_REPAIR_SCHEMA,
      tabId: stagedTabId,
      attachmentCount: stagedCount,
      expectedBasenames: _pr92ClosureExpectedBasenames(attachmentPaths),
      pageOwnedEvidence: pageOwned,
      rawEvidence: evidence.rawEvidence,
      schema27RemovalNormalizationProof: schema27Normalization,
      cleanupProven: true,
      durableFenceCleared: true
    };
  } catch (error) {
    // The full production staging wrapper can fail after DOM.setFileInputFiles has
    // already executed (for example, during post-stage evidence). Do not key cleanup
    // eligibility on the wrapper having returned successfully. The durable fence was
    // persisted before file selection and is the authoritative proof that partial
    // staging may exist. If budget remains, read that fence and invoke the established
    // destructive prewrite recovery; otherwise retain it so the next write fails closed.
    try {
      if (_pr92RemainingTurnMsOrZero(context) > 0) {
        const residualFence = await _pr92ReadDirtyAttachmentFence();
        if (Number.isInteger(residualFence)) {
          await _pr92RequireCleanAttachmentState(context);
        }
      }
    } catch {}
    throw error;
  } finally {
    _pr92ActiveTurnContext = null;
  }
};

/* END legacy source: service_worker_rich_input_schema27_staging_diagnostic_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema28_repair_pr9_2.js */
// PR9.2 schema-28 request-bound stream-handoff parser repair.
//
// Authenticated schema-27 validation proved the protected image write completed and
// ChatGPT produced the attachment-dependent answer, but the turn failed with
// PR9_2_WRITE_COMPLETED_CONVERSATION_ID_UNRESOLVED. The inherited base parser
// prefiltered SSE payload text with the serialization-specific substring
// `"type":"stream_handoff"` before JSON.parse and rejected every base64Encoded
// response body. Current ChatGPT emits valid stream-handoff JSON with ordinary
// whitespace (for example `"type": "stream_handoff"`), so exact-request identity
// could be present while the parser returned null.
//
// Schema 28 changes no identity source. New-chat identity remains exclusively the
// stream_handoff.conversation_id parsed from Network.getResponseBody for the exact
// protected requestId already proven by requestWillBeSent + loadingFinished. Route
// state remains diagnostic only. The repair parses JSON before inspecting `type`,
// decodes CDP base64 response-body representation as UTF-8, and fails closed if
// multiple stream_handoff records disagree on conversation identity.

const _pr92Schema28PriorExecuteNativeTurn = executeNativeTurn;
const _pr92Schema28PriorExtractSafeStreamMetadata = extractSafeStreamMetadata;
const PR92_SCHEMA28_REPAIR_SCHEMA = 28;
const PR92_SCHEMA28_COMMITTED_IDENTITY_ERROR =
  "PR9_2_WRITE_COMPLETED_CONVERSATION_ID_UNRESOLVED";

let _pr92Schema28LastIdentityParseDiagnostics = null;

function _pr92Schema28DecodeResponseBody(body, base64Encoded) {
  if (typeof body !== "string") return null;
  if (base64Encoded !== true) return body;
  try {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

function _pr92Schema28ExtractRequestBoundStreamMetadata(body, base64Encoded) {
  const decoded = _pr92Schema28DecodeResponseBody(body, base64Encoded);
  const diagnostics = {
    bodyDecoded: typeof decoded === "string",
    base64Encoded: base64Encoded === true,
    parsedJsonDataRecords: 0,
    streamHandoffCount: 0,
    conflictingConversationIds: false
  };
  if (typeof decoded !== "string") {
    return {
      conversationId: null,
      turnExchangeId: null,
      diagnostics
    };
  }

  let conversationId = null;
  let turnExchangeId = null;
  for (const rawLine of decoded.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) continue;
    const payloadText = rawLine.slice(5).trim();
    if (!payloadText || payloadText === "[DONE]" || !payloadText.startsWith("{")) {
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(payloadText);
      diagnostics.parsedJsonDataRecords += 1;
    } catch {
      continue;
    }
    if (payload?.type !== "stream_handoff") continue;
    diagnostics.streamHandoffCount += 1;

    const candidateConversationId =
      typeof payload?.conversation_id === "string" && payload.conversation_id.trim()
        ? payload.conversation_id.trim()
        : null;
    if (!candidateConversationId) continue;

    if (conversationId !== null && conversationId !== candidateConversationId) {
      diagnostics.conflictingConversationIds = true;
      conversationId = null;
      turnExchangeId = null;
      break;
    }
    conversationId = candidateConversationId;

    const candidateTurnExchangeId =
      typeof payload?.turn_exchange_id === "string" && payload.turn_exchange_id.trim()
        ? payload.turn_exchange_id.trim()
        : null;
    if (candidateTurnExchangeId) turnExchangeId = candidateTurnExchangeId;
  }

  return {
    conversationId: diagnostics.conflictingConversationIds ? null : conversationId,
    turnExchangeId: diagnostics.conflictingConversationIds ? null : turnExchangeId,
    diagnostics
  };
}

extractSafeStreamMetadata = function _pr92Schema28ExtractSafeStreamMetadata(
  body,
  base64Encoded
) {
  // Preserve the complete pre-schema-28 metadata observer chain for side effects
  // such as PR8.8 INSTANT/model/reasoning responseHints. When CDP represents the
  // body as base64, decode it first and present the prior observer with the same
  // UTF-8 SSE text it historically understands. Its returned metadata is
  // deliberately ignored: schema-28 request-bound parsing below remains the sole
  // authority for conversationId/turnExchangeId. Any historical schema-19 causal
  // fields written by the prior observer are overwritten from schema-28 results.
  const observerBody = _pr92Schema28DecodeResponseBody(body, base64Encoded);
  try {
    if (typeof observerBody === "string") {
      _pr92Schema28PriorExtractSafeStreamMetadata(observerBody, false);
    } else {
      _pr92Schema28PriorExtractSafeStreamMetadata(body, base64Encoded);
    }
  } catch {
    // Observability must never perturb the request-bound identity path.
  }

  const parsed = _pr92Schema28ExtractRequestBoundStreamMetadata(body, base64Encoded);
  _pr92Schema28LastIdentityParseDiagnostics = { ...parsed.diagnostics };

  // Schema 19 consumes these context fields after schema 17 has read the body for
  // the exact completed requestId. Preserve that same request-bound handoff and do
  // not consult route/tab state here.
  const context = _pr92ActiveRichInputContext;
  if (context !== null) {
    context.schema19CausalConversationId =
      typeof parsed.conversationId === "string" && parsed.conversationId
        ? parsed.conversationId
        : null;
    context.schema19CausalTurnExchangeId =
      typeof parsed.turnExchangeId === "string" && parsed.turnExchangeId
        ? parsed.turnExchangeId
        : null;
  }

  return {
    conversationId: parsed.conversationId,
    turnExchangeId: parsed.turnExchangeId
  };
};

async function _pr92Schema28ReadDiagnosticTab(tabId, context) {
  if (!Number.isInteger(tabId)) return null;
  try {
    const tab = await _pr92Schema7RunUntil(
      context.deadlineAt,
      "SCHEMA28_COMMITTED_IDENTITY_DIAGNOSTIC_TAB_READ",
      () => chrome.tabs.get(tabId)
    );
    return {
      tabId,
      url: typeof tab?.url === "string" ? tab.url : null,
      routeConversationId: conversationIdFromUrl(tab?.url || "") || null
    };
  } catch {
    return { tabId, url: null, routeConversationId: null };
  }
}

async function _pr92Schema28CommittedIdentityDiagnostic(message) {
  if (message?.text != null || message?.attachmentPaths != null) {
    throw new Error("PR9_2_SCHEMA28_COMMITTED_IDENTITY_DIAGNOSTIC_WRITE_INPUT_FORBIDDEN");
  }
  if (_pr92ActiveTurnContext !== null || _pr92ActiveRichInputContext !== null) {
    throw new Error("PR9_2_TURN_CONTEXT_BUSY");
  }

  const context = _pr92CreateTurnContext(message);
  _pr92ActiveTurnContext = context;
  try {
    const fenceBefore = await _pr92ReadDirtyAttachmentFence();
    let runtimeTabId = null;
    if (Number.isInteger(fenceBefore)) {
      runtimeTabId = fenceBefore;
    } else {
      try {
        runtimeTabId = await _pr92Schema7RunUntil(
          context.deadlineAt,
          "SCHEMA28_COMMITTED_IDENTITY_DIAGNOSTIC_RUNTIME_TAB_ID",
          () => storedRuntimeTabId()
        );
      } catch {
        runtimeTabId = null;
      }
    }

    // Route state is captured before any governed cleanup only as diagnostic
    // evidence. It cannot satisfy or override request-bound conversation identity.
    const tabBeforeCleanup = await _pr92Schema28ReadDiagnosticTab(runtimeTabId, context);
    let cleanupAttempted = false;
    if (Number.isInteger(fenceBefore)) {
      cleanupAttempted = true;
      // This production recovery returns only after its existing identity-guarded
      // destructive close and explicit tab-absence proof have completed, and clears
      // the durable fence only after that proof. Do not manufacture a second proof
      // with a post-cleanup tabs.get whose timeout could be mistaken for absence.
      await _pr92RequireCleanAttachmentState(context);
    }

    const fenceAfter = await _pr92ReadDirtyAttachmentFence();
    if (Number.isInteger(fenceAfter)) {
      throw new Error("PR9_2_SCHEMA28_COMMITTED_IDENTITY_DIAGNOSTIC_FENCE_REMAINS");
    }

    const fencedTabAbsentAfterCleanup = Number.isInteger(fenceBefore) ? true : null;
    return {
      diagnosticOnly: true,
      reconciliationOnly: true,
      writePerformed: false,
      conversationWritePerformed: false,
      attachmentStagingPerformed: false,
      textInsertionPerformed: false,
      protectedSubmitAttempted: false,
      automaticWriteRetry: false,
      fallbackTransport: null,
      richInputSchemaVersion: PR92_SCHEMA28_REPAIR_SCHEMA,
      durableFencePresentBefore: Number.isInteger(fenceBefore),
      cleanupAttempted,
      cleanupProven: !Number.isInteger(fenceAfter),
      durableFenceCleared: !Number.isInteger(fenceAfter),
      fencedTabAbsentAfterCleanup,
      fencedTabAbsenceAuthority: Number.isInteger(fenceBefore)
        ? "PRODUCTION_REQUIRE_CLEAN_ATTACHMENT_STATE"
        : null,
      observedTabIdBeforeCleanup: tabBeforeCleanup?.tabId ?? null,
      observedRouteConversationIdDiagnostic:
        tabBeforeCleanup?.routeConversationId ?? null,
      observedUrlBeforeCleanup: tabBeforeCleanup?.url ?? null,
      routeConversationIdentityAuthoritative: false
    };
  } finally {
    _pr92ActiveTurnContext = null;
  }
}

executeNativeTurn = async function _executeNativeTurnWithPr92Schema28Repair(message) {
  if (message?.diagnosePr92CommittedIdentityStateSchema28 === true) {
    return _pr92Schema28CommittedIdentityDiagnostic(message);
  }

  const isPotentialNewChatRichWrite =
    Array.isArray(message?.attachmentPaths) &&
    message.attachmentPaths.length > 0 &&
    !(typeof message?.conversationId === "string" && message.conversationId.trim());
  if (isPotentialNewChatRichWrite) {
    _pr92Schema28LastIdentityParseDiagnostics = null;
  }

  let result;
  try {
    result = await _pr92Schema28PriorExecuteNativeTurn(message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.startsWith(PR92_SCHEMA28_COMMITTED_IDENTITY_ERROR)) {
      const diagnostics = _pr92Schema28LastIdentityParseDiagnostics;
      const suffix = diagnostics
        ? `:SCHEMA28:bodyDecoded=${diagnostics.bodyDecoded === true}` +
          `:base64Encoded=${diagnostics.base64Encoded === true}` +
          `:parsedJsonDataRecords=${Number(diagnostics.parsedJsonDataRecords) || 0}` +
          `:streamHandoffCount=${Number(diagnostics.streamHandoffCount) || 0}` +
          `:conflictingConversationIds=${diagnostics.conflictingConversationIds === true}`
        : ":SCHEMA28:identityParserNotReached=true";
      throw new Error(`${PR92_SCHEMA28_COMMITTED_IDENTITY_ERROR}${suffix}`);
    }
    throw error;
  }

  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA28_REPAIR_SCHEMA,
    causalStreamHandoffJsonParsedBeforeTypeFilter: true,
    causalStreamHandoffJsonWhitespaceInvariant: true,
    causalStreamHandoffBase64BodyDecodingSupported: true,
    conflictingStreamHandoffConversationIdsFailClosed: true,
    priorStreamMetadataObserverSideEffectsPreserved: true,
    routeConversationIdentityAuthoritative: false,
    automaticWriteRetryAfterCausalIdentityFailure: false
  };
};

/* END legacy source: service_worker_rich_input_schema28_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema28_diagnostic_repair_pr9_2.js */
// PR9.2 schema-28 diagnostic-only reconciliation repair.
//
// This overlay does not modify rich-input write, staging, protected-submit, or
// causal identity authority. It only repairs the committed-state reconciliation
// diagnostic added by schema 28:
//   1. optional route sampling must not consume cleanup authority/budget;
//   2. clearing the durable fence through production recovery does not always
//      imply that the numeric tab id is literally absent (a reused non-ChatGPT
//      id is intentionally left untouched), so tab presence is reported as a
//      separate tri-state diagnostic observation.
//
// Turn deadlines are monotonic (performance.now based), so every local diagnostic
// sub-budget below deliberately stays in that same clock domain.

const _pr92Schema28DiagnosticRepairPriorExecuteNativeTurn = executeNativeTurn;
const PR92_SCHEMA28_DIAGNOSTIC_ROUTE_SAMPLE_MAX_MS = 250;
const PR92_SCHEMA28_DIAGNOSTIC_CLEANUP_RESERVE_MS = 10000;
const PR92_SCHEMA28_DIAGNOSTIC_RETURN_RESERVE_MS = 1000;
const PR92_SCHEMA28_DIAGNOSTIC_POST_CLEANUP_SAMPLE_MAX_MS = 250;

function _pr92Schema28DiagnosticRemainingMs(context) {
  return Math.max(0, context.deadlineAt - performance.now());
}

async function _pr92Schema28DiagnosticReadTab(tabId, deadlineAt, label) {
  if (!Number.isInteger(tabId) || !Number.isFinite(deadlineAt) || deadlineAt <= performance.now()) {
    return {
      state: "unknown",
      tabId: Number.isInteger(tabId) ? tabId : null,
      url: null,
      routeConversationId: null
    };
  }
  try {
    const tab = await _pr92Schema7RunUntil(
      deadlineAt,
      label,
      () => chrome.tabs.get(tabId)
    );
    return {
      state: "present",
      tabId,
      url: typeof tab?.url === "string" ? tab.url : null,
      routeConversationId: conversationIdFromUrl(tab?.url || "") || null
    };
  } catch (error) {
    if (_pr92DeadlineRepairIsMissingTabError(error)) {
      return {
        state: "absent",
        tabId,
        url: null,
        routeConversationId: null
      };
    }
    return {
      state: "unknown",
      tabId,
      url: null,
      routeConversationId: null
    };
  }
}

async function _pr92Schema28DiagnosticRouteSample(tabId, context, cleanupRequired) {
  const remaining = _pr92Schema28DiagnosticRemainingMs(context);
  const reserve = cleanupRequired
    ? PR92_SCHEMA28_DIAGNOSTIC_CLEANUP_RESERVE_MS
    : PR92_SCHEMA28_DIAGNOSTIC_RETURN_RESERVE_MS;
  const available = remaining - reserve;
  if (!Number.isInteger(tabId) || available <= 0) {
    return {
      state: "unknown",
      tabId: Number.isInteger(tabId) ? tabId : null,
      url: null,
      routeConversationId: null,
      skippedForCleanupReserve: cleanupRequired
    };
  }
  const budget = Math.min(PR92_SCHEMA28_DIAGNOSTIC_ROUTE_SAMPLE_MAX_MS, available);
  const sampled = await _pr92Schema28DiagnosticReadTab(
    tabId,
    performance.now() + budget,
    "SCHEMA28_DIAGNOSTIC_ROUTE_SAMPLE"
  );
  return {
    ...sampled,
    skippedForCleanupReserve: false
  };
}

async function _pr92Schema28DiagnosticPostCleanupPresence(tabId, context) {
  if (!Number.isInteger(tabId)) {
    return { state: "unknown", tabId: null, url: null, routeConversationId: null };
  }
  const remaining = _pr92Schema28DiagnosticRemainingMs(context);
  const available = remaining - PR92_SCHEMA28_DIAGNOSTIC_RETURN_RESERVE_MS;
  if (available <= 0) {
    return { state: "unknown", tabId, url: null, routeConversationId: null };
  }
  const budget = Math.min(PR92_SCHEMA28_DIAGNOSTIC_POST_CLEANUP_SAMPLE_MAX_MS, available);
  return _pr92Schema28DiagnosticReadTab(
    tabId,
    performance.now() + budget,
    "SCHEMA28_DIAGNOSTIC_POST_CLEANUP_TAB_SAMPLE"
  );
}

async function _pr92Schema28CommittedIdentityDiagnosticRepaired(message) {
  if (message?.text != null || message?.attachmentPaths != null) {
    throw new Error("PR9_2_SCHEMA28_COMMITTED_IDENTITY_DIAGNOSTIC_WRITE_INPUT_FORBIDDEN");
  }
  if (_pr92ActiveTurnContext !== null || _pr92ActiveRichInputContext !== null) {
    throw new Error("PR9_2_TURN_CONTEXT_BUSY");
  }

  const context = _pr92CreateTurnContext(message);
  _pr92ActiveTurnContext = context;
  try {
    const fenceBefore = await _pr92ReadDirtyAttachmentFence();
    let runtimeTabId = null;
    if (Number.isInteger(fenceBefore)) {
      runtimeTabId = fenceBefore;
    } else {
      try {
        runtimeTabId = await _pr92Schema7RunUntil(
          context.deadlineAt,
          "SCHEMA28_DIAGNOSTIC_RUNTIME_TAB_ID",
          () => storedRuntimeTabId()
        );
      } catch {
        runtimeTabId = null;
      }
    }

    const cleanupRequired = Number.isInteger(fenceBefore);
    const tabBeforeCleanup = await _pr92Schema28DiagnosticRouteSample(
      runtimeTabId,
      context,
      cleanupRequired
    );

    let cleanupAttempted = false;
    if (cleanupRequired) {
      cleanupAttempted = true;
      await _pr92RequireCleanAttachmentState(context);
    }

    const fenceAfter = await _pr92ReadDirtyAttachmentFence();
    if (Number.isInteger(fenceAfter)) {
      throw new Error("PR9_2_SCHEMA28_COMMITTED_IDENTITY_DIAGNOSTIC_FENCE_REMAINS");
    }

    const tabAfterCleanup = cleanupRequired
      ? await _pr92Schema28DiagnosticPostCleanupPresence(runtimeTabId, context)
      : { state: "unknown", tabId: runtimeTabId, url: null, routeConversationId: null };

    const fencedTabAbsentAfterCleanup = cleanupRequired
      ? (tabAfterCleanup.state === "absent"
          ? true
          : tabAfterCleanup.state === "present"
            ? false
            : null)
      : null;
    const fencedTabAbsenceAuthority = cleanupRequired
      ? (tabAfterCleanup.state === "absent"
          ? "POST_CLEANUP_TAB_ABSENCE_PROBE"
          : tabAfterCleanup.state === "present"
            ? "POST_CLEANUP_TAB_PRESENCE_PROBE"
            : null)
      : null;

    return {
      diagnosticOnly: true,
      reconciliationOnly: true,
      writePerformed: false,
      conversationWritePerformed: false,
      attachmentStagingPerformed: false,
      textInsertionPerformed: false,
      protectedSubmitAttempted: false,
      automaticWriteRetry: false,
      fallbackTransport: null,
      richInputSchemaVersion: PR92_SCHEMA28_REPAIR_SCHEMA,
      durableFencePresentBefore: cleanupRequired,
      cleanupAttempted,
      cleanupProven: !Number.isInteger(fenceAfter),
      staleComposerReconciled: !Number.isInteger(fenceAfter),
      cleanupProofAuthority: cleanupRequired
        ? "PRODUCTION_REQUIRE_CLEAN_ATTACHMENT_STATE"
        : null,
      durableFenceCleared: !Number.isInteger(fenceAfter),
      fencedTabAbsentAfterCleanup,
      fencedTabAbsenceAuthority,
      observedTabStateBeforeCleanup: tabBeforeCleanup.state,
      observedTabIdBeforeCleanup: tabBeforeCleanup.tabId ?? null,
      observedRouteConversationIdDiagnostic: tabBeforeCleanup.routeConversationId ?? null,
      observedUrlBeforeCleanup: tabBeforeCleanup.url ?? null,
      routeSampleSkippedForCleanupReserve:
        tabBeforeCleanup.skippedForCleanupReserve === true,
      observedTabStateAfterCleanup: cleanupRequired ? tabAfterCleanup.state : null,
      routeConversationIdentityAuthoritative: false
    };
  } finally {
    _pr92ActiveTurnContext = null;
  }
}

executeNativeTurn = async function _executeNativeTurnWithPr92Schema28DiagnosticRepair(message) {
  if (message?.diagnosePr92CommittedIdentityStateSchema28 === true) {
    return _pr92Schema28CommittedIdentityDiagnosticRepaired(message);
  }
  return _pr92Schema28DiagnosticRepairPriorExecuteNativeTurn(message);
};

/* END legacy source: service_worker_rich_input_schema28_diagnostic_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_rich_input_schema29_repair_pr9_2.js */
// PR9.2 schema-29 request-body-bound rich-submit and protocol identity closure.
//
// Authenticated rich-input runs established that the product write succeeds even
// when current ChatGPT emits additional /conversation POSTs after the protected
// click and emits no `stream_handoff` record. Raw POST multiplicity and CDP's
// `hasUserGesture` bit are therefore not stable logical-turn identity primitives.
//
// Schema 29 keeps the reviewed schema-21 protected boundary: a unique page-side
// arm marker is emitted immediately before the validated `button.click()` in the
// same synchronous renderer task. Schema 17/19 still select and complete the FIRST
// conversation POST after that arm and read Network.getResponseBody for that exact
// requestId. Schema 29 replaces only schema 20's historical final
// "exactly-one-post + !hasUserGesture" gate with request-body identity.
//
// The first armed request must prove, from its own JSON body, exactly one intended
// user message: action=next, exact inserted text, non-empty client message id,
// expected attachment count in recognized request channels, and the correct
// conversation-id semantics (absent for new chat; exact for continuation).
//
// CDP may omit Request.postData even when hasPostData=true. When that happens,
// schema 29 immediately dispatches Network.getRequestPostData(requestId) while the
// same debugger session is still attached. The returned body is parsed directly
// into safe identity facts and is never retained. Correlation waits only within a
// short bounded post-write budget that preserves schema 19's RPC-return reserve.
// An unresolved request body fails closed rather than falling back to POST count,
// route state, or user-gesture heuristics.
//
// Additional armed service POSTs are allowed and non-authoritative. Additional
// requests carrying no new user-message identity cannot invalidate the selected
// write. A retry carrying the same client message id is the same logical turn and
// is allowed. Any distinct post-arm user message id fails closed, preventing a
// concurrent manual user turn from contaminating canonical assistant readback.
//
// Response identity is independently exact-request-bound: recognized top-level
// and root-add conversation-id slots in the selected request's response body must
// all agree. Route state remains diagnostic only and automatic write retry remains
// forbidden. Raw request text, postData, request ids, message ids, and conversation
// ids are never emitted in diagnostics.

const _pr92Schema29PriorExecuteNativeTurn = executeNativeTurn;
const _pr92Schema29PriorExecuteOfficialPageTurn = executeOfficialPageTurn;
const _pr92Schema29PriorExtractSafeStreamMetadata = extractSafeStreamMetadata;
const PR92_SCHEMA29_REPAIR_SCHEMA = 29;
const PR92_SCHEMA29_IDENTITY_AUTHORITY =
  "NETWORK_REQUEST_BOUND_PROTOCOL_CONVERSATION_ID_CONSENSUS";
const PR92_SCHEMA29_REQUEST_CORRELATION =
  "VALIDATED_CLICK_REQUEST_BODY_USER_MESSAGE_IDENTITY";
const PR92_SCHEMA29_COMMITTED_IDENTITY_ERROR =
  "PR9_2_WRITE_COMPLETED_CONVERSATION_ID_UNRESOLVED";
const PR92_SCHEMA29_POSTDATA_SETTLE_CAP_MS = 1_000;

let _pr92Schema29LastIdentityParseDiagnostics = null;
let _pr92Schema29LastSubmitCorrelationDiagnostics = null;

function _pr92Schema29NonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function _pr92Schema29ExtractRequestBoundConversationMetadata(body, base64Encoded) {
  const decoded = _pr92Schema28DecodeResponseBody(body, base64Encoded);
  const diagnostics = {
    bodyDecoded: typeof decoded === "string",
    base64Encoded: base64Encoded === true,
    parsedJsonDataRecords: 0,
    protocolConversationIdRecordCount: 0,
    topLevelConversationIdRecordCount: 0,
    rootAddValueConversationIdRecordCount: 0,
    distinctProtocolConversationIdCount: 0,
    protocolConversationIdSourceKinds: [],
    streamHandoffCount: 0,
    conflictingConversationIds: false,
    conflictingTurnExchangeIds: false
  };
  if (typeof decoded !== "string") {
    return { conversationId: null, turnExchangeId: null, diagnostics };
  }

  const conversationIds = new Set();
  const turnExchangeIds = new Set();
  const sourceKinds = new Set();

  for (const rawLine of decoded.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) continue;
    const payloadText = rawLine.slice(5).trim();
    if (!payloadText || payloadText === "[DONE]" || !payloadText.startsWith("{")) {
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      continue;
    }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      continue;
    }
    diagnostics.parsedJsonDataRecords += 1;

    const eventType = _pr92Schema29NonEmptyString(payload.type);
    if (eventType === "stream_handoff") diagnostics.streamHandoffCount += 1;

    let topLevelConversationId = null;
    if (Object.prototype.hasOwnProperty.call(payload, "conversation_id")) {
      topLevelConversationId = _pr92Schema29NonEmptyString(payload.conversation_id);
    }
    if (topLevelConversationId) {
      diagnostics.protocolConversationIdRecordCount += 1;
      diagnostics.topLevelConversationIdRecordCount += 1;
      conversationIds.add(topLevelConversationId);
      sourceKinds.add("top-level");

      if (Object.prototype.hasOwnProperty.call(payload, "turn_exchange_id")) {
        const candidateTurnExchangeId = _pr92Schema29NonEmptyString(
          payload.turn_exchange_id
        );
        if (candidateTurnExchangeId) turnExchangeIds.add(candidateTurnExchangeId);
      }
    }

    const rootAddValue =
      payload.p === "" &&
      payload.o === "add" &&
      payload.v !== null &&
      typeof payload.v === "object" &&
      !Array.isArray(payload.v)
        ? payload.v
        : null;
    let rootAddConversationId = null;
    if (
      rootAddValue !== null &&
      Object.prototype.hasOwnProperty.call(rootAddValue, "conversation_id")
    ) {
      rootAddConversationId = _pr92Schema29NonEmptyString(
        rootAddValue.conversation_id
      );
    }
    if (rootAddConversationId) {
      diagnostics.protocolConversationIdRecordCount += 1;
      diagnostics.rootAddValueConversationIdRecordCount += 1;
      conversationIds.add(rootAddConversationId);
      sourceKinds.add("root-add-v");
    }
  }

  diagnostics.distinctProtocolConversationIdCount = conversationIds.size;
  diagnostics.protocolConversationIdSourceKinds = Array.from(sourceKinds).sort();
  diagnostics.conflictingConversationIds = conversationIds.size > 1;
  diagnostics.conflictingTurnExchangeIds = turnExchangeIds.size > 1;

  const conversationId = conversationIds.size === 1
    ? Array.from(conversationIds)[0]
    : null;
  const turnExchangeId = conversationId !== null && turnExchangeIds.size === 1
    ? Array.from(turnExchangeIds)[0]
    : null;

  return { conversationId, turnExchangeId, diagnostics };
}

function _pr92Schema29RequestMessageAttachmentChannels(message) {
  const content = message?.content;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const pointerParts = parts.filter((part) => {
    if (part === null || typeof part !== "object" || Array.isArray(part)) return false;
    return _pr92Schema29NonEmptyString(part.asset_pointer) !== null;
  });
  const metadataAttachments = Array.isArray(message?.metadata?.attachments)
    ? message.metadata.attachments
    : [];

  const channels = [];
  if (pointerParts.length > 0) channels.push(pointerParts.length);
  if (metadataAttachments.length > 0) channels.push(metadataAttachments.length);
  return {
    pointerPartCount: pointerParts.length,
    metadataAttachmentCount: metadataAttachments.length,
    channels
  };
}

function _pr92Schema29InspectRequestPostData(
  postData,
  expectedText,
  expectedAttachmentCount,
  expectedConversationId
) {
  const diagnostics = {
    postDataPresent: typeof postData === "string" && postData.length > 0,
    requestJsonParsed: false,
    actionNext: false,
    conversationIdentityMatches: false,
    userMessageCount: 0,
    userMessageIdCount: 0,
    userMessageIdentityClassified: false,
    exactTextUserMessageCount: 0,
    exactRichUserMessageCount: 0,
    requestMessageIdPresent: false,
    pointerPartCount: 0,
    metadataAttachmentCount: 0,
    attachmentEvidenceChannelCount: 0,
    attachmentCountsMatch: false
  };
  if (!diagnostics.postDataPresent) {
    return {
      matched: false,
      logicalMessageId: null,
      logicalUserMessageIds: [],
      diagnostics
    };
  }

  let payload;
  try {
    payload = JSON.parse(postData);
  } catch {
    return {
      matched: false,
      logicalMessageId: null,
      logicalUserMessageIds: [],
      diagnostics
    };
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      matched: false,
      logicalMessageId: null,
      logicalUserMessageIds: [],
      diagnostics
    };
  }
  diagnostics.requestJsonParsed = true;
  diagnostics.actionNext = payload.action === "next";

  const requestConversationId = _pr92Schema29NonEmptyString(payload.conversation_id);
  diagnostics.conversationIdentityMatches = expectedConversationId === null
    ? requestConversationId === null
    : requestConversationId === expectedConversationId;

  const messagesFieldPresent = Object.prototype.hasOwnProperty.call(
    payload,
    "messages"
  );
  if (messagesFieldPresent && !Array.isArray(payload.messages)) {
    return {
      matched: false,
      logicalMessageId: null,
      logicalUserMessageIds: [],
      diagnostics
    };
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const exactCandidates = [];
  const logicalUserMessageIds = [];
  for (const message of messages) {
    if (message === null || typeof message !== "object" || Array.isArray(message)) continue;
    if (message?.author?.role !== "user") continue;
    diagnostics.userMessageCount += 1;

    const messageId = _pr92Schema29NonEmptyString(message.id);
    if (messageId) {
      diagnostics.userMessageIdCount += 1;
      logicalUserMessageIds.push(messageId);
    }

    if (
      !diagnostics.actionNext ||
      !diagnostics.conversationIdentityMatches
    ) {
      continue;
    }
    const parts = Array.isArray(message?.content?.parts) ? message.content.parts : [];
    const textParts = parts.filter((part) => typeof part === "string");
    if (textParts.join("") !== expectedText) continue;
    diagnostics.exactTextUserMessageCount += 1;

    const attachment = _pr92Schema29RequestMessageAttachmentChannels(message);
    const channels = attachment.channels;
    const attachmentCountsMatch = expectedAttachmentCount > 0
      ? channels.length > 0 && channels.every((count) => count === expectedAttachmentCount)
      : channels.every((count) => count === 0);
    if (!attachmentCountsMatch || !messageId) continue;

    exactCandidates.push({
      messageId,
      pointerPartCount: attachment.pointerPartCount,
      metadataAttachmentCount: attachment.metadataAttachmentCount,
      attachmentEvidenceChannelCount: channels.length
    });
  }

  diagnostics.userMessageIdentityClassified =
    diagnostics.userMessageCount === diagnostics.userMessageIdCount;

  diagnostics.exactRichUserMessageCount = exactCandidates.length;
  if (exactCandidates.length !== 1) {
    return {
      matched: false,
      logicalMessageId: null,
      logicalUserMessageIds,
      diagnostics
    };
  }

  const candidate = exactCandidates[0];
  diagnostics.requestMessageIdPresent = true;
  diagnostics.pointerPartCount = candidate.pointerPartCount;
  diagnostics.metadataAttachmentCount = candidate.metadataAttachmentCount;
  diagnostics.attachmentEvidenceChannelCount = candidate.attachmentEvidenceChannelCount;
  diagnostics.attachmentCountsMatch = true;
  return {
    matched: true,
    logicalMessageId: candidate.messageId,
    logicalUserMessageIds,
    diagnostics
  };
}

function _pr92Schema29ApplyRequestInspection(entry, inspected, source) {
  entry.matched = inspected?.matched === true;
  entry.logicalMessageId = inspected?.logicalMessageId || null;
  entry.logicalUserMessageIds = Array.isArray(inspected?.logicalUserMessageIds)
    ? inspected.logicalUserMessageIds.slice()
    : [];
  entry.diagnostics = inspected?.diagnostics || null;

  const explicitlyBodyless =
    source === "request-event-no-post-data";
  const identityClassified =
    inspected?.diagnostics?.requestJsonParsed === true &&
    inspected?.diagnostics?.userMessageIdentityClassified === true;

  entry.requestBodyResolved = explicitlyBodyless || identityClassified;
  entry.requestBodySource = entry.requestBodyResolved
    ? source
    : "unresolved";
}

function _pr92Schema29RecordPostArmConversationRequest(debuggee, context, params) {
  if (context === null || context.schema20ProtectedSubmitArmed !== true) return;
  const request = params?.request;
  if (
    !_pr92Schema20PriorIsConversationWrite(
      request?.url || "",
      request?.method || ""
    )
  ) {
    return;
  }

  const requestId = _pr92Schema29NonEmptyString(params?.requestId);
  if (!requestId) return;
  const observed = Array.isArray(context.schema29PostArmConversationRequests)
    ? context.schema29PostArmConversationRequests
    : [];
  if (observed.some((entry) => entry.requestId === requestId)) return;

  const entry = {
    requestId,
    hasUserGesture: params?.hasUserGesture === true,
    matched: false,
    logicalMessageId: null,
    logicalUserMessageIds: [],
    diagnostics: null,
    requestBodyResolved: false,
    requestBodySource: "unresolved",
    postDataLookupPromise: null
  };
  observed.push(entry);
  context.schema29PostArmConversationRequests = observed;

  const eventPostData = typeof request?.postData === "string" && request.postData.length > 0
    ? request.postData
    : null;
  if (eventPostData !== null) {
    _pr92Schema29ApplyRequestInspection(
      entry,
      _pr92Schema29InspectRequestPostData(
        eventPostData,
        context.schema29ExpectedText,
        context.schema29ExpectedAttachmentCount,
        context.schema19RequestedConversationId
      ),
      "request-event-post-data"
    );
    return;
  }

  if (request?.hasPostData === false) {
    _pr92Schema29ApplyRequestInspection(
      entry,
      _pr92Schema29InspectRequestPostData(
        null,
        context.schema29ExpectedText,
        context.schema29ExpectedAttachmentCount,
        context.schema19RequestedConversationId
      ),
      "request-event-no-post-data"
    );
    return;
  }

  // CDP explicitly permits Request.postData to be omitted when the body is too
  // long. Dispatch the exact-request fallback immediately, while schema 17's
  // debugger session is still attached. The promise stores only parsed facts.
  try {
    const pending = chrome.debugger.sendCommand(
      debuggee,
      "Network.getRequestPostData",
      { requestId }
    );
    entry.postDataLookupPromise = Promise.resolve(pending)
      .then((response) => {
        const decoded = _pr92Schema28DecodeResponseBody(
          response?.postData,
          response?.base64Encoded === true
        );
        if (typeof decoded !== "string" || !decoded) return false;
        _pr92Schema29ApplyRequestInspection(
          entry,
          _pr92Schema29InspectRequestPostData(
            decoded,
            context.schema29ExpectedText,
            context.schema29ExpectedAttachmentCount,
            context.schema19RequestedConversationId
          ),
          "network-get-request-post-data"
        );
        return true;
      })
      .catch(() => false);
  } catch {
    entry.postDataLookupPromise = Promise.resolve(false);
  }
}

async function _pr92Schema29AwaitPostDataLookups(context) {
  const observed = Array.isArray(context?.schema29PostArmConversationRequests)
    ? context.schema29PostArmConversationRequests
    : [];
  const pending = observed
    .map((entry) => entry?.postDataLookupPromise)
    .filter((value) => value && typeof value.then === "function");
  if (pending.length === 0) return;

  const remaining = _pr92RemainingTurnMsOrZero(context);
  const usable = remaining - PR92_SCHEMA19_RPC_RETURN_RESERVE_MS;
  if (!Number.isFinite(usable) || usable <= 0) return;
  const localBudget = Math.max(
    1,
    Math.min(PR92_SCHEMA29_POSTDATA_SETTLE_CAP_MS, usable)
  );
  const localDeadlineAt = Math.min(
    context.deadlineAt - PR92_SCHEMA19_RPC_RETURN_RESERVE_MS,
    performance.now() + localBudget
  );
  try {
    await _pr92Schema7RunUntil(
      localDeadlineAt,
      "SCHEMA29_REQUEST_POST_DATA_SETTLE",
      () => Promise.allSettled(pending)
    );
  } catch {
    // Any still-unresolved body remains fail-closed correlation evidence.
  }
}

function _pr92Schema29EvaluateSubmitCorrelation(context) {
  const observed = Array.isArray(context?.schema29PostArmConversationRequests)
    ? context.schema29PostArmConversationRequests
    : [];
  const markerObserved = context?.schema20ProtectedSubmitMarkerObserved === true;
  const first = observed.length > 0 ? observed[0] : null;
  const firstMatched = first?.matched === true;
  const firstLogicalMessageId = _pr92Schema29NonEmptyString(first?.logicalMessageId);
  const firstDiagnostics = first?.diagnostics || null;

  const matching = observed.filter((entry) => entry?.matched === true);
  const unresolvedRequestBodyCount = observed.filter(
    (entry) => entry?.requestBodyResolved !== true
  ).length;
  const fallbackRequestBodyCount = observed.filter(
    (entry) => entry?.requestBodySource === "network-get-request-post-data"
  ).length;
  const eventRequestBodyCount = observed.filter(
    (entry) => entry?.requestBodySource === "request-event-post-data"
  ).length;
  const postArmUserMessageIds = new Set();
  for (const entry of observed) {
    const ids = Array.isArray(entry?.logicalUserMessageIds)
      ? entry.logicalUserMessageIds
      : [];
    for (const value of ids) {
      const normalized = _pr92Schema29NonEmptyString(value);
      if (normalized) postArmUserMessageIds.add(normalized);
    }
  }
  const distinctPostArmUserMessageCount = postArmUserMessageIds.size;
  const foreignPostArmUserMessageCount = firstLogicalMessageId === null
    ? distinctPostArmUserMessageCount
    : Array.from(postArmUserMessageIds).filter(
        (value) => value !== firstLogicalMessageId
      ).length;
  const userGestureRequestCount = observed.filter(
    (entry) => entry?.hasUserGesture === true
  ).length;

  const ok =
    markerObserved &&
    firstMatched &&
    firstLogicalMessageId !== null &&
    unresolvedRequestBodyCount === 0 &&
    foreignPostArmUserMessageCount === 0;

  return {
    ok,
    markerObserved,
    postArmConversationRequestCount: observed.length,
    matchingRequestCount: matching.length,
    distinctPostArmUserMessageCount,
    foreignPostArmUserMessageCount,
    unresolvedRequestBodyCount,
    fallbackRequestBodyCount,
    eventRequestBodyCount,
    firstRequestMatched: firstMatched,
    firstRequestPostDataPresent: firstDiagnostics?.postDataPresent === true,
    firstRequestJsonParsed: firstDiagnostics?.requestJsonParsed === true,
    firstRequestActionNext: firstDiagnostics?.actionNext === true,
    firstRequestConversationIdentityMatches:
      firstDiagnostics?.conversationIdentityMatches === true,
    firstRequestUserMessageIdCount:
      Number(firstDiagnostics?.userMessageIdCount) || 0,
    firstRequestExactTextUserMessageCount:
      Number(firstDiagnostics?.exactTextUserMessageCount) || 0,
    firstRequestExactRichUserMessageCount:
      Number(firstDiagnostics?.exactRichUserMessageCount) || 0,
    firstRequestMessageIdPresent: firstDiagnostics?.requestMessageIdPresent === true,
    firstRequestPointerPartCount: Number(firstDiagnostics?.pointerPartCount) || 0,
    firstRequestMetadataAttachmentCount:
      Number(firstDiagnostics?.metadataAttachmentCount) || 0,
    firstRequestAttachmentEvidenceChannelCount:
      Number(firstDiagnostics?.attachmentEvidenceChannelCount) || 0,
    firstRequestAttachmentCountsMatch: firstDiagnostics?.attachmentCountsMatch === true,
    postArmUserGestureRequestCount: userGestureRequestCount,
    additionalServicePostArmRequestsAllowed: true,
    distinctPostArmUserMessagesFailClosed: true,
    additionalPostArmRequestsAuthoritative: false,
    hasUserGestureAuthoritative: false
  };
}

extractSafeStreamMetadata = function _pr92Schema29ExtractSafeStreamMetadata(
  body,
  base64Encoded
) {
  try {
    _pr92Schema29PriorExtractSafeStreamMetadata(body, base64Encoded);
  } catch {
    // Observability must never perturb exact-request identity.
  }

  const parsed = _pr92Schema29ExtractRequestBoundConversationMetadata(
    body,
    base64Encoded
  );
  _pr92Schema29LastIdentityParseDiagnostics = { ...parsed.diagnostics };

  const context = _pr92ActiveRichInputContext;
  if (context !== null) {
    context.schema19CausalConversationId =
      typeof parsed.conversationId === "string" && parsed.conversationId
        ? parsed.conversationId
        : null;
    context.schema19CausalTurnExchangeId =
      typeof parsed.turnExchangeId === "string" && parsed.turnExchangeId
        ? parsed.turnExchangeId
        : null;
  }

  return {
    conversationId: parsed.conversationId,
    turnExchangeId: parsed.turnExchangeId
  };
};

executeOfficialPageTurn = async function _pr92Schema29ExecuteOfficialPageTurn(args) {
  const context = _pr92ActiveRichInputContext;
  if (context === null) return _pr92Schema29PriorExecuteOfficialPageTurn(args);

  const tabId = args?.tabId;
  const debuggee = { tabId };
  context.schema29ExpectedText = typeof args?.text === "string" ? args.text : "";
  context.schema29ExpectedAttachmentCount = Array.isArray(context.attachmentPaths)
    ? context.attachmentPaths.length
    : 0;
  context.schema29PostArmConversationRequests = [];

  const observer = (source, method, params) => {
    if (source?.tabId !== tabId) return;
    if (method === "Runtime.consoleAPICalled") {
      _pr92Schema20ObserveArmMarker(context, params);
      return;
    }
    if (method === "Network.requestWillBeSent") {
      _pr92Schema29RecordPostArmConversationRequest(debuggee, context, params);
    }
  };
  chrome.debugger.onEvent.addListener(observer);

  try {
    // Bypass only schema 20's obsolete post-return multiplicity/user-gesture
    // decision. Schema 19 retains schema 17's selected requestId, completion,
    // response-body read, and causal conversation identity. The global schema-20
    // isConversationWrite predicate still denies all pre-arm request authority.
    const result = await _pr92Schema20PriorExecuteOfficialPageTurn(args);
    if (
      result?.diagnostics?.conversationRequestSeen !== true ||
      result?.diagnostics?.loadingFinished !== true
    ) {
      return result;
    }

    await _pr92Schema29AwaitPostDataLookups(context);
    const correlation = _pr92Schema29EvaluateSubmitCorrelation(context);
    _pr92Schema29LastSubmitCorrelationDiagnostics = { ...correlation };
    if (!correlation.ok) {
      throw new Error(PR92_SCHEMA29_COMMITTED_IDENTITY_ERROR);
    }

    const isNewChatRichTurn = context.schema19RequestedConversationId == null;
    return {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        ...(isNewChatRichTurn
          ? {
              conversationIdentityAuthority: PR92_SCHEMA29_IDENTITY_AUTHORITY,
              routeConversationIdentityAuthoritative: false,
              requestBoundProtocolConversationIdConsensus: true
            }
          : {}),
        protectedSubmitRequestCorrelation: PR92_SCHEMA29_REQUEST_CORRELATION,
        protectedSubmitArmMarkerObserved: true,
        protectedSubmitRequestBodyMatched: true,
        protectedSubmitLogicalMessageIdentityUnique: true,
        postArmConversationRequestCount: correlation.postArmConversationRequestCount,
        matchingPostArmConversationRequestCount: correlation.matchingRequestCount,
        additionalServicePostArmRequestsAllowed: true,
        distinctPostArmUserMessagesFailClosed: true,
        additionalPostArmConversationRequestsAuthoritative: false,
        protectedSubmitRequestHadUserGesture: null,
        hasUserGestureAuthoritative: false,
        preArmConversationRequestsAuthoritative: false
      }
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      detail.startsWith(PR92_SCHEMA29_COMMITTED_IDENTITY_ERROR) &&
      _pr92Schema29LastSubmitCorrelationDiagnostics === null
    ) {
      // Do not settle Network.getRequestPostData a second time. If the
      // authoritative correlation path already waited, reuse its diagnostics.
      // If an inherited committed-state error arrived before that point,
      // unresolved request bodies remain fail-closed immediately.
      _pr92Schema29LastSubmitCorrelationDiagnostics =
        _pr92Schema29EvaluateSubmitCorrelation(context);
    }
    throw error;
  } finally {
    chrome.debugger.onEvent.removeListener(observer);
    context.schema20ProtectedSubmitArmed = false;
    context.schema29ExpectedText = null;
    context.schema29ExpectedAttachmentCount = 0;
  }
};

executeNativeTurn = async function _executeNativeTurnWithPr92Schema29Repair(message) {
  const isRichWrite =
    Array.isArray(message?.attachmentPaths) && message.attachmentPaths.length > 0;
  if (isRichWrite) {
    _pr92Schema29LastIdentityParseDiagnostics = null;
    _pr92Schema29LastSubmitCorrelationDiagnostics = null;
  }

  let result;
  try {
    result = await _pr92Schema29PriorExecuteNativeTurn(message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.startsWith(PR92_SCHEMA29_COMMITTED_IDENTITY_ERROR)) {
      const diagnostics = _pr92Schema29LastIdentityParseDiagnostics;
      const correlation = _pr92Schema29LastSubmitCorrelationDiagnostics;
      const identitySuffix = diagnostics
        ? `:SCHEMA29:bodyDecoded=${diagnostics.bodyDecoded === true}` +
          `:base64Encoded=${diagnostics.base64Encoded === true}` +
          `:parsedJsonDataRecords=${Number(diagnostics.parsedJsonDataRecords) || 0}` +
          `:protocolConversationIdRecordCount=${Number(diagnostics.protocolConversationIdRecordCount) || 0}` +
          `:topLevelConversationIdRecordCount=${Number(diagnostics.topLevelConversationIdRecordCount) || 0}` +
          `:rootAddValueConversationIdRecordCount=${Number(diagnostics.rootAddValueConversationIdRecordCount) || 0}` +
          `:distinctProtocolConversationIdCount=${Number(diagnostics.distinctProtocolConversationIdCount) || 0}` +
          `:streamHandoffCount=${Number(diagnostics.streamHandoffCount) || 0}` +
          `:conflictingConversationIds=${diagnostics.conflictingConversationIds === true}` +
          `:conflictingTurnExchangeIds=${diagnostics.conflictingTurnExchangeIds === true}` +
          `:protocolConversationIdSourceKinds=${diagnostics.protocolConversationIdSourceKinds.join(",")}`
        : ":SCHEMA29:identityParserNotReached=true";
      const correlationSuffix = correlation
        ? `:protectedSubmitMarkerObserved=${correlation.markerObserved === true}` +
          `:postArmConversationRequestCount=${Number(correlation.postArmConversationRequestCount) || 0}` +
          `:matchingRequestCount=${Number(correlation.matchingRequestCount) || 0}` +
          `:distinctPostArmUserMessageCount=${Number(correlation.distinctPostArmUserMessageCount) || 0}` +
          `:foreignPostArmUserMessageCount=${Number(correlation.foreignPostArmUserMessageCount) || 0}` +
          `:unresolvedRequestBodyCount=${Number(correlation.unresolvedRequestBodyCount) || 0}` +
          `:fallbackRequestBodyCount=${Number(correlation.fallbackRequestBodyCount) || 0}` +
          `:firstRequestMatched=${correlation.firstRequestMatched === true}` +
          `:firstRequestPostDataPresent=${correlation.firstRequestPostDataPresent === true}` +
          `:firstRequestJsonParsed=${correlation.firstRequestJsonParsed === true}` +
          `:firstRequestActionNext=${correlation.firstRequestActionNext === true}` +
          `:firstRequestConversationIdentityMatches=${correlation.firstRequestConversationIdentityMatches === true}` +
          `:firstRequestUserMessageIdCount=${Number(correlation.firstRequestUserMessageIdCount) || 0}` +
          `:firstRequestExactTextUserMessageCount=${Number(correlation.firstRequestExactTextUserMessageCount) || 0}` +
          `:firstRequestExactRichUserMessageCount=${Number(correlation.firstRequestExactRichUserMessageCount) || 0}` +
          `:firstRequestMessageIdPresent=${correlation.firstRequestMessageIdPresent === true}` +
          `:firstRequestPointerPartCount=${Number(correlation.firstRequestPointerPartCount) || 0}` +
          `:firstRequestMetadataAttachmentCount=${Number(correlation.firstRequestMetadataAttachmentCount) || 0}` +
          `:firstRequestAttachmentEvidenceChannelCount=${Number(correlation.firstRequestAttachmentEvidenceChannelCount) || 0}` +
          `:firstRequestAttachmentCountsMatch=${correlation.firstRequestAttachmentCountsMatch === true}` +
          `:postArmUserGestureRequestCount=${Number(correlation.postArmUserGestureRequestCount) || 0}`
        : ":submitCorrelationDiagnosticsUnavailable=true";
      throw new Error(
        `${PR92_SCHEMA29_COMMITTED_IDENTITY_ERROR}${identitySuffix}${correlationSuffix}`
      );
    }
    throw error;
  }

  if (message?.characterizeRichInputSupport !== true) return result;
  return {
    ...result,
    richInputSchemaVersion: PR92_SCHEMA29_REPAIR_SCHEMA,
    newChatConversationIdentityAuthority: PR92_SCHEMA29_IDENTITY_AUTHORITY,
    requestBoundProtocolConversationIdAuthority: true,
    requestBoundProtocolConversationIdConsensusRequired: true,
    topLevelConversationIdAuthority: true,
    rootAddValueConversationIdAuthority: true,
    unrecognizedNestedConversationIdCanSatisfyIdentity: false,
    streamHandoffRequiredForCausalConversationIdentity: false,
    conflictingRequestBoundConversationIdsFailClosed: true,
    routeConversationIdentityAuthoritative: false,
    protectedSubmitRequestCorrelation: PR92_SCHEMA29_REQUEST_CORRELATION,
    validatedClickRequestBodyCorrelation: true,
    requestPostDataRequiredForProtectedSubmitCorrelation: true,
    requestPostDataFallbackSupported: true,
    requestPostDataFallbackExactRequestBound: true,
    unresolvedRequestBodyFailsClosed: true,
    exactUserTextRequiredForProtectedSubmitCorrelation: true,
    requestMessageIdRequiredForProtectedSubmitCorrelation: true,
    requestAttachmentCountRequiredForProtectedSubmitCorrelation: true,
    continuationConversationIdRequiredForProtectedSubmitCorrelation: true,
    newChatConversationIdMustBeAbsentForProtectedSubmitCorrelation: true,
    additionalServicePostArmRequestsAllowed: true,
    additionalPostArmConversationRequestsAuthoritative: false,
    duplicateSameLogicalMessageRequestAllowed: true,
    distinctPostArmUserMessagesFailClosed: true,
    hasUserGestureAuthoritative: false,
    exactlyOnePostArmConversationRequestRequired: false,
    ambiguousPostArmConversationRequestsSignalCommittedReadbackIncomplete: false,
    submitCorrelationFailureDiagnosticsAvailable: true,
    automaticWriteRetryAfterSubmitCorrelationFailure: false,
    automaticWriteRetryAfterCausalIdentityFailure: false
  };
};

/* END legacy source: service_worker_rich_input_schema29_repair_pr9_2.js */

// PR9.3 observational-only source/citation normalization. Loaded after the final
// PR9.2 authority generation so it can observe PR8.12 message events without
// participating in attachment staging, protected submit, retry, or finality.

/* BEGIN legacy source: service_worker_product_source_citations_pr9_3.js */
// PR9.3: structured source/citation observations above the PR8.12 activity stream.
//
// This layer observes only bounded product-visible provenance fields already
// present in streamed ChatGPT messages. It does not read response bodies, raw
// tool arguments/results, hidden messages, private thoughts, credentials, DOM,
// cookies, headers, or request post data. Observation defects are non-authority:
// they cannot fail/retry a product write or replace canonical finality.

const PR93_SOURCE_CITATION_SCHEMA_VERSION = 1;
const PR93_MAX_SOURCES_PER_REFERENCE = 64;
const PR93_MAX_SOURCES_PER_TURN = 128;
const PR93_MAX_REFERENCES_PER_MESSAGE = 128;
const PR93_MAX_URL_CHARS = 4096;
const PR93_MAX_TITLE_CHARS = 512;
const PR93_MAX_ATTRIBUTION_CHARS = 256;
const PR93_MAX_REFERENCE_TYPE_CHARS = 96;
const PR93_SENSITIVE_QUERY_KEYS = new Set([
  "access_token", "refresh_token", "id_token", "token", "auth", "authorization",
  "api_key", "apikey", "key", "signature", "sig", "credential", "credentials",
  "secret", "client_secret", "client_assertion", "code_verifier", "password", "passwd",
  "session", "session_id", "sessionid", "code"
]);

const _pr93PriorInspectMessage = _pr812InspectMessage;
const _pr93StateByStreamContext = new WeakMap();

function _pr93State(context) {
  let state = _pr93StateByStreamContext.get(context);
  if (state) return state;
  state = {
    sourceIdByKey: new Map(),
    emittedSourceIds: new Set(),
    emittedCitationKeys: new Set(),
    sourceCounter: 0,
    citationCounter: 0
  };
  _pr93StateByStreamContext.set(context, state);
  return state;
}

function _pr93BoundedText(value, maxChars) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\u0000/g, "").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxChars);
}

function _pr93OptionalNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function _pr93SafeReferenceType(value) {
  const text = _pr93BoundedText(value, PR93_MAX_REFERENCE_TYPE_CHARS);
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_").slice(0, PR93_MAX_REFERENCE_TYPE_CHARS) || null;
}

function _pr93SensitiveQueryKey(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase().replace(/[-.]/g, "_");
  return PR93_SENSITIVE_QUERY_KEYS.has(normalized) ||
    normalized.startsWith("x_amz_") ||
    normalized.startsWith("x_goog_") ||
    normalized.startsWith("oauth_");
}

function _pr93SafeHttpUrl(value) {
  const text = _pr93BoundedText(value, PR93_MAX_URL_CHARS);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname) return null;
    // Userinfo and common query credentials are not provenance and never leave
    // this observation layer. Fragments are stripped unconditionally because
    // they are unnecessary for source identity and can carry private tokens.
    if (parsed.username || parsed.password) return null;
    for (const key of parsed.searchParams.keys()) {
      if (_pr93SensitiveQueryKey(key)) return null;
    }
    parsed.hash = "";
    return parsed.href.slice(0, PR93_MAX_URL_CHARS);
  } catch {
    return null;
  }
}

function _pr93SourceCandidate(value) {
  if (!value || typeof value !== "object") return null;
  const url = _pr93SafeHttpUrl(value.url);
  if (!url) return null;
  let domain = null;
  try { domain = new URL(url).hostname || null; } catch {}
  return {
    url,
    title: _pr93BoundedText(value.title, PR93_MAX_TITLE_CHARS),
    attribution: _pr93BoundedText(value.attribution, PR93_MAX_ATTRIBUTION_CHARS),
    domain
  };
}

function _pr93CollectSourceCandidates(reference, options = {}) {
  const footnote = options?.footnote === true;
  const output = [];
  const pushCandidate = (value) => {
    if (output.length >= PR93_MAX_SOURCES_PER_REFERENCE) return;
    const candidate = _pr93SourceCandidate(value);
    if (candidate) output.push(candidate);
  };
  const pushItem = (item) => {
    if (!item || typeof item !== "object") return;
    pushCandidate(item);
    const supporting = Array.isArray(item.supporting_websites)
      ? item.supporting_websites.slice(0, PR93_MAX_SOURCES_PER_REFERENCE)
      : [];
    for (const source of supporting) pushCandidate(source);
  };

  if (!reference || typeof reference !== "object") return output;

  const sources = Array.isArray(reference.sources) ? reference.sources : [];
  for (const source of sources.slice(0, PR93_MAX_SOURCES_PER_REFERENCE)) pushItem(source);

  if (!footnote) {
    const items = Array.isArray(reference.items) ? reference.items : [];
    for (const item of items.slice(0, PR93_MAX_SOURCES_PER_REFERENCE)) pushItem(item);

    const fallback = Array.isArray(reference.fallback_items) ? reference.fallback_items : [];
    for (const item of fallback.slice(0, PR93_MAX_SOURCES_PER_REFERENCE)) pushItem(item);

    if (output.length === 0) pushCandidate(reference);
  }

  if (output.length === 0 && Array.isArray(reference.safe_urls)) {
    for (const url of reference.safe_urls.slice(0, PR93_MAX_SOURCES_PER_REFERENCE)) {
      pushCandidate({ url, title: url });
    }
  }

  const seen = new Set();
  return output.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function _pr93EnsureSource(context, state, candidate, origin) {
  if (!candidate) return null;
  let sourceId = state.sourceIdByKey.get(candidate.url);
  if (!sourceId) {
    if (state.sourceIdByKey.size >= PR93_MAX_SOURCES_PER_TURN) return null;
    state.sourceCounter += 1;
    sourceId = `pr93-source-${state.sourceCounter}`;
    state.sourceIdByKey.set(candidate.url, sourceId);
  }

  if (!state.emittedSourceIds.has(sourceId)) {
    state.emittedSourceIds.add(sourceId);
    _pr812Emit(context, {
      type: "product_source_observed",
      observation_schema: PR93_SOURCE_CITATION_SCHEMA_VERSION,
      observation_id: `source-observation:${sourceId}`,
      source_id: sourceId,
      url: candidate.url,
      title: candidate.title,
      domain: candidate.domain,
      attribution: candidate.attribution,
      source_origin: _pr93SafeReferenceType(origin)
    });
  }
  return sourceId;
}

function _pr93EmitCitation(context, state, fields) {
  const sourceId = fields?.sourceId;
  if (typeof sourceId !== "string" || !sourceId) return;
  const startIndex = _pr93OptionalNonNegativeInt(fields.startIndex);
  const endIndex = _pr93OptionalNonNegativeInt(fields.endIndex);
  if (startIndex === null || endIndex === null || endIndex < startIndex) return;
  const citationIndex = _pr93OptionalNonNegativeInt(fields.citationIndex);
  const referenceType = _pr93SafeReferenceType(fields.referenceType);
  const messageId = _pr93BoundedText(fields.messageId, 256) || "message";

  const key = [messageId, sourceId, startIndex, endIndex, citationIndex, referenceType].join("|");
  if (state.emittedCitationKeys.has(key)) return;
  state.emittedCitationKeys.add(key);
  state.citationCounter += 1;
  const citationId = `pr93-citation-${state.citationCounter}`;

  _pr812Emit(context, {
    type: "product_citation_observed",
    observation_schema: PR93_SOURCE_CITATION_SCHEMA_VERSION,
    observation_id: `citation-observation:${citationId}`,
    citation_id: citationId,
    source_id: sourceId,
    citation_index: citationIndex,
    start_index: startIndex,
    end_index: endIndex,
    reference_type: referenceType,
    display_text: _pr93BoundedText(fields.displayText, PR93_MAX_TITLE_CHARS)
  });
}

function _pr93InspectContentReferences(context, state, messageId, metadata) {
  const references = Array.isArray(metadata?.content_references)
    ? metadata.content_references.slice(0, PR93_MAX_REFERENCES_PER_MESSAGE)
    : [];

  references.forEach((reference, referenceIndex) => {
    if (!reference || typeof reference !== "object") return;
    const referenceType = _pr93SafeReferenceType(reference.type);
    const footnote = referenceType === "sources_footnote";
    const candidates = _pr93CollectSourceCandidates(reference, { footnote });

    for (const candidate of candidates) {
      const sourceId = _pr93EnsureSource(
        context,
        state,
        candidate,
        footnote ? "content_references.sources_footnote" : "content_references"
      );
      if (!sourceId || footnote) continue;
      _pr93EmitCitation(context, state, {
        sourceId,
        messageId,
        citationIndex: referenceIndex,
        startIndex: reference.start_idx,
        endIndex: reference.end_idx,
        referenceType,
        displayText: candidate.attribution || candidate.title
      });
    }
  });
}

function _pr93InspectLegacyCitations(context, state, messageId, metadata) {
  const citations = Array.isArray(metadata?.citations)
    ? metadata.citations.slice(0, PR93_MAX_REFERENCES_PER_MESSAGE)
    : [];

  citations.forEach((citation, citationIndex) => {
    if (!citation || typeof citation !== "object") return;
    const source = citation.metadata && typeof citation.metadata === "object"
      ? citation.metadata
      : citation;
    const candidate = _pr93SourceCandidate(source);
    const sourceId = _pr93EnsureSource(context, state, candidate, "legacy_citations");
    if (!sourceId) return;
    _pr93EmitCitation(context, state, {
      sourceId,
      messageId,
      citationIndex,
      startIndex: citation.start_ix,
      endIndex: citation.end_ix,
      referenceType: citation.citation_format_type || source.type || "legacy_citation",
      displayText: candidate.attribution || candidate.title
    });
  });

  const metadataList = Array.isArray(metadata?._cite_metadata?.metadata_list)
    ? metadata._cite_metadata.metadata_list.slice(0, PR93_MAX_SOURCES_PER_REFERENCE)
    : [];
  for (const source of metadataList) {
    _pr93EnsureSource(context, state, _pr93SourceCandidate(source), "legacy_cite_metadata");
  }
}

function _pr93InspectTetherQuote(context, state, content) {
  if (!content || typeof content !== "object" || content.content_type !== "tether_quote") return;
  const candidate = _pr93SourceCandidate(content);
  _pr93EnsureSource(context, state, candidate, "tether_quote");
}

_pr812InspectMessage = function _pr812InspectMessageWithStructuredSources(context, priorState, message) {
  _pr93PriorInspectMessage(context, priorState, message);

  if (!message || typeof message !== "object") return;
  if (message?.metadata?.is_visually_hidden_from_conversation === true) return;

  const content = message.content && typeof message.content === "object" ? message.content : {};
  const contentType = _pr93BoundedText(content.content_type, PR93_MAX_REFERENCE_TYPE_CHARS);
  if (contentType && contentType.toLowerCase() === "thoughts") return;

  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const messageId = _pr93BoundedText(message.id, 256) || "message";
  const state = _pr93State(context);

  _pr93InspectContentReferences(context, state, messageId, metadata);
  _pr93InspectLegacyCitations(context, state, messageId, metadata);
  _pr93InspectTetherQuote(context, state, content);
};

/* END legacy source: service_worker_product_source_citations_pr9_3.js */

/* END legacy source: service_worker_rich_input_schema7_repair_pr9_2.js */


/* BEGIN legacy source: service_worker_submit_only_v2.js */
// Bridge submission boundary v2: type + one click + observed official conversation POST.
// Reply generation is owned by the persistent page observer, not this request.

const _submitOnlyPriorExecuteNativeTurn = executeNativeTurn;
let _submitOnlyAcknowledgedPageTurn = null;
const CWA_SUBMIT_COMMIT_OBSERVATION_MS = 5_000;

async function _submitOnlyLocalSnapshot(debuggee) {
  const result = await sendCommand(debuggee, "Runtime.evaluate", {
    expression: `(() => {
      const composer = document.querySelector('#prompt-textarea') ||
        document.querySelector('[contenteditable="true"]') ||
        document.querySelector('textarea[placeholder]');
      const text = composer ? String(composer.innerText ?? composer.value ?? '').trim() : null;
      const turns = document.querySelectorAll('main [data-testid^="conversation-turn-"], main article').length;
      const stop = document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]');
      return { composerText: text, turnCount: turns, generating: Boolean(stop) };
    })()`,
    returnByValue: true,
    awaitPromise: true
  });
  return result?.result?.value || { composerText: null, turnCount: null, generating: false };
}

// The commit observation window exists to learn what the server actually did
// with the write.  Historically it returned as soon as the conversation POST
// was *dispatched* (Network.requestWillBeSent) and never read the response, so
// the real HTTP status -- including a 429 -- was discarded inside the
// extension and the caller was told "202".  Keep watching inside the same
// bounded window for the response: a >=400 status is decisive evidence that
// the turn did not land and must be surfaced as CHATGPT_TURN_HTTP_STATUS.
// A missing response must NOT become a failure -- the write may still have
// landed -- so the window still degrades to the dispatched-only verdict.
async function _submitOnlyWaitForAckOrGeneration(
  requestSeen, rejected, accepted, debuggee, timeoutMs
) {
  const deadline = performance.now() + Math.max(1, timeoutMs);
  let requestObserved = false;
  let pendingRequestSeen = requestSeen;
  while (performance.now() < deadline) {
    const winner = await Promise.race([
      rejected.then(() => "rejected"),
      accepted.then(() => "accepted"),
      pendingRequestSeen.then(() => "network"),
      sleep(Math.min(100, Math.max(1, deadline - performance.now()))).then(() => null)
    ]);
    if (winner === "rejected") return "rejected";
    if (winner === "accepted") return "accepted";
    if (winner === "network") {
      requestObserved = true;
      // Do not re-win the race on the already-observed dispatch event; the
      // remaining budget belongs to the response observation.
      pendingRequestSeen = new Promise(() => {});
    }
    const snapshot = await _submitOnlyLocalSnapshot(debuggee);
    if (snapshot.generating === true) return "local_generation";
  }
  return requestObserved ? "network" : null;
}

async function _executeSubmitOnlyPageTurn({ tabId, text, timeoutMs }) {
  if (!Number.isInteger(tabId)) throw new Error("TAB_ID_REQUIRED");
  if (typeof text !== "string" || !text.trim()) throw new Error("TEXT_REQUIRED");
  const startedAt = performance.now();
  const tab = await chrome.tabs.get(tabId);
  if (!isChatGPTUrl(tab.url || "")) throw new Error("RUNTIME_TAB_IS_NOT_CHATGPT");
  const debuggee = { tabId };
  const diagnostics = {
    tabId,
    tabWasActive: Boolean(tab.active),
    composerStrategy: null,
    submitStrategy: null,
    submitButtonSelector: null,
    submitAckMs: null,
    // ``responseStatus`` is the verdict reported to the caller.  It is only a
    // fallback now: ``responseStatusObserved`` records whether the real HTTP
    // status was actually read from the network, and
    // ``conversationResponseStatus`` carries it.  Reporting 202 without
    // setting ``responseStatusObserved`` means "dispatched, unconfirmed",
    // never "the server accepted it".
    responseStatus: 202,
    responseStatusObserved: false,
    conversationResponseStatus: null,
    responseMimeType: null,
    conversationRequestSeen: false,
    conversationResponseSeen: false,
    loadingFinished: false,
    completionReadyWaitMs: null,
    debuggerAttachedAfter: null,
    elapsedMs: null
  };
  let attached = false;
  let eventListener = null;
  try {
    if (!(globalThis._cwaPersistentObserverOwnsTab?.(tabId) === true)) {
      await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
      attached = true;
    }
    await sendCommand(debuggee, "Network.enable");
    await sendCommand(debuggee, "Runtime.enable");
    await waitForComposerReady(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_READY_TIMEOUT_MS)
    );
    let resolveRequestSeen;
    const requestSeen = new Promise((resolve) => { resolveRequestSeen = resolve; });
    let resolveRejected;
    const rejected = new Promise((resolve) => { resolveRejected = resolve; });
    let resolveAccepted;
    const accepted = new Promise((resolve) => { resolveAccepted = resolve; });
    let conversationRequestId = null;
    eventListener = (source, method, params) => {
      if (source.tabId !== tabId) return;
      if (method === "Network.requestWillBeSent") {
        const request = params?.request;
        if (!isConversationWrite(request?.url || "", request?.method || "")) return;
        diagnostics.conversationRequestSeen = true;
        // Bind the observation to the first conversation write: the submit is
        // the request whose response tells us whether the turn was accepted.
        if (conversationRequestId === null) conversationRequestId = params.requestId;
        resolveRequestSeen(params.requestId);
        return;
      }
      if (method !== "Network.responseReceived") return;
      if (conversationRequestId === null || params?.requestId !== conversationRequestId) return;
      const status = params?.response?.status;
      if (!Number.isInteger(status)) return;
      diagnostics.conversationResponseSeen = true;
      diagnostics.responseStatusObserved = true;
      diagnostics.conversationResponseStatus = status;
      diagnostics.responseMimeType =
        typeof params.response.mimeType === "string" ? params.response.mimeType : null;
      if (status >= 400) {
        resolveRejected(status);
        return;
      }
      if (status >= 200 && status < 300) {
        // The real status supersedes the 202 fallback.
        diagnostics.responseStatus = status;
        resolveAccepted(status);
      }
    };
    chrome.debugger.onEvent.addListener(eventListener);
    diagnostics.composerStrategy = await locateAndFocusComposer(debuggee);
    await clearComposer(debuggee);
    await sendCommand(debuggee, "Input.insertText", { text });
    const preSubmitSnapshot = await _submitOnlyLocalSnapshot(debuggee);
    const submitStartedAt = performance.now();
    const submit = await submitOfficialPageTurn(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_READY_TIMEOUT_MS)
    );
    diagnostics.submitStrategy = submit.strategy;
    diagnostics.submitButtonSelector = submit.selector;
    const ackBudget = Math.min(remainingMs(startedAt, timeoutMs), CWA_SUBMIT_COMMIT_OBSERVATION_MS);
    let acknowledgement = await _submitOnlyWaitForAckOrGeneration(
      requestSeen, rejected, accepted, debuggee, ackBudget
    );
    if (acknowledgement === "rejected") {
      // The server refused the write (429 / 5xx).  Throw before
      // _submitOnlyAcknowledgedPageTurn is assigned so the concrete status
      // reaches the CLI and the bridge, which classifies it as a writer rate
      // limit, applies the account cooldown, and preserves the attempt.
      // Reporting this as an acknowledged submission is what silently burned
      // whole turns and held the account gate for the entire turn.
      throw new Error(
        `CHATGPT_TURN_HTTP_STATUS:${diagnostics.conversationResponseStatus}`
      );
    }
    if (acknowledgement === null) {
      let after = await _submitOnlyLocalSnapshot(debuggee);
      if (acknowledgement === null) {
        const noCommitProven = (
          after.composerText === text.trim() &&
          after.turnCount === preSubmitSnapshot.turnCount &&
          after.generating !== true
        );
        if (noCommitProven) {
          throw new Error(`CHATGPT_SUBMIT_NOT_COMMITTED_LOCAL_PROOF:${submit.strategy}`);
        }
        if (after.generating === true || after.turnCount > preSubmitSnapshot.turnCount) {
          acknowledgement = "local_turn_evidence";
        } else {
          throw new Error(`CHATGPT_SUBMIT_NOT_OBSERVED:${submit.strategy}`);
        }
      }
    }
    diagnostics.submitAckMs = elapsedMs(submitStartedAt);
    diagnostics.elapsedMs = elapsedMs(startedAt);
    const finalTab = await chrome.tabs.get(tabId);
    _submitOnlyAcknowledgedPageTurn = {
      diagnostics,
      finalUrl: finalTab.url || "",
      conversationId: conversationIdFromUrl(finalTab.url || ""),
      turnExchangeId: null
    };
    // Abort the inherited completion/post-processing chain. Returning here is
    // insufficient because several historical wrappers perform their own
    // completion waits after executeOfficialPageTurn resolves.
    throw new Error("CWA_SUBMIT_ONLY_ACKNOWLEDGED");
  } finally {
    if (eventListener) chrome.debugger.onEvent.removeListener(eventListener);
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
  }
}

executeNativeTurn = async function _executeNativeTurnWithSubmitOnly(message) {
  if (message?.submitOnly !== true) return _submitOnlyPriorExecuteNativeTurn(message);
  if (Array.isArray(message?.attachmentPaths) && message.attachmentPaths.length > 0) {
    throw new Error("BROWSER_NATIVE_SUBMIT_ONLY_RICH_INPUT_UNSUPPORTED");
  }
  const priorPageTurn = executeOfficialPageTurn;
  _submitOnlyAcknowledgedPageTurn = null;
  executeOfficialPageTurn = _executeSubmitOnlyPageTurn;
  try {
    return await _submitOnlyPriorExecuteNativeTurn(message);
  } catch (error) {
    const acknowledged = _submitOnlyAcknowledgedPageTurn;
    if (acknowledged === null) throw error;
    const tabId = acknowledged.diagnostics.tabId;
    // THIS object is what the caller actually receives on the submit-only
    // success path: _executeSubmitOnlyPageTurn throws
    // CWA_SUBMIT_ONLY_ACKNOWLEDGED to abort the inherited completion chain, and
    // this catch turns that throw back into a result.  service_worker.js's own
    // return is never reached, so hard-coding 202 here would fabricate the
    // verdict even after the observer learned the real status.
    //
    // Report the status that was actually read, and carry the discriminators so
    // a caller can tell an observed verdict from the dispatched-only fallback.
    return {
      conversationId: acknowledged.conversationId,
      turnExchangeId: null,
      responseStatus: acknowledged.diagnostics.responseStatus,
      responseStatusObserved: acknowledged.diagnostics.responseStatusObserved === true,
      conversationResponseStatus: acknowledged.diagnostics.conversationResponseStatus ?? null,
      responseMimeType: acknowledged.diagnostics.responseMimeType ?? null,
      finalUrl: acknowledged.finalUrl,
      tabId,
      tabWasActive: acknowledged.diagnostics.tabWasActive,
      elapsedMs: acknowledged.diagnostics.elapsedMs,
      submitStrategy: acknowledged.diagnostics.submitStrategy,
      submitAckMs: acknowledged.diagnostics.submitAckMs,
      browserAuthorityLeaseId: typeof message.browserAuthorityLeaseId === "string"
        ? message.browserAuthorityLeaseId : null,
      attachmentCount: 0
    };
  } finally {
    _submitOnlyAcknowledgedPageTurn = null;
    executeOfficialPageTurn = priorPageTurn;
  }
};

/* END legacy source: service_worker_submit_only_v2.js */

// Protocol-v2 external-operation observation over the existing page-owned recorder.
// Inert by default; activated only by an explicit observer start. Loaded before
// the persistent turn observer so that observer stays the final production layer;
// it reuses the same debugger sessions without a second attach and never performs
// browserless HTTP reads.

/* BEGIN legacy source: service_worker_external_operation_v2_1.js */
// Bounded event-observation characterization recorder (protocol-v2 pre-work).
//
// This module is INERT by default: it registers no listeners and performs no
// reads until a native "characterize" message with an explicit action
// (start/stop/status/dump/clear) arrives. When active it records, from the
// SAME debugger sessions the persistent turn observer already holds (no second
// chrome.debugger.attach), a bounded raw log of page-owned network events, tab
// events and DOM/UI samples into chrome.storage.local.
//
// Hard rules:
//  - never attaches a second debugger, never creates/updates/closes a tab,
//    never sends Input.* or other page-mutation CDP commands;
//  - never performs a browserless HTTP canonical read and never issues fetch;
//  - never records prompt/final/tool content, request post data, response
//    bodies, cookies or tokens; stream content is reduced to SSE event-type
//    names and byte sizes only;
//  - log is bounded (event count and byte budget); drop oldest on overflow.

const CWA_CHARACTERIZATION_KEY = "cwaCharacterizationLogV1";
const CWA_CHARACTERIZATION_SCHEMA = 1;
const CWA_CHARACTERIZATION_MAX_EVENTS = 4000;
const CWA_CHARACTERIZATION_BYTE_BUDGET = 2 * 1024 * 1024;
const CWA_CHARACTERIZATION_DOM_INTERVAL_MS = 2000;
const CWA_CHARACTERIZATION_DOM_MAX_SAMPLES = 150;

let _cwaCharActive = false;
let _cwaCharSessionId = null;
let _cwaCharStartedAtMs = null;
let _cwaCharSeq = 0;
let _cwaCharSourceSeq = new Map();
let _cwaCharBytes = 0;
let _cwaCharEvents = [];
let _cwaCharDomTimer = null;
let _cwaCharDomSamples = 0;
let _cwaCharPersistTimer = null;
let _cwaCharAckCursor = null;
let _cwaCharConversationRef = null;
let _cwaCharAttemptId = null;
let _cwaCharTurnId = null;
let _cwaCharTabUpdatedListener = null;
let _cwaCharTabActivatedListener = null;
let _cwaCharTabRemovedListener = null;
const _cwaCharWriteRequestIds = new Set();
// WebSocket bookkeeping: map a debugger request id (the handshake request) to
// its chatgpt-origin url kind so frame events stay content-free — only token /
// length metadata for chatgpt sockets is pushed, never raw payload bytes.
let _cwaCharWsKinds = new Map();

function _cwaCharNow() { return Date.now(); }

function _cwaCharUrlKind(url) {
  try {
    const parsed = new URL(url || "");
    if (parsed.origin !== CHATGPT_ORIGIN) return "other_origin";
    const match = parsed.pathname.match(/^\/c\/([^/]+)$/);
    if (match) {
      let id = match[1];
      try { id = decodeURIComponent(id); } catch {}
      return id ? "conversation" : "conversation_empty";
    }
    if (parsed.pathname === "/" || parsed.pathname === "") return "root";
    return "other_chatgpt";
  } catch {
    return "invalid";
  }
}

function _cwaCharConversationIdFromUrl(url) {
  try {
    const parsed = new URL(url || "");
    if (parsed.origin !== CHATGPT_ORIGIN) return null;
    const match = parsed.pathname.match(/^\/c\/([^/]+)$/);
    if (!match) return null;
    let id = match[1];
    try { id = decodeURIComponent(id); } catch {}
    return id || null;
  } catch {
    return null;
  }
}

function _cwaCharPush(entry) {
  const rawSource = typeof entry?.source === "string" && entry.source ? entry.source : "session";
  const publicSource = rawSource === "dom" || rawSource === "tab" ? "page" : rawSource;
  const sourceSeq = _cwaCharSourceSeq.get(publicSource) || 0;
  entry.source_seq = sourceSeq;
  _cwaCharSourceSeq.set(publicSource, sourceSeq + 1);
  entry.seq = _cwaCharSeq;
  entry.t = _cwaCharNow();
  _cwaCharSeq += 1;
  _cwaCharEvents.push(entry);
  _cwaCharBytes += JSON.stringify(entry).length;
  while (
    _cwaCharEvents.length > CWA_CHARACTERIZATION_MAX_EVENTS ||
    (_cwaCharBytes > CWA_CHARACTERIZATION_BYTE_BUDGET && _cwaCharEvents.length > 16)
  ) {
    const dropped = _cwaCharEvents.shift();
    _cwaCharBytes -= JSON.stringify(dropped).length;
    if (_cwaCharBytes < 0) _cwaCharBytes = 0;
  }
  _cwaCharSchedulePersist();
}

function _cwaCharPersistedLog() {
  return {
    schema: CWA_CHARACTERIZATION_SCHEMA,
    session_id: _cwaCharSessionId,
    active: _cwaCharActive,
    started_at_ms: _cwaCharStartedAtMs,
    event_count: _cwaCharEvents.length,
    bytes: _cwaCharBytes,
    acked_cursor: _cwaCharAckCursor,
    conversation_ref: _cwaCharConversationRef,
    attempt_id: _cwaCharAttemptId,
    turn_id: _cwaCharTurnId,
    events: _cwaCharEvents
  };
}

async function _cwaCharPersistNow() {
  if (_cwaCharPersistTimer !== null) {
    try { clearTimeout(_cwaCharPersistTimer); } catch {}
    _cwaCharPersistTimer = null;
  }
  try {
    await chrome.storage.local.set({ [CWA_CHARACTERIZATION_KEY]: _cwaCharPersistedLog() });
    return true;
  } catch {
    return false;
  }
}

function _cwaCharSchedulePersist() {
  if (_cwaCharPersistTimer !== null) return;
  _cwaCharPersistTimer = setTimeout(() => {
    _cwaCharPersistTimer = null;
    void _cwaCharPersistNow();
  }, 500);
}

// SSE event-type-only extraction: returns an array of distinct type tokens
// ("event" field or JSON "type" field values) found in a decoded chunk, never
// content. Used to answer "which SSE event types does the stream carry".
const CWA_CHAR_SSE_EVENT_RE = /(?:^|\n)event\s*:\s*([A-Za-z0-9_.-]+)|"type"\s*:\s*"([A-Za-z0-9_.-]+)"/g;
function _cwaCharSseEventTypes(decodedChunk) {
  if (typeof decodedChunk !== "string" || !decodedChunk) return [];
  const seen = [];
  let match;
  CWA_CHAR_SSE_EVENT_RE.lastIndex = 0;
  while ((match = CWA_CHAR_SSE_EVENT_RE.exec(decodedChunk)) !== null) {
    const token = match[1] || match[2];
    if (token && !seen.includes(token)) seen.push(token);
    if (seen.length >= 32) break;
  }
  return seen;
}

// SSE path-value extraction: returns the distinct "/message/..." path tokens
// (plus "[DONE]") found in a decoded SSE chunk.  Content-free: only path
// names, never the values/text they carry.
const CWA_CHAR_SSE_PATH_RE = /"p"\s*:\s*"(\/message\/[^"]+)"/g;
function _cwaCharSsePaths(decodedChunk) {
  if (typeof decodedChunk !== "string" || !decodedChunk) return [];
  const seen = [];
  let match;
  CWA_CHAR_SSE_PATH_RE.lastIndex = 0;
  while ((match = CWA_CHAR_SSE_PATH_RE.exec(decodedChunk)) !== null) {
    const path = match[1];
    if (path && !seen.includes(path)) seen.push(path);
    if (seen.length >= 24) break;
  }
  if (decodedChunk.includes("[DONE]") && !seen.includes("[DONE]")) seen.push("[DONE]");
  return seen;
}

function _cwaCharNetworkEvent(source, method, params) {
  const tabId = source?.tabId;
  if (!Number.isInteger(tabId)) return;
  if (method === "Network.requestWillBeSent") {
    const request = params?.request;
    const kind = _cwaCharUrlKind(request?.url);
    if (kind === "other_origin") return;
    const isWrite = typeof isConversationWrite === "function"
      ? isConversationWrite(request?.url || "", request?.method || "")
      : false;
    if (isWrite && typeof params?.requestId === "string") {
      _cwaCharWriteRequestIds.add(params.requestId);
    }
    _cwaCharPush({
      source: "network",
      method,
      tabId,
      request_id: typeof params?.requestId === "string" ? params.requestId : null,
      url_kind: kind,
      conversation_id: _cwaCharConversationIdFromUrl(request?.url),
      http_method: request?.method || null,
      resource_type: request?.resourceType || null,
      is_conversation_write: isWrite
    });
  } else if (method === "Network.responseReceived") {
    const response = params?.response;
    const kind = _cwaCharUrlKind(response?.url);
    if (kind === "other_origin") return;
    const requestId = typeof params?.requestId === "string" ? params.requestId : null;
    const isWrite = requestId !== null && _cwaCharWriteRequestIds.has(requestId);
    if (isWrite) {
      void _cwaCharEnableStream(tabId, requestId);
    }
    _cwaCharPush({
      source: "network",
      method,
      tabId,
      request_id: requestId,
      url_kind: kind,
      status: response?.status ?? null,
      mime: response?.mimeType || null,
      is_conversation_write: isWrite
    });
  } else if (method === "Network.dataReceived") {
    const size = Number.isFinite(params?.dataLength) ? params.dataLength : null;
    const requestId = typeof params?.requestId === "string" ? params.requestId : null;
    let types = [];
    let paths = [];
    if (typeof params?.base64Encoded === "boolean" && params.base64Encoded && typeof params?.data === "string") {
      try {
        const decoded = atob(params.data);
        types = _cwaCharSseEventTypes(decoded);
        if (requestId !== null && _cwaCharWriteRequestIds.has(requestId)) {
          paths = _cwaCharSsePaths(decoded);
        }
      } catch {}
    }
    _cwaCharPush({
      source: "network", method, tabId, bytes: size,
      is_conversation_write: requestId !== null && _cwaCharWriteRequestIds.has(requestId),
      sse_event_types: types, sse_paths: paths
    });
  } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
    const requestId = typeof params?.requestId === "string" ? params.requestId : null;
    const isWrite = requestId !== null && _cwaCharWriteRequestIds.has(requestId);
    _cwaCharPush({
      source: "network",
      method,
      tabId,
      request_id: requestId,
      is_conversation_write: isWrite,
      encoded_bytes: Number.isFinite(params?.encodedDataLength) ? params.encodedDataLength : null,
      error: method === "Network.loadingFailed" ? (params?.errorText || null) : null
    });
    if (requestId !== null) _cwaCharWriteRequestIds.delete(requestId);
  } else if (method === "Network.webSocketCreated") {
    const url = typeof params?.url === "string" ? params.url : "";
    const kind = _cwaCharUrlKind(url);
    const requestId = typeof params?.requestId === "string" ? params.requestId : null;
    if (kind !== "other_origin" && requestId !== null) {
      _cwaCharWsKinds.set(requestId, kind);
    }
    _cwaCharPush({
      source: "network", method, tabId,
      request_id: requestId,
      url_kind: kind
    });
  } else if (method === "Network.webSocketFrameReceived" || method === "Network.webSocketFrameSent") {
    // Content-free: payload is only used to extract SSE event-type / path
    // tokens for chatgpt text sockets; full payload bytes are never stored.
    const frame = params?.response;
    const requestId = typeof params?.requestId === "string" ? params.requestId : null;
    const kind = requestId !== null ? (_cwaCharWsKinds.get(requestId) || null) : null;
    const payload = typeof frame?.payloadData === "string" ? frame.payloadData : "";
    let types = [];
    let paths = [];
    if (kind && kind !== "other_origin" && frame?.opcode === 1 && payload) {
      types = _cwaCharSseEventTypes(payload);
      if (types.length > 0) paths = _cwaCharSsePaths(payload);
    }
    _cwaCharPush({
      source: "network", method, tabId,
      request_id: requestId, ws_kind: kind,
      opcode: Number.isInteger(frame?.opcode) ? frame.opcode : null,
      payload_bytes: payload ? payload.length : null,
      sse_event_types: types, sse_paths: paths
    });
  } else if (method === "Network.webSocketFrameError") {
    const error = typeof params?.errorMessage === "string" ? params.errorMessage : null;
    _cwaCharPush({
      source: "network", method, tabId,
      request_id: typeof params?.requestId === "string" ? params.requestId : null,
      error: error ? error.slice(0, 160) : null
    });
  } else if (method === "Network.webSocketClosed") {
    const requestId = typeof params?.requestId === "string" ? params.requestId : null;
    if (requestId !== null) _cwaCharWsKinds.delete(requestId);
    _cwaCharPush({
      source: "network", method, tabId, request_id: requestId,
      close_code: Number.isInteger(params?.closeCode) ? params.closeCode : null
    });
  }
}

async function _cwaCharEnableStream(tabId, requestId) {
  if (!_cwaCharActive) return;
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      "Network.streamResourceContent",
      { requestId }
    );
    if (typeof result?.bufferedData === "string" && result.bufferedData) {
      let decoded = "";
      try { decoded = atob(result.bufferedData); } catch {}
      const paths = _cwaCharSsePaths(decoded);
      if (paths.length > 0) {
        _cwaCharPush({
          source: "network", method: "Network.streamResourceContent", tabId,
          is_conversation_write: true, sse_paths: paths,
          buffered_bytes: typeof result?.bufferedData === "string" ? result.bufferedData.length : null
        });
      }
    }
  } catch {}
}

function _cwaCharOnDebuggerEvent(source, method, params) {
  if (!_cwaCharActive) return;
  if (!String(method || "").startsWith("Network.")) return;
  _cwaCharNetworkEvent(source, method, params);
}

function _cwaCharDomProbeExpression() {
  return `(() => {
    const main = document.querySelector('main');
    const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]').length;
    const stop = Boolean(document.querySelector(
      'button[data-testid="stop-button"], button[aria-label="Stop generating"]'
    ));
    const composer = Boolean(
      document.querySelector('#prompt-textarea, div[contenteditable="true"]')
    );
    let banners = [];
    for (const el of document.querySelectorAll('[data-testid^="banner"], [role="alert"]')) {
      const name = el.getAttribute('data-testid') || el.getAttribute('role');
      if (name && !banners.includes(name)) banners.push(name);
      if (banners.length >= 4) break;
    }
    return { main_ready: Boolean(main), turns, stop, composer, banners };
  })()`;
}

async function _cwaCharDomProbeOnce() {
  if (!_cwaCharActive || _cwaCharDomSamples >= CWA_CHARACTERIZATION_DOM_MAX_SAMPLES) return;
  let tabs = [];
  try {
    const targets = await chrome.debugger.getTargets();
    tabs = targets.filter((t) => t.type === "page" && t.tabId !== undefined && t.attached);
  } catch {
    return;
  }
  for (const target of tabs.slice(0, 4)) {
    const debuggee = { tabId: target.tabId };
    try {
      const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
        expression: _cwaCharDomProbeExpression(),
        returnByValue: true
      });
      const value = result?.result?.value;
      if (value && typeof value === "object") {
        _cwaCharDomSamples += 1;
        _cwaCharPush({ source: "dom", tabId: target.tabId, dom: value });
      }
    } catch {}
  }
}

function _cwaCharOnTabUpdated(tabId, changeInfo, tab) {
  if (!_cwaCharActive) return;
  if (typeof tab?.url !== "string" || tab.url.startsWith("chrome://")) return;
  const kind = _cwaCharUrlKind(tab.url);
  if (kind === "other_origin") return;
  _cwaCharPush({
    source: "tab",
    kind: "tab_updated",
    tabId,
    url_kind: kind,
    conversation_id: _cwaCharConversationIdFromUrl(tab.url),
    visible: tab.active === true ? true : null
  });
}

function _cwaCharPublicSource(rawSource) {
  return rawSource === "dom" || rawSource === "tab" ? "page" : rawSource;
}

function _cwaCharHydrateStored(log) {
  _cwaCharSessionId = log.session_id ?? null;
  _cwaCharStartedAtMs = log.started_at_ms ?? _cwaCharNow();
  _cwaCharEvents = Array.isArray(log.events) ? [...log.events] : [];
  _cwaCharBytes = Number.isFinite(log.bytes) ? Number(log.bytes) : _cwaCharEvents.reduce((sum, entry) => sum + JSON.stringify(entry).length, 0);
  _cwaCharAckCursor = typeof log.acked_cursor === "string" ? log.acked_cursor : null;
  _cwaCharConversationRef = typeof log.conversation_ref === "string" ? log.conversation_ref : null;
  _cwaCharAttemptId = typeof log.attempt_id === "string" ? log.attempt_id : null;
  _cwaCharTurnId = typeof log.turn_id === "string" ? log.turn_id : null;
  _cwaCharSeq = 0;
  _cwaCharSourceSeq = new Map();
  _cwaCharDomSamples = 0;
  for (const entry of _cwaCharEvents) {
    if (Number.isInteger(entry?.seq) && entry.seq >= _cwaCharSeq) _cwaCharSeq = entry.seq + 1;
    const source = _cwaCharPublicSource(typeof entry?.source === "string" ? entry.source : "session");
    if (Number.isInteger(entry?.source_seq)) {
      const next = entry.source_seq + 1;
      if (next > (_cwaCharSourceSeq.get(source) || 0)) _cwaCharSourceSeq.set(source, next);
    }
    if (entry?.source === "dom") _cwaCharDomSamples += 1;
  }
  _cwaCharWsKinds = new Map();
}

function _cwaCharNormalizeContext(context) {
  const input = context && typeof context === "object" ? context : {};
  const normalized = {};
  for (const key of ["conversation_ref", "attempt_id", "turn_id"]) {
    const value = input[key];
    if (value === null || value === undefined) {
      normalized[key] = null;
    } else if (typeof value === "string" && value.trim()) {
      normalized[key] = value.trim();
    } else {
      throw new Error("EXTERNAL_OPERATION_CONTEXT_INVALID");
    }
  }
  return normalized;
}

function _cwaCharContextMatches(context) {
  return (
    (context.conversation_ref === null || context.conversation_ref === _cwaCharConversationRef) &&
    (context.attempt_id === null || context.attempt_id === _cwaCharAttemptId) &&
    (context.turn_id === null || context.turn_id === _cwaCharTurnId)
  );
}

async function _cwaCharStart(sessionId, context = null) {
  const normalizedSessionId = typeof sessionId === "string" && sessionId ? sessionId : null;
  let normalizedContext;
  try { normalizedContext = _cwaCharNormalizeContext(context); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  if (_cwaCharActive) {
    if (_cwaCharSessionId === normalizedSessionId) {
      if (!_cwaCharContextMatches(normalizedContext)) {
        return { ok: false, error: "EXTERNAL_OPERATION_CONTEXT_MISMATCH" };
      }
      return { ok: true, session_id: _cwaCharSessionId, active: true, resumed: false, already_active: true };
    }
    return { ok: false, error: "CHARACTERIZE_ALREADY_ACTIVE" };
  }

  let storedLog = null;
  try {
    const stored = await chrome.storage.local.get(CWA_CHARACTERIZATION_KEY);
    storedLog = stored?.[CWA_CHARACTERIZATION_KEY] || null;
  } catch {}

  if (storedLog?.active === true) {
    if (storedLog.session_id !== normalizedSessionId) {
      return { ok: false, error: "CHARACTERIZE_ALREADY_ACTIVE" };
    }
    _cwaCharHydrateStored(storedLog);
    if (!_cwaCharContextMatches(normalizedContext)) {
      return { ok: false, error: "EXTERNAL_OPERATION_CONTEXT_MISMATCH" };
    }
    _cwaCharActive = true;
    _cwaCharActivateListeners();
    _cwaCharPush({ source: "runtime", kind: "reattached" });
    const durable = await _cwaCharPersistNow();
    if (!durable) return { ok: false, error: "EXTERNAL_OPERATION_PERSIST_FAILED" };
    return { ok: true, session_id: _cwaCharSessionId, active: true, resumed: true };
  }

  if (storedLog && storedLog.session_id === normalizedSessionId && storedLog.active === false) {
    return { ok: false, error: "CHARACTERIZE_SESSION_ALREADY_STOPPED" };
  }

  _cwaCharActive = true;
  _cwaCharSessionId = normalizedSessionId;
  _cwaCharStartedAtMs = _cwaCharNow();
  _cwaCharSeq = 0;
  _cwaCharSourceSeq = new Map();
  _cwaCharBytes = 0;
  _cwaCharEvents = [];
  _cwaCharAckCursor = null;
  _cwaCharConversationRef = normalizedContext.conversation_ref;
  _cwaCharAttemptId = normalizedContext.attempt_id;
  _cwaCharTurnId = normalizedContext.turn_id;
  _cwaCharDomSamples = 0;
  _cwaCharWsKinds = new Map();
  _cwaCharActivateListeners();
  _cwaCharPush({ source: "session", kind: "started" });
  const durable = await _cwaCharPersistNow();
  if (!durable) return { ok: false, error: "EXTERNAL_OPERATION_PERSIST_FAILED" };
  return { ok: true, session_id: _cwaCharSessionId, active: true, resumed: false };
}


function _cwaCharActivateListeners() {
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
}
async function _cwaCharStop() {
  if (!_cwaCharActive) return { ok: false, error: "CHARACTERIZE_NOT_ACTIVE" };
  _cwaCharActive = false;
  _cwaCharWriteRequestIds.clear();
  _cwaCharPush({ source: "session", kind: "stopped" });
  _cwaCharWsKinds.clear();
  if (_cwaCharDomTimer !== null) {
    clearInterval(_cwaCharDomTimer);
    _cwaCharDomTimer = null;
  }
  chrome.debugger.onEvent.removeListener(_cwaCharOnDebuggerEvent);
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
  const summary = {
    ok: true,
    session_id: _cwaCharSessionId,
    event_count: _cwaCharEvents.length,
    bytes: _cwaCharBytes,
    dom_samples: _cwaCharDomSamples,
    started_at_ms: _cwaCharStartedAtMs,
    stopped_at_ms: _cwaCharNow()
  };
  await _cwaCharPersistNow();
  return summary;
}

async function _cwaCharDump() {
  try {
    const stored = await chrome.storage.local.get(CWA_CHARACTERIZATION_KEY);
    const log = stored?.[CWA_CHARACTERIZATION_KEY];
    if (!log || typeof log !== "object") {
      return { ok: true, schema: CWA_CHARACTERIZATION_SCHEMA, session_id: null, event_count: 0, events: [] };
    }
    const events = Array.isArray(log.events) ? log.events : [];
    return {
      ok: true,
      schema: CWA_CHARACTERIZATION_SCHEMA,
      session_id: log.session_id ?? null,
      active: log.active === true,
      started_at_ms: log.started_at_ms ?? null,
      event_count: events.length,
      bytes: log.bytes ?? 0,
      events
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function _cwaCharExternalEventTypeFromPaths(paths) {
  if (!Array.isArray(paths)) return null;
  if (paths.includes("/message/end_turn")) return "end_turn";
  if (paths.includes("/message/status")) return "status_update";
  if (paths.includes("/message/metadata")) return "metadata_update";
  if (paths.includes("/message/content/parts/0")) return "text_delta";
  if (paths.includes("/message/content")) return "content_update";
  return null;
}

function _cwaCharExternalSource(entry) {
  if (entry?.source === "network") return "network";
  if (entry?.source === "session") return "session";
  return "page";
}

function _cwaCharExternalEventType(entry) {
  if (entry?.source === "session") return "session";
  if (entry?.source === "runtime" && entry?.kind === "reattached") return "runtime_reattach";
  if (entry?.source === "dom") return "page_state";
  if (entry?.source === "tab") {
    return entry?.kind === "tab_updated" && typeof entry?.conversation_id === "string"
      ? "route_change"
      : "page_state";
  }
  const method = entry?.method;
  if (method === "Network.requestWillBeSent" && entry?.is_conversation_write === true) {
    return "turn_submitted";
  }
  if (method === "Network.responseReceived") {
    return entry?.is_conversation_write === true && Number(entry?.status) === 429
      ? "rate_limited"
      : "http_status";
  }
  if (
    method === "Network.dataReceived" ||
    method === "Network.streamResourceContent" ||
    method === "Network.webSocketFrameReceived" ||
    method === "Network.webSocketFrameSent"
  ) {
    return _cwaCharExternalEventTypeFromPaths(entry?.sse_paths) || "stream_data";
  }
  if (method === "Network.loadingFinished" || method === "Network.webSocketClosed") {
    return "stream_finished";
  }
  if (method === "Network.loadingFailed" || method === "Network.webSocketFrameError") {
    return "stream_failed";
  }
  return "stream_data";
}

function _cwaCharExternalMetadata(entry) {
  const metadata = {};
  const assign = (key, value) => {
    if (value !== null && value !== undefined) metadata[key] = value;
  };
  assign("network_method", typeof entry?.method === "string" ? entry.method : null);
  assign("network_request_id", typeof entry?.request_id === "string" ? entry.request_id : null);
  assign("url_kind", typeof entry?.url_kind === "string" ? entry.url_kind : null);
  assign("request_method", typeof entry?.http_method === "string" ? entry.http_method : null);
  assign("resource_type", typeof entry?.resource_type === "string" ? entry.resource_type : null);
  assign("is_conversation_write", typeof entry?.is_conversation_write === "boolean" ? entry.is_conversation_write : null);
  assign("http_status", Number.isFinite(entry?.status) ? Number(entry.status) : null);
  assign("mime", typeof entry?.mime === "string" ? entry.mime : null);
  assign("bytes", Number.isFinite(entry?.bytes) ? Number(entry.bytes) : null);
  assign("encoded_bytes", Number.isFinite(entry?.encoded_bytes) ? Number(entry.encoded_bytes) : null);
  assign("buffered_bytes", Number.isFinite(entry?.buffered_bytes) ? Number(entry.buffered_bytes) : null);
  assign("frame_bytes", Number.isFinite(entry?.payload_bytes) ? Number(entry.payload_bytes) : null);
  assign("sse_event_types", Array.isArray(entry?.sse_event_types) ? [...entry.sse_event_types] : null);
  assign("sse_paths", Array.isArray(entry?.sse_paths) ? [...entry.sse_paths] : null);
  assign("ws_kind", typeof entry?.ws_kind === "string" ? entry.ws_kind : null);
  assign("opcode", Number.isInteger(entry?.opcode) ? entry.opcode : null);
  assign("close_code", Number.isInteger(entry?.close_code) ? entry.close_code : null);
  assign("tab_id", Number.isInteger(entry?.tabId) ? entry.tabId : null);
  assign("page_event_kind", typeof entry?.kind === "string" ? entry.kind : null);
  assign("visible", typeof entry?.visible === "boolean" ? entry.visible : null);
  if (entry?.dom && typeof entry.dom === "object") {
    assign("turns", Number.isInteger(entry.dom.turns) ? entry.dom.turns : null);
    assign("stop", typeof entry.dom.stop === "boolean" ? entry.dom.stop : null);
    assign("composer", typeof entry.dom.composer === "boolean" ? entry.dom.composer : null);
    assign("banners", Array.isArray(entry.dom.banners) ? [...entry.dom.banners] : null);
  }
  return metadata;
}

function _cwaCharExternalError(eventType) {
  if (eventType === "rate_limited") {
    return { code: "HTTP_429", retryable: true };
  }
  if (eventType === "stream_failed") {
    return { code: "OBSERVATION_STREAM_FAILED", retryable: true };
  }
  return null;
}

function _cwaCharExternalStatus(eventType) {
  if (eventType === "rate_limited") return "retryable";
  if (eventType === "stream_failed") return "failed";
  if (eventType === "end_turn") return "completed";
  return "running";
}

function _cwaCharExternalCursor(operationId, rawSeq) {
  return `${operationId}:${rawSeq}`;
}

function _cwaCharParseExternalCursor(operationId, cursor) {
  if (cursor === null || cursor === undefined) return -1;
  if (typeof cursor !== "string" || !cursor.startsWith(`${operationId}:`)) {
    throw new Error("EXTERNAL_OPERATION_CURSOR_MISMATCH");
  }
  const raw = cursor.slice(operationId.length + 1);
  if (!/^\d+$/.test(raw)) throw new Error("EXTERNAL_OPERATION_CURSOR_MISMATCH");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("EXTERNAL_OPERATION_CURSOR_MISMATCH");
  return value;
}

async function _cwaCharExternalSnapshot(operationId) {
  if (_cwaCharSessionId === operationId && (_cwaCharActive || _cwaCharEvents.length > 0)) {
    return { session_id: operationId, events: [..._cwaCharEvents], acked_cursor: _cwaCharAckCursor };
  }
  const stored = await chrome.storage.local.get(CWA_CHARACTERIZATION_KEY);
  const log = stored?.[CWA_CHARACTERIZATION_KEY];
  if (!log || typeof log !== "object" || log.session_id !== operationId) {
    throw new Error("EXTERNAL_OPERATION_NOT_FOUND");
  }
  if (log.active === true) {
    throw new Error("EXTERNAL_OPERATION_OBSERVER_LOST");
  }
  return {
    session_id: log.session_id,
    events: Array.isArray(log.events) ? [...log.events] : [],
    acked_cursor: typeof log.acked_cursor === "string" ? log.acked_cursor : null
  };
}

function _cwaCharProjectExternalEvent(operationId, entry) {
  if (!Number.isInteger(entry?.seq) || entry.seq < 0) {
    throw new Error("EXTERNAL_OPERATION_SEQUENCE_INVALID");
  }
  if (!Number.isInteger(entry?.source_seq) || entry.source_seq < 0) {
    throw new Error("EXTERNAL_OPERATION_SOURCE_SEQUENCE_MISSING");
  }
  const eventType = _cwaCharExternalEventType(entry);
  return {
    protocol: 2,
    type: "turn_event",
    operation_id: operationId,
    conversation_ref: typeof entry?.conversation_id === "string" ? entry.conversation_id : _cwaCharConversationRef,
    attempt_id: _cwaCharAttemptId,
    turn_id: _cwaCharTurnId,
    event_seq: entry.source_seq,
    source: _cwaCharExternalSource(entry),
    event_type: eventType,
    t_ms: Number.isFinite(entry?.t) ? Number(entry.t) : _cwaCharNow(),
    status: _cwaCharExternalStatus(eventType),
    cursor: _cwaCharExternalCursor(operationId, entry.seq),
    metadata: _cwaCharExternalMetadata(entry),
    error: _cwaCharExternalError(eventType)
  };
}

async function _cwaCharExternalOperationEvents(operationId, cursor, limit) {
  try {
    if (typeof operationId !== "string" || !operationId.trim()) {
      throw new Error("EXTERNAL_OPERATION_ID_REQUIRED");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("EXTERNAL_OPERATION_LIMIT_INVALID");
    }
    const normalizedId = operationId.trim();
    const afterSeq = _cwaCharParseExternalCursor(normalizedId, cursor);
    if (_cwaCharActive && _cwaCharSessionId === normalizedId) {
      const durable = await _cwaCharPersistNow();
      if (!durable) throw new Error("EXTERNAL_OPERATION_PERSIST_FAILED");
    }
    const snapshot = await _cwaCharExternalSnapshot(normalizedId);
    const events = snapshot.events
      .filter((entry) => entry && Number.isInteger(entry.seq))
      .sort((left, right) => left.seq - right.seq);
    if (events.length === 0) {
      if (afterSeq >= 0) throw new Error("EXTERNAL_OPERATION_CURSOR_AHEAD");
      return { ok: true, operation_id: normalizedId, events: [], next_cursor: cursor ?? null, has_more: false };
    }
    const firstSeq = events[0].seq;
    const lastSeq = events[events.length - 1].seq;
    if (afterSeq > lastSeq) throw new Error("EXTERNAL_OPERATION_CURSOR_AHEAD");
    if (firstSeq > afterSeq + 1) throw new Error("EXTERNAL_OPERATION_CURSOR_GAP");
    const remaining = events.filter((entry) => entry.seq > afterSeq);
    const selected = remaining.slice(0, limit);
    const publicEvents = selected.map((entry) => _cwaCharProjectExternalEvent(normalizedId, entry));
    return {
      ok: true,
      operation_id: normalizedId,
      events: publicEvents,
      next_cursor: publicEvents.length > 0 ? publicEvents[publicEvents.length - 1].cursor : (cursor ?? null),
      has_more: remaining.length > selected.length
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}


async function _cwaCharExternalOperationAck(operationId, cursor) {
  try {
    if (typeof operationId !== "string" || !operationId.trim()) throw new Error("EXTERNAL_OPERATION_ID_REQUIRED");
    const normalizedId = operationId.trim();
    const ackSeq = _cwaCharParseExternalCursor(normalizedId, cursor);
    if (ackSeq < 0) throw new Error("EXTERNAL_OPERATION_ACK_CURSOR_REQUIRED");
    if (_cwaCharActive && _cwaCharSessionId === normalizedId) {
      const durable = await _cwaCharPersistNow();
      if (!durable) throw new Error("EXTERNAL_OPERATION_PERSIST_FAILED");
    }
    const snapshot = await _cwaCharExternalSnapshot(normalizedId);
    const known = snapshot.events.some((entry) => Number.isInteger(entry?.seq) && entry.seq === ackSeq);
    if (!known) throw new Error("EXTERNAL_OPERATION_ACK_CURSOR_UNKNOWN");
    if (typeof snapshot.acked_cursor === "string") {
      const durableAckSeq = _cwaCharParseExternalCursor(normalizedId, snapshot.acked_cursor);
      if (ackSeq < durableAckSeq) throw new Error("EXTERNAL_OPERATION_ACK_ROLLBACK");
    }
    if (_cwaCharSessionId === normalizedId && (_cwaCharActive || _cwaCharEvents.length > 0)) {
      _cwaCharAckCursor = cursor;
      const durable = await _cwaCharPersistNow();
      if (!durable) throw new Error("EXTERNAL_OPERATION_PERSIST_FAILED");
    } else {
      const stored = await chrome.storage.local.get(CWA_CHARACTERIZATION_KEY);
      const log = stored?.[CWA_CHARACTERIZATION_KEY];
      if (!log || log.session_id !== normalizedId) throw new Error("EXTERNAL_OPERATION_NOT_FOUND");
      await chrome.storage.local.set({ [CWA_CHARACTERIZATION_KEY]: { ...log, acked_cursor: cursor } });
    }
    return { ok: true, operation_id: normalizedId, cursor };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function _cwaCharExternalAggregate(operationId, entries, ackedCursor = null) {
  const events = entries
    .filter((entry) => entry && Number.isInteger(entry.seq))
    .sort((left, right) => left.seq - right.seq)
    .map((entry) => _cwaCharProjectExternalEvent(operationId, entry));
  let failed = false;
  let retryable = false;
  let terminalSeen = false;
  let terminalMarkers = 0;
  let lastDataMs = null;
  let lastTerminalMs = null;
  let submittedSeen = false;
  let conversationRef = null;
  for (const event of events) {
    if (typeof event.conversation_ref === "string") conversationRef = event.conversation_ref;
    if (event.event_type === "turn_submitted") {
      retryable = false;
      submittedSeen = true;
      terminalSeen = false;
      terminalMarkers = 0;
      lastDataMs = null;
      lastTerminalMs = null;
    }
    if (event.status === "retryable" && event.error?.retryable === true) retryable = true;
    if (event.status === "failed" || event.event_type === "stream_failed" || event.event_type === "observer_lost" || event.error?.retryable === false) failed = true;
    const conversationWrite = event.metadata?.is_conversation_write === true;
    const structuredTerminal = ["end_turn", "status_update", "metadata_update"].includes(event.event_type) && ["completed", "failed"].includes(event.status);
    const transportTerminal = submittedSeen && event.event_type === "stream_finished" && conversationWrite;
    if (structuredTerminal || transportTerminal) {
      terminalSeen = true;
      terminalMarkers += 1;
      lastTerminalMs = event.t_ms;
    }
    const structuredData = ["text_delta", "content_update", "tool_call", "tool_result"].includes(event.event_type);
    const transportData = submittedSeen && event.event_type === "stream_data" && conversationWrite;
    if (structuredData || transportData) lastDataMs = event.t_ms;
  }
  let status = "running";
  if (failed) status = "failed";
  else if (retryable) status = "retryable";
  else if (terminalSeen) {
    const anchors = [lastDataMs, lastTerminalMs].filter((value) => value !== null);
    const anchor = anchors.length > 0 ? Math.max(...anchors) : null;
    if (anchor === null || _cwaCharNow() - anchor >= 3000) status = "completed";
  }
  return {
    operation_id: operationId,
    conversation_ref: conversationRef,
    status,
    event_count: events.length,
    terminal_markers: terminalMarkers,
    failed,
    retryable,
    cursor: events.length > 0 ? events[events.length - 1].cursor : null,
    acked_cursor: ackedCursor,
  };
}

async function _cwaCharExternalOperationStatus(operationId) {
  try {
    if (typeof operationId !== "string" || !operationId.trim()) throw new Error("EXTERNAL_OPERATION_ID_REQUIRED");
    const normalizedId = operationId.trim();
    if (_cwaCharActive && _cwaCharSessionId === normalizedId) {
      const durable = await _cwaCharPersistNow();
      if (!durable) throw new Error("EXTERNAL_OPERATION_PERSIST_FAILED");
    }
    const snapshot = await _cwaCharExternalSnapshot(normalizedId);
    return { ok: true, ..._cwaCharExternalAggregate(normalizedId, snapshot.events, snapshot.acked_cursor ?? null) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function _cwaCharExternalOperationResult(operationId) {
  const status = await _cwaCharExternalOperationStatus(operationId);
  if (!status.ok) return status;
  return { ...status };
}

async function _cwaCharClear() {
  try {
    await chrome.storage.local.remove(CWA_CHARACTERIZATION_KEY);
    _cwaCharEvents = [];
    _cwaCharBytes = 0;
    _cwaCharSeq = 0;
    _cwaCharSourceSeq = new Map();
    _cwaCharAckCursor = null;
    _cwaCharConversationRef = null;
    _cwaCharAttemptId = null;
    _cwaCharTurnId = null;
    _cwaCharWsKinds.clear();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function _cwaCharStatus() {
  return {
    ok: true,
    schema: CWA_CHARACTERIZATION_SCHEMA,
    active: _cwaCharActive,
    session_id: _cwaCharSessionId,
    event_count: _cwaCharEvents.length,
    bytes: _cwaCharBytes,
    dom_samples: _cwaCharDomSamples
  };
}

/* END legacy source: service_worker_external_operation_v2_1.js */


/* BEGIN legacy source: service_worker_running_monitor.js */
// Running-conversation list snapshot (monitoring foundation, protocol-v2
// pre-work).
//
// This module is INERT by default: it registers no listeners and attaches no
// debugger. On an explicit native "running_snapshot" message it reads, from the
// debugger sessions the persistent turn observer already holds (no second
// chrome.debugger.attach), the ChatGPT page's OWN recent-conversation list and
// in-page generation state, and returns a multi-signal snapshot:
//
//   - list ordering (order of sidebar/home conversation anchors);
//   - per-entry title, conversation id, busy marker (animate-spin indicator —
//     a strong signal that a conversation is generating, never assumed to be
//     universal), last-message preview head and relative-time text when the
//     page renders them;
//   - per-page generation state (stop control, committed turn ids, tail
//     length, composer) for the page's displayed conversation.
//
// Purpose: the account-level "which conversations/projects are running right
// now" determination must come from the page's own message list, never from a
// pinned conversation id or a browserless HTTP read. Busy markers are only one
// signal; callers combine ordering + in-page state + message times before
// declaring anything idle (plan rule: no single signal alone may conclude "no
// run"; multi-signal conjunction required).
//
// Hard rules: never attaches a second debugger, never creates/updates/closes a
// tab, never sends Input.* or page-mutation CDP commands, never performs a
// browserless HTTP canonical read, never issues fetch. Reads only titles,
// preview heads and time labels needed for list semantics (truncated); never
// records message bodies.

const CWA_RUNNING_SNAPSHOT_SCHEMA = 1;
const CWA_RUNNING_SNAPSHOT_MAX_ENTRIES = 60;
const CWA_RUNNING_SNAPSHOT_PREVIEW_LEN = 90;

function _cwaRunMonSnapshotExpression() {
  return `(() => {
    const truncate = (s, n) => { s = String(s || '').replace(/\\s+/g, ' ').trim();
      return s.length > n ? s.slice(0, n) + '…' : s; };
    const isVisible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    };
    const pathId = (location.pathname.match(/\\/c\\/([0-9a-fA-F-]{36})/) || [])[1] || null;

    // Recent-conversation list (sidebar on conversation pages, recent list on
    // home): DOM order is the list order.
    const entries = [];
    const seen = new Set();
    for (const anchor of document.querySelectorAll('a[href*="/c/"]')) {
      const match = (anchor.getAttribute('href') || '').match(/\\/c\\/([0-9a-fA-F-]{36})/);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      const item = anchor.closest('li') || anchor.parentElement;
      const lines = (anchor.innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean);
      let timeText = null;
      if (item) {
        for (const span of item.querySelectorAll('span,time')) {
          const text = (span.innerText || '').trim();
          if (text && text.length <= 24 && /ago|前|分钟|小时|秒|刚刚|今天|昨天|AM|PM|am|pm/i.test(text)) {
            timeText = text; break;
          }
        }
      }
      entries.push({
        id: match[1],
        order: entries.length,
        title: truncate(lines[0] || '', 60),
        busy: Boolean(item && item.querySelector('[class*="animate-spin"]')),
        preview: truncate(lines[lines.length - 1] || '', ${CWA_RUNNING_SNAPSHOT_PREVIEW_LEN}),
        time: timeText
      });
      if (entries.length >= ${CWA_RUNNING_SNAPSHOT_MAX_ENTRIES}) break;
    }

    // In-page generation state for the displayed conversation (if any).
    const main = document.querySelector('main');
    const stops = main ? [...main.querySelectorAll(
      'button[data-testid="stop-button"], button[aria-label="Stop generating"]')] : [];
    const turns = [...document.querySelectorAll('[data-testid^="conversation-turn-"]')];
    const last = turns[turns.length - 1];
    const composer = document.querySelector('main [contenteditable="true"]');

    // Content-free tail facts of the last message. Only booleans and lengths
    // are returned — never message text. Project/MCP capability phrases are
    // recognized by exact tokens (already observed on @OH-WorkSpace /
    // @R04-GH3535外协 threads) so the outcome layer can flag a "clean
    // completion with no real progress" without leaking content.
    const tail = last ? (last.innerText || '').replace(/\\s+/g, ' ').trim() : '';
    const tailTail = tail.slice(-600);
    const toolHits = (tailTail.match(/(called tool|tool call)/gi) || []).length;
    const endsWithPunct = /[。．.!！?？…:]\\s*$/.test(tailTail);
    const endsWithToolMarker = /(called tool|tool call)[^\\w]*\\s*$/i.test(tailTail);
    const bannersText = [...document.querySelectorAll('[role="alert"], [data-testid^="banner"]')]
      .map((b) => (b.innerText || '')).join(' ');
    // THE LENGTH-LIMIT NOTICE LIVES IN THE COMPOSER AREA, NOT IN AN ALERT. Measured 2026-09-12 on OH:
    // the page ended with "你已达到此对话的长度上限，你可以开始新聊天以继续对话。开始新对话" while
    // the role=alert and data-testid=banner selectors matched NOTHING and the composer still looked
    // enabled -- so a banner-only check, which is what this line used to be, could not see the one
    // notice that means the conversation is over. Scanning the composer region too makes it visible.
    //
    // NOTE FOR EDITORS: this file is a template literal, so a backtick anywhere in a comment ENDS the
    // string early and breaks the whole script. That mistake was made three times; write selector
    // names without the backtick quotes this file's comments would normally use.
    const composerRegion = document.querySelector('main form, main');
    const composerText = composerRegion ? (composerRegion.innerText || '') : '';
    const noticeText = bannersText + ' ' + composerText.slice(-1200);
    const tailFacts = {
      tail_len: tailTail.length,
      ends_tool_chain: toolHits >= 3 && endsWithToolMarker && !endsWithPunct,
      // MULTI-LINGUAL AND NOT TAIL-ONLY. Measured 2026-09-12: a session whose plugin was genuinely
      // gone wrote "工具被系统禁用" and "Temp … 变为不可用", while this list held 已禁用 and the
      // scan covered only the last 600 characters -- and the sentence carrying the news was the
      // FIRST line of the reply. So the alternatives were widened and the test now looks at the
      // whole last turn (see the tail variable), not just the tail slice.
      //
      // A bare 不可用 must NOT match: "数据不可用" / "该字段不可用" are project facts. The Chinese
      // alternatives therefore require a tool/plugin subject or a change of state.
      plugin_unavailable: /已禁用|无法访问工作区|无权限访问|插件不可用|插件.{0,8}禁用|工具.{0,12}(?:不可用|无法使用|禁用|停用)|(?:变为|变得|变成|仍然|仍|已经|已)(?:是)?[^。\\n]{0,4}?不可用|plugin.*(unavailable|disabled)|tools?.*(unavailable|disabled)|cannot access (?:the )?workspace|no (?:permission|access) to (?:the )?(?:workspace|tools)|执行端明确返回/i.test(tail + ' ' + bannersText),
      checkpoint_ok: /ok\\s*=\\s*true|state revision \\d+|checkpoint/i.test(tailTail),
      ends_punctuated: endsWithPunct,
      length_limit_ui: /已达到此对话的长度上限|此对话的长度上限|达到长度上限|对话已达|开始新聊天以继续|too long to continue|reached the (?:length )?limit|start a new chat to continue|maximum length/i.test(noticeText + ' ' + tailTail),
      content_free: true
    };
    return {
      route: location.href,
      path_conversation_id: pathId,
      entries,
      page: {
        stop: Boolean(stops.find(isVisible)),
        turn_ids: turns.slice(-8).map((t) => t.getAttribute('data-testid')),
        last_len: last ? (last.innerText || '').length : null,
        composer: Boolean(composer && isVisible(composer)),
        tail_facts: tailFacts
      }
    };
  })()`;
}

async function _cwaRunMonEvaluate(debuggee, expression) {
  const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
    expression,
    returnByValue: true
  });
  const value = result?.result?.value;
  return value && typeof value === "object" ? value : null;
}

async function _cwaRunMonSnapshot() {
  let targets = [];
  try {
    targets = await chrome.debugger.getTargets();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const pages = targets.filter(
    (target) => target.type === "page" && target.attached && Number.isInteger(target.tabId)
  );
  const pageSnapshots = [];
  for (const target of pages.slice(0, 8)) {
    const debuggee = { tabId: target.tabId };
    const value = await _cwaRunMonEvaluate(debuggee, _cwaRunMonSnapshotExpression());
    if (value && Array.isArray(value?.entries)) {
      pageSnapshots.push({ tab_id: target.tabId, ...value });
    }
  }
  return {
    ok: true,
    schema: CWA_RUNNING_SNAPSHOT_SCHEMA,
    attached_page_count: pageSnapshots.length,
    pages: pageSnapshots
  };
}

/* END legacy source: service_worker_running_monitor.js */


/* BEGIN legacy source: service_worker_persistent_turn_observer_v3.js */
// Persistent page-owned turn observation v3.
//
// Submission and observation intentionally have different lifetimes. The
// native writer returns after the official page has committed a conversation
// POST. This observer keeps the Chrome debugger subscription alive and records
// the response stream until an explicit network terminal or failure arrives.
// It also sees turns submitted manually in the same runtime tab. No canonical
// ChatGPT endpoint is read and UI inactivity is never interpreted as failure.

const CWA_TURN_LEDGER_KEY = "cwaPersistentTurnLedgerV1";
const CWA_TURN_LEDGER_SCHEMA = 1;
const CWA_LIST_SURFACE_KEY = "cwaListSurfaceTabIdV1";
const CWA_LIST_SURFACE_URL = "https://chatgpt.com/";
const _cwaObservedTabs = new Set();
const _cwaTurnsByRequest = new Map();
const _cwaLatestByTab = new Map();
let _cwaPersistTimer = null;

function _cwaNow() { return Date.now(); }

function _cwaConversationIdFromTab(tab) {
  return conversationIdFromUrl(tab?.url || "") || null;
}

function _cwaPublicObservation(record) {
  if (!record) return { schema: CWA_TURN_LEDGER_SCHEMA, state: "IDLE" };
  return {
    schema: CWA_TURN_LEDGER_SCHEMA,
    state: record.state,
    conversationId: record.conversationId,
    tabId: record.tabId,
    requestId: record.requestId,
    source: record.source,
    submittedAt: record.submittedAt,
    lastEventAt: record.lastEventAt,
    responseStatus: record.responseStatus,
    responseMimeType: record.responseMimeType,
    terminalKind: record.terminalKind,
    terminalAt: record.terminalAt,
    failure: record.failure,
    dataEventCount: record.dataEventCount,
    dataByteLength: record.dataByteLength,
    streamResourceContentEnabled: record.streamResourceContentEnabled,
    observerAttached: _cwaObservedTabs.has(record.tabId)
  };
}

function _cwaSchedulePersist() {
  if (_cwaPersistTimer !== null) return;
  _cwaPersistTimer = setTimeout(async () => {
    _cwaPersistTimer = null;
    const records = Array.from(_cwaLatestByTab.values()).map(_cwaPublicObservation);
    try { await chrome.storage.local.set({ [CWA_TURN_LEDGER_KEY]: records }); } catch {}
  }, 250);
}

function _cwaTouch(record) {
  record.lastEventAt = _cwaNow();
  _cwaLatestByTab.set(record.tabId, record);
  _cwaSchedulePersist();
}

function _cwaFinish(record, state, terminalKind, failure = null) {
  if (!record || record.state !== "RUNNING") return;
  record.state = state;
  record.terminalKind = terminalKind;
  record.terminalAt = _cwaNow();
  record.failure = failure;
  _cwaTouch(record);
}

async function _cwaEnableStream(record) {
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId: record.tabId },
      "Network.streamResourceContent",
      { requestId: record.requestId }
    );
    record.streamResourceContentEnabled = true;
    if (typeof result?.bufferedData === "string" && result.bufferedData) {
      _cwaInspectChunk(record, result.bufferedData);
    }
  } catch (error) {
    // The network lifecycle remains authoritative when this experimental CDP
    // method is unavailable. This is observer degradation, not turn failure.
    record.streamResourceContentEnabled = false;
    record.streamObserverError = error instanceof Error ? error.message : String(error);
    _cwaTouch(record);
  }
}

function _cwaInspectChunk(record, base64Data) {
  if (typeof base64Data !== "string" || !base64Data) return;
  try {
    const binary = atob(base64Data);
    const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
    record.dataEventCount += 1;
    record.dataByteLength += binary.length;
    record.sseBuffer += record.decoder.decode(bytes, { stream: true });
    while (true) {
      const boundary = /\r?\n\r?\n/.exec(record.sseBuffer);
      if (!boundary) break;
      const block = record.sseBuffer.slice(0, boundary.index);
      record.sseBuffer = record.sseBuffer.slice(boundary.index + boundary[0].length);
      _cwaInspectSseBlock(record, block);
    }
    _cwaTouch(record);
  } catch {
    // A decode failure does not change the underlying network lifecycle.
  }
}

function _cwaInspectTerminalValue(record, value, depth = 0) {
  if (depth > 8 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 256)) _cwaInspectTerminalValue(record, item, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata : null;
  const finishDetails = metadata?.finish_details;
  const finish = finishDetails?.type || metadata?.finish_reason || value.finish_reason;
  if (typeof finish === "string" && finish.trim()) record.finishReason = finish.trim();
  if (value.end_turn === true) record.endTurn = true;
  if (value.is_complete === true || metadata?.is_complete === true) record.isComplete = true;
  if (value.status === "completed" || value.status === "finished_successfully") {
    record.completedStatus = true;
  }
  if (value.p === "/message/end_turn" && value.v === true) record.endTurn = true;
  if (value.p === "/message/status" && (value.v === "completed" || value.v === "finished_successfully")) {
    record.completedStatus = true;
  }
  if (value.p === "/message/metadata" && value.v && typeof value.v === "object") {
    _cwaInspectTerminalValue(record, { metadata: value.v }, depth + 1);
  }
  for (const key of ["message", "messages", "data", "result", "payload", "turn", "v", "value"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      _cwaInspectTerminalValue(record, value[key], depth + 1);
    }
  }
}

function _cwaInspectSseBlock(record, block) {
  const data = String(block || "").split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart()).join("\n").trim();
  if (!data) return;
  if (data === "[DONE]") {
    _cwaFinish(record, "COMPLETED", "stream_done");
    return;
  }
  try { _cwaInspectTerminalValue(record, JSON.parse(data)); } catch { return; }
  if (record.finishReason && (record.endTurn || record.isComplete || record.completedStatus)) {
    _cwaFinish(record, "COMPLETED", "assistant_terminal_conjunction");
  }
}

function _cwaRecordConversationRequest(tabId, params) {
  const record = {
    schema: CWA_TURN_LEDGER_SCHEMA,
    state: "RUNNING",
    conversationId: null,
    tabId,
    requestId: params.requestId,
    source: "CHROME_NETWORK_STREAM",
    submittedAt: _cwaNow(),
    lastEventAt: _cwaNow(),
    responseStatus: null,
    responseMimeType: null,
    terminalKind: null,
    terminalAt: null,
    failure: null,
    dataEventCount: 0,
    dataByteLength: 0,
    streamResourceContentEnabled: null,
    decoder: new TextDecoder("utf-8"),
    sseBuffer: "",
    finishReason: null,
    endTurn: false,
    isComplete: false,
    completedStatus: false
  };
  _cwaTurnsByRequest.set(params.requestId, record);
  _cwaLatestByTab.set(tabId, record);
  _cwaSchedulePersist();
  void chrome.tabs.get(tabId).then((tab) => {
    record.conversationId = _cwaConversationIdFromTab(tab);
    _cwaTouch(record);
  }).catch(() => {});
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source?.tabId;
  if (!Number.isInteger(tabId) || !_cwaObservedTabs.has(tabId)) return;
  if (method === "Network.requestWillBeSent") {
    const request = params?.request;
    if (isConversationWrite(request?.url || "", request?.method || "")) {
      _cwaRecordConversationRequest(tabId, params);
    }
    return;
  }
  const record = _cwaTurnsByRequest.get(params?.requestId);
  if (!record) return;
  if (method === "Network.responseReceived") {
    record.responseStatus = params?.response?.status ?? null;
    record.responseMimeType = params?.response?.mimeType || null;
    _cwaTouch(record);
    if (Number.isFinite(record.responseStatus) && record.responseStatus >= 400) {
      _cwaFinish(record, "FAILED", "http_error", `HTTP_${record.responseStatus}`);
    } else {
      void _cwaEnableStream(record);
    }
  } else if (method === "Network.dataReceived") {
    _cwaInspectChunk(record, params?.data);
  } else if (method === "Network.loadingFailed") {
    _cwaFinish(record, "FAILED", "network_failed", params?.errorText || "NETWORK_FAILED");
  } else if (method === "Network.loadingFinished") {
    _cwaFinish(record, "COMPLETED", "network_finished");
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!_cwaObservedTabs.has(tabId) || !changeInfo.url) return;
  const record = _cwaLatestByTab.get(tabId);
  if (!record) return;
  const conversationId = _cwaConversationIdFromTab(tab);
  if (conversationId) {
    record.conversationId = conversationId;
    _cwaTouch(record);
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source?.tabId;
  if (!Number.isInteger(tabId) || !_cwaObservedTabs.delete(tabId)) return;
  const record = _cwaLatestByTab.get(tabId);
  if (record?.state === "RUNNING") {
    _cwaFinish(record, "FAILED", "observer_detached", reason || "DEBUGGER_DETACHED");
  }
});

async function _cwaEnsurePersistentObserver(tabId) {
  if (_cwaObservedTabs.has(tabId)) return;
  const debuggee = { tabId };
  const targets = await chrome.debugger.getTargets();
  const target = targets.find((value) => value.tabId === tabId);
  if (target?.attached) {
    // The only supported shared owner is an observer installed by this worker.
    // A transient writer will finish within milliseconds; retry briefly.
    for (let index = 0; index < 20; index += 1) {
      await sleep(50);
      const latest = (await chrome.debugger.getTargets()).find((value) => value.tabId === tabId);
      if (!latest?.attached) break;
    }
  }
  const latest = (await chrome.debugger.getTargets()).find((value) => value.tabId === tabId);
  if (latest?.attached) throw new Error("PERSISTENT_OBSERVER_DEBUGGER_BUSY");
  await chrome.debugger.attach(debuggee, CDP_PROTOCOL_VERSION);
  await chrome.debugger.sendCommand(debuggee, "Network.enable");
  await chrome.debugger.sendCommand(debuggee, "Runtime.enable");
  _cwaObservedTabs.add(tabId);
}

globalThis._cwaPersistentObserverOwnsTab = (tabId) => _cwaObservedTabs.has(tabId);

async function _cwaLocalUiState(tabId) {
  try {
    const result = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
      expression: `(() => ({ generating: Boolean(document.querySelector(
        'button[data-testid="stop-button"], button[aria-label="Stop generating"]'
      )) }))()`,
      returnByValue: true
    });
    return result?.result?.value?.generating === true;
  } catch {
    return false;
  }
}

setInterval(() => {
  for (const record of _cwaLatestByTab.values()) {
    if (record?.state !== "RUNNING") continue;
    void _cwaLocalUiState(record.tabId).then((generating) => {
      if (record.state !== "RUNNING") return;
      if (generating) {
        record.generationControlObserved = true;
        record.consecutiveGenerationControlAbsent = 0;
        return;
      }
      record.consecutiveGenerationControlAbsent =
        (record.consecutiveGenerationControlAbsent || 0) + 1;
      const requiredAbsentSamples = record.generationControlObserved === true ? 2 : 5;
      if (record.dataEventCount > 0 && record.consecutiveGenerationControlAbsent >= requiredAbsentSamples) {
        _cwaFinish(record, "COMPLETED", "page_generation_control_released");
      }
    });
  }
}, 1000);

async function _cwaObserveTurn(message) {
  const requestedId = typeof message?.conversationId === "string"
    ? message.conversationId.trim() : "";
  const tab = await ensureRuntimeTab(requestedId || null);
  if (!Number.isInteger(tab?.id)) throw new Error("CHATGPT_RUNTIME_TAB_MISSING_ID");
  await _cwaEnsurePersistentObserver(tab.id);
  let record = _cwaLatestByTab.get(tab.id) || null;
  if (!record) {
    const stored = await chrome.storage.local.get(CWA_TURN_LEDGER_KEY).catch(() => ({}));
    const rows = Array.isArray(stored?.[CWA_TURN_LEDGER_KEY])
      ? stored[CWA_TURN_LEDGER_KEY] : [];
    record = rows.find((row) => row?.conversationId === requestedId) || null;
  }
  if (record && record.tabId !== tab.id) {
    const generating = await _cwaLocalUiState(tab.id);
    record = {
      ...record,
      tabId: tab.id,
      requestId: generating ? null : record.requestId,
      source: "LOCAL_UI_RECOVERY",
      lastEventAt: _cwaNow(),
      state: generating ? "RUNNING" : "COMPLETED",
      terminalKind: generating ? null : "page_ready_after_observer_rebind",
      terminalAt: generating ? null : _cwaNow(),
      failure: null
    };
    _cwaLatestByTab.set(tab.id, record);
    _cwaSchedulePersist();
  }
  if (!record && await _cwaLocalUiState(tab.id)) {
    record = {
      state: "RUNNING", conversationId: requestedId || _cwaConversationIdFromTab(tab),
      tabId: tab.id, requestId: null, source: "LOCAL_UI_RECOVERY",
      submittedAt: null, lastEventAt: _cwaNow(), responseStatus: null,
      responseMimeType: null, terminalKind: null, terminalAt: null, failure: null,
      dataEventCount: 0, dataByteLength: 0, streamResourceContentEnabled: null
    };
    _cwaLatestByTab.set(tab.id, record);
  }
  return _cwaPublicObservation(record);
}

const _cwaPersistentPriorExecuteNativeTurn = executeNativeTurn;
executeNativeTurn = async function _executeNativeTurnWithPersistentObservation(message) {
  if (message?.type === "observe_turn") return _cwaObserveTurn(message);
  if (message?.type === "turn" && message?.submitOnly === true) {
    const tab = await ensureRuntimeTab(
      typeof message.conversationId === "string" ? message.conversationId : null
    );
    await _cwaEnsurePersistentObserver(tab.id);
  }
  const result = await _cwaPersistentPriorExecuteNativeTurn(message);
  if (message?.type === "turn" && message?.submitOnly === true) {
    return {
      ...result,
      browserAuthorityLeaseId: typeof message.browserAuthorityLeaseId === "string"
        ? message.browserAuthorityLeaseId : null,
      attachmentCount: 0
    };
  }
  return result;
};

// Resident list surface: a dedicated ChatGPT root page whose own DOM carries
// the account-level recent-conversation list (no single-view bounce, no
// self-exclusion). The persistent observer holds its debugger so the
// `running_snapshot` read can evaluate the full list on demand.
async function _cwaEnsureListSurface(message) {
  const stored = await chrome.storage.local.get(CWA_LIST_SURFACE_KEY);
  let tabId = Number.isInteger(stored?.[CWA_LIST_SURFACE_KEY])
    ? stored[CWA_LIST_SURFACE_KEY] : null;
  let tab = null;
  if (tabId !== null) {
    try { tab = await chrome.tabs.get(tabId); } catch { tab = null; }
  }
  if (tab === null) {
    tab = await chrome.tabs.create({ url: CWA_LIST_SURFACE_URL, active: false });
    tabId = tab?.id;
    await chrome.storage.local.set({ [CWA_LIST_SURFACE_KEY]: tabId });
  }
  await _cwaEnsurePersistentObserver(tabId);
  const current = await chrome.tabs.get(tabId);
  return {
    tab_id: tabId,
    attached: _cwaObservedTabs.has(tabId),
    url: current?.url || null
  };
}

/* END legacy source: service_worker_persistent_turn_observer_v3.js */


// Transitional Task-5 boundary: expose final assembled turn behavior and the
// named native-message capabilities used by the explicit production router.
function _tryBeginNativeRequest(requestId) {
  if (activeRequestId !== null) return false;
  activeRequestId = requestId;
  return true;
}

function _endNativeRequest(requestId) {
  if (activeRequestId === requestId) activeRequestId = null;
}

export function installNativeMessageRouter(router) {
  if (typeof router !== "function") throw new TypeError("NATIVE_MESSAGE_ROUTER_REQUIRED");
  if (_productionNativeMessageRouter !== null) {
    throw new Error("NATIVE_MESSAGE_ROUTER_ALREADY_INSTALLED");
  }
  _productionNativeMessageRouter = router;
}

export function getLegacyRuntimeCallbacks() {
  const nativeMessageCapabilities = Object.freeze({
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    postNativeResult: safePortPost,
    fallbackNativeMessage: onNativeMessage,
    tryBeginNativeRequest: _tryBeginNativeRequest,
    endNativeRequest: _endNativeRequest,
    releaseRuntimeTab: _pr88ReleaseRuntimeTab,
    externalOperationAck: _cwaCharExternalOperationAck,
    externalOperationStatus: _cwaCharExternalOperationStatus,
    externalOperationResult: _cwaCharExternalOperationResult,
    externalOperationEvents: _cwaCharExternalOperationEvents,
    characterizationStart: _cwaCharStart,
    characterizationStop: _cwaCharStop,
    characterizationDump: _cwaCharDump,
    characterizationClear: _cwaCharClear,
    characterizationStatus: _cwaCharStatus,
    characterizationSessionId: () => _cwaCharSessionId,
    runningSnapshot: _cwaRunMonSnapshot,
    observeTurn: _cwaObserveTurn,
    ensureListSurface: _cwaEnsureListSurface,
  });
  return Object.freeze({
    executeTurn: executeNativeTurn,
    startNativeBridge: connectNativeBridge,
    ownsObservedTab: globalThis._cwaPersistentObserverOwnsTab ?? null,
    nativeMessageCapabilities,
  });
}
