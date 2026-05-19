import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Square, Paperclip, Image, FileText } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

import { textContent } from '@/lib/utils';
import { executeChatRequest } from '@/lib/core/chat-orchestrator';
import { resetPuterConnectionStateForRetry } from '@/lib/providers/puter/runtime';
import { recordRuntimeEvent } from '@/lib/telemetry/runtimeTelemetry';

interface ComposerAttachment {
  name: string;
  type: string;
  size?: number;
  lastModified?: number;
  file?: File;
  restored?: boolean;
}

export function MessageInput() {
  const [input, setInput] = useState('');
  const [retryOverride, setRetryOverride] = useState<{
    prompt: string;
    providerId?: string;
    modelId?: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId)
  );
  const addMessage = useChatStore((s) => s.addMessage);
  const startStreaming = useChatStore((s) => s.startStreaming);
  const appendChunk = useChatStore((s) => s.appendChunk);
  const beginFallback = useChatStore((s) => s.beginFallback);
  const finalizeStream = useChatStore((s) => s.finalizeStream);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const setAbortController = useChatStore((s) => s.setAbortController);
  const setDraft = useChatStore((s) => s.setDraft);
  const clearDraft = useChatStore((s) => s.clearDraft);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const workspaceContext = useWorkspaceStore((s) => s.getInjectableContext());

  useEffect(() => {
    const draft = activeConversation ? useChatStore.getState().drafts[activeConversation.id] : undefined;
    setInput(draft?.text ?? '');
    setRetryOverride(null);
    setAttachments(
      draft?.attachments.map((attachment) => ({
        name: attachment.name,
        type: attachment.mimeType ?? '',
        size: attachment.size,
        lastModified: attachment.lastModified,
        restored: true,
      })) ?? []
    );
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [activeConversation?.id]);

  useEffect(() => {
    const handleRetry = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; providerId?: string; modelId?: string }>).detail;
      const prompt = detail?.prompt;
      if (!prompt) return;
      if (useChatStore.getState().isStreaming) return;
      if (!resetPuterConnectionStateForRetry()) return;
      recordRuntimeEvent({
        type: 'retry_triggered',
        providerId: detail.providerId,
        modelId: detail.modelId,
        message: 'chat retry requested',
      });
      setRetryOverride({ prompt, providerId: detail.providerId, modelId: detail.modelId });
      setInput(prompt);
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    window.addEventListener('ai-superhub:retry-chat', handleRetry);
    return () => window.removeEventListener('ai-superhub:retry-chat', handleRetry);
  }, []);

  const handleSend = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || !activeConversation || isStreaming) return;

    const userText = input.trim();
    const retryForSend = retryOverride?.prompt === userText ? retryOverride : null;
    setInput('');
    setRetryOverride(null);
    clearDraft(activeConversation.id);

    // Build content parts from text + attachments
    const contentParts = textContent(userText);
    const imageAttachments = attachments.filter((a) => a.type.startsWith('image'));
    for (const img of imageAttachments) {
      contentParts.push({
        type: 'image',
        file: img.file,
        name: img.name,
        size: img.size,
        lastModified: img.lastModified,
        mimeType: img.type,
        persistenceState: img.file ? 'available' : 'metadata-only',
      });
    }
    const fileAttachments = attachments.filter((a) => !a.type.startsWith('image'));
    for (const f of fileAttachments) {
      contentParts.push({
        type: 'file',
        file: f.file,
        name: f.name,
        size: f.size,
        lastModified: f.lastModified,
        mimeType: f.type,
        persistenceState: f.file ? 'available' : 'metadata-only',
      });
    }
    setAttachments([]);

    await executeChatRequest(
      {
        conversation: activeConversation,
        contentParts,
        prompt: userText,
        selectedModel,
        selectedProvider,
        retryOverride: retryForSend,
        workspaceContext,
      },
      {
        addMessage,
        startStreaming,
        appendChunk,
        beginFallback,
        finalizeStream,
        setAbortController,
        getCurrentStreamId: () => useChatStore.getState().getCurrentStreamId(),
      }
    );
  }, [
    input,
    attachments,
    activeConversation,
    isStreaming,
    addMessage,
    startStreaming,
    appendChunk,
    beginFallback,
    finalizeStream,
    setAbortController,
    clearDraft,
    selectedProvider,
    selectedModel,
    retryOverride,
    workspaceContext,
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
      size: f.size,
      lastModified: f.lastModified,
      file: f,
    }));
    setAttachments((prev) => {
      const next = [...prev, ...newAttachments];
      if (activeConversation) {
        setDraft(activeConversation.id, {
          text: input,
          attachments: next.map((attachment) => ({
            name: attachment.name,
            mimeType: attachment.type,
            size: attachment.size,
            lastModified: attachment.lastModified,
          })),
        });
      }
      return next;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files.map((f) => ({
      name: f.name,
      type: f.type,
      size: f.size,
      lastModified: f.lastModified,
      file: f,
    }));
    setAttachments((prev) => {
      const next = [...prev, ...newAttachments];
      if (activeConversation) {
        setDraft(activeConversation.id, {
          text: input,
          attachments: next.map((attachment) => ({
            name: attachment.name,
            mimeType: attachment.type,
            size: attachment.size,
            lastModified: attachment.lastModified,
          })),
        });
      }
      return next;
    });
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
              {att.restored && <span className="text-text-muted">(restore to send)</span>}
              <button
                onClick={() => setAttachments((prev) => {
                  const next = prev.filter((_, idx) => idx !== i);
                  if (activeConversation) {
                    setDraft(activeConversation.id, {
                      text: input,
                      attachments: next.map((attachment) => ({
                        name: attachment.name,
                        mimeType: attachment.type,
                        size: attachment.size,
                        lastModified: attachment.lastModified,
                      })),
                    });
                  }
                  return next;
                })}
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
              if (retryOverride && e.target.value !== retryOverride.prompt) {
                setRetryOverride(null);
              }
              if (activeConversation) {
                setDraft(activeConversation.id, {
                  text: e.target.value,
                  attachments: attachments.map((attachment) => ({
                    name: attachment.name,
                    mimeType: attachment.type,
                    size: attachment.size,
                    lastModified: attachment.lastModified,
                  })),
                });
              }
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
