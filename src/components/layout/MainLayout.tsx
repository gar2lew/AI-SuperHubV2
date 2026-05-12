import { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/settingsStore';
import { useResponsive } from '@/hooks/useResponsive';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { WorkspaceNav } from './WorkspaceNav';
import { ChatArea } from '@/components/chat/ChatArea';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { CommandPalette } from '@/components/command-palette/CommandPalette';

const CodingWorkspace = lazy(() =>
  import('@/components/coding/CodingWorkspace').then((module) => ({ default: module.CodingWorkspace }))
);
const ImageWorkspace = lazy(() =>
  import('@/components/image/ImageWorkspace').then((module) => ({ default: module.ImageWorkspace }))
);
const VoiceWorkspace = lazy(() =>
  import('@/components/voice/VoiceWorkspace').then((module) => ({ default: module.VoiceWorkspace }))
);
const TerminalWorkspace = lazy(() =>
  import('@/components/terminal/TerminalWorkspace').then((module) => ({
    default: module.TerminalWorkspace,
  }))
);

export function MainLayout() {
  const rightPanelOpen = useSettingsStore((s) => s.rightPanelOpen);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const commandPaletteOpen = useSettingsStore((s) => s.commandPaletteOpen);
  const activeWorkspace = useSettingsStore((s) => s.activeWorkspace);
  const { isMobile, isTablet } = useResponsive();

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-bg-primary">
      {!isMobile && <Sidebar />}

      <main className="app-main flex flex-1 flex-col min-w-0">
        <WorkspaceNav />
        <Suspense fallback={<div className="p-6 text-sm text-text-muted">Loading workspace...</div>}>
          {activeWorkspace === 'chat' && <ChatArea />}
          {activeWorkspace === 'coding' && <CodingWorkspace />}
          {activeWorkspace === 'image' && <ImageWorkspace />}
          {activeWorkspace === 'voice' && <VoiceWorkspace />}
          {activeWorkspace === 'terminal' && <TerminalWorkspace />}
        </Suspense>
      </main>

      <AnimatePresence>
        {rightPanelOpen && !isMobile && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: isTablet ? 280 : 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="utility-panel-shell border-l overflow-hidden"
          >
            <RightPanel />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rightPanelOpen && isMobile && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="utility-panel-shell fixed inset-x-0 bottom-14 z-40 max-h-[70vh] overflow-hidden border-t"
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
