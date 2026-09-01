// Bridge submission boundary: type + click + observed official conversation POST.
// Reply generation is owned by the persistent page observer, not this request.

const _submitOnlyPriorExecuteNativeTurn = executeNativeTurn;
let _submitOnlyAcknowledgedPageTurn = null;

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
    responseStatus: 202,
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
    let resolveRequestSeen;
    const requestSeen = new Promise((resolve) => { resolveRequestSeen = resolve; });
    eventListener = (source, method, params) => {
      if (source.tabId !== tabId || method !== "Network.requestWillBeSent") return;
      const request = params?.request;
      if (isConversationWrite(request?.url || "", request?.method || "")) {
        diagnostics.conversationRequestSeen = true;
        resolveRequestSeen(params.requestId);
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
    return {
      conversationId: acknowledged.conversationId,
      turnExchangeId: null,
      responseStatus: 202,
      responseMimeType: null,
      finalUrl: acknowledged.finalUrl,
      tabId,
      tabWasActive: acknowledged.diagnostics.tabWasActive,
      elapsedMs: acknowledged.diagnostics.elapsedMs,
      submitStrategy: acknowledged.diagnostics.submitStrategy,
      submitAckMs: acknowledged.diagnostics.submitAckMs
    };
  } finally {
    _submitOnlyAcknowledgedPageTurn = null;
    executeOfficialPageTurn = priorPageTurn;
  }
};
