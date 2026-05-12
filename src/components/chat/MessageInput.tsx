import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, Square, Paperclip, Image, FileText } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';

import { textContent } from '@/lib/utils';
import { assembleContext } from '@/lib/core/context';
import { recordFailure } from '@/lib/providers/health';
import { resolveRoute } from '@/lib/routing/fallback-router';

export function MessageInput() {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; type: string; file?: File }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConversation = useChatStore((s) => s.getActiveConversation)();
  const addMessage = useChatStore((s) => s.addMessage);
  const startStreaming = useChatStore((s) => s.startStreaming);
  const appendChunk = useChatStore((s) => s.appendChunk);
  const finalizeStream = useChatStore((s) => s.finalizeStream);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const setAbortController = useChatStore((s) => s.setAbortController);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);

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

    // Add user message
    addMessage(activeConversation.id, {
      role: 'user',
      content: contentParts,
    });

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

    const streamId = startStreaming(activeConversation.id, route.provider.id, route.modelId);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const context = assembleContext(activeConversation);
      const stream = route.provider.stream(context, controller.signal);

      for await (const chunk of stream) {
        appendChunk(chunk);
      }

      finalizeStream(activeConversation.id, streamId);
    } catch (error) {
      const err = error as Error;
      if (err.name !== 'AbortError') {
        console.error('Stream failed:', err);
        recordFailure(route.provider.id);

        // Try fallback if available
        if (route.fallbackChain.length > 1) {
          const fallbackModelId = route.fallbackChain[1];
          const fallbackRoute = resolveRoute(fallbackModelId, { allowFallback: false });
          if (fallbackRoute) {
            appendChunk({ type: 'status', content: `fallback: ${fallbackRoute.provider.name}` });
            try {
              const context = assembleContext(activeConversation);
              const fallbackStream = fallbackRoute.provider.stream(context, controller.signal);
              for await (const chunk of fallbackStream) {
                appendChunk(chunk);
              }
              finalizeStream(activeConversation.id, streamId);
              return;
            } catch (fallbackErr) {
              recordFailure(fallbackRoute.provider.id);
            }
          }
        }

        appendChunk({ type: 'text', content: `\n\nError: ${err.message}` });
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

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  return (
    <div
      className="border-t border-border-subtle bg-bg-secondary px-4 py-3"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-accent/10 border-2 border-dashed border-accent rounded-lg flex items-center justify-center z-50"
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
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-tertiary border border-border-subtle text-xs text-text-secondary"
            >
              {att.type.startsWith('image') ? <Image size={12} /> : <FileText size={12} />}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="ml-1 text-text-muted hover:text-error"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-bg-tertiary border border-border-subtle rounded-xl px-3 py-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 transition-all">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.pdf,.json,.js,.ts,.tsx,.jsx,.py,.rs,.go"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Attach file"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message your AI assistant..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none outline-none py-2 max-h-[200px] min-h-[20px]"
            disabled={isStreaming}
          />

          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="shrink-0 p-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
              title="Stop generation"
            >
              <Square size={18} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              className="shrink-0 p-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Send message"
            >
              <Send size={18} />
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-text-muted mt-1.5">
          {isStreaming ? 'Generating response...' : 'Press Enter to send, Shift+Enter for new line'}
        </p>
      </div>
    </div>
  );
}
