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
import { recordPuterFallbackEvent, resetPuterRuntimeForTests } from "@/lib/providers/puter/runtime";
import { streamImageGeneration } from "@/lib/providers/puter/image";
import { resolveRoute } from "@/lib/routing/fallback-router";
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
      usedFallback: false,
    });
    expect(route?.provider.id).toBe("puter");
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
