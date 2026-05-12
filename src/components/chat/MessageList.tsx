import { motion } from 'framer-motion';
import type { Message } from '@/types';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { useChatStore } from '@/store/chatStore';
import { textContent } from '@/lib/utils';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamText = useChatStore((s) => s.getStreamText());

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {messages.map((message, index) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index === messages.length - 1 ? 0 : 0 }}
        >
          <MessageBubble message={message} />
        </motion.div>
      ))}

      {isStreaming && streamText && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: textContent(streamText),
              createdAt: Date.now(),
            }}
            isStreaming={true}
          />
        </motion.div>
      )}

      {isStreaming && !streamText && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <TypingIndicator />
        </motion.div>
      )}
    </div>
  );
}
