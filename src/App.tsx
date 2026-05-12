import { useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';

function KeyboardShortcuts() {
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const openCommandPalette = useSettingsStore((s) => s.openCommandPalette);
  const openSearch = useSettingsStore((s) => s.openSearch);
  const createConversation = useChatStore((s) => s.createConversation);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        openSearch();
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
    openSettings,
    openCommandPalette,
    openSearch,
    createConversation,
  ]);

  return null;
}

function App() {
  return (
    <>
      <KeyboardShortcuts />
      <MainLayout />
    </>
  );
}

export default App;
