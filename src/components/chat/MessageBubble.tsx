import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Copy, Check, Clock, Volume2, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import type { Message } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { useChatStore } from '@/store/chatStore';
import { formatTimestamp, copyMessageContent } from '@/lib/utils';
import { MarkdownRenderer } from './renderers/MarkdownRenderer';
import { StreamingTextRenderer } from './renderers/StreamingTextRenderer';
import { VisionMessage } from './message/VisionMessage';
import { ReasoningRenderer } from './renderers/ReasoningRenderer';
import { textToSpeechArtifact } from '@/lib/providers/puter/speech';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  grouped?: boolean;
  streamStatus?: string;
}

export function MessageBubble({ message, isStreaming, grouped, streamStatus }: MessageBubbleProps) {
  const showTimestamps = useSettingsStore((s) => s.showTimestamps);
  const isAppStreaming = useChatStore((s) => s.isStreaming);
  const [copied, setCopied] = useState(false);
  const [ttsState, setTtsState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const handleCopy = async () => {
    await copyMessageContent(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTTS = async () => {
    const text = message.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ');

    if (!text.trim()) return;

    setTtsState('loading');
    try {
      const artifact = await textToSpeechArtifact(text);
      const audio = new Audio(artifact.url);
      audioRef.current = audio;

      audio.onended = () => {
        setTtsState('idle');
        if (artifact.blob) URL.revokeObjectURL(artifact.url);
      };
      audio.onerror = () => {
        setTtsState('error');
        setTimeout(() => setTtsState('idle'), 2000);
      };

      setTtsState('playing');
      await audio.play();
    } catch {
      setTtsState('error');
      setTimeout(() => setTtsState('idle'), 2000);
    }
  };

  const handleRetry = () => {
    if (!message.metadata?.retryPrompt || isAppStreaming) return;
    window.dispatchEvent(
      new CustomEvent('ai-superhub:retry-chat', {
        detail: {
          prompt: message.metadata.retryPrompt,
          providerId: message.metadata.provider,
          modelId: message.metadata.model,
        },
      })
    );
  };

  const hasReasoning = !!message.metadata?.reasoning;
  const canRetry = isAssistant && message.metadata?.retryable && message.metadata.retryPrompt;

  return (
    <article
      className={`message-bubble group flex gap-2.5 sm:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${
        isStreaming ? 'is-streaming' : ''
      }`}
      aria-live={isStreaming ? 'polite' : undefined}
    >
      {/* Avatar */}
      <div
        className={`avatar-token shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center ${
          grouped ? 'opacity-0' : ''
        } ${isUser ? 'is-user text-white' : 'is-assistant text-accent'}`}
        aria-hidden={grouped}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'max-w-[78%]' : 'max-w-[88%]'}`}>
        <div
          className={`message-content relative rounded-2xl px-4 py-3 sm:px-5 sm:py-4 ${
            isUser
              ? 'user-message ml-auto'
              : 'assistant-message'
          }`}
        >
          {/* Action buttons */}
          <div className="message-toolbar absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* TTS button (assistant only) */}
            {isAssistant && (
              <button
                onClick={handleTTS}
                disabled={ttsState === 'loading' || ttsState === 'playing'}
                className="message-action p-1.5 text-text-muted hover:text-text-primary"
                title={ttsState === 'error' ? 'TTS failed' : ttsState === 'playing' ? 'Playing...' : 'Read aloud'}
                aria-label={ttsState === 'error' ? 'TTS failed' : ttsState === 'playing' ? 'Playing' : 'Read aloud'}
              >
                {ttsState === 'loading' && <Loader2 size={14} className="animate-spin" />}
                {ttsState === 'playing' && <Volume2 size={14} className="text-accent" />}
                {ttsState === 'error' && <AlertCircle size={14} className="text-error" />}
                {ttsState === 'idle' && <Volume2 size={14} />}
              </button>
            )}
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="message-action p-1.5 text-text-muted hover:text-text-primary"
              title="Copy"
              aria-label="Copy message"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          {/* Render content parts */}
          <div className="space-y-2">
            {message.content.map((part, i) => {
              if (part.type === 'text') {
                return isUser ? (
                  <p key={i} className="text-[0.97rem] leading-relaxed whitespace-pre-wrap">
                    {part.text}
                  </p>
                ) : isStreaming ? (
                  <StreamingTextRenderer key={i} text={part.text} />
                ) : (
                  <MarkdownRenderer key={i} text={part.text} />
                );
              }
              if (part.type === 'image') {
                return <VisionMessage key={i} url={part.url} file={part.file} />;
              }
              if (part.type === 'file') {
                return (
                  <div
                    key={i}
                    className="content-chip flex items-center gap-2 p-2 text-xs text-text-secondary"
                  >
                    <span className="font-mono">📎</span>
                    <span>{part.name || 'File'}</span>
                  </div>
                );
              }
              if (part.type === 'audio') {
                return (
                  <div
                    key={i}
                    className="content-chip flex items-center gap-2 p-2 text-xs text-text-secondary"
                  >
                    <span className="font-mono">🔊</span>
                    <span>Audio</span>
                  </div>
                );
              }
              return null;
            })}
          </div>

          {/* Reasoning trace */}
          {hasReasoning && message.metadata?.reasoning && (
            <ReasoningRenderer reasoning={message.metadata.reasoning} />
          )}

          {streamStatus && (
            <p className="mt-2 text-xs text-text-muted" aria-live="polite">
              {streamStatus}
            </p>
          )}

          {canRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isAppStreaming}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={isAppStreaming ? 'Retry available after current stream finishes' : 'Retry failed request'}
            >
              <RotateCcw size={13} />
              Retry
            </button>
          )}

          {/* Streaming cursor */}
          {isStreaming && (
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.95, repeat: Infinity, ease: 'easeInOut' }}
              className="stream-cursor inline-block align-middle"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Timestamp */}
        {showTimestamps && (
          <div
            className={`flex items-center gap-1 mt-1.5 text-xs text-text-muted ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
          >
            <Clock size={10} />
            <time dateTime={new Date(message.createdAt).toISOString()}>{formatTimestamp(message.createdAt)}</time>
          </div>
        )}
      </div>
    </article>
  );
}
