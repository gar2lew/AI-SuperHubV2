import type { AIChunk, Capability, ContentPart, Conversation, Message, ProviderId } from '@/types';
import { textContent } from '@/lib/utils';
import { assembleContext } from '@/lib/core/context';
import { recordClientError } from '@/lib/diagnostics/client-errors';
import { modelRegistry } from '@/lib/models/registry';
import { recordProviderFallbackTransition } from '@/lib/providers/analytics';
import { formatProviderError } from '@/lib/providers/errors';
import { recordFailure } from '@/lib/providers/health';
import { recordPuterFallbackEvent } from '@/lib/providers/puter/runtime';
import { resolveRoute, type RoutingOptions, type RoutingResult } from '@/lib/routing/fallback-router';

interface ChatModelSummary {
  label: string;
  capabilities: Capability[];
}

export interface ChatRetryOverride {
  prompt: string;
  providerId?: string;
  modelId?: string;
}

export interface ExecuteChatRequestOptions {
  conversation: Conversation;
  contentParts: ContentPart[];
  prompt: string;
  selectedModel: string;
  selectedProvider: ProviderId;
  retryOverride?: ChatRetryOverride | null;
  workspaceContext?: string;
}

export interface ChatRequestDependencies {
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'createdAt'> & { id?: string }) => void;
  startStreaming: (
    conversationId: string,
    providerId: string,
    modelId: string,
    runtimeModelId?: string,
    retryPrompt?: string
  ) => string;
  appendChunk: (chunk: AIChunk) => void;
  beginFallback?: (providerId: string, status: string) => void;
  finalizeStream: (conversationId: string, streamId: string) => void;
  setAbortController: (controller: AbortController | null) => void;
  getCurrentStreamId: () => string | null;
  resolveRoute?: (modelId: string, options?: RoutingOptions) => RoutingResult | null;
  getModel?: (modelId: string) => ChatModelSummary | undefined;
  createAbortController?: () => AbortController;
  recordFailure?: (providerId: string, reason?: 'error' | 'timeout') => void;
  recordProviderFallbackTransition?: (fromProviderId: string, toProviderId: string) => void;
  recordPuterFallbackEvent?: (fromProviderId?: string, toProviderId?: string) => void;
  recordClientError?: typeof recordClientError;
  formatProviderError?: (error: unknown, fallback?: string) => string;
}

export type ChatRequestResult =
  | { status: 'completed'; streamId?: string }
  | { status: 'rejected'; reason: 'model-capability' | 'no-route' }
  | { status: 'stale'; streamId: string };

const defaultDependencies = {
  resolveRoute,
  getModel: (modelId: string) => {
    const model = modelRegistry.get(modelId);
    return model ? { label: model.label, capabilities: model.capabilities } : undefined;
  },
  createAbortController: () => new AbortController(),
  recordFailure,
  recordProviderFallbackTransition,
  recordPuterFallbackEvent,
  recordClientError,
  formatProviderError,
};

export async function executeChatRequest(
  options: ExecuteChatRequestOptions,
  dependencies: ChatRequestDependencies
): Promise<ChatRequestResult> {
  const deps = { ...defaultDependencies, ...dependencies };
  const retryForSend = options.retryOverride?.prompt === options.prompt ? options.retryOverride : null;
  const routeModelId = retryForSend?.modelId ?? options.selectedModel;
  const routeProviderId = retryForSend?.providerId ?? options.selectedProvider;

  const userMessageForContext: Message = {
    id: `pending-${Date.now()}`,
    role: 'user',
    content: options.contentParts,
    createdAt: Date.now(),
  };
  const conversationWithPendingMessage: Conversation = {
    ...options.conversation,
    messages: [...options.conversation.messages, userMessageForContext],
  };

  deps.addMessage(options.conversation.id, {
    role: 'user',
    content: options.contentParts,
  });

  const selectedModelRecord = deps.getModel(routeModelId);
  if (selectedModelRecord && !selectedModelRecord.capabilities.includes('chat')) {
    deps.addMessage(options.conversation.id, {
      role: 'assistant',
      content: textContent(
        `${selectedModelRecord.label} does not support chat. Choose a chat-capable model or switch to the matching workspace.`
      ),
    });
    return { status: 'rejected', reason: 'model-capability' };
  }

  const route = deps.resolveRoute(routeModelId, {
    preferredProvider: routeProviderId,
    allowFallback: true,
    respectHealth: retryForSend ? false : undefined,
  });

  if (!route) {
    deps.addMessage(options.conversation.id, {
      role: 'assistant',
      content: textContent('Error: No available provider found. All providers are either disabled or unavailable.'),
    });
    return { status: 'rejected', reason: 'no-route' };
  }

  if (route.usedFallback && routeProviderId !== route.provider.id) {
    deps.recordProviderFallbackTransition(routeProviderId, route.provider.id);
  }

  const streamId = deps.startStreaming(
    options.conversation.id,
    route.provider.id,
    route.modelId,
    route.runtimeModelId,
    options.prompt
  );
  const controller = deps.createAbortController();
  deps.setAbortController(controller);

  const context = assembleContext(conversationWithPendingMessage, {
    systemPrompt: options.workspaceContext,
  });

  try {
    await streamRoute(route, context, controller, streamId, deps);
    if (deps.getCurrentStreamId() !== streamId) return { status: 'stale', streamId };
    deps.finalizeStream(options.conversation.id, streamId);
    return { status: 'completed', streamId };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AbortError') return { status: 'stale', streamId };
    if (deps.getCurrentStreamId() !== streamId) return { status: 'stale', streamId };

    deps.recordClientError({
      source: 'stream',
      error: err,
      context: {
        providerId: route.provider.id,
        modelId: route.modelId,
        streamId,
        phase: 'primary',
      },
    });
    console.error('Stream failed:', err);
    deps.recordFailure(route.provider.id);

    const fallbackCompleted = await tryFallbackRoute({
      route,
      context,
      controller,
      streamId,
      conversationId: options.conversation.id,
      deps,
    });
    if (fallbackCompleted) return { status: 'completed', streamId };

    if (controller.signal.aborted || deps.getCurrentStreamId() !== streamId) {
      return { status: 'stale', streamId };
    }
    deps.appendChunk({ type: 'text', content: `\n\nError: ${deps.formatProviderError(err)}` });
    deps.finalizeStream(options.conversation.id, streamId);
    return { status: 'completed', streamId };
  }
}

async function streamRoute(
  route: RoutingResult,
  context: Message[],
  controller: AbortController,
  streamId: string,
  deps: ChatRequestDependencies & typeof defaultDependencies
) {
  const stream = route.provider.stream(context, controller.signal, route.runtimeModelId);
  for await (const chunk of stream) {
    if (deps.getCurrentStreamId() !== streamId) return;
    deps.appendChunk(chunk);
  }
}

async function tryFallbackRoute({
  route,
  context,
  controller,
  streamId,
  conversationId,
  deps,
}: {
  route: RoutingResult;
  context: Message[];
  controller: AbortController;
  streamId: string;
  conversationId: string;
  deps: ChatRequestDependencies & typeof defaultDependencies;
}): Promise<boolean> {
  if (route.fallbackChain.length <= 1) return false;

  const fallbackModelId = route.fallbackChain[1] ?? 'ollama-llama-maverick';
  const fallbackRoute = deps.resolveRoute(fallbackModelId, { allowFallback: true });
  if (!fallbackRoute) return false;
  if (controller.signal.aborted || deps.getCurrentStreamId() !== streamId) return true;

  deps.recordPuterFallbackEvent(route.provider.id, fallbackRoute.provider.id);
  deps.recordProviderFallbackTransition(route.provider.id, fallbackRoute.provider.id);
  const fallbackStatus = `${route.provider.name} failed, switching to ${fallbackRoute.provider.name}...`;
  deps.beginFallback?.(fallbackRoute.provider.id, fallbackStatus);
  deps.appendChunk({ type: 'status', content: fallbackStatus });

  try {
    await streamRoute(fallbackRoute, context, controller, streamId, deps);
    if (deps.getCurrentStreamId() !== streamId) return true;
    deps.finalizeStream(conversationId, streamId);
    return true;
  } catch (fallbackErr) {
    if (
      (fallbackErr as Error).name === 'AbortError' ||
      controller.signal.aborted ||
      deps.getCurrentStreamId() !== streamId
    ) {
      return true;
    }
    deps.recordClientError({
      source: 'stream',
      error: fallbackErr,
      context: {
        providerId: fallbackRoute.provider.id,
        modelId: fallbackRoute.modelId,
        streamId,
        phase: 'fallback',
      },
    });
    deps.recordFailure(fallbackRoute.provider.id);
    return false;
  }
}
