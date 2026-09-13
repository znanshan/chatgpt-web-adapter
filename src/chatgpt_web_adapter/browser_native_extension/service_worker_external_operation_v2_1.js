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
    const retry = Boolean(document.querySelector(
      'button[data-testid*="retry"], button[data-testid*="regenerate"], button[data-testid*="try-again"]'
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
    return { main_ready: Boolean(main), turns, stop, retry, composer, banners };
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
  if (method === "Network.loadingFailed") {
    return entry?.is_conversation_write === true ? "stream_failed" : "stream_data";
  }
  if (method === "Network.webSocketFrameError") {
    return "stream_data";
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
  assign("observed_conversation_ref", typeof entry?.conversation_id === "string" ? entry.conversation_id : null);
  assign("page_event_kind", typeof entry?.kind === "string" ? entry.kind : null);
  assign("visible", typeof entry?.visible === "boolean" ? entry.visible : null);
  if (entry?.dom && typeof entry.dom === "object") {
    assign("turns", Number.isInteger(entry.dom.turns) ? entry.dom.turns : null);
    assign("stop", typeof entry.dom.stop === "boolean" ? entry.dom.stop : null);
    assign("retry", typeof entry.dom.retry === "boolean" ? entry.dom.retry : null);
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
    conversation_ref: typeof _cwaCharConversationRef === "string"
      ? _cwaCharConversationRef
      : (typeof entry?.conversation_id === "string" ? entry.conversation_id : null),
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

const _cwaCharPriorOnNativeMessage = onNativeMessage;
onNativeMessage = async function _onNativeMessageWithCharacterizationRecorder(message, port) {
  if (message?.protocol === BRIDGE_PROTOCOL_VERSION && message?.type === "external_operation_ack") {
    const reply = await _cwaCharExternalOperationAck(message.operation_id, message.cursor);
    safePortPost(port, { protocol: BRIDGE_PROTOCOL_VERSION, type: "external_operation_ack_result", request_id: message.request_id, ...reply });
    return;
  }
  if (message?.protocol === BRIDGE_PROTOCOL_VERSION && message?.type === "external_operation_status") {
    const reply = await _cwaCharExternalOperationStatus(message.operation_id);
    safePortPost(port, { protocol: BRIDGE_PROTOCOL_VERSION, type: "external_operation_status_result", request_id: message.request_id, ...reply });
    return;
  }
  if (message?.protocol === BRIDGE_PROTOCOL_VERSION && message?.type === "external_operation_result") {
    const reply = await _cwaCharExternalOperationResult(message.operation_id);
    safePortPost(port, { protocol: BRIDGE_PROTOCOL_VERSION, type: "external_operation_result_result", request_id: message.request_id, ...reply });
    return;
  }
  if (message?.protocol === BRIDGE_PROTOCOL_VERSION && message?.type === "external_operation_events") {
    const reply = await _cwaCharExternalOperationEvents(
      message.operation_id,
      message.cursor ?? null,
      message.limit
    );
    safePortPost(port, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "external_operation_events_result",
      request_id: message.request_id,
      ...reply
    });
    return;
  }
  if (message?.protocol === BRIDGE_PROTOCOL_VERSION && message?.type === "characterize") {
    const action = message.action;
    const requestId = message.request_id;
    let reply;
    if (action === "start") {
      reply = await _cwaCharStart(
        typeof message.session_id === "string" && message.session_id ? message.session_id : null,
        {
          conversation_ref: message.conversation_ref ?? null,
          attempt_id: message.attempt_id ?? null,
          turn_id: message.turn_id ?? null,
        }
      );
    } else if (action === "stop") {
      const requestedSession = typeof message.session_id === "string" && message.session_id
        ? message.session_id
        : null;
      if (requestedSession !== null && requestedSession !== _cwaCharSessionId) {
        reply = { ok: false, error: "CHARACTERIZE_SESSION_MISMATCH" };
      } else {
        reply = await _cwaCharStop();
      }
    } else if (action === "dump") {
      reply = await _cwaCharDump();
    } else if (action === "clear") {
      reply = await _cwaCharClear();
    } else if (action === "status") {
      reply = _cwaCharStatus();
    } else {
      reply = { ok: false, error: "CHARACTERIZE_UNKNOWN_ACTION" };
    }
    safePortPost(port, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "characterize_result",
      request_id: requestId,
      ...reply
    });
    return;
  }
  return _cwaCharPriorOnNativeMessage(message, port);
};
