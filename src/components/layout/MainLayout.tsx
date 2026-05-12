import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/settingsStore';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { ChatArea } from '@/components/chat/ChatArea';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { CommandPalette } from '@/components/command-palette/CommandPalette';

export function MainLayout() {
  const rightPanelOpen = useSettingsStore((s) => s.rightPanelOpen);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const commandPaletteOpen = useSettingsStore((s) => s.commandPaletteOpen);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      <Sidebar />

      <main className="flex flex-1 flex-col min-w-0">
        <ChatArea />
      </main>

      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="border-l border-border-subtle overflow-hidden"
          >
            <RightPanel />
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal open={settingsOpen} />
      <CommandPalette open={commandPaletteOpen} />
    </div>
  );
}
