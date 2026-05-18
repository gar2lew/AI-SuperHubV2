import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimeTelemetrySnapshot,
  recordFallback,
  recordRuntimeEvent,
  recordProviderLatency,
  recordRenderTiming,
  recordStreamAbort,
  recordStreamChunk,
  recordStreamComplete,
  recordStreamStart,
  recordViewportMetrics,
  resetRuntimeTelemetry,
} from "@/lib/telemetry/runtimeTelemetry";

describe("runtimeTelemetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
    resetRuntimeTelemetry();
  });

  it("summarizes stream duration, chunk throughput, aborts, provider latency, and fallbacks", () => {
    recordStreamStart({
      streamId: "stream-1",
      providerId: "puter",
      modelId: "puter-gpt-5",
      conversationId: "conversation-1",
    });
    recordStreamChunk("stream-1", 5);
    vi.setSystemTime(new Date("2026-05-13T08:00:01.000Z"));
    recordStreamChunk("stream-1", 7);
    recordStreamComplete("stream-1");
    recordProviderLatency("puter", 1000);
    recordFallback("puter", "ollama");

    recordStreamStart({
      streamId: "stream-2",
      providerId: "puter",
      modelId: "puter-gpt-5",
    });
    recordStreamAbort("stream-2");

    const snapshot = getRuntimeTelemetrySnapshot();

    expect(snapshot.streams).toMatchObject({
      started: 2,
      completed: 1,
      aborted: 1,
      abortRate: 0.5,
      lastDurationMs: 1000,
      averageDurationMs: 1000,
      lastThroughputPerSecond: 2,
      averageThroughputPerSecond: 2,
    });
    expect(snapshot.providers.latencyByProvider.puter).toMatchObject({
      count: 1,
      lastMs: 1000,
      averageMs: 1000,
    });
    expect(snapshot.providers.fallbacks).toMatchObject({
      count: 1,
      lastFromProvider: "puter",
      lastToProvider: "ollama",
    });
  });

  it("keeps render and viewport metrics bounded to recent diagnostics", () => {
    for (let index = 0; index < 70; index += 1) {
      recordRenderTiming("MessageList", index);
      recordViewportMetrics({
        width: 390,
        height: 844 - index,
        deviceType: "mobile",
        orientation: "portrait",
        visualViewportHeight: 700,
        keyboardInset: index,
      });
    }

    const snapshot = getRuntimeTelemetrySnapshot();

    expect(snapshot.render.recent).toHaveLength(50);
    expect(snapshot.render.byName.MessageList).toMatchObject({
      count: 70,
      lastMs: 69,
    });
    expect(snapshot.viewport.recent).toHaveLength(50);
    expect(snapshot.viewport.last).toMatchObject({
      width: 390,
      keyboardInset: 69,
      deviceType: "mobile",
    });
  });

  it("records structured runtime events with stream correlation and derived performance metrics", () => {
    recordStreamStart({
      streamId: "stream-1",
      providerId: "puter",
      modelId: "puter-claude-sonnet-4",
      runtimeModelId: "claude-sonnet-4",
      conversationId: "conversation-1",
      fallbackChain: ["puter-claude-sonnet-4", "ollama-llama-maverick"],
      retryCount: 1,
      reconnectCount: 2,
    });

    vi.setSystemTime(new Date("2026-05-13T08:00:00.250Z"));
    recordStreamChunk("stream-1", 4);
    vi.setSystemTime(new Date("2026-05-13T08:00:01.000Z"));
    recordFallback("puter", "ollama", {
      streamId: "stream-1",
      conversationId: "conversation-1",
      runtimeModelId: "claude-sonnet-4",
      fallbackChain: ["puter-claude-sonnet-4", "ollama-llama-maverick"],
    });
    recordRuntimeEvent({
      type: "retry_triggered",
      providerId: "puter",
      modelId: "puter-claude-sonnet-4",
      runtimeModelId: "claude-sonnet-4",
      streamId: "stream-1",
      conversationId: "conversation-1",
    });
    recordStreamComplete("stream-1");

    const snapshot = getRuntimeTelemetrySnapshot();

    expect(snapshot.streams.recent[0]).toMatchObject({
      streamId: "stream-1",
      providerId: "puter",
      modelId: "puter-claude-sonnet-4",
      runtimeModelId: "claude-sonnet-4",
      firstTokenLatencyMs: 250,
      retryCount: 1,
      reconnectCount: 2,
    });
    expect(snapshot.events.recent.map((event) => event.type)).toEqual([
      "stream_start",
      "provider_fallback",
      "retry_triggered",
      "stream_complete",
    ]);
    expect(snapshot.performance).toMatchObject({
      averageStreamLatencyMs: 1000,
      averageFirstTokenLatencyMs: 250,
      retryFrequency: 1,
      providerFailureRate: 0,
    });
  });
});
