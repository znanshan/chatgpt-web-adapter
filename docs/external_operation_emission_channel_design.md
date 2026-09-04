# Protocol-v2 emission channel — design (extension -> adapter -> bridge)

Status: `DRAFT` (how content-free v2 event frames cross the native-messaging
boundary once the extension emits them; Task 3 remainder)

## Today's channel (verified in code)

- The extension's persistent observer posts native messages of type
  `turn_event` (e.g. `browser_ui_state` events) via `postNative`.
- The native host (`browser_native_host.py`) has an optional `event_sink`
  callable. When the bridge requests a turn with
  `streamTextObservations: true`, the host routes each `turn_event` from the
  extension into `event_sink(message)` (non-terminal messages only) and does
  not treat them as the turn reply.

So a low-risk v2 emission path **reuses the existing `turn_event` channel**:
the extension wraps the observed turn lifecycle and emits
`{type: "turn_event", request_id, event: <v2 frame>}` frames; the bridge that
opened the turn passes an event_sink that feeds each frame into its
`ExternalOperationStream` (adapter) / `ExternalOperation` (bridge provider).

## Frame content crossing the channel

Each `event` payload is a content-free protocol-v2 frame exactly as defined by
`docs/external_operation_event_contract_v2_design.md` and implemented in
`external_operation.py` (both repos):

```json
{
  "protocol": 2, "type": "turn_event",
  "operation_id": "<bridge operation/attempt>",
  "conversation_ref": "/c/<id>", "attempt_id": "...", "turn_id": "...",
  "event_seq": 0, "source": "network", "event_type": "turn_submitted",
  "t_ms": 1788..., "status": "running",
  "cursor": "<operation_id>:0",
  "metadata": { "http_status": 202 },
  "error": null
}
```

Never: prompt/final/tool bodies, cookies, tokens, raw SSE content. Detailed
evidence stays in the private evidence store.

## Operation binding

The extension cannot invent an operation_id that the bridge already owns.  The
bridge binds a conversation-write to an external operation before/at submit
and carries the id in the turn request; the extension echoes the bound
`operation_id`/`attempt_id` on the emitted frames for that conversation write.
Unbound frames are dropped (or a fresh operation is opened only for an explicit
unmanaged observation).

## Emitted families (characterized now)

The network/transport families are already characterized (findings 002) and can
be emitted without SSE content parsing:

- `turn_submitted` on the conversation-write request (HTTP 202 ack observed),
- `http_status` on responseReceived (200/202/404/429),
- `stream_data` on dataReceived (bytes/count only),
- `stream_finished` / `stream_failed` on loadingFinished/loadingFailed.

## Families awaiting SSE frame-structure characterization

`text_delta` / `status_update` / `metadata_update` / `end_turn` / `tool_*` /
`user_message` derive from the decoded `data:` JSON frames.  The recorder now
captures content-free `/message/*` path tokens via
`Network.streamResourceContent`; a bounded live run must confirm the live
frame vocabulary before the extension emits these families (finding 002 open
item).  The `turn_is_complete` quiescence model already defines how a consumer
assembles them into a terminal decision.

## Receipt/ack

The bridge acknowledges by applying `event_seq` per source and persisting the
cursor (ExternalOperationStream / bridge ExternalOperation already enforce
monotonic contiguity and reject gaps).  Extension-side dedup: the extension
re-posts only on reconnect from a durable per-operation cursor; the consumer
must never silently splice a gap.
