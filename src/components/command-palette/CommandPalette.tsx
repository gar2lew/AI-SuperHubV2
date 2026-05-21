import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MessageSquarePlus, Settings, Sun, PanelRight, Keyboard, Activity, Square, MessageSquare, Code2, Image, Mic2, Terminal } from 'lucide-react';
import { useSettingsStore, type WorkspaceId } from '@/store/settingsStore';
import { useChatStore } from '@/store/chatStore';
import { useWorkstationStore, type CommandHistoryEntry } from '@/store/workstationStore';

interface CommandPaletteProps {
  open: boolean;
}

interface Command {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette({ open }: CommandPaletteProps) {
  const closeCommandPalette = useSettingsStore((s) => s.closeCommandPalette);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);
  const setRightPanelOpen = useSettingsStore((s) => s.setRightPanelOpen);
  const setLastUtilityTab = useSettingsStore((s) => s.setLastUtilityTab);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const setActiveWorkspace = useSettingsStore((s) => s.setActiveWorkspace);
  const createConversation = useChatStore((s) => s.createConversation);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const commandHistory = useWorkstationStore((s) => s.commandHistory);
  const recentPrompts = useWorkstationStore((s) => s.recentPrompts);
  const recordCommand = useWorkstationStore((s) => s.recordCommand);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: Command[] = useMemo(
    () => {
      const items: Command[] = [
        {
          id: 'new-chat',
          label: 'New Chat',
          icon: MessageSquarePlus,
          shortcut: 'Ctrl+N',
          action: () => {
            createConversation();
            setActiveWorkspace('chat');
            closeCommandPalette();
          },
        },
        {
          id: 'toggle-theme',
          label: 'Toggle Theme',
          icon: Sun,
          shortcut: 'Ctrl+Shift+L',
          action: () => {
            toggleTheme();
            closeCommandPalette();
          },
        },
        {
          id: 'toggle-panel',
          label: 'Toggle Right Panel',
          icon: PanelRight,
          shortcut: 'Ctrl+]',
          action: () => {
            toggleRightPanel();
            closeCommandPalette();
          },
        },
        {
          id: 'diagnostics',
          label: 'Open Diagnostics',
          icon: Activity,
          shortcut: 'Ctrl+Shift+D',
          action: () => {
            setLastUtilityTab('diagnostics');
            setRightPanelOpen(true);
            closeCommandPalette();
          },
        },
        {
          id: 'stop-stream',
          label: 'Stop Stream',
          icon: Square,
          shortcut: 'Esc',
          action: () => {
            stopStreaming();
            closeCommandPalette();
          },
        },
        ...workspaceCommands(setActiveWorkspace, closeCommandPalette),
        ...historyCommands(commandHistory, recentPrompts, {
          setActiveWorkspace,
          closeCommandPalette,
          recordCommand,
        }),
        {
          id: 'settings',
          label: 'Open Settings',
          icon: Settings,
          shortcut: 'Ctrl+,',
          action: () => {
            openSettings();
            closeCommandPalette();
          },
        },
      ];
      return items.filter((command) => command.id !== 'stop-stream' || isStreaming);
    },
    [
      createConversation,
      isStreaming,
      commandHistory,
      recentPrompts,
      recordCommand,
      setActiveWorkspace,
      toggleTheme,
      toggleRightPanel,
      setRightPanelOpen,
      setLastUtilityTab,
      openSettings,
      closeCommandPalette,
      stopStreaming,
    ]
  );

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.id.includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        closeCommandPalette();
        return;
      }

      if (e.key === 'ArrowDown') {
        if (filtered.length === 0) return;
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        if (filtered.length === 0) return;
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filtered[selectedIndex];
        if (selected) {
          recordCommand({ kind: 'command', label: selected.label, value: selected.id });
          selected.action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filtered, selectedIndex, closeCommandPalette, recordCommand]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={closeCommandPalette}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            className="modal-panel w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="panel-header flex items-center gap-3 px-4 py-3">
              <Search size={18} className="text-text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
                autoFocus
              />
              <kbd className="kbd-token px-1.5 py-0.5 text-[10px] text-text-muted font-mono">
                ESC
              </kbd>
            </div>

            {/* Commands list */}
            <div className="max-h-64 overflow-y-auto py-2">
              {filtered.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  No commands found
                </div>
              )}
              {filtered.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    recordCommand({ kind: 'command', label: cmd.label, value: cmd.id });
                    cmd.action();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIndex
                      ? 'command-item is-active text-accent'
                      : 'command-item text-text-secondary'
                  }`}
                >
                  <cmd.icon size={16} />
                  <span className="flex-1 text-sm">{cmd.label}</span>
                  {cmd.shortcut && (
                    <kbd className="kbd-token px-1.5 py-0.5 text-[10px] text-text-muted font-mono">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="panel-header flex items-center gap-4 px-4 py-2 text-[10px] text-text-muted">
              <span className="flex items-center gap-1">
                <Keyboard size={10} />
                <span>↑↓ to navigate</span>
              </span>
              <span>↵ to select</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function workspaceCommands(
  setActiveWorkspace: (workspace: WorkspaceId) => void,
  closeCommandPalette: () => void
): Command[] {
  const workspaces: Array<{ id: WorkspaceId; label: string; icon: React.ElementType; shortcut: string }> = [
    { id: 'chat', label: 'Switch to Chat', icon: MessageSquare, shortcut: 'Ctrl+1' },
    { id: 'coding', label: 'Switch to Coding', icon: Code2, shortcut: 'Ctrl+2' },
    { id: 'image', label: 'Switch to Image', icon: Image, shortcut: 'Ctrl+3' },
    { id: 'voice', label: 'Switch to Voice', icon: Mic2, shortcut: 'Ctrl+4' },
    { id: 'terminal', label: 'Switch to Terminal', icon: Terminal, shortcut: 'Ctrl+5' },
  ];

  return workspaces.map((workspace) => ({
    id: `workspace-${workspace.id}`,
    label: workspace.label,
    icon: workspace.icon,
    shortcut: workspace.shortcut,
    action: () => {
      setActiveWorkspace(workspace.id);
      closeCommandPalette();
    },
  }));
}

function historyCommands(
  commandHistory: CommandHistoryEntry[],
  recentPrompts: CommandHistoryEntry[],
  actions: {
    setActiveWorkspace: (workspace: WorkspaceId) => void;
    closeCommandPalette: () => void;
    recordCommand: (entry: Omit<CommandHistoryEntry, 'id' | 'createdAt' | 'useCount'>) => void;
  }
): Command[] {
  const recentCommands = commandHistory
    .filter((entry) => entry.kind !== 'prompt')
    .slice(0, 5)
    .map((entry) => ({
      id: `recent-${entry.id}`,
      label: `Recent: ${entry.label}`,
      icon: Keyboard,
      action: () => {
        actions.recordCommand({
          kind: entry.kind,
          label: entry.label,
          value: entry.value,
          workspace: entry.workspace,
        });
        if (entry.kind === 'workspace' && entry.workspace) {
          actions.setActiveWorkspace(entry.workspace);
        }
        actions.closeCommandPalette();
      },
    }));

  const promptCommands = recentPrompts.slice(0, 5).map((entry) => ({
    id: `prompt-${entry.id}`,
    label: `Recall prompt: ${entry.label}`,
    icon: MessageSquare,
    action: () => {
      actions.setActiveWorkspace('chat');
      actions.recordCommand({
        kind: 'prompt',
        label: entry.label,
        value: entry.value,
        workspace: entry.workspace ?? 'chat',
      });
      window.dispatchEvent(new CustomEvent('ai-superhub:recall-prompt', { detail: { prompt: entry.value } }));
      actions.closeCommandPalette();
    },
  }));

  return [...promptCommands, ...recentCommands];
}
