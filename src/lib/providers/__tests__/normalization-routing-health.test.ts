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
  recordPuterFallbackEvent,
  resetPuterConnectionStateForRetry,
  resetPuterRuntimeForTests,
  safePuterChat,
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
    expect(status.runtime).toMatchObject({
      loaded: false,
      ready: false,
      timeoutEvents: 0,
      activeStreamId: null,
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
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(getPuterProviderStatus().runtime).toMatchObject({
      authState: "expired",
      connectionState: "connected",
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
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(getPuterProviderStatus().runtime.reconnectExhausted).toBe(true);
    await safePuterChat(messages, { model: "claude-sonnet-4" });

    expect(getPuterProviderStatus().runtime).toMatchObject({
      connectionState: "connected",
      reconnectAttempts: 0,
      reconnectExhausted: false,
      error: null,
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
