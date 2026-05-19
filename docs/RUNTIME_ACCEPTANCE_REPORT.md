# Runtime Acceptance Report

## Scope

This report tracks real-world Puter runtime acceptance for AI Superhub. It is intentionally operational: it records what has been validated, what remains blocked, and which runtime risks need live browser follow-up.

This phase does not introduce agents, orchestration, backend services, databases, or new provider architecture.

## Successful Validations

### Production Deployment Readiness

- Deployment metadata now exposes a deterministic runtime build identity from app version, commit, and deployment timestamp.
- Diagnostics surfaces build identity and stale-asset status so production operators can distinguish old clients from the current deployment.
- Puter runtime diagnostics now track activation source: existing window runtime, script load, reconnect, revalidation, or deployment refresh recovery.
- Deploy refresh recovery cleanup resets active reconnect timers, active stream ownership, reconnect exhaustion state, and stale stream references.
- Browser `pagehide` is treated as a deployment/refresh boundary so active runtime ownership does not survive a hard refresh or deployment reload.

### Local Technical Validation

- TypeScript, build, unit, desktop E2E, mobile E2E, and visual regression passed locally after runtime activation changes.
- Puter runtime wrappers now require authenticated runtime validation before chat, image, TTS, and STT calls.
- Runtime mode is explicit: `live`, `mock`, `fallback`, or `offline`.
- Mock and fallback activation paths are observable in diagnostics.
- Puter model discovery is exercised through `puter.ai.listModels()` in runtime tests.
- Reconnect scheduling uses bounded jittered backoff and suppresses duplicate reconnect timers.
- Retry recovery requests are rate limited to prevent duplicate retry storms.
- Auth expiration invalidates live readiness and clears cached model discovery.

### Chat And Streaming

- Existing desktop chat E2E passes through the deterministic mocked provider path.
- Provider wrapper tests validate authenticated gating before live chat execution.
- Stream ownership and retry flows remain covered by existing E2E and store tests.

### Image Generation

- Existing desktop image E2E passes through the deterministic mocked artifact path.
- `safePuterImage()` now uses the same authenticated runtime validation gate as chat.

### Voice

- Existing desktop voice E2E passes through deterministic mocked media events.
- `safePuterTTS()` and `safePuterSTT()` now use authenticated runtime validation before invoking Puter AI methods.

### Mobile Runtime

- Mobile Chromium E2E passed for keyboard lifecycle, workspace navigation, image modal layout, and terminal viewport behavior.
- Tablet E2E passed for layout scaling, code block overflow, terminal proportions, and image modal proportions.

## Failed Or Blocked Validations

The following validations are still blocked in this automation environment because no authenticated Puter browser session is available to the Playwright test runner:

- Real signed-in Puter chat execution.
- Real token streaming latency and websocket behavior.
- Real provider retry after live provider failure.
- Real reconnect after live auth/session expiration.
- Real `txt2img()` artifact generation.
- Real `txt2speech()` playback lifecycle.
- Real `speech2txt()` microphone permission lifecycle.
- Real deploy-refresh behavior while a Puter stream is active.
- Real stale-asset recovery against a production CDN/browser cache.
- Real Android Chrome background/foreground recovery under Puter-hosted auth.
- Mobile Safari runtime validation.
- Mobile hardware microphone permission behavior.

## Runtime Observations

- Runtime starts as `offline` until Puter is loaded.
- Authenticated sessions transition to `live`.
- Unauthenticated or expired sessions transition to explicit `mock`.
- Provider/model discovery failures transition to `fallback`.
- Auth expiration clears discovered model cache so stale model availability cannot poison future routing.
- Reconnect attempts are bounded and jittered to avoid synchronized retry loops.
- Duplicate retry recovery requests are suppressed during a short runtime cooldown.
- Diagnostics now shows runtime mode, mode reason, auth invalidation, model fetch status, reconnect backoff, retry blocks, active request/stream counts, stream abort causes, recovery decisions, image/TTS/STT latency, media failure counts, and provider latency.
- Image workspace cleanup now avoids persisting expired `blob:` URLs and revokes abandoned object URLs when artifacts are removed or the workspace unmounts.
- Voice workspace cleanup now pauses abandoned playback, revokes temporary audio object URLs, and releases microphone tracks on stop/unmount.
- Store-level stream ownership now rejects direct concurrent stream creation so lower-level callers cannot accidentally create overlapping active stream owners.
- Long-session soak counters now expose active reconnect timers, reconnect exhaustion count, provider recovery success count, runtime validation count, and longest observed stream duration.
- Resource diagnostics now track active object URLs and active media tracks, with bounded counters for created/revoked URLs and acquired/released tracks.
- Production diagnostics now includes auth refresh count, offline recovery count, deploy refresh recovery count, runtime activation source, build ID, and stale asset state.
- Offline/online transitions increment bounded recovery counters and schedule at most one reconnect attempt.
- A successful auth revalidation after unauthenticated or expired state increments auth refresh count and clears stale degraded state.
- Deployment refresh recovery is idempotent and local-only; it does not add backend coordination or persistent orchestration.

## Deployment Observations

- Vercel-hosted deployments are expected not to inherit Puter shell authentication.
- Puter-hosted deployments are expected to inherit Puter authentication and can reach `LIVE` mode when model discovery succeeds.
- Stale client detection is based on deterministic build identity comparison; external cache invalidation still depends on deployment hosting behavior.
- Refresh during active stream is handled as a hard runtime boundary: the stream owner and reconnect timer are cleared rather than replayed.
- Reconnect after temporary offline state remains bounded by the existing reconnect attempt limit and jittered backoff.

## Mobile Device Observations

- Automated mobile Chromium coverage validates responsive shell behavior, workspace navigation, image modal layout, and code/terminal viewport stability.
- Real Android Chrome live-runtime checks still need device validation for Puter auth, long streaming, image generation, TTS/STT, and background/foreground recovery.
- Mobile Safari remains a separate operational acceptance item because viewport, media, microphone, and background socket behavior differ from Chromium.

## Production Readiness Status

Status: **conditionally ready for Puter-hosted operational acceptance**.

The app has deterministic runtime modes, deploy/refresh cleanup, bounded reconnect and retry behavior, resource counters, and production-safe diagnostics. Final production acceptance still depends on signed-in Puter-hosted validation for live streaming, image generation, voice, mobile device permissions, and provider-side latency.

## Release Candidate Validation

Status: **release-candidate ready for automated validation; live acceptance remains operator-gated**.

Validated in this local environment:

- TypeScript, production build, unit coverage, desktop E2E, mobile Chromium E2E, and visual regression.
- Fallback/mock behavior for chat, image, voice, diagnostics, retry, abort, and mobile layout.
- Runtime guards for duplicate retries, reconnect timers, active stream ownership, deployment refresh cleanup, object URL cleanup, and media track cleanup.
- Deployment identity visibility, stale asset signaling, runtime activation source visibility, and recovery counters.

Not validated in this local environment:

- Signed-in Puter-hosted startup.
- Real long streaming and provider websocket behavior.
- Real image generation and retry.
- Real TTS playback and STT permission allow/deny.
- Real auth expiration and auth refresh recovery.
- Physical Android Chrome and Safari/iPhone behavior.
- Deploy while app is open against a real production host.

Release-candidate acceptance criteria:

- The app can be considered ready for controlled Puter-hosted release testing when automated validation remains green and Diagnostics shows deterministic mode transitions under both authenticated and unauthenticated sessions.
- The app should not be considered fully production-accepted until the live checklist below is completed in an authenticated Puter-hosted browser session and at least one real mobile device.

## Release Candidate Operational Review

Production-ready areas:

- Runtime mode visibility and fallback/mock transparency.
- Retry and reconnect bounding.
- Stream ownership cleanup on abort and refresh.
- Image/audio object URL and media track cleanup.
- Deployment metadata and build identity visibility.
- Desktop, mobile Chromium, and visual regression coverage.

Partially validated areas:

- Live Puter provider behavior, because local automated tests can validate wrapper semantics but not authenticated provider transport.
- Mobile media permissions, because browser automation covers layout but not physical device permission quirks.
- Deployment refresh recovery, because local tests validate cleanup semantics but not CDN/browser cache behavior under real deploys.

Recommended future priorities after release candidate:

- Run a signed-in Puter-hosted smoke test before each release.
- Keep a small mobile device checklist for Android Chrome and iPhone Safari.
- Record live latency and reconnect observations in this report after each release candidate.
- Avoid additional orchestration features until live provider acceptance is complete.

## Known Operational Risks

- Puter provider availability can fluctuate independently of local app health.
- Puter model metadata shape may change and require normalization updates.
- Signed-in browser session state may expire while UI still appears loaded.
- Websocket transport failures can occur mid-stream and must rely on deterministic stream ownership to avoid stale mutations.
- Mobile browsers can suspend sockets or media playback during tab/background transitions.
- Mobile microphone permissions vary by browser and device; permission denial must remain normalized and retryable.
- Live provider latency may differ substantially from mocked E2E timing.
- Live long-running streams still need Puter-hosted soak testing for late chunks after abort/reconnect.
- Multi-hour authenticated Puter-hosted sessions still need manual observation to confirm counters remain stable under real provider transport behavior.
- Stale production assets can only be detected by build identity; the browser or CDN may still serve older bundles until normal cache invalidation completes.
- Deploy refresh during live provider execution should be validated against real Puter websocket behavior because local tests can only verify deterministic cleanup semantics.

## Required Live Acceptance Follow-Up

Run these checks in a browser profile that is signed into Puter:

1. Open the app and verify Diagnostics shows `LIVE`.
2. Run a chat request with the Smart preset and verify real streamed tokens.
3. Abort a live stream and verify no duplicate assistant content appears.
4. Retry the same prompt and verify retry rate limiting prevents duplicate retry activation.
5. Temporarily expire/sign out of Puter and verify Diagnostics shows `MOCK (Unauthenticated)` or expired-session mode.
6. Generate a real image and verify artifact rendering on desktop and mobile.
7. Run TTS playback and verify playback lifecycle, retry behavior, and diagnostics latency.
8. Run STT with microphone permission allowed and denied.
9. Test mobile Chrome keyboard, image, voice, retry, reconnect, and diagnostics views.
10. Test mobile Safari if available.
11. Trigger a production redeploy or hard refresh during a stream and verify Diagnostics increments deploy refresh recovery without duplicate assistant content.
12. Reopen an older cached client, if possible, and verify build identity/stale asset diagnostics are visible.
