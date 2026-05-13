import { useRef, useEffect, useCallback, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { EmptyState } from '@/components/onboarding/EmptyState';

export function ChatArea() {
  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId)
  );
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamTextLength = useChatStore((s) => s.getStreamText().length);
  const autoScroll = useSettingsStore((s) => s.autoScroll);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, [autoScroll]);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [activeConversation?.messages.length, scrollToBottom]);

  useEffect(() => {
    if (!isStreaming || !isNearBottom || !autoScroll) return;
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      scrollToBottom('auto');
    });
  }, [autoScroll, isNearBottom, isStreaming, scrollToBottom, streamTextLength]);

  useEffect(() => () => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
  }, []);

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
        className="flex-1 overflow-y-auto px-3 py-4 scroll-smooth sm:px-5 sm:py-5"
      >
        <MessageList messages={activeConversation.messages} />
        <div ref={messagesEndRef} />
      </div>
      {!isNearBottom && (
        <button className="scroll-bottom-button" onClick={() => scrollToBottom()} aria-label="Scroll to latest message">
          <ArrowDown size={16} />
          New messages
        </button>
      )}
      <MessageInput />
    </div>
  );
}
