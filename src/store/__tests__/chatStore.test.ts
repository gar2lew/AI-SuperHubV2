import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIChunk } from "@/types";
import { resetHealth } from "@/lib/providers/health";
import { useChatStore } from "@/store/chatStore";

function resetChatStore() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    isStreaming: false,
    streamEngine: null,
    abortController: null,
    currentStreamId: null,
  });
  useChatStore.persist.clearStorage();
}

async function flushRaf() {
  await vi.advanceTimersToNextTimerAsync();
}

function messageText(message: ReturnType<typeof useChatStore.getState>["conversations"][number]["messages"][number]) {
  return message.content
    .filter((part): part is Extract<typeof message.content[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

describe("chatStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    resetHealth("puter");
    resetChatStore();
  });

  it("creates a conversation and makes it active", () => {
    const id = useChatStore.getState().createConversation();
    const state = useChatStore.getState();

    expect(state.activeConversationId).toBe(id);
    expect(state.getActiveConversation()?.id).toBe(id);
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0]).toMatchObject({
      id,
      title: "New Conversation",
      providerId: "puter",
      presetId: "smart",
      modelId: "puter-claude-sonnet-4",
      messages: [],
    });
  });

  it("retargets activeConversationId after deleting the active conversation", () => {
    const firstId = useChatStore.getState().createConversation();
    vi.setSystemTime(new Date("2026-05-13T08:01:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.987654321);
    const secondId = useChatStore.getState().createConversation();

    useChatStore.getState().deleteConversation(secondId);

    expect(useChatStore.getState().activeConversationId).toBe(firstId);
    expect(useChatStore.getState().getActiveConversation()?.id).toBe(firstId);
  });

  it("uses the first user message as a trimmed conversation title", () => {
    const id = useChatStore.getState().createConversation();

    useChatStore.getState().addMessage(id, {
      role: "user",
      content: [{ type: "text", text: "  ## Build `stream` support with more than fifty four chars please  " }],
    });

    expect(useChatStore.getState().conversations[0].title).toBe(
      "Build stream support with more than fifty four char..."
    );
  });

  it("cleans up stream ownership when createConversation resets during an active stream", () => {
    const oldId = useChatStore.getState().createConversation();
    const controller = new AbortController();
    useChatStore.getState().setAbortController(controller);
    const oldStreamId = useChatStore.getState().startStreaming(oldId, "puter", "puter-gpt-5");

    const newId = useChatStore.getState().createConversation();
    const state = useChatStore.getState();

    expect(controller.signal.aborted).toBe(true);
    expect(state.activeConversationId).toBe(newId);
    expect(state.currentStreamId).toBeNull();
    expect(state.isStreaming).toBe(false);
    expect(state.streamEngine).toBeNull();
    expect(state.conversations.find((c) => c.id === oldId)?.streaming).toBeUndefined();
    expect(oldStreamId).not.toBe(state.currentStreamId);
  });

  it("ignores stale stream finalization and keeps the current stream owner intact", () => {
    const firstId = useChatStore.getState().createConversation();
    const firstStreamId = useChatStore.getState().startStreaming(firstId, "puter", "puter-gpt-5");
    vi.setSystemTime(new Date("2026-05-13T08:00:01.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.87654321);
    const secondId = useChatStore.getState().createConversation();
    const secondStreamId = useChatStore.getState().startStreaming(secondId, "puter", "puter-gpt-5");

    useChatStore.getState().finalizeStream(firstId, firstStreamId);

    const state = useChatStore.getState();
    expect(state.currentStreamId).toBe(secondStreamId);
    expect(state.isStreaming).toBe(true);
    expect(state.conversations.find((c) => c.id === secondId)?.streaming?.streamId).toBe(secondStreamId);
  });

  it("prevents stale stream batches from mutating the active stream or final message", async () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.111111111)
      .mockReturnValueOnce(0.222222222)
      .mockReturnValueOnce(0.333333333);
    const id = useChatStore.getState().createConversation();
    const firstStreamId = useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");
    const staleEngine = useChatStore.getState().streamEngine;

    useChatStore.getState().appendChunk({ type: "text", content: "stale" });
    const secondStreamId = useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");
    staleEngine?.push({ type: "text", content: "zombie" });
    staleEngine?.done();

    useChatStore.getState().appendChunk({ type: "text", content: "fresh" });
    await flushRaf();
    useChatStore.getState().finalizeStream(id, secondStreamId);

    const messages = useChatStore.getState().getMessages(id);
    expect(firstStreamId).not.toBe(secondStreamId);
    expect(messages).toHaveLength(1);
    expect(messageText(messages[0])).toBe("fresh");
    expect(useChatStore.getState().currentStreamId).toBeNull();
  });

  it("tracks streaming text, reasoning, diagnostics, and final assistant metadata", async () => {
    const id = useChatStore.getState().createConversation();
    const streamId = useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");

    useChatStore.getState().appendChunk({ type: "text", content: "Hello " });
    useChatStore.getState().appendChunk({ type: "reasoning", content: "thinking" });
    useChatStore.getState().appendChunk({ type: "text", content: "world" });
    await flushRaf();

    const streamingState = useChatStore.getState();
    expect(streamingState.getStreamText()).toBe("Hello world");
    expect(streamingState.getStreamReasoning()).toBe("thinking");
    expect(streamingState.streamEngine?.getDiagnostics()).toMatchObject({
      chunkCount: 3,
      bufferedCount: 3,
      pendingCount: 0,
      streamId,
      conversationId: id,
      isRunning: true,
    });

    vi.setSystemTime(new Date("2026-05-13T08:00:01.500Z"));
    useChatStore.getState().finalizeStream(id, streamId);

    const messages = useChatStore.getState().getMessages(id);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Hello world" }],
      metadata: {
        provider: "puter",
        model: "puter-gpt-5",
        latencyMs: 1500,
      },
    });
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().currentStreamId).toBeNull();
    expect(useChatStore.getState().conversations[0].streaming).toBeUndefined();
  });

  it("aborts and resets active stream state without adding an empty assistant message", () => {
    const id = useChatStore.getState().createConversation();
    const controller = new AbortController();
    useChatStore.getState().setAbortController(controller);
    useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");

    useChatStore.getState().stopStreaming();

    expect(controller.signal.aborted).toBe(true);
    expect(useChatStore.getState()).toMatchObject({
      isStreaming: false,
      streamEngine: null,
      abortController: null,
      currentStreamId: null,
    });
    expect(useChatStore.getState().getMessages(id)).toEqual([]);
    expect(useChatStore.getState().conversations[0].streaming).toBeUndefined();
  });

  it("aborts and clears ownership when rapidly stopping before starting a new stream", async () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.111111111)
      .mockReturnValueOnce(0.222222222)
      .mockReturnValueOnce(0.333333333);
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");
    const controller = new AbortController();
    useChatStore.getState().setAbortController(controller);

    useChatStore.getState().appendChunk({ type: "text", content: "partial" });
    useChatStore.getState().stopStreaming();

    expect(controller.signal.aborted).toBe(true);
    expect(useChatStore.getState().currentStreamId).toBeNull();
    expect(useChatStore.getState().streamEngine).toBeNull();
    expect(useChatStore.getState().conversations[0].streaming).toBeUndefined();

    const nextStreamId = useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");
    useChatStore.getState().appendChunk({ type: "text", content: "after restart" });
    await flushRaf();
    useChatStore.getState().finalizeStream(id, nextStreamId);

    const messages = useChatStore.getState().getMessages(id);
    expect(messages).toHaveLength(1);
    expect(messageText(messages[0])).toBe("after restart");
  });

  it("aborts the owned stream when switching conversations", async () => {
    const firstId = useChatStore.getState().createConversation();
    vi.setSystemTime(new Date("2026-05-13T08:01:00.000Z"));
    const secondId = useChatStore.getState().createConversation();
    useChatStore.getState().setActiveConversation(firstId);
    useChatStore.getState().startStreaming(firstId, "puter", "puter-gpt-5");
    const controller = new AbortController();
    useChatStore.getState().setAbortController(controller);

    useChatStore.getState().appendChunk({ type: "text", content: "do not keep" });
    useChatStore.getState().setActiveConversation(secondId);
    await flushRaf();

    expect(controller.signal.aborted).toBe(true);
    expect(useChatStore.getState().activeConversationId).toBe(secondId);
    expect(useChatStore.getState().currentStreamId).toBeNull();
    expect(useChatStore.getState().streamEngine).toBeNull();
    expect(useChatStore.getState().conversations.find((c) => c.id === firstId)?.streaming).toBeUndefined();
    expect(useChatStore.getState().getMessages(firstId)).toHaveLength(0);
  });

  it("deduplicates sequenced chunks before finalization", async () => {
    const id = useChatStore.getState().createConversation();
    const streamId = useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");
    const duplicate: AIChunk = { type: "text", content: "same", metadata: { sequence: 7 } };

    useChatStore.getState().appendChunk(duplicate);
    useChatStore.getState().appendChunk(duplicate);
    await flushRaf();
    useChatStore.getState().finalizeStream(id, streamId);

    expect(useChatStore.getState().getMessages(id)[0].content).toEqual([{ type: "text", text: "same" }]);
  });

  it("keeps fallback status chunks in the stream buffer but excludes them from finalized content", async () => {
    const id = useChatStore.getState().createConversation();
    const streamId = useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");

    useChatStore.getState().appendChunk({ type: "status", content: "fallback: Backup Provider" });
    useChatStore.getState().appendChunk({ type: "text", content: "fallback answer" });
    await flushRaf();

    expect(useChatStore.getState().conversations[0].streaming?.buffer.map((chunk) => chunk.type)).toEqual([
      "status",
      "text",
    ]);

    useChatStore.getState().finalizeStream(id, streamId);
    const messages = useChatStore.getState().getMessages(id);
    expect(messages).toHaveLength(1);
    expect(messageText(messages[0])).toBe("fallback answer");
  });

  it("drops duplicate and out-of-order sequenced chunks within a batch", async () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");
    const chunks: AIChunk[] = [
      { type: "text", content: "first", metadata: { sequence: 0 } },
      { type: "status", content: "checkpoint", metadata: { sequence: 2 } },
      { type: "text", content: "late", metadata: { sequence: 1 } },
      { type: "text", content: "duplicate", metadata: { sequence: 2 } },
      { type: "text", content: "third", metadata: { sequence: 3 } },
    ];

    for (const chunk of chunks) {
      useChatStore.getState().appendChunk(chunk);
    }
    await flushRaf();

    const streaming = useChatStore.getState().conversations[0].streaming;
    expect(streaming?.buffer.map((chunk) => chunk.content)).toEqual(["first", "checkpoint", "third"]);
    expect(streaming?.lastSequence).toBe(3);
  });
});
