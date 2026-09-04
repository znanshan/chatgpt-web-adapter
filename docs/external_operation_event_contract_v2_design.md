# External-Operation Event Contract v2 — Design (from live characterization)

Status: `DRAFT` (protocol-v2 event-frame contract, derived from bounded live
characterization findings 001/002 plus the extension/SSE vocabulary already in
code; zero browserless HTTP reads; drives Task 3 of the external-operation
driving plan)

## Purpose

Define the versioned event frames the adapter/extension exposes for one
ChatGPT page-owned turn, so a new Bridge external-operation provider and any
downstream consumer can attach/read/events/result **without parsing page DOM or
writer logs and without any browserless HTTP canonical read**. The dedicated
Chrome page's own network/stream/DOM observation is the only read path.

## Frame envelope

Every event is a versioned frame:

```text
{
  protocol: 2,
  type: "turn_event",            // external-operation event
  operation_id,                  // stable external-operation identity (provider-scoped)
  conversation_ref,              // /c/<id> route identity
  attempt_id, turn_id,           // attempt/turn association (bridge + page-owned)
  event_seq,                     // monotonic per (operation, source)
  source,                        // network | page | model | tool | user | runtime | system
  event_type,                    // normalized type below
  t_ms,                          // epoch ms
  status,                        // running | completed | failed | retryable | unknown
  cursor,                        // opaque resume cursor (receipt/ack/replay/dedup)
  metadata,                      // content-free fields only (sizes, statuses, paths, kinds)
  error                          // structured error when failed/retryable
}
```

Never in a public frame: prompt/final/tool bodies, cookies, tokens, raw SSE
content. Detailed evidence (thinking summaries, text deltas, tool activity)
lives in a permission-tiered private evidence store, append-only, replayable.

## Normalized event taxonomy (from findings + SSE vocabulary)

The page-owned SSE stream (observed as `Network.streamResourceContent` chunks
decoded to `data:` JSON frames) uses path-value frames; normalized event types
map from those plus the network lifecycle and DOM samples:

| event_type (normalized) | local source | notes |
| --- | --- | --- |
| `turn_submitted` | conversation-write request (HTTP 202 ack observed) | the write accepted; stream follows |
| `text_delta` | SSE `/message/content/parts/0` (path null) | assistant text increment (content withheld; sizes/counts public) |
| `content_update` | SSE `/message/content` | content object updates |
| `status_update` | SSE `/message/status` = completed / finished_successfully | per-message status |
| `metadata_update` | SSE `/message/metadata` | finish_details / finish_reason (tokens only) |
| `end_turn` | SSE `/message/end_turn` = true | **conjunction marker, not turn end** (finding 002) |
| `tool_call` / `tool_result` | SSE role=assistant(tool_calls) / role=tool | tool activity (content withheld) |
| `user_message` | SSE role=user | manual/user messages (from refresh delta) |
| `stream_data` | `Network.dataReceived` | bytes/count, no content |
| `stream_finished` / `stream_failed` | `Network.loadingFinished/Failed` | terminal transport |
| `route_change` | tab/URL /c/<id> vs root | conversation identity |
| `page_state` | DOM probe (stop control, turns, composer, banners) | corroboration only |
| `http_status` | responseReceived (200/202/404/429) | page-owned request outcomes; 429 observed under load |
| `rate_limited` | http 429 aggregate | backoff signal (finding 002: 50 in ~3 min under heavy load) |
| `runtime_reattach` / `observer_lost` | extension/broker lifecycle | reattachment |
| `policy_banner` | DOM banner (alert observed while generating) | system notices |

## Terminal semantics (finding 002)

- `end_turn` / `assistant_terminal_conjunction` / `status=completed` are
  per-segment markers: the SSE stream keeps delivering (dataReceived continues)
  after them in tool-chained turns.
- A turn is **done** only on sustained stream quiescence: no dataReceived and
  no new terminal frames for a bounded window, combined with terminal evidence.
  A consumer must not close the turn on the first terminal marker.

## Cursor / receipt / dedup

- `event_seq` is monotonic per (operation, source); a consumer replays from its
  `cursor`.
- The provider persists every frame append-only (private evidence store);
  receipts acknowledge the last applied seq; gaps or source-identity drift fail
  loudly, never silently splice.
- Restart/reattach resumes from the durable cursor without a second submission.

## Retention / privacy tiers

- Public event frames: structured facts only (identity/seq/time/status/
  sizes/path kinds/error classes) — durable per operation.
- Private evidence store: content-adjacent summaries (thinking/tool/text
  deltas) with permission tiers, retention bounds and cleanup.
- Raw page frames stay private and are not required for the public contract.

## Open items before implementation

- Characterize the actual SSE chunk framing end-to-end with the recorder
  (`Network.streamResourceContent` + decoded `data:` blocks) on a real turn to
  confirm the path vocabulary in live traffic (findings 002 item 4).
- Capture fresh-conversation creation and a manual-interjection refresh delta
  (user/branch families).
- Confirm quiescence window bounds per model/profile.
