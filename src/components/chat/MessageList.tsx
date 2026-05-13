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
  const streamText = useChatStore((s) => s.getStreamText());
  const reduceMotion = useReducedMotion();
  useRenderProfile('MessageList');
  const streamingMessage = useMemo<Message>(
    () => ({
      id: 'streaming',
      role: 'assistant',
      content: textContent(streamText),
      createdAt: 0,
    }),
    [streamText]
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

      {isStreaming && streamText && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="message-item stream-reveal"
        >
          <MessageBubble
            message={streamingMessage}
            isStreaming={true}
          />
        </motion.div>
      )}

      {isStreaming && !streamText && (
        <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
          <TypingIndicator />
        </motion.div>
      )}
    </div>
  );
});
