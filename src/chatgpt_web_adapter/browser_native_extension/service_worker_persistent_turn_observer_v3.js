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

const _cwaPersistentPriorOnNativeMessage = onNativeMessage;
onNativeMessage = async function _onNativeMessageWithPersistentObservation(message, port) {
  if (message?.protocol !== BRIDGE_PROTOCOL_VERSION || message?.type !== "observe_turn") {
    return _cwaPersistentPriorOnNativeMessage(message, port);
  }
  const requestId = message.request_id;
  if (typeof requestId !== "string" || !requestId) return;
  try {
    const observation = await _cwaObserveTurn(message);
    safePortPost(port, {
      protocol: BRIDGE_PROTOCOL_VERSION, type: "turn_observation_result",
      request_id: requestId, ok: true, observation
    });
  } catch (error) {
    safePortPost(port, {
      protocol: BRIDGE_PROTOCOL_VERSION, type: "turn_observation_result",
      request_id: requestId, ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
