

export function TypingIndicator() {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-bg-elevated text-accent border border-border-subtle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <div className="bg-bg-tertiary border border-border-subtle rounded-2xl px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot-delay-1" />
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot-delay-2" />
        </div>
      </div>
    </div>
  );
}
