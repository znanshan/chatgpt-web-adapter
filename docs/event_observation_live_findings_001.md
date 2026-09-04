# Event Observation Live Findings 001 — terminal conjunction is not turn end

Status: `EVIDENCE` (bounded live observation; feeds the protocol-v2 observation
contract and the completion criterion)

## What was observed

Instance: R02 (CPFEM long task), dedicated Chrome, existing persistent turn
observer v3 (the version shipped before the characterization recorder; read via
the local native `observe_turn` RPC — zero browserless HTTP reads, zero
submitted traffic).

During one real multi-segment tool-chained turn, sampled over ~3 minutes:

| sample | state | terminalKind | dataEventCount | dataByteLength | response |
| --- | --- | --- | --- | --- | --- |
| 16:44:57 | COMPLETED | assistant_terminal_conjunction | 458 | 416 419 | 200, text/event-stream |
| 16:45:09 | COMPLETED | assistant_terminal_conjunction | 467 | 428 092 | 200, text/event-stream |
| 16:45:21 | COMPLETED | assistant_terminal_conjunction | 473 | 435 802 | 200, text/event-stream |
| 16:45:33 | COMPLETED | assistant_terminal_conjunction | 488 | 446 333 | 200, text/event-stream |
| 16:45:58 | COMPLETED | assistant_terminal_conjunction | 511 | 506 139 | 200, text/event-stream |
| 16:46:18 | COMPLETED | assistant_terminal_conjunction | 523 | 523 604 | 200, text/event-stream |
| 16:46:38 | COMPLETED | assistant_terminal_conjunction | 569 | 559 819 | 200, text/event-stream |

`lastEventAt` advanced on every sample while `state` stayed `COMPLETED` and
`terminalKind` stayed `assistant_terminal_conjunction`; `source` =
`CHROME_NETWORK_STREAM`.

## What it means

1. The observer's public observation exposes a useful minimal schema (state,
   responseStatus=200, responseMimeType=text/event-stream, terminalKind,
   dataEventCount, dataByteLength, submittedAt, lastEventAt, source,
   conversationId) — a solid base for the versioned external-operation event
   frame fields.
2. **`assistant_terminal_conjunction` is a per-segment marker, not the turn
   end.** In tool-chained turns the assistant produces a terminal message, the
   page calls a tool, and the stream continues; data keeps arriving
   (458 -> 569 events, +140 KB over ~3 min) after the observer already reported
   `COMPLETED`.
3. Therefore a new-version completion criterion that trusts
   `state == COMPLETED` or the first terminal kind alone would close the turn
   early while the model is still working. The durable criterion must be
   **stream quiescence**: no dataReceived and no new terminal frames for a
   bounded window, combined with terminal evidence — mirroring the plan rule
   "text inactivity is never a stop by itself", now sharpened to "a terminal
   conjunction is not a stop either; only sustained quiescence after terminal
   evidence ends the turn."

## Open items for the full characterization run

- Which frame(s) carry the true final terminal (network loadingFinished vs a
  last SSE terminal event vs page DOM finalization), and how they relate to
  this conjunction marker.
- How manual user interjection and fresh-conversation creation appear in the
  same stream/network view (deferred recorder run on an idle instance).
- Whether dataByteLength/dataEventCount reset per segment and whether a
  stable-quiescence threshold can be measured per model/profile.

The bounded characterization recorder
(`service_worker_event_characterization_recorder.js`, driven by the
`characterize` native message) is built to answer these on an idle-instance
window.
