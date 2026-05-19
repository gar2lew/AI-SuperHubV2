# Runtime Acceptance Report

## Scope

This report tracks real-world Puter runtime acceptance for AI Superhub. It is intentionally operational: it records what has been validated, what remains blocked, and which runtime risks need live browser follow-up.

This phase does not introduce agents, orchestration, backend services, databases, or new provider architecture.

## Successful Validations

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
- Diagnostics now shows runtime mode, mode reason, auth invalidation, model fetch status, reconnect backoff, retry blocks, recovery decisions, and provider latency.

## Known Operational Risks

- Puter provider availability can fluctuate independently of local app health.
- Puter model metadata shape may change and require normalization updates.
- Signed-in browser session state may expire while UI still appears loaded.
- Websocket transport failures can occur mid-stream and must rely on deterministic stream ownership to avoid stale mutations.
- Mobile browsers can suspend sockets or media playback during tab/background transitions.
- Mobile microphone permissions vary by browser and device; permission denial must remain normalized and retryable.
- Live provider latency may differ substantially from mocked E2E timing.

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

