import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkstationStore } from '@/store/workstationStore';
import { recordHydrationComplete } from '@/lib/telemetry/runtimeTelemetry';
import { beginPuterRuntimeBootstrap } from '@/lib/providers/puter/runtime';

function KeyboardShortcuts() {
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const openCommandPalette = useSettingsStore((s) => s.openCommandPalette);
  const openSearch = useSettingsStore((s) => s.openSearch);
  const setActiveWorkspace = useSettingsStore((s) => s.setActiveWorkspace);
  const setLastUtilityTab = useSettingsStore((s) => s.setLastUtilityTab);
  const setRightPanelOpen = useSettingsStore((s) => s.setRightPanelOpen);
  const createConversation = useChatStore((s) => s.createConversation);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const recordCommand = useWorkstationStore((s) => s.recordCommand);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      // Command palette: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
        return;
      }

      // New chat: Ctrl+N
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createConversation();
        setActiveWorkspace('chat');
        return;
      }

      // Settings: Ctrl+,
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        openSettings();
        return;
      }

      // Search: /
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTypingTarget) return;
        e.preventDefault();
        openSearch();
        return;
      }

      if (e.key === 'Escape' && useChatStore.getState().isStreaming && !isTypingTarget) {
        e.preventDefault();
        stopStreaming();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setLastUtilityTab('diagnostics');
        setRightPanelOpen(!useSettingsStore.getState().rightPanelOpen);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        const workspace = (['chat', 'coding', 'image', 'voice', 'terminal'] as const)[Number(e.key) - 1];
        setActiveWorkspace(workspace);
        recordCommand({
          kind: 'workspace',
          label: `Switch to ${workspace}`,
          value: workspace,
          workspace,
        });
        return;
      }

      // Toggle sidebar: Ctrl+[
      if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Toggle right panel: Ctrl+]
      if ((e.ctrlKey || e.metaKey) && e.key === ']') {
        e.preventDefault();
        toggleRightPanel();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    toggleSidebar,
    toggleRightPanel,
    setRightPanelOpen,
    openSettings,
    openCommandPalette,
    openSearch,
    setLastUtilityTab,
    setActiveWorkspace,
    createConversation,
    stopStreaming,
    recordCommand,
  ]);

  return null;
}

function App() {
  useEffect(() => {
    recordHydrationComplete();
    void beginPuterRuntimeBootstrap();
  }, []);

  return (
    <>
      <KeyboardShortcuts />
      <MainLayout />
    </>
  );
}

export default App;
