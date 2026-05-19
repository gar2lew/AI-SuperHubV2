import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIChunk } from "@/types";
import { resetHealth } from "@/lib/providers/health";
import { getRuntimeTelemetrySnapshot, resetRuntimeTelemetry } from "@/lib/telemetry/runtimeTelemetry";
import { serializeContentForPersistence, sanitizeHydratedChatState, useChatStore } from "@/store/chatStore";

function resetChatStore() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    drafts: {},
    isStreaming: false,
    streamEngine: null,
    abortController: null,
    currentStreamId: null,
    activeStream: null,
    lastStream: null,
    activeExecutionId: null,
    executionsById: {},
    pipelinesById: {},
    contextFramesById: {},
    activeContextFrameId: null,
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
    resetRuntimeTelemetry();
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

  it("archives and reopens conversations without orphaning the active conversation", () => {
    const firstId = useChatStore.getState().createConversation();
    vi.setSystemTime(new Date("2026-05-13T08:01:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.987654321);
    const secondId = useChatStore.getState().createConversation();

    useChatStore.getState().archiveConversation(secondId);

    expect(useChatStore.getState().activeConversationId).toBe(firstId);
    expect(useChatStore.getState().conversations.find((c) => c.id === secondId)?.archivedAt).toBe(Date.now());

    useChatStore.getState().reopenConversation(secondId);

    expect(useChatStore.getState().activeConversationId).toBe(secondId);
    expect(useChatStore.getState().conversations.find((c) => c.id === secondId)?.archivedAt).toBeUndefined();
  });

  it("stores lightweight conversation summaries and metadata", () => {
    const id = useChatStore.getState().createConversation();

    useChatStore.getState().updateConversationMetadata(id, {
      summary: "Planning notes for persistent context.",
      tags: ["planning", " continuity ", ""],
    });

    expect(useChatStore.getState().conversations[0]).toMatchObject({
      summary: "Planning notes for persistent context.",
      tags: ["planning", "continuity"],
    });
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

  it("repairs hydrated chat state with stale active ids and leftover streaming state", () => {
    const repaired = sanitizeHydratedChatState({
      activeConversationId: "missing-conversation",
      activeStream: {
        streamId: "active-stream",
        conversationId: "kept-conversation",
        executionId: "exec-active",
        lifecycle: "streaming",
        providerId: "puter",
        modelId: "puter-gpt-5",
        runtimeModelId: "gpt-5",
        startedAt: 1,
        updatedAt: 2,
        recoveryReason: "reload",
        status: "Generating",
        partialText: "partial text",
        timeline: [{ type: "thinking", at: 1, providerId: "puter", modelId: "puter-gpt-5" }],
      },
      activeExecutionId: "exec-active",
      executionsById: {
        "exec-active": {
          executionId: "exec-active",
          messageId: "assistant-message-active",
          providerId: "puter",
          modelId: "puter-gpt-5",
          lifecycle: "streaming",
          startedAt: 1,
          updatedAt: 2,
          retryCount: 0,
          partialText: "partial text",
          timeline: [{ executionId: "exec-active", type: "thinking", at: 1, providerId: "puter", modelId: "puter-gpt-5" }],
        },
      },
      conversations: [
        {
          id: "kept-conversation",
          title: "Persisted",
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          presetId: "smart",
          providerId: "puter",
          modelId: "puter-gpt-5",
          streaming: {
            isActive: true,
            buffer: [{ type: "text", content: "volatile" }],
            startedAt: 1,
            providerId: "puter",
            modelId: "puter-gpt-5",
            runtimeModelId: "gpt-5",
            retryPrompt: "resume me",
            streamId: "old-stream",
          },
        },
      ],
    });

    expect(repaired.activeConversationId).toBe("kept-conversation");
    expect(repaired.conversations?.[0].streaming).toBeUndefined();
    expect(repaired.conversations?.[0].recovery).toMatchObject({
      status: "interrupted",
      streamId: "active-stream",
      providerId: "puter",
      modelId: "puter-gpt-5",
    });
    expect(repaired.lastStream).toMatchObject({
      lifecycle: "interrupted",
      partialText: "partial text",
    });
    expect(repaired.activeExecutionId).toBeNull();
    expect(repaired.executionsById?.["exec-active"]).toMatchObject({
      lifecycle: "interrupted",
      partialText: "partial text",
      metadata: { recoveryReason: "reload" },
    });
    expect(repaired).toMatchObject({
      isStreaming: false,
      activeStream: null,
      streamEngine: null,
      abortController: null,
      currentStreamId: null,
    });
  });

  it("preserves draft text and attachment metadata across persistence without browser File handles", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().setDraft(id, {
      text: "resume this thought",
      attachments: [
        {
          name: "notes.md",
          mimeType: "text/markdown",
          size: 42,
          lastModified: 123,
        },
      ],
    });

    const repaired = sanitizeHydratedChatState({
      activeConversationId: id,
      conversations: useChatStore.getState().conversations,
      drafts: useChatStore.getState().drafts,
    });

    expect(repaired.drafts?.[id]).toEqual({
      text: "resume this thought",
      updatedAt: Date.now(),
      attachments: [
        {
          name: "notes.md",
          mimeType: "text/markdown",
          size: 42,
          lastModified: 123,
          persistenceState: "metadata-only",
        },
      ],
    });
  });

  it("serializes message attachments into durable metadata-only references", () => {
    const file = new File(["hello"], "hello.txt", {
      type: "text/plain",
      lastModified: 456,
    });

    expect(serializeContentForPersistence([
      { type: "text", text: "attached" },
      { type: "file", file, name: "hello.txt", mimeType: "text/plain" },
      { type: "image", file, url: "blob:preview", mimeType: "image/png" },
    ])).toEqual([
      { type: "text", text: "attached" },
      {
        type: "file",
        name: "hello.txt",
        mimeType: "text/plain",
        size: 5,
        lastModified: 456,
        persistenceState: "metadata-only",
      },
      {
        type: "image",
        name: "hello.txt",
        url: "blob:preview",
        mimeType: "image/png",
        size: 5,
        lastModified: 456,
        persistenceState: "metadata-only",
      },
    ]);
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
    useChatStore.getState().stopStreaming();
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
    useChatStore.getState().stopStreaming();
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
    const executionId = useChatStore.getState().activeExecutionId;

    expect(executionId).toMatch(/^exec-/);
    expect(useChatStore.getState().executionsById[executionId!]).toMatchObject({
      executionId,
      lifecycle: "thinking",
      providerId: "puter",
      modelId: "puter-gpt-5",
      retryCount: 0,
    });
    expect(useChatStore.getState().executionsById[executionId!].messageId).not.toBe(executionId);
    expect(useChatStore.getState().getStreamLifecycle()).toBe("thinking");
    expect(useChatStore.getState().getStreamTimeline().map((event) => event.type)).toEqual(["thinking"]);

    useChatStore.getState().appendChunk({ type: "text", content: "Hello " });
    useChatStore.getState().appendChunk({ type: "reasoning", content: "thinking" });
    useChatStore.getState().appendChunk({ type: "text", content: "world" });
    await flushRaf();

    const streamingState = useChatStore.getState();
    expect(streamingState.getStreamLifecycle()).toBe("streaming");
    expect(streamingState.getActiveExecution()?.partialText).toBe("Hello world");
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
    expect(messages[0].id).toBe(useChatStore.getState().executionsById[executionId!].messageId);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Hello world" }],
      metadata: {
        executionId,
        provider: "puter",
        model: "puter-gpt-5",
        latencyMs: 1500,
      },
    });
    expect(useChatStore.getState().activeExecutionId).toBeNull();
    expect(useChatStore.getState().executionsById[executionId!]).toMatchObject({
      lifecycle: "completed",
      completedAt: Date.now(),
      partialText: "Hello world",
    });
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().currentStreamId).toBeNull();
    expect(useChatStore.getState().activeStream).toBeNull();
    expect(useChatStore.getState().lastStream).toMatchObject({
      streamId,
      lifecycle: "completed",
      partialText: "Hello world",
    });
    expect(useChatStore.getState().lastStream?.timeline.map((event) => event.type)).toEqual([
      "thinking",
      "streaming",
      "completed",
    ]);
    expect(useChatStore.getState().conversations[0].streaming).toBeUndefined();
    expect(getRuntimeTelemetrySnapshot().streams).toMatchObject({
      started: 1,
      completed: 1,
      active: 0,
    });
  });

  it("creates capability-aware chat generation executions by default", () => {
    const executionId = useChatStore.getState().createExecution({
      messageId: "assistant-message-capability",
      providerId: "puter",
      modelId: "puter-gpt-5",
    });

    const execution = useChatStore.getState().executionsById[executionId];
    expect(execution).toMatchObject({
      capability: "chat-generation",
      messageId: "assistant-message-capability",
    });
    expect(execution.timeline[0]).toMatchObject({
      executionId,
      capability: "chat-generation",
      type: "thinking",
      providerId: "puter",
      modelId: "puter-gpt-5",
    });
  });

  it("keeps retrieval capability metadata isolated from assistant messages", () => {
    const conversationId = useChatStore.getState().createConversation();
    const executionId = useChatStore.getState().createRetrievalExecution({
      messageId: "assistant-message-retrieval",
      retrievalSourceCount: 4,
      retrievalLatency: 125,
    });

    useChatStore.getState().addMessage(conversationId, {
      id: "assistant-message-retrieval",
      role: "assistant",
      content: [{ type: "text", text: "retrieval-informed answer" }],
      metadata: { executionId },
    });

    const execution = useChatStore.getState().executionsById[executionId];
    const message = useChatStore.getState().getMessages(conversationId)[0];
    expect(execution).toMatchObject({
      capability: "context-retrieval",
      capabilityMetadata: {
        retrievalSourceCount: 4,
        retrievalLatency: 125,
      },
    });
    expect(message.metadata).toEqual({ executionId });
  });

  it("creates tool execution placeholders with capability-safe status rendering", () => {
    const executionId = useChatStore.getState().createToolExecution({
      messageId: "assistant-message-tool",
      toolName: "workspace.lookup",
      toolStatus: "running",
    });

    expect(useChatStore.getState().executionsById[executionId]).toMatchObject({
      capability: "tool-call",
      capabilityMetadata: {
        toolName: "workspace.lookup",
        toolStatus: "running",
      },
    });
    expect(useChatStore.getState().getExecutionStatus(executionId)).toBe("Calling tool...");
  });

  it("filters executions by capability and returns the latest execution for a message", () => {
    const firstId = useChatStore.getState().createExecution({
      messageId: "assistant-message-filtered",
      capability: "workspace-analysis",
      capabilityMetadata: { workspaceId: "workspace-1", analysisScope: "summary" },
    });
    vi.setSystemTime(new Date("2026-05-13T08:00:02.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.987654321);
    const secondId = useChatStore.getState().createExecution({
      messageId: "assistant-message-filtered",
      capability: "workspace-analysis",
      capabilityMetadata: { workspaceId: "workspace-1", analysisScope: "files" },
    });

    expect(useChatStore.getState().getExecutionsByCapability("workspace-analysis").map((execution) => execution.executionId)).toEqual([
      firstId,
      secondId,
    ]);
    expect(useChatStore.getState().getLatestExecutionForMessage("assistant-message-filtered")?.executionId).toBe(secondId);
  });

  it("preserves capability lineage and metadata across retries", () => {
    const parentId = useChatStore.getState().createRetrievalExecution({
      messageId: "assistant-message-retry-capability",
      retrievalSourceCount: 2,
      retrievalLatency: 90,
    });
    useChatStore.getState().failExecution(parentId, "provider");

    const retryId = useChatStore.getState().retryExecution(parentId);

    expect(useChatStore.getState().executionsById[retryId]).toMatchObject({
      parentExecutionId: parentId,
      messageId: "assistant-message-retry-capability",
      capability: "context-retrieval",
      capabilityMetadata: {
        retrievalSourceCount: 2,
        retrievalLatency: 90,
      },
      retryCount: 1,
    });
  });

  it("returns capability-aware execution timelines for inspection", () => {
    const executionId = useChatStore.getState().createToolExecution({
      toolName: "workspace.lookup",
      toolStatus: "pending",
    });

    useChatStore.getState().beginStreaming();

    expect(useChatStore.getState().getExecutionTimeline(executionId)).toEqual([
      expect.objectContaining({
        executionId,
        capability: "tool-call",
        type: "thinking",
        capabilityMetadata: {
          toolName: "workspace.lookup",
          toolStatus: "pending",
        },
      }),
      expect.objectContaining({
        executionId,
        capability: "tool-call",
        type: "streaming",
      }),
    ]);
  });

  it("creates child executions with parent linkage and inherited group ownership", () => {
    const parentId = useChatStore.getState().createRetrievalExecution({
      messageId: "assistant-message-chain",
      retrievalSourceCount: 3,
    });

    const childId = useChatStore.getState().createChildExecution(parentId, {
      capability: "chat-generation",
      messageId: "assistant-message-chain",
    });

    expect(useChatStore.getState().executionsById[parentId]).toMatchObject({
      childExecutionIds: [childId],
    });
    expect(useChatStore.getState().executionsById[childId]).toMatchObject({
      parentExecutionId: parentId,
      groupId: parentId,
      capability: "chat-generation",
      messageId: "assistant-message-chain",
    });
    expect(useChatStore.getState().getExecutionParent(childId)?.executionId).toBe(parentId);
    expect(useChatStore.getState().getExecutionChildren(parentId).map((execution) => execution.executionId)).toEqual([childId]);
  });

  it("preserves deterministic dependency metadata without duplicate attachment", () => {
    const retrievalId = useChatStore.getState().createRetrievalExecution();
    const analysisId = useChatStore.getState().createWorkspaceExecution({
      workspaceId: "workspace-1",
      analysisScope: "retrieved-documents",
    });
    const toolId = useChatStore.getState().createToolExecution({
      toolName: "workspace.lookup",
      toolStatus: "pending",
    });

    useChatStore.getState().attachExecutionDependency(analysisId, retrievalId);
    useChatStore.getState().attachExecutionDependency(toolId, analysisId);
    useChatStore.getState().attachExecutionDependency(toolId, analysisId);

    expect(useChatStore.getState().executionsById[analysisId].dependencyExecutionIds).toEqual([retrievalId]);
    expect(useChatStore.getState().executionsById[toolId].dependencyExecutionIds).toEqual([analysisId]);
  });

  it("returns deterministic grouped execution graphs and descendants", () => {
    const rootId = useChatStore.getState().createExecution({
      capability: "context-retrieval",
      groupId: "group-compose-1",
    });
    const analysisId = useChatStore.getState().createChildExecution(rootId, {
      capability: "workspace-analysis",
    });
    const synthesisId = useChatStore.getState().createChildExecution(analysisId, {
      capability: "chat-generation",
    });

    const graph = useChatStore.getState().getExecutionGraph(rootId);

    expect(graph).toMatchObject({
      executionId: rootId,
      capability: "context-retrieval",
      groupId: "group-compose-1",
      children: [
        {
          executionId: analysisId,
          capability: "workspace-analysis",
          children: [
            {
              executionId: synthesisId,
              capability: "chat-generation",
            },
          ],
        },
      ],
    });
    expect(useChatStore.getState().getExecutionDescendants(rootId).map((execution) => execution.executionId)).toEqual([
      analysisId,
      synthesisId,
    ]);
  });

  it("preserves retry lineage inside execution graphs without corrupting children", () => {
    const rootId = useChatStore.getState().createExecution({
      capability: "context-retrieval",
      groupId: "group-retry-1",
    });
    const childId = useChatStore.getState().createChildExecution(rootId, {
      capability: "workspace-analysis",
    });
    useChatStore.getState().failExecution(childId, "provider");

    const retryId = useChatStore.getState().retryExecution(childId);

    expect(useChatStore.getState().executionsById[retryId]).toMatchObject({
      parentExecutionId: childId,
      groupId: "group-retry-1",
      capability: "workspace-analysis",
      retryCount: 1,
    });
    expect(useChatStore.getState().executionsById[rootId].childExecutionIds).toEqual([childId]);
    expect(useChatStore.getState().executionsById[childId].childExecutionIds).toEqual([retryId]);
  });

  it("prevents circular parent and dependency graph references", () => {
    const rootId = useChatStore.getState().createExecution({ capability: "context-retrieval" });
    const childId = useChatStore.getState().createChildExecution(rootId, { capability: "workspace-analysis" });

    expect(() => useChatStore.getState().attachExecutionParent(rootId, childId)).toThrow("circular execution graph");
    expect(() => useChatStore.getState().attachExecutionDependency(rootId, rootId)).toThrow("invalid execution dependency");
    useChatStore.getState().attachExecutionDependency(childId, rootId);
    expect(() => useChatStore.getState().attachExecutionDependency(rootId, childId)).toThrow("circular execution dependency");
  });

  it("prevents concurrent active stream ownership from being created directly", () => {
    const conversationId = useChatStore.getState().createConversation();
    const firstStreamId = useChatStore.getState().startStreaming(conversationId, "puter", "puter-gpt-5");

    expect(() => useChatStore.getState().startStreaming(conversationId, "puter", "puter-gpt-5")).toThrow(
      /stream already active/i
    );
    expect(useChatStore.getState().getCurrentStreamId()).toBe(firstStreamId);
    expect(useChatStore.getState().isStreaming).toBe(true);
  });

  it("repairs hydrated execution graph references safely", () => {
    const repaired = sanitizeHydratedChatState({
      executionsById: {
        "exec-root": {
          executionId: "exec-root",
          messageId: "message-root",
          capability: "context-retrieval",
          lifecycle: "completed",
          startedAt: 1,
          updatedAt: 2,
          retryCount: 0,
          childExecutionIds: ["exec-child", "missing-child", "exec-child"],
          dependencyExecutionIds: ["missing-dependency"],
          timeline: [{ executionId: "exec-root", type: "completed", at: 2 }],
        },
        "exec-child": {
          executionId: "exec-child",
          messageId: "message-root",
          parentExecutionId: "exec-root",
          capability: "workspace-analysis",
          lifecycle: "completed",
          startedAt: 2,
          updatedAt: 3,
          retryCount: 0,
          timeline: [{ executionId: "exec-child", type: "completed", at: 3 }],
        },
        "exec-orphan": {
          executionId: "exec-orphan",
          messageId: "message-orphan",
          parentExecutionId: "missing-parent",
          capability: "tool-call",
          lifecycle: "interrupted",
          startedAt: 3,
          updatedAt: 4,
          retryCount: 0,
          timeline: [{ executionId: "exec-orphan", type: "interrupted", at: 4 }],
        },
      },
      conversations: [],
    });

    expect(repaired.executionsById?.["exec-root"]).toMatchObject({
      childExecutionIds: ["exec-child"],
      dependencyExecutionIds: [],
    });
    expect(repaired.executionsById?.["exec-child"]).toMatchObject({
      parentExecutionId: "exec-root",
    });
    expect(repaired.executionsById?.["exec-orphan"]).toMatchObject({
      parentExecutionId: null,
    });
  });

  it("records deterministic execution trace ordering and summary duration", () => {
    const executionId = useChatStore.getState().createExecution({
      messageId: "assistant-message-observed",
      capability: "chat-generation",
      providerId: "puter",
      modelId: "puter-gpt-5",
    });
    vi.setSystemTime(new Date("2026-05-13T08:00:02.000Z"));
    useChatStore.getState().completeExecution(executionId, "done");

    expect(useChatStore.getState().getExecutionTrace(executionId).map((event) => event.eventType)).toEqual([
      "created",
      "started",
      "completed",
    ]);
    expect(useChatStore.getState().getExecutionSummary(executionId)).toMatchObject({
      executionId,
      capability: "chat-generation",
      lifecycle: "completed",
      durationMs: 2000,
      retryCount: 0,
      childExecutionCount: 0,
      dependencyCount: 0,
      fallbackCount: 0,
      interruptionCount: 0,
      recoveryCount: 0,
    });
  });

  it("records fallback observability in order without assistant content contamination", async () => {
    const conversationId = useChatStore.getState().createConversation();
    const streamId = useChatStore.getState().startStreaming(conversationId, "puter", "puter-gpt-5");
    const executionId = useChatStore.getState().activeExecutionId!;

    vi.setSystemTime(new Date("2026-05-13T08:00:01.000Z"));
    useChatStore.getState().beginFallback("backup", "OpenAI timed out, switching to Backup Provider...");
    useChatStore.getState().appendChunk({ type: "text", content: "clean answer" });
    await flushRaf();
    useChatStore.getState().finalizeStream(conversationId, streamId);

    expect(useChatStore.getState().getExecutionTrace(executionId).map((event) => event.eventType)).toEqual([
      "created",
      "started",
      "fallback",
      "status",
      "completed",
    ]);
    expect(useChatStore.getState().getExecutionSummary(executionId)).toMatchObject({
      fallbackCount: 1,
      fallbackLatencyMs: 1000,
    });
    expect(messageText(useChatStore.getState().getMessages(conversationId)[0])).toBe("clean answer");
  });

  it("summarizes execution graphs deterministically for orchestration inspection", () => {
    const rootId = useChatStore.getState().createExecution({
      capability: "context-retrieval",
      groupId: "group-observe-1",
    });
    const analysisId = useChatStore.getState().createChildExecution(rootId, {
      capability: "workspace-analysis",
    });
    const synthesisId = useChatStore.getState().createChildExecution(analysisId, {
      capability: "chat-generation",
    });
    useChatStore.getState().attachExecutionDependency(synthesisId, rootId);

    expect(useChatStore.getState().getExecutionGraphSummary(rootId)).toMatchObject({
      rootExecutionId: rootId,
      groupId: "group-observe-1",
      totalExecutions: 3,
      capabilities: ["context-retrieval", "workspace-analysis", "chat-generation"],
      dependencyEdges: [{ fromExecutionId: synthesisId, dependsOnExecutionId: rootId }],
      stages: [
        { executionId: rootId, depth: 0, capability: "context-retrieval" },
        { executionId: analysisId, depth: 1, capability: "workspace-analysis" },
        { executionId: synthesisId, depth: 2, capability: "chat-generation" },
      ],
    });
  });

  it("preserves retry trace continuity across execution lineage", () => {
    const parentId = useChatStore.getState().createExecution({
      messageId: "assistant-message-observed-retry",
      capability: "workspace-analysis",
    });
    useChatStore.getState().failExecution(parentId, "provider");

    const retryId = useChatStore.getState().retryExecution(parentId);

    expect(useChatStore.getState().getExecutionTrace(parentId).map((event) => event.eventType)).toEqual([
      "created",
      "started",
      "failed",
      "retry-initiated",
    ]);
    expect(useChatStore.getState().getExecutionTrace(retryId)[0]).toMatchObject({
      eventType: "created",
      executionId: retryId,
      metadata: { parentExecutionId: parentId },
    });
    expect(useChatStore.getState().getExecutionSummary(retryId)).toMatchObject({
      parentExecutionId: parentId,
      retryCount: 1,
    });
  });

  it("traces interruption and recovery timing in active execution snapshots", () => {
    const executionId = useChatStore.getState().createToolExecution({
      toolName: "workspace.lookup",
      toolStatus: "running",
    });

    vi.setSystemTime(new Date("2026-05-13T08:00:03.000Z"));
    useChatStore.getState().interruptExecution(executionId, "network");
    vi.setSystemTime(new Date("2026-05-13T08:00:05.000Z"));
    useChatStore.getState().recoverExecution(executionId, "manual retry accepted");

    expect(useChatStore.getState().getExecutionTrace(executionId).map((event) => event.eventType)).toEqual([
      "created",
      "started",
      "interrupted",
      "recovered",
    ]);
    expect(useChatStore.getState().getActiveExecutionSummary()).toMatchObject({
      executionId,
      lifecycle: "recovered",
      interruptionCount: 1,
      recoveryCount: 1,
      timeToRecoveryMs: 5000,
    });
    expect(useChatStore.getState().getExecutionStatusSnapshot()).toMatchObject({
      activeExecutionId: executionId,
      activeLifecycle: "recovered",
      totalExecutions: 1,
      runningExecutions: 1,
      failedExecutions: 0,
      interruptedExecutions: 0,
    });
  });

  it("denies retries past policy limits and records governance violations", () => {
    const executionId = useChatStore.getState().createExecution({
      capability: "chat-generation",
      policy: { maxRetries: 0 },
    });
    useChatStore.getState().failExecution(executionId, "provider");

    expect(useChatStore.getState().canRetryExecution(executionId)).toMatchObject({
      allowed: false,
      reason: "retry limit exceeded",
    });
    expect(() => useChatStore.getState().retryExecution(executionId)).toThrow("retry limit exceeded");
    expect(useChatStore.getState().getGovernanceViolations(executionId)).toEqual([
      expect.objectContaining({
        eventType: "governance-denied",
        metadata: { action: "retry", reason: "retry limit exceeded" },
      }),
    ]);
  });

  it("enforces execution timeout policies deterministically", () => {
    const executionId = useChatStore.getState().createToolExecution({
      toolName: "workspace.lookup",
      toolStatus: "running",
      policy: { maxExecutionDurationMs: 1000 },
    });

    vi.setSystemTime(new Date("2026-05-13T08:00:02.000Z"));
    expect(useChatStore.getState().hasExceededExecutionBudget(executionId)).toBe(true);
    useChatStore.getState().enforceExecutionTimeout(executionId);

    expect(useChatStore.getState().executionsById[executionId]).toMatchObject({
      lifecycle: "failed",
      metadata: { recoveryReason: "timeout-policy" },
    });
    expect(useChatStore.getState().getExecutionTrace(executionId).map((event) => event.eventType)).toEqual([
      "created",
      "started",
      "governance-timeout",
      "failed",
    ]);
  });

  it("enforces child execution limits without orphaning graph state", () => {
    const rootId = useChatStore.getState().createExecution({
      capability: "context-retrieval",
      policy: { maxChildExecutions: 1 },
    });
    const childId = useChatStore.getState().createChildExecution(rootId, { capability: "workspace-analysis" });

    expect(useChatStore.getState().canCreateChildExecution(rootId)).toEqual({ allowed: false, reason: "child execution limit exceeded" });
    expect(() => useChatStore.getState().createChildExecution(rootId, { capability: "tool-call" })).toThrow("child execution limit exceeded");
    expect(useChatStore.getState().getExecutionChildren(rootId).map((execution) => execution.executionId)).toEqual([childId]);
    expect(useChatStore.getState().getGovernanceViolations(rootId).at(-1)).toMatchObject({
      metadata: { action: "create-child", reason: "child execution limit exceeded" },
    });
  });

  it("enforces dependency depth limits and keeps dependency graphs stable", () => {
    const rootId = useChatStore.getState().createExecution({
      capability: "context-retrieval",
      policy: { maxDependencyDepth: 1 },
    });
    const dependencyA = useChatStore.getState().createExecution({ capability: "workspace-analysis" });
    const dependencyB = useChatStore.getState().createExecution({ capability: "tool-call" });
    useChatStore.getState().attachExecutionDependency(dependencyA, dependencyB);

    expect(useChatStore.getState().hasExceededDepthLimit(rootId, dependencyA)).toBe(true);
    expect(useChatStore.getState().canAttachDependency(rootId, dependencyA)).toEqual({
      allowed: false,
      reason: "dependency depth limit exceeded",
    });
    expect(() => useChatStore.getState().attachExecutionDependency(rootId, dependencyA)).toThrow("dependency depth limit exceeded");
    expect(useChatStore.getState().executionsById[rootId].dependencyExecutionIds).toEqual([]);
  });

  it("records governance events for circular dependency rejection", () => {
    const rootId = useChatStore.getState().createExecution({ capability: "context-retrieval" });
    const childId = useChatStore.getState().createChildExecution(rootId, { capability: "workspace-analysis" });
    useChatStore.getState().attachExecutionDependency(childId, rootId);

    expect(() => useChatStore.getState().attachExecutionDependency(rootId, childId)).toThrow("circular execution dependency");
    expect(useChatStore.getState().getGovernanceViolations(rootId).at(-1)).toMatchObject({
      metadata: { action: "attach-dependency", reason: "circular execution dependency" },
    });
    expect(useChatStore.getState().getExecutionGraphSummary(rootId)?.dependencyEdges).toEqual([
      { fromExecutionId: childId, dependsOnExecutionId: rootId },
    ]);
  });

  it("summarizes execution policy and budget state", () => {
    const executionId = useChatStore.getState().createExecution({
      capability: "workspace-analysis",
      policy: {
        maxRetries: 2,
        maxExecutionDurationMs: 5000,
        maxChildExecutions: 3,
        maxDependencyDepth: 2,
        allowCapabilityFallback: false,
        allowParallelChildren: false,
      },
    });
    useChatStore.getState().createChildExecution(executionId, { capability: "chat-generation" });

    expect(useChatStore.getState().getExecutionPolicySummary(executionId)).toMatchObject({
      executionId,
      policy: {
        maxRetries: 2,
        maxExecutionDurationMs: 5000,
        maxChildExecutions: 3,
        maxDependencyDepth: 2,
        allowCapabilityFallback: false,
        allowParallelChildren: false,
      },
    });
    expect(useChatStore.getState().getExecutionBudgetSummary(executionId)).toMatchObject({
      executionId,
      retryCount: 0,
      childExecutionCount: 1,
      dependencyDepth: 0,
      fallbackCount: 0,
      exceeded: false,
    });
  });

  it("blocks synthesis until retrieval dependency completes", () => {
    const retrievalId = useChatStore.getState().createRetrievalExecution({
      messageId: "assistant-message-scheduled",
    });
    const synthesisId = useChatStore.getState().createExecution({
      messageId: "assistant-message-scheduled",
      capability: "chat-generation",
      dependencyExecutionIds: [retrievalId],
    });

    expect(useChatStore.getState().isExecutionReady(synthesisId)).toBe(false);
    expect(useChatStore.getState().executionsById[synthesisId]).toMatchObject({
      schedulingState: "waiting",
      waitingOnExecutionIds: [retrievalId],
    });
    expect(useChatStore.getState().getBlockedExecutions().map((execution) => execution.executionId)).toEqual([synthesisId]);

    useChatStore.getState().completeExecution(retrievalId, "context");
    useChatStore.getState().resolveExecutionDependency(synthesisId, retrievalId);

    expect(useChatStore.getState().isExecutionReady(synthesisId)).toBe(true);
    expect(useChatStore.getState().executionsById[synthesisId]).toMatchObject({
      schedulingState: "ready",
      waitingOnExecutionIds: [],
    });
  });

  it("schedules executions with deterministic priority ordering", () => {
    const lowId = useChatStore.getState().createExecution({ capability: "workspace-analysis", priority: "low" });
    const criticalId = useChatStore.getState().createExecution({ capability: "chat-generation", priority: "critical" });
    const highId = useChatStore.getState().createExecution({ capability: "tool-call", priority: "high" });

    useChatStore.getState().scheduleExecution(lowId);
    useChatStore.getState().scheduleExecution(criticalId);
    useChatStore.getState().scheduleExecution(highId);

    expect(useChatStore.getState().getExecutionPriorityQueue().map((execution) => execution.executionId)).toEqual([
      criticalId,
      highId,
      lowId,
    ]);
    expect(useChatStore.getState().getPriorityDistribution()).toEqual({
      critical: 1,
      high: 1,
      normal: 0,
      low: 1,
    });
  });

  it("marks executions waiting and rejects circular wait chains", () => {
    const firstId = useChatStore.getState().createExecution({ capability: "context-retrieval" });
    const secondId = useChatStore.getState().createExecution({ capability: "workspace-analysis" });

    useChatStore.getState().markExecutionWaiting(secondId, [firstId]);

    expect(useChatStore.getState().executionsById[secondId]).toMatchObject({
      schedulingState: "waiting",
      waitingOnExecutionIds: [firstId],
    });
    expect(() => useChatStore.getState().markExecutionWaiting(firstId, [secondId])).toThrow("circular execution wait");
    expect(useChatStore.getState().getExecutionTrace(firstId).at(-1)).toMatchObject({
      eventType: "governance-denied",
      metadata: { action: "mark-waiting", reason: "circular execution wait" },
    });
  });

  it("surfaces scheduling snapshots and queue summaries", () => {
    const readyId = useChatStore.getState().createExecution({ capability: "chat-generation", priority: "high" });
    const dependencyId = useChatStore.getState().createExecution({ capability: "context-retrieval", priority: "normal" });
    const blockedId = useChatStore.getState().createExecution({
      capability: "workspace-analysis",
      priority: "low",
      dependencyExecutionIds: [dependencyId],
    });
    useChatStore.getState().scheduleExecution(readyId);

    expect(useChatStore.getState().getSchedulingSnapshot()).toMatchObject({
      totalExecutions: 3,
      readyExecutions: 1,
      waitingExecutions: 1,
      scheduledExecutions: 1,
      blockedExecutions: 1,
    });
    expect(useChatStore.getState().getExecutionQueueSummary()).toMatchObject({
      queuedExecutionIds: [readyId],
      blockedExecutionIds: [blockedId],
    });
    expect(useChatStore.getState().getBlockedExecutionSummary()).toEqual([
      {
        executionId: blockedId,
        waitingOnExecutionIds: [dependencyId],
        dependencyCount: 1,
      },
    ]);
  });

  it("records scheduling trace ordering for blocked, promoted, and scheduled executions", () => {
    const dependencyId = useChatStore.getState().createExecution({ capability: "context-retrieval" });
    const executionId = useChatStore.getState().createExecution({
      capability: "chat-generation",
      dependencyExecutionIds: [dependencyId],
    });

    useChatStore.getState().completeExecution(dependencyId, "context");
    useChatStore.getState().resolveExecutionDependency(executionId, dependencyId);
    useChatStore.getState().scheduleExecution(executionId);

    expect(useChatStore.getState().getExecutionTrace(executionId).map((event) => event.eventType)).toEqual([
      "created",
      "started",
      "execution-blocked",
      "dependency-resolved",
      "execution-ready",
      "execution-scheduled",
    ]);
  });

  it("progresses retrieval analysis synthesis pipelines deterministically", () => {
    const pipelineId = useChatStore.getState().createPipeline([
      "context-retrieval",
      "workspace-analysis",
      "response-synthesis",
    ]);

    const retrievalId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "context-retrieval",
      stage: "context-retrieval",
    });
    useChatStore.getState().completeExecution(retrievalId, "context");
    useChatStore.getState().advancePipelineStage(pipelineId);

    const analysisId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "workspace-analysis",
      stage: "workspace-analysis",
      dependencyExecutionIds: [retrievalId],
    });
    useChatStore.getState().completeExecution(analysisId, "analysis");
    useChatStore.getState().advancePipelineStage(pipelineId);

    const synthesisId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "chat-generation",
      stage: "response-synthesis",
      dependencyExecutionIds: [analysisId],
    });
    useChatStore.getState().completeExecution(synthesisId, "answer");
    useChatStore.getState().advancePipelineStage(pipelineId);

    expect(useChatStore.getState().getPipelineSummary(pipelineId)).toMatchObject({
      pipelineId,
      status: "completed",
      currentStage: null,
      executionCount: 3,
      completedStageCount: 3,
      blockedStageCount: 0,
    });
    expect(useChatStore.getState().getPipelineExecutions(pipelineId).map((execution) => execution.executionId)).toEqual([
      retrievalId,
      analysisId,
      synthesisId,
    ]);
  });

  it("keeps blocked pipeline stages waiting until dependencies resolve", () => {
    const pipelineId = useChatStore.getState().createPipeline([
      "context-retrieval",
      "response-synthesis",
    ]);
    const retrievalId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "context-retrieval",
      stage: "context-retrieval",
    });
    useChatStore.getState().advancePipelineStage(pipelineId);

    const synthesisId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "chat-generation",
      stage: "response-synthesis",
      dependencyExecutionIds: [retrievalId],
    });

    expect(useChatStore.getState().getPipelineStageSummary(pipelineId)).toEqual([
      expect.objectContaining({ stage: "context-retrieval", status: "completed" }),
      expect.objectContaining({ stage: "response-synthesis", status: "blocked", executionIds: [synthesisId] }),
    ]);
    expect(useChatStore.getState().getPipelineStatusSnapshot()).toMatchObject({
      totalPipelines: 1,
      runningPipelines: 1,
      blockedPipelines: 1,
    });

    useChatStore.getState().completeExecution(retrievalId, "context");
    useChatStore.getState().resolveExecutionDependency(synthesisId, retrievalId);

    expect(useChatStore.getState().getPipelineStageSummary(pipelineId).at(-1)).toMatchObject({
      stage: "response-synthesis",
      status: "running",
      executionIds: [synthesisId],
    });
  });

  it("fails pipelines deterministically and preserves trace history", () => {
    const pipelineId = useChatStore.getState().createPipeline(["context-retrieval"]);
    const executionId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "context-retrieval",
      stage: "context-retrieval",
    });

    useChatStore.getState().failExecution(executionId, "provider");
    useChatStore.getState().failPipeline(pipelineId, "provider");

    expect(useChatStore.getState().getPipelineSummary(pipelineId)).toMatchObject({
      status: "failed",
      failedStageCount: 1,
      currentStage: "context-retrieval",
    });
    expect(useChatStore.getState().pipelinesById[pipelineId].trace.map((event) => event.eventType)).toEqual([
      "pipeline-created",
      "stage-started",
      "stage-failed",
      "pipeline-failed",
    ]);
  });

  it("preserves retry lineage within pipeline execution sets", () => {
    const pipelineId = useChatStore.getState().createPipeline(["workspace-analysis"]);
    const executionId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "workspace-analysis",
      stage: "workspace-analysis",
    });
    useChatStore.getState().failExecution(executionId, "provider");

    const retryId = useChatStore.getState().retryExecution(executionId);
    useChatStore.getState().attachExistingExecutionToPipeline(pipelineId, retryId, "workspace-analysis");

    expect(useChatStore.getState().getPipelineExecutions(pipelineId).map((execution) => execution.executionId)).toEqual([
      executionId,
      retryId,
    ]);
    expect(useChatStore.getState().executionsById[retryId]).toMatchObject({
      parentExecutionId: executionId,
      pipelineId,
      pipelineStage: "workspace-analysis",
    });
  });

  it("rejects invalid or duplicate pipeline stage progression", () => {
    const pipelineId = useChatStore.getState().createPipeline(["context-retrieval", "response-synthesis"]);

    expect(() => useChatStore.getState().advancePipelineStage(pipelineId, "response-synthesis")).toThrow("invalid pipeline stage order");
    useChatStore.getState().advancePipelineStage(pipelineId);
    expect(() => useChatStore.getState().advancePipelineStage(pipelineId, "context-retrieval")).toThrow("duplicate pipeline stage progression");
    expect(useChatStore.getState().pipelinesById[pipelineId].trace.at(-1)).toMatchObject({
      eventType: "pipeline-governance-denied",
      metadata: { reason: "duplicate pipeline stage progression" },
    });
  });

  it("exposes pipeline observability snapshots and execution graphs", () => {
    const pipelineId = useChatStore.getState().createPipeline(["context-retrieval", "workspace-analysis"]);
    const retrievalId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "context-retrieval",
      stage: "context-retrieval",
    });
    useChatStore.getState().completeExecution(retrievalId, "context");
    useChatStore.getState().advancePipelineStage(pipelineId);
    const analysisId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "workspace-analysis",
      stage: "workspace-analysis",
      dependencyExecutionIds: [retrievalId],
    });

    expect(useChatStore.getState().getActivePipelines().map((pipeline) => pipeline.pipelineId)).toEqual([pipelineId]);
    expect(useChatStore.getState().getPipelineExecutionGraph(pipelineId)).toMatchObject({
      pipelineId,
      executionIds: [retrievalId, analysisId],
      dependencyEdges: [{ fromExecutionId: analysisId, dependsOnExecutionId: retrievalId }],
    });
  });

  it("keeps pipeline-local context isolated between pipelines", () => {
    const firstPipelineId = useChatStore.getState().createPipeline(["context-retrieval"]);
    const secondPipelineId = useChatStore.getState().createPipeline(["context-retrieval"]);

    const firstFrameId = useChatStore.getState().createContextFrame({
      scope: "pipeline",
      pipelineId: firstPipelineId,
      contextKeys: ["workspace.summary"],
      metadata: { label: "first" },
    });
    const secondFrameId = useChatStore.getState().createContextFrame({
      scope: "pipeline",
      pipelineId: secondPipelineId,
      contextKeys: ["workspace.summary"],
      metadata: { label: "second" },
    });

    expect(useChatStore.getState().getPipelineContextFrames(firstPipelineId).map((frame) => frame.frameId)).toEqual([firstFrameId]);
    expect(useChatStore.getState().getPipelineContextFrames(secondPipelineId).map((frame) => frame.frameId)).toEqual([secondFrameId]);
    expect(useChatStore.getState().getContextPropagationGraph(firstFrameId)).toMatchObject({
      frameId: firstFrameId,
      descendants: [],
    });
  });

  it("inherits context explicitly for execution-scoped frames", () => {
    const pipelineId = useChatStore.getState().createPipeline(["context-retrieval"]);
    const executionId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "context-retrieval",
      stage: "context-retrieval",
    });
    const pipelineFrameId = useChatStore.getState().createContextFrame({
      scope: "pipeline",
      pipelineId,
      contextKeys: ["workspace.summary", "operator.intent"],
    });

    const executionFrameId = useChatStore.getState().inheritContextFrame(pipelineFrameId, {
      scope: "execution",
      executionId,
      contextKeys: ["stage.result"],
    });
    useChatStore.getState().attachFrameToExecution(executionFrameId, executionId);

    expect(useChatStore.getState().resolveExecutionContext(executionId)).toEqual({
      frameIds: [pipelineFrameId, executionFrameId],
      contextKeys: ["workspace.summary", "operator.intent", "stage.result"],
    });
    expect(useChatStore.getState().getContextFrameHierarchy(executionFrameId)).toEqual([
      expect.objectContaining({ frameId: pipelineFrameId, scope: "pipeline" }),
      expect.objectContaining({ frameId: executionFrameId, scope: "execution" }),
    ]);
  });

  it("keeps tool context isolated from parent pipeline context unless explicitly inherited", () => {
    const pipelineId = useChatStore.getState().createPipeline(["tool-execution"]);
    const toolExecutionId = useChatStore.getState().attachExecutionToPipeline(pipelineId, {
      capability: "tool-call",
      stage: "tool-execution",
    });
    const pipelineFrameId = useChatStore.getState().createContextFrame({
      scope: "pipeline",
      pipelineId,
      contextKeys: ["pipeline.intent"],
    });
    const toolFrameId = useChatStore.getState().createContextFrame({
      scope: "tool",
      pipelineId,
      executionId: toolExecutionId,
      contextKeys: ["tool.private-result"],
    });

    expect(useChatStore.getState().getPipelineContextSummary(pipelineId)).toMatchObject({
      pipelineId,
      frameIds: [pipelineFrameId, toolFrameId],
      propagatedContextKeys: ["pipeline.intent"],
      isolatedFrameIds: [toolFrameId],
    });
  });

  it("enforces context inheritance depth and key-count governance", () => {
    const rootFrameId = useChatStore.getState().createContextFrame({
      scope: "pipeline",
      contextKeys: ["a", "b"],
      policy: { maxInheritedDepth: 1, maxContextKeyCount: 3 },
    });
    const childFrameId = useChatStore.getState().inheritContextFrame(rootFrameId, {
      scope: "execution",
      contextKeys: ["c"],
    });

    expect(() => useChatStore.getState().inheritContextFrame(childFrameId, {
      scope: "tool",
      contextKeys: ["d"],
    })).toThrow("context inheritance depth exceeded");
    expect(() => useChatStore.getState().inheritContextFrame(rootFrameId, {
      scope: "execution",
      contextKeys: ["c", "d"],
    })).toThrow("context key limit exceeded");
    expect(useChatStore.getState().getContextGovernanceViolations(rootFrameId).map((event) => event.eventType)).toEqual([
      "context-governance-denied",
      "context-governance-denied",
    ]);
  });

  it("records deterministic context observability ordering", () => {
    const frameId = useChatStore.getState().createContextFrame({
      scope: "conversation",
      contextKeys: ["conversation.summary"],
    });
    const childFrameId = useChatStore.getState().inheritContextFrame(frameId, {
      scope: "pipeline",
      contextKeys: ["pipeline.summary"],
    });

    expect(useChatStore.getState().getContextFrameSummary(childFrameId)).toMatchObject({
      frameId: childFrameId,
      scope: "pipeline",
      inheritedDepth: 1,
      contextKeyCount: 2,
      inheritedContextKeys: ["conversation.summary"],
      localContextKeys: ["pipeline.summary"],
    });
    expect(useChatStore.getState().contextFramesById[childFrameId].trace.map((event) => event.eventType)).toEqual([
      "frame-created",
      "frame-inherited",
      "context-propagated",
    ]);
  });

  it("aborts and resets active stream state without adding an empty assistant message", () => {
    const id = useChatStore.getState().createConversation();
    const controller = new AbortController();
    useChatStore.getState().setAbortController(controller);
    useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");
    const executionId = useChatStore.getState().activeExecutionId!;
    const staleEngine = useChatStore.getState().streamEngine;

    useChatStore.getState().stopStreaming();
    staleEngine?.push({ type: "text", content: "late completion" });
    staleEngine?.done();

    expect(controller.signal.aborted).toBe(true);
    expect(useChatStore.getState()).toMatchObject({
      isStreaming: false,
      streamEngine: null,
      abortController: null,
      currentStreamId: null,
      activeStream: null,
    });
    expect(useChatStore.getState().activeExecutionId).toBeNull();
    expect(useChatStore.getState().executionsById[executionId]).toMatchObject({
      lifecycle: "interrupted",
      metadata: { recoveryReason: "user-stop" },
    });
    expect(useChatStore.getState().lastStream).toMatchObject({
      lifecycle: "interrupted",
      recoveryReason: "user-stop",
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

  it("flushes pending chunks when a fast stream finalizes before the next frame", () => {
    const id = useChatStore.getState().createConversation();
    const streamId = useChatStore.getState().startStreaming(id, "puter", "puter-claude-sonnet-4", "claude-sonnet-4");

    useChatStore.getState().appendChunk({ type: "text", content: "fast response" });
    useChatStore.getState().finalizeStream(id, streamId);

    const messages = useChatStore.getState().getMessages(id);
    expect(messages).toHaveLength(1);
    expect(messageText(messages[0])).toBe("fast response");
  });

  it("creates one retryable timeout message and clears stream ownership", async () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().startStreaming(
      id,
      "puter",
      "puter-claude-sonnet-4",
      "claude-sonnet-4",
      "retry this exact prompt"
    );
    const executionId = useChatStore.getState().activeExecutionId!;

    await vi.advanceTimersByTimeAsync(60_000);

    const state = useChatStore.getState();
    const messages = state.getMessages(id);
    expect(state.isStreaming).toBe(false);
    expect(state.currentStreamId).toBeNull();
    expect(state.activeStream).toBeNull();
    expect(state.activeExecutionId).toBeNull();
    expect(state.executionsById[executionId]).toMatchObject({
      lifecycle: "failed",
      metadata: { recoveryReason: "timeout" },
    });
    expect(state.lastStream).toMatchObject({
      lifecycle: "failed",
      recoveryReason: "timeout",
    });
    expect(state.conversations[0].streaming).toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messageText(messages[0])).toContain("Error:");
    expect(messages[0].metadata).toMatchObject({
      provider: "puter",
      model: "puter-claude-sonnet-4",
      runtimeModel: "claude-sonnet-4",
      retryable: true,
      retryPrompt: "retry this exact prompt",
      failureKind: "timeout",
    });
  });

  it("keeps fallback status chunks in the stream buffer but excludes them from finalized content", async () => {
    const id = useChatStore.getState().createConversation();
    const streamId = useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");
    const executionId = useChatStore.getState().activeExecutionId!;

    useChatStore.getState().beginFallback("backup", "OpenAI timed out, switching to Backup Provider...");
    useChatStore.getState().appendChunk({ type: "status", content: "fallback: Backup Provider" });
    useChatStore.getState().appendChunk({ type: "text", content: "fallback answer" });
    await flushRaf();

    expect(useChatStore.getState().getStreamLifecycle()).toBe("streaming");
    expect(useChatStore.getState().executionsById[executionId].timeline.map((event) => event.type)).toEqual([
      "thinking",
      "fallback",
      "streaming",
    ]);
    expect(useChatStore.getState().executionsById[executionId].metadata).toMatchObject({
      fallbackReason: "OpenAI timed out, switching to Backup Provider...",
    });
    expect(useChatStore.getState().conversations[0].streaming?.buffer.map((chunk) => chunk.type)).toEqual([
      "status",
      "text",
    ]);
    expect(useChatStore.getState().getStreamStatus()).toBe("OpenAI timed out, switching to Backup Provider...");

    useChatStore.getState().finalizeStream(id, streamId);
    const messages = useChatStore.getState().getMessages(id);
    expect(messages).toHaveLength(1);
    expect(messageText(messages[0])).toBe("fallback answer");
    expect(useChatStore.getState().lastStream?.timeline.map((event) => event.type)).toEqual([
      "thinking",
      "fallback",
      "streaming",
      "completed",
    ]);
  });

  it("marks a recovered stream before deterministic teardown", () => {
    const id = useChatStore.getState().createConversation();
    const streamId = useChatStore.getState().startStreaming(id, "puter", "puter-gpt-5");

    useChatStore.getState().markRecovered("manual retry accepted");
    useChatStore.getState().finalizeStream(id, streamId);

    expect(useChatStore.getState().lastStream).toMatchObject({
      lifecycle: "completed",
      recoveryReason: "manual retry accepted",
    });
    expect(useChatStore.getState().lastStream?.timeline.map((event) => event.type)).toEqual([
      "thinking",
      "recovered",
      "completed",
    ]);
  });

  it("creates retry executions with lineage without mutating the parent execution", () => {
    const parentId = useChatStore.getState().createExecution({
      messageId: "assistant-message-1",
      providerId: "puter",
      modelId: "puter-gpt-5",
    });
    useChatStore.getState().failExecution(parentId, "provider");

    const retryId = useChatStore.getState().retryExecution(parentId, {
      providerId: "ollama",
      modelId: "ollama-llama-maverick",
    });

    expect(retryId).not.toBe(parentId);
    expect(useChatStore.getState().executionsById[parentId]).toMatchObject({
      lifecycle: "failed",
      retryCount: 0,
    });
    expect(useChatStore.getState().executionsById[retryId]).toMatchObject({
      parentExecutionId: parentId,
      messageId: "assistant-message-1",
      providerId: "ollama",
      modelId: "ollama-llama-maverick",
      retryCount: 1,
      lifecycle: "thinking",
    });
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
