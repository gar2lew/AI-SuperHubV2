import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Copy, Check, Clock, Volume2, Loader2, AlertCircle } from 'lucide-react';
import type { Message } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { formatTimestamp, copyMessageContent } from '@/lib/utils';
import { MarkdownRenderer } from './renderers/MarkdownRenderer';
import { VisionMessage } from './message/VisionMessage';
import { ReasoningRenderer } from './renderers/ReasoningRenderer';
import { getPuterAISafe } from '@/lib/providers/puter/runtime';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const showTimestamps = useSettingsStore((s) => s.showTimestamps);
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
    const ai = getPuterAISafe();
    if (!ai) {
      setTtsState('error');
      setTimeout(() => setTtsState('idle'), 2000);
      return;
    }

    const text = message.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ');

    if (!text.trim()) return;

    setTtsState('loading');
    try {
      const audioBlob = await ai.txt2speech(text);
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setTtsState('idle');
        URL.revokeObjectURL(url);
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

  const hasReasoning = !!message.metadata?.reasoning;

  return (
    <div className={`group flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
          isUser
            ? 'bg-accent text-white'
            : 'bg-bg-elevated text-accent border border-border-subtle'
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'max-w-[80%]' : 'max-w-[85%]'}`}>
        <div
          className={`relative rounded-2xl px-5 py-3.5 ${
            isUser
              ? 'bg-accent text-white ml-auto'
              : 'bg-bg-tertiary border border-border-subtle'
          }`}
        >
          {/* Action buttons */}
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* TTS button (assistant only) */}
            {isAssistant && (
              <button
                onClick={handleTTS}
                disabled={ttsState === 'loading' || ttsState === 'playing'}
                className="p-1.5 rounded-md bg-bg-elevated/80 hover:bg-bg-hover text-text-muted hover:text-text-primary transition-all"
                title={ttsState === 'error' ? 'TTS failed' : ttsState === 'playing' ? 'Playing...' : 'Read aloud'}
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
              className="p-1.5 rounded-md bg-bg-elevated/80 hover:bg-bg-hover text-text-muted hover:text-text-primary transition-all"
              title="Copy"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          {/* Render content parts */}
          <div className="space-y-2">
            {message.content.map((part, i) => {
              if (part.type === 'text') {
                return isUser ? (
                  <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
                    {part.text}
                  </p>
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
                    className="flex items-center gap-2 p-2 rounded bg-bg-elevated text-xs text-text-secondary"
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
                    className="flex items-center gap-2 p-2 rounded bg-bg-elevated text-xs text-text-secondary"
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

          {/* Streaming cursor */}
          {isStreaming && (
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="inline-block w-2 h-4 bg-accent ml-0.5 align-middle"
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
            <span>{formatTimestamp(message.createdAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
