import { useState } from 'react';
import { CheckCircle2, CornerDownLeft, Terminal as TerminalIcon } from 'lucide-react';
import { terminalAdapter, type TerminalEntry } from '@/lib/terminal';

export function TerminalWorkspace() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [height, setHeight] = useState(420);

  const execute = async () => {
    const entry = await terminalAdapter.execute(input);
    setHistory((prev) => [entry, ...prev].slice(0, 20));
    setInput('');
    setHistoryIndex(-1);
  };

  const recallHistory = (direction: 1 | -1) => {
    if (history.length === 0) return;
    const next = Math.min(history.length - 1, Math.max(0, historyIndex + direction));
    setHistoryIndex(next);
    setInput(history[next].command);
  };

  return (
    <section className="workspace-surface terminal-surface">
      <div className="workspace-header">
        <div>
          <h1>Terminal Foundation</h1>
          <p>Provider-ready command UI with safe mock execution.</p>
        </div>
        <span className="status-pill">UI-only</span>
      </div>

      <div className="terminal-panel" style={{ height }}>
        <div className="terminal-input-row">
          <TerminalIcon size={18} />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') execute();
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                recallHistory(1);
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                recallHistory(-1);
              }
            }}
            placeholder="Type a command for the mock adapter..."
            aria-label="Mock terminal command"
          />
          <button onClick={execute} title="Run mock command" aria-label="Run mock command">
            <CornerDownLeft size={16} />
          </button>
        </div>

        <div className="terminal-history">
          {history.length === 0 ? (
            <pre>mock terminal ready. shell execution is disabled.</pre>
          ) : (
            history.map((entry) => (
              <pre key={entry.id}>
                <span className="terminal-meta">
                  <CheckCircle2 size={13} />
                  {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {entry.status}
                </span>
                {'\n'}
                <span>$ {entry.command}</span>
                {'\n'}
                {entry.output}
              </pre>
            ))
          )}
        </div>
        <label className="terminal-resize">
          <span>Terminal height</span>
          <input
            type="range"
            min="280"
            max="680"
            step="20"
            value={height}
            onChange={(event) => setHeight(Number(event.target.value))}
          />
        </label>
      </div>
    </section>
  );
}
