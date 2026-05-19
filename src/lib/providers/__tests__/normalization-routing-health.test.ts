import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types";
import {
  getCooldownInfo,
  getHealth,
  getHealthyProviders,
  isHealthy,
  recordFailure,
  recordSuccess,
  resetHealth,
} from "@/lib/providers/health";
import {
  extractSystemPrompt,
  formatMessages,
  normalizeImageResponse,
  normalizePuterChunk,
  normalizePuterResponse,
  normalizeTTSResponse,
} from "@/lib/providers/puter/normalize";
import { getPuterProviderStatus } from "@/lib/providers/puter";
import { puterStream } from "@/lib/providers/puter/chat";
import {
  getPuterDiscoveredModels,
  beginPuterAuthBootstrap,
  beginPuterAuthPopupFromUserGesture,
  beginPuterRuntimeBootstrap,
  recordPuterAuthReplayFailed,
  recordPuterAuthReplayPending,
  recordPuterAuthReplayStarted,
  recordPuterAuthReplaySucceeded,
  recordPuterStreamAbort,
  recordPuterFallbackEvent,
  resetPuterConnectionStateForRetry,
  resetPuterRuntimeForTests,
  safePuterChat,
  safePuterImage,
  safePuterSTT,
  safePuterTTS,
  setActivePuterStream,
  setPuterRuntimeMode,
  validatePuterModels,
  validatePuterSession,
  validateRuntimeExecution,
} from "@/lib/providers/puter/runtime";
import { waitForPuter } from "@/lib/providers/puter";
import { streamImageGeneration } from "@/lib/providers/puter/image";
import { getLastRoutingDiagnostics, resolveRoute } from "@/lib/routing/fallback-router";
import { getRuntimeTelemetrySnapshot, resetRuntimeTelemetry } from "@/lib/telemetry/runtimeTelemetry";
import { getModelMetadata } from "@/lib/models/metadata";
import { modelRegistry } from "@/lib/models/registry";

const messages: Message[] = [
  {
    id: "system",
    role: "system",
    content: [{ type: "text", text: "Be concise." }],
    createdAt: 1,
  },
  {
    id: "user",
    role: "user",
    content: [
      { type: "text", text: "Look at this" },
      { type: "image", url: "blob:image", mimeType: "image/png" },
    ],
    createdAt: 2,
  },
];

describe("Puter normalization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.42);
    resetPuterRuntimeForTests();
  });

  afterEach(() => {
    delete window.puter;
  });

  it("normalizes raw Puter chunks into AIChunk shapes", () => {
    expect(normalizePuterChunk("hi")).toEqual({ type: "text", content: "hi" });
    expect(normalizePuterChunk({ delta: " there" })).toEqual({ type: "text", content: " there" });
    expect(normalizePuterChunk({ done: true }, 3)).toEqual({
      type: "status",
      content: "done",
      metadata: { sequence: 3 },
    });
    expect(normalizePuterChunk(null, 4)).toEqual({
      type: "status",
      content: "empty",
      metadata: { sequence: 4 },
    });
  });

  it("normalizes Puter text responses and artifacts", () => {
    expect(normalizePuterResponse({ message: "hello" })).toEqual([{ type: "text", text: "hello" }]);
    expect(normalizePuterResponse(null)).toEqual([]);

    const image = normalizeImageResponse({ url: "blob:image" }, "draw", "model-a");
    expect(image).toMatchObject({
      id: "image-mp3rri80-f4bipx",
      type: "image",
      url: "blob:image",
      prompt: "draw",
      model: "model-a",
      createdAt: Date.now(),
    });

    const elementImage = normalizeImageResponse(
      Object.assign(document.createElement("img"), { src: "data:image/png;base64,abc" }),
      "draw",
      "gpt-image-1-mini"
    );
    expect(elementImage).toMatchObject({
      type: "image",
      url: "data:image/png;base64,abc",
      prompt: "draw",
      model: "gpt-image-1-mini",
    });

    const nestedImage = normalizeImageResponse({ data: [{ b64_json: "abc" }] }, "draw");
    expect(nestedImage.url).toBe("data:image/png;base64,abc");

    const audio = normalizeTTSResponse("blob:audio", "voice-a");
    expect(audio).toMatchObject({
      id: "audio-mp3rri80-f4bipx",
      type: "audio",
      url: "blob:audio",
      voice: "voice-a",
      createdAt: Date.now(),
    });
  });

  it("formats multimodal messages and extracts the system prompt", () => {
    expect(extractSystemPrompt(messages)).toBe("Be concise.");
    expect(formatMessages(messages)).toEqual([
      { role: "system", content: [{ type: "text", text: "Be concise." }] },
      {
        role: "user",
        content: [
          { type: "text", text: "Look at this" },
          { type: "image", url: "blob:image", mimeType: "image/png" },
        ],
      },
    ]);
  });

  it("streams real Puter image elements into normalized artifacts", async () => {
    const calls: unknown[] = [];
    const image = Object.assign(document.createElement("img"), { src: "data:image/png;base64,abc" });
    window.puter = {
      ai: {
        txt2img: (prompt: string | Record<string, unknown>, options: unknown) => {
          calls.push({ prompt, options });
          return Promise.resolve(image);
        },
      },
      auth: {
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "image-user" }),
      },
    };

    const events = [];
    for await (const event of streamImageGeneration("paint a release badge", {
      model: "gpt-image-1-mini",
    })) {
      events.push(event);
    }

    expect(calls).toEqual([
      {
        prompt: "paint a release badge",
        options: { model: "gpt-image-1-mini" },
      },
    ]);
    expect(events.map((event) => event.type)).toEqual(["status", "status", "artifact", "status"]);
    expect(events[2]).toMatchObject({
      type: "artifact",
      artifact: {
        url: "data:image/png;base64,abc",
        model: "gpt-image-1-mini",
      },
    });
  });

  it("normalizes internal Puter chat IDs before provider execution", async () => {
    const calls: unknown[] = [];
    window.puter = {
      ai: {
        chat: (_messages: unknown, options: unknown) => {
          calls.push(options);
          return {
            async *[Symbol.asyncIterator]() {
              yield { text: "ok" };
              yield { done: true };
            },
          };
        },
      },
      auth: {
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "chat-user" }),
      },
    };

    const chunks = [];
    for await (const chunk of puterStream(messages, undefined, "puter-claude-sonnet-4")) {
      chunks.push(chunk);
    }

    expect(calls).toEqual([
      expect.objectContaining({
        model: "claude-sonnet-4",
        stream: true,
      }),
    ]);
    expect(chunks.some((chunk) => chunk.type === "text" && chunk.content === "ok")).toBe(true);
  });

  it("rejects malformed Puter runtime mappings before provider execution", async () => {
    const chat = vi.fn();
    window.puter = { ai: { chat } };

    await expect(async () => {
      for await (const _chunk of puterStream(messages, undefined, "puter-missing-runtime")) {
        // Exhaust the generator so provider setup runs.
      }
    }).rejects.toThrow(/Missing runtime model mapping/);
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("provider routing and diagnostics state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
    resetRuntimeTelemetry();
    resetPuterRuntimeForTests();
    resetHealth("puter");
    resetHealth("ollama");
  });

  it("falls back from an unavailable preferred provider to the model native provider", () => {
    const route = resolveRoute("ollama-llama-maverick", {
      preferredProvider: "puter",
      respectHealth: false,
    });

    expect(route).toMatchObject({
      modelId: "ollama-llama-maverick",
      usedFallback: true,
      fallbackChain: ["ollama-llama-maverick", "ollama-deepseek-v4"],
    });
    expect(route?.provider.id).toBe("ollama");
  });

  it("allows Puter routes to lazy-load the browser runtime", () => {
    const route = resolveRoute("puter-gpt-5", {
      preferredProvider: "puter",
      respectHealth: false,
    });

    expect(route).toMatchObject({
      modelId: "puter-gpt-5",
      runtimeModelId: "gpt-5",
      usedFallback: false,
    });
    expect(route?.provider.id).toBe("puter");
  });

  it("exposes internal and runtime IDs in routing diagnostics", () => {
    const route = resolveRoute("puter-claude-sonnet-4", {
      preferredProvider: "puter",
      respectHealth: false,
    });

    expect(route).toMatchObject({
      modelId: "puter-claude-sonnet-4",
      runtimeModelId: "claude-sonnet-4",
    });
    expect(getLastRoutingDiagnostics()).toMatchObject({
      requestedModelId: "puter-claude-sonnet-4",
      resolvedModelId: "puter-claude-sonnet-4",
      resolvedRuntimeModelId: "claude-sonnet-4",
      resolvedProviderId: "puter",
    });
  });

  it("uses the safe fallback route when provider health would otherwise collapse routing", () => {
    recordFailure("puter", "timeout");

    const route = resolveRoute("puter-claude-sonnet-4", {
      preferredProvider: "puter",
      respectHealth: true,
    });

    expect(route).toMatchObject({
      modelId: "ollama-llama-maverick",
      usedFallback: true,
    });
    expect(route?.provider.id).toBe("ollama");
    expect(getLastRoutingDiagnostics()).toMatchObject({
      requestedModelId: "puter-claude-sonnet-4",
      resolvedModelId: "ollama-llama-maverick",
      resolvedProviderId: "ollama",
      usedFallback: true,
    });
    expect(getLastRoutingDiagnostics()?.rejections.map((item) => item.reason)).toContain("provider-unhealthy");
  });

  it("repairs invalid model selections with the safe fallback route", () => {
    const route = resolveRoute("missing-model-id", {
      preferredProvider: "puter",
      respectHealth: true,
    });

    expect(route).toMatchObject({
      modelId: "ollama-llama-maverick",
      usedFallback: true,
    });
    expect(route?.provider.id).toBe("ollama");
    expect(getLastRoutingDiagnostics()?.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelId: "missing-model-id", reason: "model-missing" }),
      ])
    );
  });

  it("respects provider health cooldowns and recovers after reset", () => {
    recordFailure("ollama");

    expect(isHealthy("ollama")).toBe(false);
    expect(getHealth("ollama")).toMatchObject({
      providerId: "ollama",
      failures: 1,
      consecutiveFailures: 1,
      disabled: true,
    });
    expect(getCooldownInfo("ollama")).toMatchObject({
      isInCooldown: true,
      cooldownRemainingMs: 5000,
      cooldownDurationMs: 5000,
    });
    expect(getHealthyProviders(["ollama", "puter"])).toEqual(["puter"]);

    recordSuccess("ollama", 123);
    expect(isHealthy("ollama")).toBe(true);
    expect(getHealth("ollama")).toMatchObject({
      latencyMs: 123,
      consecutiveFailures: 0,
      disabled: false,
    });
    expect(getRuntimeTelemetrySnapshot().providers.latencyByProvider.ollama).toMatchObject({
      count: 1,
      lastMs: 123,
      averageMs: 123,
    });
  });

  it("counts runtime fallback events for diagnostics", () => {
    recordPuterFallbackEvent("puter", "ollama");

    expect(getRuntimeTelemetrySnapshot().providers.fallbacks).toMatchObject({
      count: 1,
      lastFromProvider: "puter",
      lastToProvider: "ollama",
    });
  });

  it("reports Puter runtime diagnostics without loading external providers", () => {
    const status = getPuterProviderStatus();

    expect(status.available).toBe(false);
    expect(status.readiness).toBe("idle");
    expect(status.runtime.executionMode).toBe("offline");
    expect(status.runtime).toMatchObject({
      loaded: false,
      ready: false,
      timeoutEvents: 0,
      activeStreamId: null,
    });
  });

  it("bootstraps the Puter SDK once, then validates auth and model state", async () => {
    const bootstrap = beginPuterRuntimeBootstrap();
    const duplicate = beginPuterRuntimeBootstrap();
    const scripts = document.querySelectorAll('script[src="https://js.puter.com/v2/"]');

    expect(scripts).toHaveLength(1);
    expect(getPuterProviderStatus().runtime).toMatchObject({
      sdkLoadState: "loading",
      sdkRetryCount: 1,
      sdkAlreadyPresent: false,
    });

    window.puter = {
      ai: {
        listModels: vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai" }]),
      },
      auth: {
        isSignedIn: () => Promise.resolve(false),
        getUser: () => Promise.resolve(null),
      },
    };
    scripts[0].dispatchEvent(new Event("load"));

    await expect(bootstrap).resolves.toMatchObject({
      available: false,
      mode: "mock",
      reason: "auth-required",
    });
    await expect(duplicate).resolves.toMatchObject({
      available: false,
      mode: "mock",
      reason: "auth-required",
    });
    expect(getPuterProviderStatus().runtime).toMatchObject({
      sdkLoadState: "loaded",
      sdkLoadedAt: Date.now(),
      authRecoveryState: "required",
      modeReason: "auth-required",
    });
  });

  it("tracks runtime connection degradation and retry reset state", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("ok"),
      },
      auth: {
        getUser: () => Promise.resolve({ username: "test" }),
      },
    };

    await waitForPuter();
    window.dispatchEvent(new ErrorEvent("error", { message: "WebSocket connection closed" }));

    expect(getPuterProviderStatus().runtime).toMatchObject({
      connectionState: "reconnecting",
      websocketFailures: 1,
    });

    resetPuterConnectionStateForRetry();
    expect(getPuterProviderStatus().runtime).toMatchObject({
      connectionState: "reconnecting",
      error: null,
    });
  });

  it("marks reconnect exhaustion without leaving the runtime actively reconnecting", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("ok"),
      },
      auth: {
        getUser: () => Promise.reject(new Error("session expired")),
      },
    };

    await waitForPuter();
    window.dispatchEvent(new ErrorEvent("error", { message: "WebSocket connection closed" }));
    for (let index = 0; index < 3; index += 1) {
      const runtime = getPuterProviderStatus().runtime;
      await vi.advanceTimersByTimeAsync(runtime.nextReconnectAt ? runtime.nextReconnectAt - Date.now() : 0);
    }

    expect(getPuterProviderStatus().runtime).toMatchObject({
      authState: "expired",
      connectionState: "degraded",
      reconnectAttempts: 3,
      reconnectExhausted: true,
      websocketFailures: 1,
    });
    expect(getPuterProviderStatus().runtime.connectionState).not.toBe("reconnecting");
  });

  it("clears reconnect exhaustion after a successful provider operation", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("ok"),
      },
      auth: {
        getUser: () => Promise.reject(new Error("session expired")),
      },
    };

    await waitForPuter();
    window.dispatchEvent(new ErrorEvent("error", { message: "WebSocket connection closed" }));
    for (let index = 0; index < 3; index += 1) {
      const runtime = getPuterProviderStatus().runtime;
      await vi.advanceTimersByTimeAsync(runtime.nextReconnectAt ? runtime.nextReconnectAt - Date.now() : 0);
    }

    expect(getPuterProviderStatus().runtime.reconnectExhausted).toBe(true);
    window.puter.auth = {
      isSignedIn: () => Promise.resolve(true),
      getUser: () => Promise.resolve({ username: "recovered-user" }),
    };
    await safePuterChat(messages, { model: "claude-sonnet-4" });

    expect(getPuterProviderStatus().runtime).toMatchObject({
      connectionState: "connected",
      reconnectAttempts: 0,
      reconnectExhausted: false,
      error: null,
    });
  });

  it("applies jittered reconnect backoff and suppresses duplicate reconnect scheduling", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("ok"),
      },
      auth: {
        getUser: () => Promise.reject(new Error("session expired")),
      },
    };

    await waitForPuter();
    window.dispatchEvent(new ErrorEvent("error", { message: "WebSocket connection closed" }));
    const firstReconnect = getPuterProviderStatus().runtime;

    expect(firstReconnect).toMatchObject({
      connectionState: "reconnecting",
      reconnectAttempts: 1,
    });
    expect(firstReconnect.lastReconnectDelayMs).toBeGreaterThan(1000);
    expect(firstReconnect.nextReconnectAt).toBe(Date.now() + firstReconnect.lastReconnectDelayMs!);

    window.dispatchEvent(new ErrorEvent("error", { message: "WebSocket transport closed again" }));

    expect(getPuterProviderStatus().runtime).toMatchObject({
      reconnectAttempts: 1,
      websocketFailures: 2,
    });
  });

  it("rate limits duplicate retry recovery requests", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("ok"),
      },
      auth: {
        getUser: () => Promise.resolve({ username: "test" }),
      },
    };

    await waitForPuter();

    expect(resetPuterConnectionStateForRetry()).toBe(true);
    expect(resetPuterConnectionStateForRetry()).toBe(false);
    expect(getPuterProviderStatus().runtime).toMatchObject({
      duplicateRetryBlocks: 1,
      retryRateLimitedUntil: Date.now() + 1500,
      lastRecoveryDecision: "retry-rate-limited",
    });

    await vi.advanceTimersByTimeAsync(1500);

    expect(resetPuterConnectionStateForRetry()).toBe(true);
  });

  it("validates authenticated Puter sessions before live execution", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("ok"),
      },
      auth: {
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "real-user" }),
      },
    };

    await expect(validatePuterSession()).resolves.toMatchObject({
      authenticated: true,
      authState: "authenticated",
    });
    await expect(validateRuntimeExecution()).resolves.toMatchObject({
      available: true,
      mode: "live",
    });
    expect(getPuterProviderStatus().runtime).toMatchObject({
      executionMode: "live",
      modeReason: "authenticated-session",
      lastSuccessfulRealExecutionAt: Date.now(),
    });
  });

  it("marks unauthenticated sessions as explicit mock mode instead of silent live readiness", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("should-not-run"),
      },
      auth: {
        isSignedIn: () => Promise.resolve(false),
        getUser: () => Promise.resolve(null),
      },
    };

    await expect(validateRuntimeExecution()).resolves.toMatchObject({
      available: false,
      mode: "mock",
      reason: "auth-required",
    });
    await expect(safePuterChat(messages, { model: "claude-sonnet-4" })).rejects.toThrow(/auth-required/i);
    expect(getPuterProviderStatus().runtime).toMatchObject({
      executionMode: "mock",
      modeReason: "auth-required",
      authState: "unauthenticated",
      authRecoveryState: "required",
    });
  });

  it("discovers real Puter models through listModels and caches normalized metadata", async () => {
    const listModels = vi.fn().mockResolvedValue([
      {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        provider: "anthropic",
        capabilities: ["chat", "vision"],
      },
      {
        model: "gpt-image-1-mini",
        provider: { id: "openai", name: "OpenAI" },
        modalities: ["image"],
      },
    ]);
    window.puter = {
      ai: {
        listModels,
      },
      auth: {
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "model-user" }),
      },
    };

    await expect(validatePuterModels()).resolves.toMatchObject({
      ok: true,
      count: 2,
    });
    await validatePuterModels();

    expect(listModels).toHaveBeenCalledTimes(1);
    expect(getPuterDiscoveredModels()).toEqual([
      expect.objectContaining({
        runtimeId: "claude-sonnet-4",
        providerId: "anthropic",
        capabilities: ["chat", "vision"],
      }),
      expect.objectContaining({
        runtimeId: "gpt-image-1-mini",
        providerId: "openai",
        capabilities: ["image"],
      }),
    ]);
    expect(getPuterProviderStatus().runtime).toMatchObject({
      modelFetchStatus: "success",
      discoveredModelCount: 2,
    });
  });

  it("invalidates stale auth state and model cache when a live session expires", async () => {
    window.puter = {
      ai: {
        listModels: vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai", capabilities: ["chat"] }]),
      },
      auth: {
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "model-user" }),
      },
    };

    await validatePuterModels();
    expect(getPuterDiscoveredModels()).toHaveLength(1);

    window.puter.auth = {
      isSignedIn: () => Promise.reject(new Error("session expired")),
      getUser: () => Promise.reject(new Error("session expired")),
    };

    await expect(validateRuntimeExecution()).resolves.toMatchObject({
      available: false,
      mode: "mock",
      reason: "expired-session",
    });
    expect(getPuterDiscoveredModels()).toHaveLength(0);
    expect(getPuterProviderStatus().runtime).toMatchObject({
      authState: "expired",
      authInvalidatedAt: Date.now(),
      lastRuntimeValidationFailure: "session expired",
    });
  });

  it("tracks bounded live operation metrics across image and voice requests", async () => {
    window.puter = {
      ai: {
        listModels: vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai", capabilities: ["chat"] }]),
        txt2img: () => Promise.resolve("data:image/png;base64,abc"),
        txt2speech: () => Promise.resolve("data:audio/wav;base64,abc"),
        speech2txt: () => Promise.resolve({ text: "voice transcript" }),
      },
      auth: {
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "metrics-user" }),
      },
    };

    expect(getPuterProviderStatus().runtime.activeRequestCount).toBe(0);

    await safePuterImage("operational image", { model: "gpt-image-1-mini" });
    await safePuterTTS("hello", { voice: "default" });
    await safePuterSTT(new Blob(["audio"], { type: "audio/webm" }));

    expect(getPuterProviderStatus().runtime).toMatchObject({
      activeRequestCount: 0,
      imageGenerationCount: 1,
      voiceRequestCount: 2,
      lastImageLatencyMs: 0,
      lastTTSLatencyMs: 0,
      lastSTTLatencyMs: 0,
      lastSuccessfulLiveRequestAt: Date.now(),
    });
  });

  it("records stream abort causes without leaving active stream ownership behind", () => {
    recordPuterStreamAbort("user-stop");

    expect(getPuterProviderStatus().runtime).toMatchObject({
      activeStreamId: null,
      activeStreamCount: 0,
      streamAbortEvents: 1,
      lastStreamAbortReason: "user-stop",
    });
  });

  it("tracks provider timeout timing for operational diagnostics", async () => {
    window.puter = {
      ai: {
        listModels: vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai", capabilities: ["chat"] }]),
        chat: () => new Promise(() => undefined),
      },
      auth: {
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "timeout-user" }),
      },
    };

    const request = expect(safePuterChat(messages, { model: "claude-sonnet-4", timeoutMs: 25 })).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(25);

    await request;
    expect(getPuterProviderStatus().runtime).toMatchObject({
      activeRequestCount: 0,
      lastProviderTimeoutAt: Date.now(),
      lastRecoveryDecision: "reconnect-scheduled",
    });
  });

  it("keeps reconnect timers bounded during repeated long-session failures and records recovery", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("ok"),
      },
      auth: {
        getUser: () => Promise.reject(new Error("session expired")),
      },
    };

    await waitForPuter();
    for (let index = 0; index < 5; index += 1) {
      window.dispatchEvent(new ErrorEvent("error", { message: `WebSocket closed ${index}` }));
    }

    expect(getPuterProviderStatus().runtime).toMatchObject({
      activeReconnectTimerCount: 1,
      reconnectAttempts: 1,
    });

    for (let index = 0; index < 3; index += 1) {
      const runtime = getPuterProviderStatus().runtime;
      await vi.advanceTimersByTimeAsync(runtime.nextReconnectAt ? runtime.nextReconnectAt - Date.now() : 0);
    }

    expect(getPuterProviderStatus().runtime).toMatchObject({
      activeReconnectTimerCount: 0,
      reconnectExhausted: true,
      reconnectExhaustionCount: 1,
    });

    window.puter.auth = {
      isSignedIn: () => Promise.resolve(true),
      getUser: () => Promise.resolve({ username: "soak-recovered" }),
    };
    await safePuterChat(messages, { model: "claude-sonnet-4" });

    expect(getPuterProviderStatus().runtime).toMatchObject({
      reconnectExhausted: false,
      providerRecoverySuccessCount: 1,
      activeReconnectTimerCount: 0,
    });
  });

  it("tracks runtime validation and stream lifetime for long-session diagnostics", async () => {
    window.puter = {
      ai: {
        listModels: vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai", capabilities: ["chat"] }]),
      },
      auth: {
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "validation-user" }),
      },
    };

    await validateRuntimeExecution();
    setActivePuterStream("stream-long");
    await vi.advanceTimersByTimeAsync(12_500);
    setActivePuterStream(null);

    expect(getPuterProviderStatus().runtime).toMatchObject({
      runtimeValidationCount: 1,
      activeStreamCount: 0,
      maxObservedStreamDurationMs: 12_500,
    });
  });

  it("records auth refresh, offline recovery, and deploy refresh cleanup", async () => {
    window.puter = {
      ai: {
        chat: () => Promise.resolve("ok"),
      },
      auth: {
        isSignedIn: () => Promise.resolve(false),
        getUser: () => Promise.resolve(null),
      },
    };

    await validateRuntimeExecution();
    expect(getPuterProviderStatus().runtime).toMatchObject({
      executionMode: "mock",
      runtimeActivationSource: "existing-window",
    });

    window.puter.auth = {
      isSignedIn: () => Promise.resolve(true),
      getUser: () => Promise.resolve({ username: "refreshed" }),
    };
    await validateRuntimeExecution();

    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new PageTransitionEvent("pagehide"));

    expect(getPuterProviderStatus().runtime).toMatchObject({
      authRefreshCount: 1,
      offlineRecoveryCount: 1,
      deployRefreshRecoveryCount: 1,
      activeReconnectTimerCount: 0,
      activeStreamCount: 0,
    });
  });

  it("marks unauthenticated runtime as recoverable auth-required without silent mock dead-end", async () => {
    window.puter = {
      ai: {
        listModels: vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai" }]),
      },
      auth: {
        isSignedIn: () => Promise.resolve(false),
        getUser: () => Promise.resolve(null),
      },
    };

    await validateRuntimeExecution();

    expect(getPuterProviderStatus().runtime).toMatchObject({
      executionMode: "mock",
      modeReason: "auth-required",
      authRecoveryState: "required",
      authBootstrapRequiredAt: Date.now(),
      authRecoveryAttempts: 0,
    });
  });

  it("runs user-triggered Puter auth bootstrap once and revalidates live models", async () => {
    const signIn = vi.fn().mockImplementation(() => {
      window.puter!.auth = {
        signIn,
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "popup-user" }),
      };
      return Promise.resolve({ username: "popup-user" });
    });
    const listModels = vi.fn().mockResolvedValue([{ id: "claude-sonnet-4", provider: "anthropic" }]);
    window.puter = {
      ai: { listModels },
      auth: {
        signIn,
        isSignedIn: () => Promise.resolve(false),
        getUser: () => Promise.resolve(null),
      },
    };

    await validateRuntimeExecution();
    await expect(beginPuterAuthBootstrap()).resolves.toMatchObject({
      ok: true,
      authState: "authenticated",
    });

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(listModels).toHaveBeenCalledTimes(1);
    expect(getPuterProviderStatus().runtime).toMatchObject({
      executionMode: "live",
      modeReason: "authenticated-session",
      authRecoveryState: "recovered",
      authRecoveryAttempts: 1,
      discoveredModelCount: 1,
    });
  });

  it("invokes Puter signIn synchronously for trusted user gesture popup flows", async () => {
    const order: string[] = [];
    const signIn = vi.fn().mockImplementation(() => {
      order.push("signIn");
      window.puter!.auth = {
        signIn,
        isSignedIn: () => Promise.resolve(true),
        getUser: () => Promise.resolve({ username: "popup-user" }),
      };
      return Promise.resolve({ username: "popup-user" });
    });
    const listModels = vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai" }]);
    window.puter = {
      ai: { listModels },
      auth: {
        signIn,
        isSignedIn: () => Promise.resolve(false),
        getUser: () => Promise.resolve(null),
      },
    };

    const result = beginPuterAuthPopupFromUserGesture();
    order.push("after-call");

    expect(order).toEqual(["signIn", "after-call"]);
    expect(getPuterProviderStatus().runtime).toMatchObject({
      authRecoveryState: "recovering",
      authPopupState: "opened",
      authRecoveryAttempts: 1,
    });
    await expect(result).resolves.toMatchObject({ ok: true });
    expect(getPuterProviderStatus().runtime).toMatchObject({
      authRecoveryState: "recovered",
      authPopupState: "completed",
      executionMode: "live",
    });
  });

  it("records popup-blocked auth failures without clearing pending replay state", async () => {
    const signIn = vi.fn(() => {
      throw new Error("can't access property \"closed\", o is null; window.open returned null");
    });
    window.puter = {
      ai: {
        listModels: vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai" }]),
      },
      auth: {
        signIn,
        isSignedIn: () => Promise.resolve(false),
        getUser: () => Promise.resolve(null),
      },
    };

    recordPuterAuthReplayPending("expired-session");
    await expect(beginPuterAuthPopupFromUserGesture()).resolves.toMatchObject({
      ok: false,
    });

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(getPuterProviderStatus().runtime).toMatchObject({
      authRecoveryState: "failed",
      authPopupState: "blocked",
      pendingAuthReplayCount: 1,
    });
  });

  it("tracks auth replay lifecycle separately from auth bootstrap state", () => {
    recordPuterAuthReplayPending("expired-session");
    recordPuterAuthReplayStarted();
    recordPuterAuthReplayFailed(new Error("still expired"));

    expect(getPuterProviderStatus().runtime).toMatchObject({
      executionMode: "mock",
      modeReason: "expired-session",
      authRecoveryState: "required",
      authReplayState: "failed",
      pendingAuthReplayCount: 1,
      authReplayAttempts: 1,
      authReplayError: "still expired",
    });

    recordPuterAuthReplayStarted();
    recordPuterAuthReplaySucceeded();

    expect(getPuterProviderStatus().runtime).toMatchObject({
      authReplayState: "succeeded",
      pendingAuthReplayCount: 0,
      authReplayAttempts: 2,
      authReplayError: null,
    });
  });

  it("suppresses duplicate auth bootstrap calls while the Puter popup flow is pending", async () => {
    let resolveSignIn: (value: unknown) => void = () => undefined;
    const signIn = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        })
    );
    window.puter = {
      ai: {
        listModels: vi.fn().mockResolvedValue([{ id: "gpt-4o", provider: "openai" }]),
      },
      auth: {
        signIn,
        isSignedIn: () => Promise.resolve(false),
        getUser: () => Promise.resolve(null),
      },
    };

    await validateRuntimeExecution();
    const first = beginPuterAuthBootstrap();
    const second = beginPuterAuthBootstrap();
    await Promise.resolve();
    expect(signIn).toHaveBeenCalledTimes(1);

    window.puter.auth = {
      signIn,
      isSignedIn: () => Promise.resolve(true),
      getUser: () => Promise.resolve({ username: "popup-user" }),
    };
    resolveSignIn({ username: "popup-user" });

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(getPuterProviderStatus().runtime).toMatchObject({
      authRecoveryAttempts: 1,
      authRecoveryState: "recovered",
      executionMode: "live",
    });
  });


  it("keeps developer mock override explicit and visible", () => {
    setPuterRuntimeMode("mock", "developer override");

    expect(getPuterProviderStatus().runtime).toMatchObject({
      executionMode: "mock",
      modeReason: "developer override",
      modeActivatedAt: Date.now(),
    });
  });

  it("exposes broader Puter model metadata for advanced selection", () => {
    const qwen = modelRegistry.get("qwen/qwen3-coder");
    const image = modelRegistry.get("gpt-image-1-mini");

    expect(qwen).toBeDefined();
    expect(image).toBeDefined();
    expect(qwen && getModelMetadata(qwen)).toMatchObject({
      providerName: "Puter",
      category: "puter",
      streaming: true,
      codingOptimized: true,
      advanced: true,
    });
    expect(image && getModelMetadata(image)).toMatchObject({
      image: true,
      streaming: false,
      advanced: true,
    });
  });
});
