# Event Observation Characterization — Design

Status: `DRAFT` (design for a bounded live characterization run; the inventory is produced by the run, not by this document)

## Purpose

Characterize what the ChatGPT product surface (the dedicated Chrome page, its own
network traffic, DOM/UI, the browser-native extension, tool/plugin activity, user
actions, and system banners) exposes as **locally observable events**, so that a
versioned external-operation observation contract (event frames with
`operation/conversation/attempt/turn` identity, monotonic sequence, cursor,
receipt, dedup, replay) can be defined on evidence rather than on assumption.

This run is a precondition for the downstream "new Bridge as external-operation
provider" work. The driving cross-repository plan records the same hard rules:

- no browserless HTTP canonical read channel — every read comes from the
  dedicated Chrome page's own network/stream/DOM observation;
- real Chrome turn stream is the primary liveness/completion criterion; UI is
  corroboration only;
- unknown submission / duplicate write / stale cursor / protocol mismatch fail
  closed;
- recording granularity and retention are **decided after characterization**,
  not preset.

## Scope and non-goals

In scope: which real events are observable, from which local source, when they
are reliable, and how they associate with an attempt/turn; a first retention and
privacy classification per event family.

Out of scope for the characterization itself: implementing protocol v2, changing
the production extension composition, exercising the HTTP canonical channel, or
declaring final contract semantics.

## Current observation surface (starting point, from code reading)

The manifest (`manifest.json`) grants `debugger`, `tabs`, `storage`,
`nativeMessaging` and `https://chatgpt.com/*`. The v3 service worker entry
composes, among others:

- `service_worker_persistent_turn_observer_v3.js` — attaches a CDP debugger per
  observed tab, watches `Network.requestWillBeSent/responseReceived/
  dataReceived/loadingFinished/loadingFailed`, detects conversation writes,
  inspects stream chunks, and uses a 1 s local-UI watchdog
  (`button[data-testid="stop-button"]` generation control) to finish turns when
  the page stops generating. Tracks a per-tab turn ledger with state,
  conversation id, request id, response status/mime, data counts, terminal
  kind/failure and events.
- `service_worker_normalized_activity_stream_pr8_12.js` and
  `service_worker_answer_channel_pr8_12.js` — normalized activity / answer
  streaming frames.
- `service_worker_product_source_citations_pr9_3.js` — product citations.
- rich-input / submit-only / temporary-chat layers — write authority and
  Temporary semantics.
- temporary-route-reopen and product-tool characterization probes used bounded
  real sessions to learn route settling, visible-turn surfaces and tool
  activity.

Already locally observable (candidate, to be confirmed by the run): conversation
write requests and responses, SSE/stream data chunks and termination, generation
control presence, route (`/c/<id>`, `/`), tab/page identity and visibility,
temporary/product route reopen behavior, source citations. The bridge's own
attempt journal and writer sidecars are local evidence, but they describe the
Bridge's actions, not the full page surface; the characterization must observe
the page surface independently.

## Event taxonomy and candidate local sources

The run must inventory each family below and answer, per event: who produces it,
when it is reliable, how it associates with attempt/turn, whether it changes
recovery/completion judgment, whether it may enter a public event stream, and
how long to retain it.

| Family | Candidate local source(s) |
| --- | --- |
| Turn lifecycle (submit/commit/stream start/thinking/tool/text delta/completed/stopped/cancelled/retried/interrupted) | page network (conversation write + SSE), persistent observer ledger, DOM turn surface |
| Network/transport (request/response ids, SSE frames, HTTP status/mime, termination, reconnect, native response loss) | CDP Network events on page-owned traffic |
| Page/UI (route, tab/page identity, visibility, composer, stop/retry controls, footer, banners, length limit, errors) | DOM sampling (Runtime.evaluate), tab events, existing generation-control watchdog |
| Model/route (model slug, thinking effort, resolved route, downgrade, per-turn config snapshot) | page UI/selectors, network metadata where present — to be confirmed locally |
| Tools/plugins (MCP/plugin route, tool call/result, connect/drop/timeout, permission/workspace changes) | page DOM/stream frames (tool blocks), product-tool observations |
| User/branch (manual messages, edits, stop, regenerate, branch/navigate/rename, causal boundary vs Bridge attempt) | page network/DOM deltas after a bounded delayed refresh, route/list changes |
| Runtime (Chrome/extension/native-messaging start/stop, profile/port ownership, lease/owner, network jitter, reattach after reboot) | extension lifecycle, broker descriptor/port state, tab attachment |
| System/policy (429, auth, service unavailable, system disabled, length limit, maintenance/security notices) | page banners/DOM, HTTP status of page requests |

Open questions the run must settle (not assumed): whether model/effort are
reliably readable from the page or its own requests; what exactly an SSE chunk
carries per event type; how a user edit / stop / regenerate appears in the page's
own traffic and DOM; how a brand-new conversation is observable without a
browserless list read; what a bounded delayed refresh adds as a delta stream.

## Method (bounded, non-interfering)

1. Instrument inside the extension (a characterization recorder mode) rather than
   attaching a second CDP debugger from outside — one debugger per tab already
   belongs to the persistent observer; a second attach is refused.
2. Run against a dedicated Chrome instance with a real logged-in ChatGPT
   session, exercising: one long text answer, one tool-calling turn, one
   continuation, one fresh-conversation creation, one stop/regenerate where
   cheap, and one manual-message-then-delayed-refresh delta.
3. Keep the run bounded (minutes, single instance, no repeated payload reads);
   do not add browserless HTTP reads; honor any rate-limit backoff the page
   itself surfaces.
4. Record, per observed event: source, family, timestamp, association fields,
   reliability sample count, and a provisional retention/privacy tier.
5. Store the raw characterization log in a non-Git local directory; commit only
   the derived inventory (sources, classifications, open items), never
   prompt/final/cookie/token content.

## Deliverables

- Event inventory: family × local source × reliability × association ×
  privacy/retention tier.
- Answers to the open questions above, with evidence.
- Explicit list of event families that are **not** locally observable and must
  either be excluded from the contract or resolved by a different local
  mechanism (e.g., delayed-refresh delta diffing for the user's own-browser
  activity).
- Recommendation for the versioned external-operation event frame fields and the
  retention/cleanup policy, to be folded back into the protocol-v2 design.
