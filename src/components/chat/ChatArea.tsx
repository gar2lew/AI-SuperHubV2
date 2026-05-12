import { useRef, useEffect, useCallback, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { EmptyState } from '@/components/onboarding/EmptyState';

export function ChatArea() {
  const activeConversation = useChatStore((s) => s.getActiveConversation)();
  const isStreaming = useChatStore((s) => s.isStreaming);
  const autoScroll = useSettingsStore((s) => s.autoScroll);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScroll]);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages.length, isStreaming, scrollToBottom]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distance < 140);
  };

  if (!activeConversation) {
    return <EmptyState />;
  }

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-5 scroll-smooth sm:px-4 sm:py-6"
      >
        <MessageList messages={activeConversation.messages} />
        <div ref={messagesEndRef} />
      </div>
      {!isNearBottom && (
        <button className="scroll-bottom-button" onClick={scrollToBottom} aria-label="Scroll to latest message">
          <ArrowDown size={16} />
          New messages
        </button>
      )}
      <MessageInput />
    </div>
  );
}
