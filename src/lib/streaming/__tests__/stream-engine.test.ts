import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIChunk } from "@/types";
import { clearClientErrors, getClientErrorSnapshot } from "@/lib/diagnostics/client-errors";
import { getChunkSequence, runStream, StreamEngine } from "@/lib/streaming/stream-engine";
import { getRuntimeTelemetrySnapshot, resetRuntimeTelemetry } from "@/lib/telemetry/runtimeTelemetry";

const callbacks = () => ({
  onChunk: vi.fn(),
  onBatch: vi.fn(),
  onDone: vi.fn(),
  onError: vi.fn(),
  onAbort: vi.fn(),
  onTimeout: vi.fn(),
});

async function flushRaf() {
  await vi.advanceTimersToNextTimerAsync();
}

describe("StreamEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
    clearClientErrors();
    resetRuntimeTelemetry();
  });

  it("coalesces text chunks, enriches ownership metadata, and reports diagnostics", async () => {
    const cbs = callbacks();
    const engine = new StreamEngine(cbs, { flushIntervalMs: 1 }, {
      streamId: "stream-1",
      conversationId: "conversation-1",
    });

    engine.start();
    engine.push({ type: "text", content: "A" });
    engine.push({ type: "text", content: "B" });
    await flushRaf();

    expect(cbs.onBatch).toHaveBeenCalledWith([
      {
        type: "text",
        content: "AB",
        metadata: { sequence: 1, streamId: "stream-1", conversationId: "conversation-1" },
      },
    ]);
    expect(engine.getBuffer()).toHaveLength(1);
    expect(engine.getDiagnostics()).toMatchObject({
      chunkCount: 2,
      bufferedCount: 1,
      pendingCount: 0,
      streamId: "stream-1",
      conversationId: "conversation-1",
      isRunning: true,
    });
  });

  it("drops duplicate sequence numbers", async () => {
    const cbs = callbacks();
    const engine = new StreamEngine(cbs, { coalesceText: false });
    const chunk: AIChunk = { type: "text", content: "once", metadata: { sequence: 2 } };

    engine.start();
    engine.push(chunk);
    engine.push({ ...chunk, content: "twice" });
    await flushRaf();

    expect(engine.getBuffer()).toEqual([
      { type: "text", content: "once", metadata: { sequence: 2 } },
    ]);
  });

  it("preserves chunk order while attaching stream ownership metadata", () => {
    const cbs = callbacks();
    const engine = new StreamEngine(
      cbs,
      { coalesceText: false },
      { streamId: "stream-a", conversationId: "conversation-a" }
    );

    engine.start();
    engine.push({ type: "text", content: "first", metadata: { sequence: 0 } });
    engine.push({ type: "reasoning", content: "thinking", metadata: { sequence: 1 } });
    engine.push({ type: "text", content: "second", metadata: { sequence: 2 } });
    engine.done();

    const flushed = cbs.onChunk.mock.calls.map(([chunk]) => chunk);
    expect(flushed.map((chunk) => chunk.content)).toEqual(["first", "thinking", "second"]);
    expect(flushed.map(getChunkSequence)).toEqual([0, 1, 2]);
    expect(flushed.every((chunk) => chunk.metadata?.streamId === "stream-a")).toBe(true);
    expect(flushed.every((chunk) => chunk.metadata?.conversationId === "conversation-a")).toBe(true);
  });

  it("flushes pending chunks on abort and ignores later chunks", () => {
    const cbs = callbacks();
    const engine = new StreamEngine(cbs, { coalesceText: false });

    engine.start();
    engine.push({ type: "text", content: "before abort" });
    engine.abort();
    engine.push({ type: "text", content: "after abort" });

    expect(cbs.onChunk.mock.calls.map(([chunk]) => chunk.content)).toEqual(["before abort"]);
    expect(cbs.onAbort).toHaveBeenCalledOnce();
    expect(cbs.onDone).not.toHaveBeenCalled();
    expect(engine.getIsRunning()).toBe(false);
    expect(engine.getBuffer().map((chunk) => chunk.content)).toEqual(["before abort"]);
  });

  it("aborts runStream when the abort signal is already set", async () => {
    const cbs = callbacks();
    const controller = new AbortController();
    controller.abort();

    async function* source() {
      yield { type: "text", content: "ignored" } satisfies AIChunk;
    }

    const result = await runStream(source(), cbs, controller.signal);

    expect(result).toEqual([]);
    expect(cbs.onAbort).toHaveBeenCalledOnce();
    expect(cbs.onDone).not.toHaveBeenCalled();
  });

  it("stops runStream before pushing chunks observed after abort", async () => {
    const cbs = callbacks();
    const controller = new AbortController();
    cbs.onBatch = vi.fn(() => {
      controller.abort();
    });

    async function* source() {
      yield { type: "text", content: "first" } satisfies AIChunk;
      yield { type: "text", content: "second" } satisfies AIChunk;
    }

    const result = await runStream(source(), cbs, controller.signal, {
      coalesceText: false,
      maxBufferSize: 1,
    });

    expect(cbs.onChunk.mock.calls.map(([chunk]) => chunk.content)).toEqual(["first"]);
    expect(result.map((chunk) => chunk.content)).toEqual(["first"]);
    expect(cbs.onAbort).toHaveBeenCalledOnce();
    expect(cbs.onDone).not.toHaveBeenCalled();
  });

  it("exposes chunk sequence metadata", () => {
    expect(getChunkSequence({ type: "status", content: "ok", metadata: { sequence: 12 } })).toBe(12);
    expect(getChunkSequence({ type: "status", content: "ok" })).toBeUndefined();
  });

  it("records stream telemetry for duration, throughput, and aborts", async () => {
    const cbs = callbacks();
    const engine = new StreamEngine(
      cbs,
      { coalesceText: false },
      {
        streamId: "stream-telemetry",
        conversationId: "conversation-telemetry",
        providerId: "puter",
        modelId: "puter-gpt-5",
      }
    );

    engine.start();
    engine.push({ type: "text", content: "hello" });
    vi.setSystemTime(new Date("2026-05-13T08:00:01.000Z"));
    engine.push({ type: "text", content: "world" });
    engine.done();

    const aborting = new StreamEngine(
      callbacks(),
      {},
      { streamId: "stream-abort", providerId: "puter", modelId: "puter-gpt-5" }
    );
    aborting.start();
    aborting.abort();

    expect(getRuntimeTelemetrySnapshot().streams).toMatchObject({
      started: 2,
      completed: 1,
      aborted: 1,
      lastDurationMs: 1000,
      lastThroughputPerSecond: 2,
    });
  });

  it("records stream engine failures with ownership context", () => {
    const cbs = callbacks();
    const engine = new StreamEngine(
      cbs,
      { coalesceText: false },
      {
        streamId: "stream-owned",
        conversationId: "conversation-owned",
        providerId: "puter",
        modelId: "gpt-4o",
      }
    );

    engine.start();
    engine.error(new Error("stream transport failed"));

    expect(getClientErrorSnapshot()[0]).toMatchObject({
      source: "stream",
      message: "stream transport failed",
      context: {
        providerId: "puter",
        modelId: "gpt-4o",
        streamId: "stream-owned",
        conversationId: "conversation-owned",
      },
    });
  });
});
