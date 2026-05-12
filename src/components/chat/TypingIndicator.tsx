
import { Bot } from 'lucide-react';

export function TypingIndicator() {
  return (
    <div className="typing-indicator flex gap-3 sm:gap-4" role="status" aria-label="Assistant is thinking">
      <div className="avatar-token is-assistant shrink-0 w-8 h-8 flex items-center justify-center text-accent">
        <Bot size={16} />
      </div>
      <div className="typing-card assistant-message px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot-delay-1" />
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot-delay-2" />
        </div>
        <span className="sr-only">Assistant is preparing a response</span>
      </div>
    </div>
  );
}
