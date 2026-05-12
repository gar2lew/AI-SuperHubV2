import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MessageSquarePlus, Settings, Sun, PanelRight, Keyboard } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useChatStore } from '@/store/chatStore';

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
  const openSettings = useSettingsStore((s) => s.openSettings);
  const createConversation = useChatStore((s) => s.createConversation);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: Command[] = useMemo(
    () => [
      {
        id: 'new-chat',
        label: 'New Chat',
        icon: MessageSquarePlus,
        shortcut: 'Ctrl+N',
        action: () => {
          createConversation();
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
        shortcut: 'Ctrl+\\',
        action: () => {
          toggleRightPanel();
          closeCommandPalette();
        },
      },
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
    ],
    [createConversation, toggleTheme, toggleRightPanel, openSettings, closeCommandPalette]
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
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        filtered[selectedIndex]?.action();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filtered, selectedIndex, closeCommandPalette]);

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
                  onClick={cmd.action}
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
