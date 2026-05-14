import { beforeEach, describe, expect, it } from 'vitest';
import { sanitizeHydratedSettings, useSettingsStore } from '@/store/settingsStore';

function resetSettingsStore() {
  window.localStorage.clear();
  useSettingsStore.setState({
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
    selectedProvider: 'puter',
    selectedModel: 'puter-claude-sonnet-4',
    selectedPreset: 'smart',
    settingsOpen: false,
    commandPaletteOpen: false,
    searchOpen: false,
    activeWorkspace: 'chat',
  });
}

describe('settingsStore', () => {
  beforeEach(() => {
    resetSettingsStore();
  });

  it('sanitizes invalid hydrated provider, model, preset, and workspace state', () => {
    expect(
      sanitizeHydratedSettings({
        selectedProvider: 'missing-provider' as never,
        selectedModel: 'missing-model',
        selectedPreset: 'missing-preset',
        activeWorkspace: 'missing-workspace' as never,
      })
    ).toMatchObject({
      selectedProvider: 'puter',
      selectedModel: 'puter-claude-sonnet-4',
      selectedPreset: 'smart',
      activeWorkspace: 'chat',
    });
  });

  it('keeps valid Other Models selections and aligns the provider from model metadata', () => {
    expect(
      sanitizeHydratedSettings({
        selectedProvider: 'anthropic',
        selectedModel: 'qwen/qwen3-coder',
        selectedPreset: 'other-models',
        activeWorkspace: 'chat',
      })
    ).toMatchObject({
      selectedProvider: 'puter',
      selectedModel: 'qwen/qwen3-coder',
      selectedPreset: 'other-models',
      activeWorkspace: 'chat',
    });
  });
});
