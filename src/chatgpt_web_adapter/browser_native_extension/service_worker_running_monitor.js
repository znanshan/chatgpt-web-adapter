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
    return {
      route: location.href,
      path_conversation_id: pathId,
      entries,
      page: {
        stop: Boolean(stops.find(isVisible)),
        turn_ids: turns.slice(-8).map((t) => t.getAttribute('data-testid')),
        last_len: last ? (last.innerText || '').length : null,
        composer: Boolean(composer && isVisible(composer))
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

const _cwaRunMonPriorOnNativeMessage = onNativeMessage;
onNativeMessage = async function _onNativeMessageWithRunningMonitor(message, port) {
  if (message?.protocol === BRIDGE_PROTOCOL_VERSION && message?.type === "running_snapshot") {
    const requestId = message.request_id;
    let reply;
    try {
      reply = await _cwaRunMonSnapshot();
    } catch (error) {
      reply = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    safePortPost(port, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      type: "running_snapshot_result",
      request_id: requestId,
      ...reply
    });
    return;
  }
  return _cwaRunMonPriorOnNativeMessage(message, port);
};
