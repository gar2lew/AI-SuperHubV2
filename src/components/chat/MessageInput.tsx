import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Square, Paperclip, Image, FileText } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';

import { textContent } from '@/lib/utils';
import { assembleContext } from '@/lib/core/context';
import { recordFailure } from '@/lib/providers/health';
import { recordProviderFallbackTransition } from '@/lib/providers/analytics';
import { resolveRoute } from '@/lib/routing/fallback-router';
import { recordPuterFallbackEvent } from '@/lib/providers/puter/runtime';
import { recordClientError } from '@/lib/diagnostics/client-errors';
import { modelRegistry } from '@/lib/models/registry';
import { formatProviderError } from '@/lib/providers/errors';

export function MessageInput() {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; type: string; file?: File }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId)
  );
  const addMessage = useChatStore((s) => s.addMessage);
  const startStreaming = useChatStore((s) => s.startStreaming);
  const appendChunk = useChatStore((s) => s.appendChunk);
  const finalizeStream = useChatStore((s) => s.finalizeStream);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const setAbortController = useChatStore((s) => s.setAbortController);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);

  useEffect(() => {
    setInput('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [activeConversation?.id]);

  const handleSend = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || !activeConversation || isStreaming) return;

    const userText = input.trim();
    setInput('');

    // Build content parts from text + attachments
    const contentParts = textContent(userText);
    const imageAttachments = attachments.filter((a) => a.type.startsWith('image'));
    for (const img of imageAttachments) {
      contentParts.push({
        type: 'image',
        file: img.file,
        mimeType: img.type,
      });
    }
    const fileAttachments = attachments.filter((a) => !a.type.startsWith('image'));
    for (const f of fileAttachments) {
      contentParts.push({
        type: 'file',
        file: f.file,
        name: f.name,
        mimeType: f.type,
      });
    }
    setAttachments([]);

    const userMessageForContext = {
      id: `pending-${Date.now()}`,
      role: 'user' as const,
      content: contentParts,
      createdAt: Date.now(),
    };
    const conversationWithPendingMessage = {
      ...activeConversation,
      messages: [...activeConversation.messages, userMessageForContext],
    };

    // Add user message
    addMessage(activeConversation.id, {
      role: 'user',
      content: contentParts,
    });

    const selectedModelRecord = modelRegistry.get(selectedModel);
    if (selectedModelRecord && !selectedModelRecord.capabilities.includes('chat')) {
      addMessage(activeConversation.id, {
        role: 'assistant',
        content: textContent(
          `${selectedModelRecord.label} does not support chat. Choose a chat-capable model or switch to the matching workspace.`
        ),
      });
      return;
    }

    // Resolve route with fallback support
    const route = resolveRoute(selectedModel, {
      preferredProvider: selectedProvider,
      allowFallback: true,
    });

    if (!route) {
      addMessage(activeConversation.id, {
        role: 'assistant',
        content: textContent('Error: No available provider found. All providers are either disabled or unavailable.'),
      });
      return;
    }

    if (route.usedFallback && selectedProvider !== route.provider.id) {
      recordProviderFallbackTransition(selectedProvider, route.provider.id);
    }

    const streamId = startStreaming(activeConversation.id, route.provider.id, route.modelId);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const context = assembleContext(conversationWithPendingMessage);
      const stream = route.provider.stream(context, controller.signal, route.modelId);

      for await (const chunk of stream) {
        appendChunk(chunk);
      }

      finalizeStream(activeConversation.id, streamId);
    } catch (error) {
      const err = error as Error;
      if (err.name !== 'AbortError') {
        recordClientError({
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
        recordFailure(route.provider.id);

        // Try fallback if available
        if (route.fallbackChain.length > 1) {
          const fallbackModelId = route.fallbackChain[1] ?? 'ollama-llama-maverick';
          const fallbackRoute = resolveRoute(fallbackModelId, { allowFallback: true });
          if (fallbackRoute) {
            recordPuterFallbackEvent(route.provider.id, fallbackRoute.provider.id);
            recordProviderFallbackTransition(route.provider.id, fallbackRoute.provider.id);
            appendChunk({ type: 'status', content: `fallback: ${fallbackRoute.provider.name}` });
            try {
              const context = assembleContext(conversationWithPendingMessage);
              const fallbackStream = fallbackRoute.provider.stream(
                context,
                controller.signal,
                fallbackRoute.modelId
              );
              for await (const chunk of fallbackStream) {
                appendChunk(chunk);
              }
              finalizeStream(activeConversation.id, streamId);
              return;
            } catch (fallbackErr) {
              recordClientError({
                source: 'stream',
                error: fallbackErr,
                context: {
                  providerId: fallbackRoute.provider.id,
                  modelId: fallbackRoute.modelId,
                  streamId,
                  phase: 'fallback',
                },
              });
              recordFailure(fallbackRoute.provider.id);
            }
          }
        }

        appendChunk({ type: 'text', content: `\n\nError: ${formatProviderError(err)}` });
        finalizeStream(activeConversation.id, streamId);
      }
    }
  }, [
    input,
    attachments,
    activeConversation,
    isStreaming,
    addMessage,
    startStreaming,
    appendChunk,
    finalizeStream,
    setAbortController,
    selectedProvider,
    selectedModel,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const newAttachments = files.map((f) => ({
      name: f.name,
      type: f.type,
      file: f,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files.map((f) => ({
      name: f.name,
      type: f.type,
      file: f,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      const maxHeight = window.matchMedia('(max-width: 759px)').matches ? 132 : 200;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }
  }, []);

  useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, input]);

  const handleTextareaFocus = () => {
    window.setTimeout(() => {
      textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
  };

  return (
    <div
      className="composer-shell relative px-3 py-3 sm:px-5"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="drop-overlay absolute inset-0 flex items-center justify-center z-50"
        >
          <p className="text-accent font-medium">Drop files here</p>
        </motion.div>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="attachment-chip flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary"
            >
              {att.type.startsWith('image') ? <Image size={12} /> : <FileText size={12} />}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="ml-1 text-text-muted hover:text-error"
                aria-label={`Remove ${att.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-width mx-auto">
        <div className="composer-input relative flex items-end gap-2.5 px-3 py-2.5">
          <input
            id="message-attachments"
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.pdf,.json,.js,.ts,.tsx,.jsx,.py,.rs,.go"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="icon-action shrink-0 p-2 text-text-muted hover:text-text-primary"
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onFocus={handleTextareaFocus}
            placeholder="Message your AI assistant..."
            rows={1}
            className="flex-1 bg-transparent text-base leading-6 text-text-primary placeholder:text-text-muted resize-none outline-none py-2 max-h-[200px] min-h-6"
            disabled={isStreaming}
            aria-label="Message input"
          />

          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="icon-action danger shrink-0 p-2 text-error"
              title="Stop generation"
              aria-label="Stop generation"
            >
              <Square size={18} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              className="primary-action shrink-0 !min-h-0 p-2 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Send message"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          )}
        </div>

        <p className="text-center text-xs text-text-muted mt-1.5">
          {isStreaming ? 'Generating response...' : 'Press Enter to send, Shift+Enter for new line'}
        </p>
      </div>
    </div>
  );
}
