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
let _cwaCharBytes = 0;
let _cwaCharEvents = [];
let _cwaCharDomTimer = null;
let _cwaCharDomSamples = 0;
let _cwaCharPersistTimer = null;
let _cwaCharTabUpdatedListener = null;
let _cwaCharTabActivatedListener = null;
let _cwaCharTabRemovedListener = null;
const _cwaCharWriteRequestIds = new Set();

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

function _cwaCharSchedulePersist() {
  if (_cwaCharPersistTimer !== null) return;
  _cwaCharPersistTimer = setTimeout(async () => {
    _cwaCharPersistTimer = null;
    try {
      await chrome.storage.local.set({
        [CWA_CHARACTERIZATION_KEY]: {
          schema: CWA_CHARACTERIZATION_SCHEMA,
          session_id: _cwaCharSessionId,
          active: _cwaCharActive,
          started_at_ms: _cwaCharStartedAtMs,
          event_count: _cwaCharEvents.length,
          bytes: _cwaCharBytes,
          events: _cwaCharEvents
        }
      });
    } catch {}
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
    _cwaCharPush({
      source: "network",
      method,
      tabId,
      encoded_bytes: Number.isFinite(params?.encodedDataLength) ? params.encodedDataLength : null,
      error: method === "Network.loadingFailed" ? (params?.errorText || null) : null
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

function _cwaCharStart(sessionId) {
  if (_cwaCharActive) return { ok: false, error: "CHARACTERIZE_ALREADY_ACTIVE" };
  _cwaCharActive = true;
  _cwaCharSessionId = sessionId || null;
  _cwaCharStartedAtMs = _cwaCharNow();
  _cwaCharSeq = 0;
  _cwaCharBytes = 0;
  _cwaCharEvents = [];
  _cwaCharDomSamples = 0;

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

  _cwaCharPush({ source: "session", kind: "started" });
  return { ok: true, session_id: _cwaCharSessionId };
}

async function _cwaCharStop() {
  if (!_cwaCharActive) return { ok: false, error: "CHARACTERIZE_NOT_ACTIVE" };
  _cwaCharActive = false;
  _cwaCharWriteRequestIds.clear();
  _cwaCharPush({ source: "session", kind: "stopped" });
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
  try {
    await chrome.storage.local.set({
      [CWA_CHARACTERIZATION_KEY]: {
        schema: CWA_CHARACTERIZATION_SCHEMA,
        session_id: _cwaCharSessionId,
        active: false,
        started_at_ms: _cwaCharStartedAtMs,
        event_count: _cwaCharEvents.length,
        bytes: _cwaCharBytes,
        events: _cwaCharEvents
      }
    });
  } catch {}
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

async function _cwaCharClear() {
  try {
    await chrome.storage.local.remove(CWA_CHARACTERIZATION_KEY);
    _cwaCharEvents = [];
    _cwaCharBytes = 0;
    _cwaCharSeq = 0;
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
  if (message?.protocol === BRIDGE_PROTOCOL_VERSION && message?.type === "characterize") {
    const action = message.action;
    const requestId = message.request_id;
    let reply;
    if (action === "start") {
      reply = _cwaCharStart(
        typeof message.session_id === "string" && message.session_id ? message.session_id : null
      );
    } else if (action === "stop") {
      reply = await _cwaCharStop();
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
