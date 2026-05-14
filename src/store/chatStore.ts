import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conversation, Message, AIChunk } from '@/types';
import { generateId, messageToTitle, finalizeChunks } from '@/lib/utils';
import { DEFAULT_PRESET_ID, resolvePresetToModel } from '@/lib/models/presets';
import { getChunkSequence, StreamEngine } from '@/lib/streaming/stream-engine';
import { recordSuccess, recordFailure } from '@/lib/providers/health';
import { recordProviderStreamInterruption } from '@/lib/providers/analytics';
import { formatProviderError } from '@/lib/providers/errors';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;
  streamEngine: StreamEngine | null;
  abortController: AbortController | null;
  // Stream ownership for zombie prevention
  currentStreamId: string | null;

  // Actions
  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'createdAt'>) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  startStreaming: (
    conversationId: string,
    providerId: string,
    modelId: string,
    runtimeModelId?: string,
    retryPrompt?: string
  ) => string;
  appendChunk: (chunk: AIChunk) => void;
  finalizeStream: (conversationId: string, streamId: string) => void;
  stopStreaming: () => void;
  setAbortController: (controller: AbortController | null) => void;
  getActiveConversation: () => Conversation | undefined;
  getMessages: (conversationId: string) => Message[];
  getStreamText: () => string;
  getStreamReasoning: () => string;
  getCurrentStreamId: () => string | null;
}

const createDefaultConversation = (): Conversation => ({
  id: generateId(),
  title: 'New Conversation',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  presetId: DEFAULT_PRESET_ID,
  providerId: 'puter',
  modelId: resolvePresetToModel(DEFAULT_PRESET_ID),
});

function generateStreamId(): string {
  return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isStreaming: false,
      streamEngine: null,
      abortController: null,
      currentStreamId: null,

      createConversation: () => {
        const { isStreaming, abortController, streamEngine } = get();
        if (isStreaming) {
          const streamingConversationId = streamEngine?.getDiagnostics().conversationId;
          const streaming = get().conversations.find((c) => c.id === streamingConversationId)?.streaming;
          if (streaming) {
            recordProviderStreamInterruption(streaming.providerId, 'conversation-reset');
          }
          abortController?.abort();
          set({ currentStreamId: null });
          streamEngine?.abort();
        }

        const conversation = createDefaultConversation();
        set((state) => ({
          isStreaming: false,
          streamEngine: null,
          abortController: null,
          currentStreamId: null,
          conversations: [
            conversation,
            ...state.conversations.map((c) =>
              c.streaming ? { ...c, streaming: undefined } : c
            ),
          ],
          activeConversationId: conversation.id,
        }));
        return conversation.id;
      },

      setActiveConversation: (id) => {
        // Abort any active stream when switching conversations
        const { isStreaming, abortController, streamEngine } = get();
        if (isStreaming) {
          const streamingConversationId = streamEngine?.getDiagnostics().conversationId;
          const streaming = get().conversations.find((c) => c.id === streamingConversationId)?.streaming;
          if (streaming) {
            recordProviderStreamInterruption(streaming.providerId, 'conversation-switch');
          }
          set((state) => ({
            isStreaming: false,
            streamEngine: null,
            abortController: null,
            currentStreamId: null,
            activeConversationId: id,
            conversations: state.conversations.map((c) =>
              c.id === streamingConversationId ? { ...c, streaming: undefined } : c
            ),
          }));
          abortController?.abort();
          streamEngine?.abort();
          return;
        }
        set({ activeConversationId: id });
      },

      deleteConversation: (id) => {
        set((state) => {
          const filtered = state.conversations.filter((c) => c.id !== id);
          return {
            conversations: filtered,
            activeConversationId:
              state.activeConversationId === id
                ? filtered[0]?.id || null
                : state.activeConversationId,
          };
        });
      },

      renameConversation: (id, title) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        }));
      },

      addMessage: (conversationId, message) => {
        const newMessage: Message = {
          ...message,
          id: generateId(),
          createdAt: Date.now(),
        };
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [...c.messages, newMessage],
                  updatedAt: Date.now(),
                  title:
                    c.messages.length === 0 && message.role === 'user'
                      ? messageToTitle(message.content)
                      : c.title,
                }
              : c
          ),
        }));
      },

      updateMessage: (conversationId, messageId, updates) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, ...updates } : m
                  ),
                }
              : c
          ),
        }));
      },

      startStreaming: (conversationId, providerId, modelId, runtimeModelId, retryPrompt) => {
        const streamId = generateStreamId();

        const engine = new StreamEngine(
          {
            onChunk: (_chunk) => {
              // Individual chunk callback (for future real-time tool handling)
            },
            onBatch: (chunks) => {
              // Ownership check: ignore batches from stale streams
              if (get().currentStreamId !== streamId) return;

              set((state) => ({
                conversations: state.conversations.map((c) => {
                  if (c.id !== conversationId) return c;

                  const acceptedChunks: AIChunk[] = [];
                  let lastSequence = c.streaming?.lastSequence ?? -1;

                  for (const chunk of chunks) {
                    const sequence = getChunkSequence(chunk);
                    if (typeof sequence === 'number') {
                      if (sequence <= lastSequence) continue;
                      lastSequence = sequence;
                    }
                    acceptedChunks.push(chunk);
                  }

                  return {
                    ...c,
                    streaming: {
                      ...c.streaming!,
                      buffer: [...(c.streaming?.buffer || []), ...acceptedChunks],
                      lastSequence,
                    },
                  };
                }),
              }));
            },
            onDone: () => {
              if (get().currentStreamId !== streamId) return;
              get().finalizeStream(conversationId, streamId);
            },
            onError: (err) => {
              if (get().currentStreamId !== streamId) return;
              console.error('Stream error:', err);
              recordFailure(providerId);
              const bufferedContent = finalizeChunks(get().streamEngine?.getBuffer() || []);
              if (bufferedContent.length === 0) {
                get().addMessage(conversationId, {
                  role: 'assistant',
                  content: [
                    {
                      type: 'text',
                      text: `Error: ${formatProviderError(err)}`,
                    },
                  ],
                  metadata: {
                    provider: providerId,
                    model: modelId,
                    runtimeModel: runtimeModelId,
                    retryable: true,
                    retryPrompt,
                    failureKind: 'provider',
                  },
                });
              }
              get().finalizeStream(conversationId, streamId);
            },
            onAbort: () => {
              if (get().currentStreamId !== streamId) return;
              recordProviderStreamInterruption(providerId);
              get().finalizeStream(conversationId, streamId);
            },
            onTimeout: () => {
              if (get().currentStreamId !== streamId) return;
              console.warn('Stream timed out');
              recordFailure(providerId, 'timeout');
              get().addMessage(conversationId, {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: `Error: ${formatProviderError(new Error('Stream timed out'))}`,
                  },
                ],
                metadata: {
                  provider: providerId,
                  model: modelId,
                  runtimeModel: runtimeModelId,
                  retryable: true,
                  retryPrompt,
                  failureKind: 'timeout',
                },
              });
              get().finalizeStream(conversationId, streamId);
            },
          },
          { coalesceText: true, flushIntervalMs: 32, maxBufferSize: 80, timeoutMs: 60000 },
          { streamId, conversationId, providerId, modelId }
        );

        engine.start();

        set((state) => ({
          isStreaming: true,
          streamEngine: engine,
          currentStreamId: streamId,
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  streaming: {
                    isActive: true,
                    buffer: [],
                    startedAt: Date.now(),
                    providerId,
                    modelId,
                    runtimeModelId,
                    retryPrompt,
                    streamId,
                    lastSequence: -1,
                  },
                }
              : c
          ),
        }));

        return streamId;
      },

      appendChunk: (chunk) => {
        const { streamEngine } = get();
        streamEngine?.push(chunk);
      },

      finalizeStream: (conversationId, streamId) => {
        // Ownership check: prevent zombie stream updates
        if (get().currentStreamId !== streamId) {
          return;
        }

        const { streamEngine } = get();
        const buffer = streamEngine?.getBuffer() || [];
        const content = finalizeChunks(buffer);

        // Record success if we got content
        const streaming = get()
          .conversations.find((c) => c.id === conversationId)?.streaming;
        if (streaming && content.length > 0) {
          const latency = Date.now() - streaming.startedAt;
          recordSuccess(streaming.providerId, latency);
        }

        if (content.length > 0) {
          get().addMessage(conversationId, {
            role: 'assistant',
            content,
            metadata: {
              provider: streaming?.providerId,
              model: streaming?.modelId,
              runtimeModel: streaming?.runtimeModelId,
              latencyMs: streaming ? Date.now() - streaming.startedAt : undefined,
            },
          });
        }

        set((state) => ({
          isStreaming: false,
          streamEngine: null,
          abortController: null,
          currentStreamId: null,
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, streaming: undefined }
              : c
          ),
        }));
      },

      stopStreaming: () => {
        const { abortController, streamEngine } = get();
        const streamingConversationId = streamEngine?.getDiagnostics().conversationId;
        const streaming = get().conversations.find((c) => c.id === streamingConversationId)?.streaming;
        if (streaming) {
          recordProviderStreamInterruption(streaming.providerId, 'user-stop');
        }
        set((state) => ({
          isStreaming: false,
          streamEngine: null,
          abortController: null,
          currentStreamId: null,
          conversations: state.conversations.map((c) =>
            c.id === streamingConversationId ? { ...c, streaming: undefined } : c
          ),
        }));
        abortController?.abort();
        streamEngine?.abort();
      },

      setAbortController: (controller) => {
        set({ abortController: controller });
      },

      getActiveConversation: () => {
        const { conversations, activeConversationId } = get();
        return conversations.find((c) => c.id === activeConversationId);
      },

      getMessages: (conversationId) => {
        const { conversations } = get();
        return conversations.find((c) => c.id === conversationId)?.messages || [];
      },

      getStreamText: () => {
        const active = get().getActiveConversation();
        return (active?.streaming?.buffer || [])
          .filter((c): c is Extract<AIChunk, { type: 'text' }> => c.type === 'text')
          .map((c) => c.content)
          .join('');
      },

      getStreamReasoning: () => {
        const active = get().getActiveConversation();
        return (active?.streaming?.buffer || [])
          .filter((c): c is Extract<AIChunk, { type: 'reasoning' }> => c.type === 'reasoning')
          .map((c) => c.content)
          .join('');
      },

      getCurrentStreamId: () => {
        return get().currentStreamId;
      },
    }),
    {
      name: 'ai-workstation-chat',
      partialize: (state) => ({
        conversations: state.conversations.map((c) => ({
          ...c,
          streaming: undefined,
          messages: c.messages.map((m) => ({
            ...m,
            content: m.content.map((part) => {
              if (part.type === 'image' && part.file) {
                return { type: 'image', url: part.url, mimeType: part.mimeType };
              }
              if (part.type === 'audio' && part.file) {
                return { type: 'audio', url: part.url, mimeType: part.mimeType };
              }
              if (part.type === 'file' && part.file) {
                return { type: 'file', url: part.url, name: part.name, mimeType: part.mimeType };
              }
              return part;
            }),
          })),
        })),
        activeConversationId: state.activeConversationId,
      }),
    }
  )
);
