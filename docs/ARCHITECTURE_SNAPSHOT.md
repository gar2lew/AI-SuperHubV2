# AI Superhub Architecture Snapshot

This snapshot describes the current stable frontend architecture and the operational boundaries that should remain intact during future maturity work.

## Provider Flow

User input enters the chat composer, is converted into structured content parts, and is passed through context assembly before provider execution. Providers expose a common runtime surface for chat, streaming, image, vision, speech, and transcription capabilities. Provider calls remain frontend-only and are guarded by runtime readiness, model capability checks, health state, and normalized provider errors.

## Routing Flow

The routing layer resolves the selected preset or model ID to a stable internal model entry, then maps that entry to its provider and provider-specific runtime model ID. Health checks and capability validation can reject a route, after which the registered fallback chain is evaluated. A safe fallback route remains available so routing does not collapse when a transient provider failure occurs.

## Model Normalization Flow

Model registry IDs are stable application IDs. Provider execution receives only provider runtime IDs. Diagnostics intentionally displays both values so operators can distinguish UI selection, registry routing, and live provider execution.

## Stream Lifecycle

Each stream receives a unique stream ID and is owned by a single conversation. The stream engine batches chunks, tracks first-token and total latency, enforces timeouts, and finalizes buffered chunks into assistant messages. Store-level ownership checks prevent stale streams from mutating active UI state after aborts, timeouts, retries, or conversation switches.

## Retry Lifecycle

Recoverable failures produce retry metadata on the assistant message. Retry restores the exact original prompt and failed provider/model context, clears transient Puter cooldown state, and records a `retry_triggered` runtime event. Retry controls are disabled while another stream is active to prevent overlapping recovery loops.

## Fallback Lifecycle

Primary provider failure records provider health and analytics state. If a fallback route is available, the UI stream receives a fallback status chunk, provider transition analytics are recorded, and the fallback stream continues under the original stream owner. Fallbacks are also written to the runtime event timeline for operational correlation.

## Runtime State Machine

The Puter runtime exposes explicit connection states:

- `disconnected`
- `connecting`
- `connected`
- `degraded`
- `timeout`
- `reconnecting`

Auth state is tracked separately as `unknown`, `authenticated`, `unauthenticated`, or `expired`. Reconnect attempts are capped, exhaustion is surfaced in diagnostics, and successful auth/provider operations clear transient degraded state.

## Diagnostics Architecture

Diagnostics combines local snapshots from routing, stream diagnostics, Puter runtime state, provider health, provider analytics, deployment metadata, client errors, and runtime telemetry. It is intentionally local and lightweight. The diagnostics timeline shows recent runtime events, failures, retries, reconnects, provider switches, and timeout history without requiring backend storage.

## Telemetry Architecture

Telemetry is in-memory and bounded. It records structured events for stream lifecycle, provider fallback, websocket disconnect/reconnect, auth failure, image generation/failure, voice start/failure, and retry triggers. Aggregates include stream latency, first-token latency, retry frequency, reconnect frequency, provider failure rate, provider latency, render timings, workspace activation, hydration, and viewport metrics.

## Lazy-Loading Boundaries

Chat loads immediately. Heavier workspaces and diagnostics are lazy-loaded behind Suspense boundaries. Monaco, markdown/syntax rendering, image, voice, terminal, and diagnostics surfaces remain isolated to protect startup performance.

## Release Governance

Deployment metadata is baked into the Vite build and surfaced through diagnostics: app version, build timestamp, environment, deployment URL, and commit hash when available. CI covers TypeScript, build, unit tests, desktop E2E, mobile/tablet E2E, and visual regression.

## Hermes Extension Boundaries

Future Hermes integration should hook into existing extension points rather than replacing them:

- Runtime event hooks in `runtimeTelemetry`
- Stream lifecycle hooks in `StreamEngine`
- Provider execution boundaries in provider modules
- Routing diagnostics from the fallback router
- Client error normalization and diagnostics snapshots

Hermes should consume structured events and diagnostics snapshots as an observer first. It should not own provider routing, stream mutation, store state, or retry/fallback execution until those responsibilities are explicitly designed and tested.
