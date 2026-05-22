import { useEffect, useState } from 'react';
import { CheckCircle2, CornerDownLeft, MessageSquare, StickyNote, Terminal as TerminalIcon } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { terminalAdapter, type TerminalEntry } from '@/lib/terminal';
import { useWorkstationStore } from '@/store/workstationStore';

export function TerminalWorkspace() {
  const savedState = useWorkstationStore((s) => s.terminalWorkspace);
  const updateTerminalWorkspace = useWorkstationStore((s) => s.updateTerminalWorkspace);
  const recordCommand = useWorkstationStore((s) => s.recordCommand);
  const addWorkflowContext = useWorkstationStore((s) => s.addWorkflowContext);
  const setActiveWorkspace = useSettingsStore((s) => s.setActiveWorkspace);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const createConversation = useChatStore((s) => s.createConversation);
  const [input, setInput] = useState(savedState.input);
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [height, setHeight] = useState(savedState.height);

  useEffect(() => {
    setInput((current) => (current === savedState.input ? current : savedState.input));
  }, [savedState.input]);

  const execute = async () => {
    const entry = await terminalAdapter.execute(input);
    const previousCommands = useWorkstationStore.getState().terminalWorkspace.commandHistory;
    setHistory((prev) => [entry, ...prev].slice(0, 20));
    setInput('');
    updateTerminalWorkspace({
      input: '',
      commandHistory: [input, ...previousCommands].filter(Boolean).slice(0, 20),
    });
    recordCommand({ kind: 'command', label: input, value: input, workspace: 'terminal' });
    setHistoryIndex(-1);
  };

  const recallHistory = (direction: 1 | -1) => {
    if (history.length === 0) return;
    const next = Math.min(history.length - 1, Math.max(0, historyIndex + direction));
    setHistoryIndex(next);
    setInput(history[next].command);
  };

  const sendOutputToChat = (entry: TerminalEntry) => {
    addWorkflowContext({
      type: 'terminal-output',
      title: entry.command,
      summary: entry.output,
      sourceWorkspace: 'terminal',
      payload: {
        command: entry.command,
        output: entry.output,
        metadata: {
          status: entry.status,
        },
      },
    }, { attach: true });
    if (!activeConversationId) {
      createConversation();
    }
    setActiveWorkspace('chat');
  };

  const saveOutputAsNote = (entry: TerminalEntry) => {
    addWorkflowContext({
      type: 'workspace-note',
      title: `Note: ${entry.command}`,
      summary: entry.output,
      sourceWorkspace: 'terminal',
      payload: {
        text: `$ ${entry.command}\n${entry.output}`,
      },
    });
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
            onChange={(event) => {
              setInput(event.target.value);
              updateTerminalWorkspace({ input: event.target.value });
            }}
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
                <span className="terminal-entry-actions">
                  <button type="button" onClick={() => sendOutputToChat(entry)} aria-label={`Send output for ${entry.command} to Chat`} title="Send output to Chat">
                    <MessageSquare size={12} />
                  </button>
                  <button type="button" onClick={() => saveOutputAsNote(entry)} aria-label={`Save output for ${entry.command} as note`} title="Save output as note">
                    <StickyNote size={12} />
                  </button>
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
            onChange={(event) => {
              const next = Number(event.target.value);
              setHeight(next);
              updateTerminalWorkspace({ height: next });
            }}
          />
        </label>
      </div>
    </section>
  );
}
