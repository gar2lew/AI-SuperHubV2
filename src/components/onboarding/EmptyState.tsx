import { motion } from 'framer-motion';
import { Sparkles, Zap, Code, FileImage, Mic, Wrench } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { textContent } from '@/lib/utils';

const suggestions = [
  { icon: Code, text: 'Write a TypeScript function to parse JSON safely', color: 'text-accent' },
  { icon: Zap, text: 'Explain how React hooks work under the hood', color: 'text-warning' },
  { icon: FileImage, text: 'Describe what you see in an uploaded image', color: 'text-success' },
  { icon: Mic, text: 'Transcribe and summarize this audio clip', color: 'text-error' },
  { icon: Wrench, text: 'Debug this error: Cannot read property of undefined', color: 'text-accent' },
];

export function EmptyState() {
  const createConversation = useChatStore((s) => s.createConversation);

  const handleSuggestion = (text: string) => {
    const id = createConversation();
    setTimeout(() => {
      const addMessage = useChatStore.getState().addMessage;
      addMessage(id, { role: 'user', content: textContent(text) });
    }, 100);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="empty-state-panel w-full max-w-xl px-4 py-5 text-center sm:px-6 sm:py-6"
      >
        <div className="hero-orb mx-auto mb-5 flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
          <Sparkles size={28} className="text-accent" />
        </div>

        <h1 className="text-2xl font-semibold text-text-primary mb-2">AI Workstation</h1>
        <p className="mb-6 text-text-secondary">
          Your personal AI experimentation platform. Multi-provider, extensible, and built for the future.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Try asking
          </p>
          {suggestions.map((suggestion, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * i }}
              onClick={() => handleSuggestion(suggestion.text)}
              className="suggestion-card group flex w-full items-center gap-3 px-4 py-2.5 text-left sm:py-3"
            >
              <suggestion.icon size={18} className={`${suggestion.color} shrink-0`} />
              <span className="text-[0.94rem] text-text-secondary transition-colors group-hover:text-text-primary">
                {suggestion.text}
              </span>
            </motion.button>
          ))}
        </div>

        <div className="mt-6 hidden items-center justify-center gap-4 text-xs text-text-muted sm:flex">
          <span className="flex items-center gap-1">
            <kbd className="kbd-token px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
            +
            <kbd className="kbd-token px-1.5 py-0.5 font-mono text-[10px]">K</kbd>
            <span className="ml-1">Command Palette</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd-token px-1.5 py-0.5 font-mono text-[10px]">/</kbd>
            <span className="ml-1">Search</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
