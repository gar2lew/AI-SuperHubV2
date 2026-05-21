import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings, ProviderId } from '@/types';
import { DEFAULT_PRESET_ID, OTHER_MODELS_PRESET_ID, getPreset, resolvePresetToModel } from '@/lib/models/presets';
import { modelRegistry } from '@/lib/models/registry';
import { WORKSTATION_SCHEMA_VERSION } from '@/lib/persistence/governance';

export type WorkspaceId = 'chat' | 'coding' | 'image' | 'voice' | 'terminal';
export type UtilityTabId = 'files' | 'uploads' | 'tools' | 'artifacts' | 'diagnostics';

interface SettingsState extends Settings {
  selectedProvider: ProviderId;
  selectedModel: string;
  selectedPreset: string;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  searchOpen: boolean;
  activeWorkspace: WorkspaceId;
  lastUtilityTab: UtilityTabId;
  rightPanelWidth: number;
  recentWorkspaces: WorkspaceId[];

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
  setLastUtilityTab: (tab: UtilityTabId) => void;
  setRightPanelWidth: (width: number) => void;
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

const defaultModelId = resolvePresetToModel(DEFAULT_PRESET_ID);
const defaultModelProvider = modelRegistry.get(defaultModelId)?.provider;

function isProviderId(provider: string): provider is ProviderId {
  return ['puter', 'openai', 'anthropic', 'ollama', 'openrouter'].includes(provider);
}

function providerOrDefault(provider: string | undefined): ProviderId {
  return provider && isProviderId(provider) ? provider : 'puter';
}

const defaultSelectedProvider = providerOrDefault(defaultModelProvider);

function isWorkspaceId(workspace: unknown): workspace is WorkspaceId {
  return ['chat', 'coding', 'image', 'voice', 'terminal'].includes(String(workspace));
}

function isUtilityTabId(tab: unknown): tab is UtilityTabId {
  return ['files', 'uploads', 'tools', 'artifacts', 'diagnostics'].includes(String(tab));
}

function normalizePanelWidth(width: unknown): number {
  return typeof width === 'number' && Number.isFinite(width)
    ? Math.min(420, Math.max(288, Math.round(width)))
    : 336;
}

function normalizeRecentWorkspaces(value: unknown, activeWorkspace: WorkspaceId): WorkspaceId[] {
  const workspaces = Array.isArray(value) ? value.filter(isWorkspaceId) : [];
  return Array.from(new Set([activeWorkspace, ...workspaces])).slice(0, 5);
}

export function sanitizeHydratedSettings(state: Partial<SettingsState>): Partial<SettingsState> {
  const presetCandidate =
    typeof state.selectedPreset === 'string' &&
    (state.selectedPreset === OTHER_MODELS_PRESET_ID || getPreset(state.selectedPreset))
      ? state.selectedPreset
      : DEFAULT_PRESET_ID;
  const modelCandidate =
    typeof state.selectedModel === 'string' && modelRegistry.get(state.selectedModel)
      ? state.selectedModel
      : presetCandidate === OTHER_MODELS_PRESET_ID
        ? defaultModelId
        : resolvePresetToModel(presetCandidate);
  const model = modelRegistry.get(modelCandidate);
  const selectedModel = model ? modelCandidate : defaultModelId;
  const selectedProvider = providerOrDefault(modelRegistry.get(selectedModel)?.provider ?? state.selectedProvider);

  return {
    ...state,
    selectedPreset: presetCandidate,
    selectedModel,
    selectedProvider,
    activeWorkspace: isWorkspaceId(state.activeWorkspace) ? state.activeWorkspace : 'chat',
    lastUtilityTab: isUtilityTabId(state.lastUtilityTab) ? state.lastUtilityTab : 'files',
    rightPanelWidth: normalizePanelWidth(state.rightPanelWidth),
    recentWorkspaces: normalizeRecentWorkspaces(
      state.recentWorkspaces,
      isWorkspaceId(state.activeWorkspace) ? state.activeWorkspace : 'chat'
    ),
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      selectedProvider: defaultSelectedProvider,
      selectedModel: defaultModelId,
      selectedPreset: DEFAULT_PRESET_ID,
      settingsOpen: false,
      commandPaletteOpen: false,
      searchOpen: false,
      activeWorkspace: 'chat',
      lastUtilityTab: 'files',
      rightPanelWidth: 336,
      recentWorkspaces: ['chat'],

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
      setSelectedModel: (selectedModel) => {
        const model = modelRegistry.get(selectedModel);
        set({
          selectedModel,
          selectedPreset: OTHER_MODELS_PRESET_ID,
          ...(model?.provider && isProviderId(model.provider) ? { selectedProvider: model.provider } : {}),
        });
      },

      setSelectedPreset: (selectedPreset) => {
        if (selectedPreset === OTHER_MODELS_PRESET_ID) {
          set({ selectedPreset });
          return;
        }

        const modelId = resolvePresetToModel(selectedPreset);
        const model = modelRegistry.get(modelId);
        set({
          selectedPreset,
          selectedModel: modelId,
          ...(model?.provider && isProviderId(model.provider) ? { selectedProvider: model.provider } : {}),
        });
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
      setActiveWorkspace: (activeWorkspace) =>
        set((state) => ({
          activeWorkspace,
          recentWorkspaces: Array.from(new Set([activeWorkspace, ...state.recentWorkspaces])).slice(0, 5),
        })),
      setLastUtilityTab: (lastUtilityTab) => set({ lastUtilityTab }),
      setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth: normalizePanelWidth(rightPanelWidth) }),
    }),
    {
      name: 'ai-workstation-settings',
      version: WORKSTATION_SCHEMA_VERSION,
      migrate: (persisted) => sanitizeHydratedSettings(persisted as Partial<SettingsState>) as never,
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeHydratedSettings(persisted as Partial<SettingsState>),
      }),
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
        lastUtilityTab: state.lastUtilityTab,
        rightPanelWidth: state.rightPanelWidth,
        recentWorkspaces: state.recentWorkspaces,
      }),
    }
  )
);
