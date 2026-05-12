import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings, ProviderId } from '@/types';
import { DEFAULT_PRESET_ID, resolvePresetToModel } from '@/lib/models/presets';

export type WorkspaceId = 'chat' | 'coding' | 'image' | 'voice' | 'terminal';

interface SettingsState extends Settings {
  selectedProvider: ProviderId;
  selectedModel: string;
  selectedPreset: string;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  searchOpen: boolean;
  activeWorkspace: WorkspaceId;

  // Actions
  setTheme: (theme: Settings['theme']) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleRightPanel: () => void;
  setSelectedProvider: (provider: ProviderId) => void;
  setSelectedModel: (model: string) => void;
  setSelectedPreset: (preset: string) => void;
  setAutoScroll: (autoScroll: boolean) => void;
  setShowTimestamps: (show: boolean) => void;
  setPersistConversations: (persist: boolean) => void;
  toggleExperimentalFeature: (key: string) => void;
  setProviderSetting: (provider: string, key: string, value: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  setActiveWorkspace: (workspace: WorkspaceId) => void;
}

const defaultSettings: Settings = {
  theme: 'dark',
  sidebarCollapsed: false,
  rightPanelOpen: false,
  autoScroll: true,
  showTimestamps: true,
  persistConversations: true,
  experimentalFeatures: {
    vision: false,
    voice: false,
    agentMode: false,
    codeInterpreter: false,
    reasoning: false,
    fallbackRouting: true,
  },
  providerSettings: {},
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      selectedProvider: 'puter',
      selectedModel: resolvePresetToModel(DEFAULT_PRESET_ID),
      selectedPreset: DEFAULT_PRESET_ID,
      settingsOpen: false,
      commandPaletteOpen: false,
      searchOpen: false,
      activeWorkspace: 'chat',

      setTheme: (theme) => set({ theme }),

      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'dark' ? 'light' : 'dark',
        })),

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
      toggleRightPanel: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

      setSelectedProvider: (selectedProvider) => set({ selectedProvider }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),

      setSelectedPreset: (selectedPreset) => {
        const modelId = resolvePresetToModel(selectedPreset);
        set({ selectedPreset, selectedModel: modelId });
      },

      setAutoScroll: (autoScroll) => set({ autoScroll }),
      setShowTimestamps: (showTimestamps) => set({ showTimestamps }),
      setPersistConversations: (persistConversations) => set({ persistConversations }),

      toggleExperimentalFeature: (key) =>
        set((state) => ({
          experimentalFeatures: {
            ...state.experimentalFeatures,
            [key]: !state.experimentalFeatures[key],
          },
        })),

      setProviderSetting: (provider, key, value) =>
        set((state) => ({
          providerSettings: {
            ...state.providerSettings,
            [provider]: {
              ...state.providerSettings[provider],
              [key]: value,
            },
          },
        })),

      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
      openSearch: () => set({ searchOpen: true }),
      closeSearch: () => set({ searchOpen: false }),
      setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
    }),
    {
      name: 'ai-workstation-settings',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        rightPanelOpen: state.rightPanelOpen,
        autoScroll: state.autoScroll,
        showTimestamps: state.showTimestamps,
        persistConversations: state.persistConversations,
        experimentalFeatures: state.experimentalFeatures,
        providerSettings: state.providerSettings,
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        selectedPreset: state.selectedPreset,
        activeWorkspace: state.activeWorkspace,
      }),
    }
  )
);
