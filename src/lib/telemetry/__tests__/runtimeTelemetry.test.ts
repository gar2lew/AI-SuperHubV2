import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimeTelemetrySnapshot,
  recordFallback,
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
});
