import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIChunk, Capability, ContentPart, Conversation, Message } from "@/types";
import type { RoutingResult } from "@/lib/routing/fallback-router";
import { executeChatRequest, type ChatRequestDependencies } from "@/lib/core/chat-orchestrator";

function conversation(messages: Message[] = []): Conversation {
  return {
    id: "conversation-1",
    title: "Test",
    messages,
    createdAt: 1,
    updatedAt: 1,
    presetId: "smart",
    providerId: "puter",
    modelId: "puter-gpt-5",
  };
}

function route(id: string, chunks: AIChunk[], shouldFail = false): RoutingResult {
  return {
    provider: {
      id,
      name: id,
      description: id,
      models: [],
      isEnabled: true,
      validateConfig: () => true,
      chat: vi.fn(),
      stream: async function* () {
        if (shouldFail) throw new Error(`${id} failed`);
        for (const chunk of chunks) yield chunk;
      },
    },
    modelId: `${id}-model`,
    runtimeModelId: `${id}-runtime`,
    usedFallback: false,
    fallbackChain: [`${id}-model`, "fallback-model"],
  };
}

function deps(primary: RoutingResult | null, fallback?: RoutingResult): ChatRequestDependencies {
  let currentStreamId = "stream-1";
  return {
    addMessage: vi.fn(),
    startStreaming: vi.fn(() => currentStreamId),
    appendChunk: vi.fn(),
    beginFallback: vi.fn(),
    finalizeStream: vi.fn(),
    setAbortController: vi.fn(),
    getCurrentStreamId: vi.fn(() => currentStreamId),
    resolveRoute: vi.fn((modelId: string) => (modelId === "fallback-model" ? fallback ?? null : primary)),
    getModel: vi.fn(() => ({ label: "Mock Model", capabilities: ["chat"] as Capability[] })),
    createAbortController: () => new AbortController(),
    recordFailure: vi.fn(),
    recordProviderFallbackTransition: vi.fn(),
    recordPuterFallbackEvent: vi.fn(),
    recordClientError: vi.fn(),
    formatProviderError: (error) => error instanceof Error ? error.message : String(error),
  };
}

const content: ContentPart[] = [{ type: "text", text: "hello" }];

describe("executeChatRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
  });

  it("adds the user message, streams through the resolved provider, and finalizes the owned stream", async () => {
    const primary = route("puter", [{ type: "text", content: "answer" }]);
    const testDeps = deps(primary);
    let streamedMessages: Message[] = [];
    primary.provider.stream = async function* (messages) {
      streamedMessages = messages;
      yield { type: "text", content: "answer" };
    };

    await executeChatRequest({
      conversation: conversation(),
      contentParts: content,
      prompt: "hello",
      selectedModel: "puter-gpt-5",
      selectedProvider: "puter",
      workspaceContext: "Pinned workspace rules",
    }, testDeps);

    expect(testDeps.addMessage).toHaveBeenCalledWith("conversation-1", {
      role: "user",
      content,
    });
    expect(testDeps.startStreaming).toHaveBeenCalledWith(
      "conversation-1",
      "puter",
      "puter-model",
      "puter-runtime",
      "hello"
    );
    expect(testDeps.appendChunk).toHaveBeenCalledWith({ type: "text", content: "answer" });
    expect(testDeps.finalizeStream).toHaveBeenCalledWith("conversation-1", "stream-1");
    expect(streamedMessages[0]).toMatchObject({
      role: "system",
      content: [{ type: "text", text: "Pinned workspace rules" }],
    });
  });

  it("falls back within the same stream when the primary provider fails", async () => {
    const primary = route("puter", [], true);
    const fallback = route("ollama", [{ type: "text", content: "fallback answer" }]);
    const testDeps = deps(primary, fallback);

    await executeChatRequest({
      conversation: conversation(),
      contentParts: content,
      prompt: "hello",
      selectedModel: "puter-gpt-5",
      selectedProvider: "puter",
    }, testDeps);

    expect(testDeps.recordFailure).toHaveBeenCalledWith("puter");
    expect(testDeps.recordProviderFallbackTransition).toHaveBeenCalledWith("puter", "ollama");
    expect(testDeps.beginFallback).toHaveBeenCalledWith("ollama", "puter failed, switching to ollama...");
    expect(testDeps.appendChunk).toHaveBeenCalledWith({ type: "status", content: "puter failed, switching to ollama..." });
    expect(testDeps.appendChunk).toHaveBeenCalledWith({ type: "text", content: "fallback answer" });
    expect(testDeps.finalizeStream).toHaveBeenCalledWith("conversation-1", "stream-1");
  });

  it("captures expired Puter auth as a bounded pending replay without provider fallback", async () => {
    const primary = route("puter", [], true);
    primary.provider.stream = async function* () {
      throw new Error("Puter runtime unavailable: expired-session");
    };
    const fallback = route("ollama", [{ type: "text", content: "fallback answer" }]);
    const testDeps = deps(primary, fallback);
    testDeps.registerPendingAuthReplay = vi.fn();
    testDeps.markInterrupted = vi.fn();

    const result = await executeChatRequest({
      conversation: conversation(),
      contentParts: content,
      prompt: "hello",
      selectedModel: "puter-gpt-5",
      selectedProvider: "puter",
    }, testDeps);

    expect(result).toMatchObject({ status: "auth-required", streamId: "stream-1" });
    expect(testDeps.registerPendingAuthReplay).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-1",
      prompt: "hello",
      selectedModel: "puter-gpt-5",
      selectedProvider: "puter",
      providerId: "puter",
      modelId: "puter-model",
      runtimeModelId: "puter-runtime",
      reason: "expired-session",
    }));
    expect(testDeps.markInterrupted).toHaveBeenCalledWith("auth-required");
    expect(testDeps.recordFailure).not.toHaveBeenCalledWith("puter");
    expect(testDeps.beginFallback).not.toHaveBeenCalled();
    expect(testDeps.appendChunk).toHaveBeenCalledWith({
      type: "status",
      content: "Sign in required. Restore Puter auth to replay this request.",
    });
    expect(testDeps.finalizeStream).toHaveBeenCalledWith("conversation-1", "stream-1");
  });

  it("replays an auth-recovered request without duplicating the original user message", async () => {
    const primary = route("puter", [{ type: "text", content: "answer" }]);
    const testDeps = deps(primary);
    let streamedMessages: Message[] = [];
    primary.provider.stream = async function* (messages) {
      streamedMessages = messages;
      yield { type: "text", content: "answer" };
    };

    await executeChatRequest({
      conversation: conversation([{ id: "user-1", role: "user", content, createdAt: 1 }]),
      contentParts: content,
      prompt: "hello",
      selectedModel: "puter-gpt-5",
      selectedProvider: "puter",
      skipUserMessage: true,
      replayAttempt: 1,
    }, testDeps);

    expect(testDeps.addMessage).not.toHaveBeenCalledWith("conversation-1", {
      role: "user",
      content,
    });
    expect(streamedMessages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(testDeps.startStreaming).toHaveBeenCalledWith(
      "conversation-1",
      "puter",
      "puter-model",
      "puter-runtime",
      "hello"
    );
    expect(testDeps.finalizeStream).toHaveBeenCalledWith("conversation-1", "stream-1");
  });

  it("persists a chat-capability error instead of starting a stream for non-chat models", async () => {
    const testDeps = deps(null);
    testDeps.getModel = vi.fn(() => ({ label: "Image Only", capabilities: ["image"] as Capability[] }));

    const result = await executeChatRequest({
      conversation: conversation(),
      contentParts: content,
      prompt: "draw",
      selectedModel: "gpt-image-1-mini",
      selectedProvider: "puter",
    }, testDeps);

    expect(result.status).toBe("rejected");
    expect(testDeps.startStreaming).not.toHaveBeenCalled();
    expect(testDeps.addMessage).toHaveBeenLastCalledWith("conversation-1", {
      role: "assistant",
      content: [{ type: "text", text: "Image Only does not support chat. Choose a chat-capable model or switch to the matching workspace." }],
    });
  });
});
