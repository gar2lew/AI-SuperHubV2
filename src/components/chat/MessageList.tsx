import { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Message } from '@/types';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { useChatStore } from '@/store/chatStore';
import { textContent } from '@/lib/utils';
import { useRenderProfile } from '@/hooks/useRenderProfile';

interface MessageListProps {
  messages: Message[];
}

export const MessageList = memo(function MessageList({ messages }: MessageListProps) {
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeExecution = useChatStore((s) => s.getActiveExecution());
  const streamLifecycle = useChatStore((s) => s.getStreamLifecycle());
  const streamText = useChatStore((s) => s.getStreamText());
  const streamStatus = useChatStore((s) => s.getStreamStatus());
  const reduceMotion = useReducedMotion();
  useRenderProfile('MessageList');
  const runtimeLifecycle = activeExecution?.lifecycle ?? streamLifecycle;
  const runtimeText = activeExecution?.partialText ?? streamText;
  const isRuntimeActive =
    Boolean(activeExecution) || (isStreaming && runtimeLifecycle !== 'idle');
  const streamingMessage = useMemo<Message>(
    () => ({
      id: activeExecution?.messageId ?? 'streaming',
      role: 'assistant',
      content: textContent(runtimeText),
      createdAt: 0,
      metadata: activeExecution ? { executionId: activeExecution.executionId } : undefined,
    }),
    [activeExecution, runtimeText]
  );

  return (
    <div className="message-list chat-width mx-auto">
      {messages.map((message, index) => (
        <motion.div
          key={message.id}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={
            index > 0 && messages[index - 1].role === message.role
              ? 'message-item is-grouped'
              : 'message-item'
          }
        >
          <MessageBubble message={message} grouped={index > 0 && messages[index - 1].role === message.role} />
        </motion.div>
      ))}

      {isRuntimeActive && runtimeLifecycle !== 'idle' && runtimeText && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="message-item stream-reveal"
        >
          <MessageBubble
            message={streamingMessage}
            isStreaming={true}
            streamStatus={streamStatus}
          />
        </motion.div>
      )}

      {isRuntimeActive && runtimeLifecycle !== 'idle' && !runtimeText && (
        <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
          <TypingIndicator status={streamStatus} />
        </motion.div>
      )}
    </div>
  );
});
