import { useRef, useEffect, useCallback } from 'react';
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

  const scrollToBottom = useCallback(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScroll]);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages.length, isStreaming, scrollToBottom]);

  if (!activeConversation) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
      >
        <MessageList messages={activeConversation.messages} />
        <div ref={messagesEndRef} />
      </div>
      <MessageInput />
    </div>
  );
}
