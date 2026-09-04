# Event Observation Live Findings 002 — first bounded recorder capture of a real turn

Status: `EVIDENCE` (bounded live capture via the characterization recorder,
session `char-oh-2`, 2026-09-04 ~17:05, dedicated OH Chrome)

## Setup

- The characterization recorder ran inside the dedicated OH Chrome extension
  during one real `cwb project continue` turn.
- Capture window ~2.9 min after the write began: 1603 events
  (network 1512, dom 83, tab 6, session 2), 244 KB log.
- Recorder observed the SAME debugger session as the persistent turn observer
  (no second attach). Zero bridge-initiated HTTP reads.
- Raw log kept outside Git: `.tmp/char-oh-2.json`.

## Inventory (what is locally observable during a real turn)

| family | observed events | notes |
| --- | --- | --- |
| turn lifecycle / network | `Network.requestWillBeSent` 152, `responseReceived` 422, `dataReceived` 515, `loadingFinished` 423 | full page-owned traffic during the turn |
| write acknowledgement | HTTP 202 × 6 on conversation writes | the submit returns 202 before the stream |
| HTTP statuses | 200 × 365, 202 × 6, 404 × 1, **429 × 50** | heavy rate-limit evidence during operation |
| url kinds | conversation (`/c/<id>`) × 6, other_chatgpt × 574 | most page traffic is non-conversation resources/API |
| page/UI (DOM probe) | 83 samples; 82 × `{turns:5, stop:true, composer:true, banners:['alert']}` | stop control present while generating; an `alert` banner present; one transient `{turns:0, composer:false, stop:true}` sample |
| tab | 6 tab_updated route samples | conversation route observed |

## What this means for the protocol-v2 contract

1. The write → 202-ack → SSE dataReceived → loadingFinished lifecycle is fully
   observable locally from the page's own network; a new-version provider can
   build completion/activity on these without any browserless HTTP read.
2. DOM sampling cheaply exposes generation control (stop button), visible turn
   count, composer presence and banner alerts — UI as corroborating evidence.
3. HTTP 429 is visible on the page's own requests: 50 within ~3 min during
   heavy operation. The observer sees real rate-limit pressure; the new bridge
   must not add its own requests on top (consistent with the zero-browserless-
   read rule).
4. **Open item: SSE frame type extraction returned empty.** `dataReceived`
   chunks as delivered through this CDP stream did not match
   `event:`/`"type":` token patterns. The actual stream frame structure must be
   characterized separately (which fields carry thinking/tool/text deltas) —
   this drives the detailed-evidence design and cannot be assumed from the
   earlier turn-ledger observation.

## Operational findings (recorder/extension plumbing)

1. **Extension service-worker cache**: manifest-version bump alone did not make
   a running unpacked extension load new `importScripts` files; the fix was
   clearing the Chrome profile's `Default/Service Worker` directory while
   Chrome was stopped, then relaunching. The bridge's fingerprint/reload
   protocol should document this for future extension upgrades.
2. **Recorder captures only while the persistent observer holds a debugger**
   on an active turn; an idle window (no attached tab) yields no network/DOM
   events. Characterization must therefore overlap a real observed turn.
3. **Stale lease after daemon restart**: `cwb project continue` failed with
   `StaleLease` (dead owner pid from a supervisor killed by an earlier daemon
   restart) instead of recovering; the dead-owner lease had to be cleared
   before the next continue could write. A restart-safe bridge should clear a
   provably dead owner lease after a healthy canonical check rather than
   failing the continuation.

## Next steps

- Characterize the actual SSE frame structure (open item 4 above).
- Capture a fresh-conversation creation and a manual-interjection-then-
  delayed-refresh delta for the user/branch families.
- Fold the complete inventory back into the OH driving plan and the
  protocol-v2 field design.
