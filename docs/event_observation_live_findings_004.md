# Event Observation Live Findings 004 — protocol-v2 public observation closes a real turn

Status: `EVIDENCE` (bounded real-Chrome validation of the protocol-v2 public
external-operation surface, Temp runtime, 2026-09-13)

## Scope

This validation used the production candidate extension and Browser Native host
around one page-owned submit-only turn. The observer started before the write and
the turn was then followed only through public external-operation
`read / ack / status / result`; no browserless canonical read and no second
debugger attachment were used.

The public provenance supplied by the caller was stable for the operation:
`conversation_ref`, `attempt_id`, and `turn_id` were projected onto the public
frames and survived the durable observer path.

## Live result

The final bounded run (`adapter-task3-live-temp-v4`) completed successfully.

| check | result |
| --- | --- |
| page-owned submit | HTTP 202 |
| `turn_submitted` | observed |
| stream evidence | observed (`stream_data`, `stream_finished`, `http_status`) |
| exact caller-known provenance | matched |
| durable receipt | acknowledged cursor matched the applied cursor |
| provider status | `completed` |
| provider result | `completed` |
| provider failure/retryable flags | false / false |

The successful run exposed 155 events at the first completed status snapshot and
199 by the result read. Completion had exactly one terminal marker after the
submitted turn; later page/network observations did not change the completed
classification.

## Terminal finding

The current Chrome stream did not require decoded SSE `end_turn` / message-status
frames to close the operation. The stable transport signal was the
`Network.loadingFinished` belonging to the **same conversation-write request**
that produced `turn_submitted`.

Therefore the production rule is:

1. unrelated/background `loadingFinished` is not terminal evidence;
2. a `stream_finished` frame is terminal evidence only when
   `metadata.is_conversation_write == true` for the submitted turn;
3. that marker does not close the operation immediately;
4. completion requires the existing sustained-quiescence window (3 s) after the
   latest conversation-write stream data or terminal transport frame.

This preserves finding 001/002: a per-segment terminal/conjunction is not turn
end by itself, and inactivity without terminal evidence is not completion.

## Recovery / receipt findings

The same Task-3 candidate also has bounded tests for:

- MV3 worker restart hydrating the durable operation and emitting
  `runtime_reattach` without a second submission;
- monotonic durable acknowledgements, idempotent same-cursor ack, and rollback
  rejection;
- cursor-ahead/gap and source-identity drift failing closed;
- retryable delivery state clearing on the subsequent `turn_submitted`;
- provenance mismatch on resume failing closed.

## Deployment finding

An unpacked MV3 extension can keep an old `importScripts` closure even when the
file on disk and DevTools script source show newer bytes. This was reproduced in
the Task-3 live gate. A fresh production script URL
(`service_worker_external_operation_v2_1.js`) was used for the final candidate,
and loaded behavior—not disk contents alone—was the acceptance authority.

## Remaining characterization work

Fine-grained decoded SSE taxonomy (`text_delta`, tool frames, metadata paths) is
still useful future evidence, as are fresh-conversation and manual-interjection
captures. They are no longer required for the protocol-v2 adapter to provide a
content-free live stream, durable cursor/receipt/recovery, and a provider-owned
completed result.
