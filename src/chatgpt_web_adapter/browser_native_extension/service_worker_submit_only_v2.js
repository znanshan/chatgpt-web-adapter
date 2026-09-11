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
