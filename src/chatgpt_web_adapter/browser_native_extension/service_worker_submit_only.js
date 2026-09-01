// Bridge submission boundary: type + click + observed official conversation POST.
// Reply generation is owned by the persistent page observer, not this request.

const _submitOnlyPriorExecuteNativeTurn = executeNativeTurn;
let _submitOnlyAcknowledgedPageTurn = null;

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

async function _submitOnlyWaitForAckOrGeneration(requestSeen, debuggee, timeoutMs) {
  const deadline = performance.now() + Math.max(1, timeoutMs);
  while (performance.now() < deadline) {
    const winner = await Promise.race([
      requestSeen.then(() => "network"),
      sleep(Math.min(100, Math.max(1, deadline - performance.now()))).then(() => null)
    ]);
    if (winner === "network") return winner;
    const snapshot = await _submitOnlyLocalSnapshot(debuggee);
    if (snapshot.generating === true) return "local_generation";
  }
  return null;
}

async function _submitOnlyClickStableSelector(debuggee, selector) {
  const result = await sendCommand(debuggee, "Runtime.evaluate", {
    expression: `(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`,
    returnByValue: true,
    awaitPromise: true
  });
  return result?.result?.value === true;
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
    const preSubmitSnapshot = await _submitOnlyLocalSnapshot(debuggee);
    const submitStartedAt = performance.now();
    const submit = await submitOfficialPageTurn(
      debuggee,
      Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_READY_TIMEOUT_MS)
    );
    diagnostics.submitStrategy = submit.strategy;
    diagnostics.submitButtonSelector = submit.selector;
    const ackBudget = Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_ACK_TIMEOUT_MS);
    let acknowledgement = await _submitOnlyWaitForAckOrGeneration(
      requestSeen, debuggee, ackBudget
    );
    if (acknowledgement === null) {
      let after = await _submitOnlyLocalSnapshot(debuggee);
      const exactTextRetained = after.composerText === text.trim();
      const turnCountUnchanged = after.turnCount === preSubmitSnapshot.turnCount;
      if (
        exactTextRetained && turnCountUnchanged && after.generating !== true &&
        typeof submit.selector === "string" && submit.selector &&
        await _submitOnlyClickStableSelector(debuggee, submit.selector)
      ) {
        acknowledgement = await _submitOnlyWaitForAckOrGeneration(
          requestSeen, debuggee,
          Math.min(remainingMs(startedAt, timeoutMs), DEFAULT_SUBMIT_ACK_TIMEOUT_MS)
        );
        after = await _submitOnlyLocalSnapshot(debuggee);
      }
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
