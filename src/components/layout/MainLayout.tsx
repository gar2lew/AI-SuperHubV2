import { lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/settingsStore';
import { useResponsive } from '@/hooks/useResponsive';
import { recordWorkspaceActivation } from '@/lib/telemetry/runtimeTelemetry';
import { Sidebar } from './Sidebar';
import { WorkspaceNav } from './WorkspaceNav';
import { WorkspaceLoadingSkeleton } from './WorkspaceLoadingSkeleton';
import { ChatArea } from '@/components/chat/ChatArea';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { trackLazyImport } from '@/lib/diagnostics/client-errors';

const CodingWorkspace = lazy(() =>
  trackLazyImport(
    () => import('@/components/coding/CodingWorkspace').then((module) => ({ default: module.CodingWorkspace })),
    'coding workspace'
  )
);
const ImageWorkspace = lazy(() =>
  trackLazyImport(
    () => import('@/components/image/ImageWorkspace').then((module) => ({ default: module.ImageWorkspace })),
    'image workspace'
  )
);
const VoiceWorkspace = lazy(() =>
  trackLazyImport(
    () => import('@/components/voice/VoiceWorkspace').then((module) => ({ default: module.VoiceWorkspace })),
    'voice workspace'
  )
);
const TerminalWorkspace = lazy(() =>
  trackLazyImport(
    () =>
      import('@/components/terminal/TerminalWorkspace').then((module) => ({
        default: module.TerminalWorkspace,
      })),
    'terminal workspace'
  )
);
const RightPanel = lazy(() =>
  trackLazyImport(
    () => import('./RightPanel').then((module) => ({ default: module.RightPanel })),
    'right panel'
  )
);

function LazyWorkspaceContent({ activeWorkspace }: { activeWorkspace: string }) {
  switch (activeWorkspace) {
    case 'coding':
      return <CodingWorkspace />;
    case 'image':
      return <ImageWorkspace />;
    case 'voice':
      return <VoiceWorkspace />;
    case 'terminal':
      return <TerminalWorkspace />;
    default:
      return null;
  }
}

export function MainLayout() {
  const rightPanelOpen = useSettingsStore((s) => s.rightPanelOpen);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const commandPaletteOpen = useSettingsStore((s) => s.commandPaletteOpen);
  const activeWorkspace = useSettingsStore((s) => s.activeWorkspace);
  const { isMobile, isTablet } = useResponsive();

  useEffect(() => {
    const startedAt = performance.now();
    const frame = window.requestAnimationFrame(() => {
      recordWorkspaceActivation(activeWorkspace, performance.now() - startedAt);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeWorkspace]);

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-bg-primary">
      {!isMobile && <Sidebar />}

      <main className="app-main flex flex-1 flex-col min-w-0">
        <WorkspaceNav />
        {activeWorkspace === 'chat' ? (
          <ChatArea />
        ) : (
          <Suspense fallback={<WorkspaceLoadingSkeleton />}>
            <LazyWorkspaceContent activeWorkspace={activeWorkspace} />
          </Suspense>
        )}
      </main>

      <AnimatePresence>
        {rightPanelOpen && !isMobile && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: isTablet ? 288 : 336, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="utility-panel-shell border-l overflow-hidden"
          >
            <Suspense fallback={<div className="p-4 text-sm text-text-muted">Loading utilities...</div>}>
              <RightPanel />
            </Suspense>
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
            <Suspense fallback={<div className="p-4 text-sm text-text-muted">Loading utilities...</div>}>
              <RightPanel />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal open={settingsOpen} />
      <CommandPalette open={commandPaletteOpen} />
    </div>
  );
}
