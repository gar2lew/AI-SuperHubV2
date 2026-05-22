import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeHydratedWorkstationState, useWorkstationStore } from '@/store/workstationStore';

function resetWorkstationStore() {
  window.localStorage.clear();
  useWorkstationStore.setState({
    metadata: {
      schemaVersion: 2,
      restoredAt: Date.now(),
      persistedAt: Date.now(),
    },
    restoredNoticeDismissedAt: null,
    commandHistory: [],
    recentPrompts: [],
    workspaceUi: {},
    workflowContexts: [],
    attachedWorkflowContextIds: [],
    imageWorkspace: {
      prompt: '',
      model: 'gpt-image-1-mini',
      layout: 'grid',
      updatedAt: 0,
    },
    voiceWorkspace: {
      text: '',
      voice: 'default',
      speed: 1,
      volume: 0.85,
      updatedAt: 0,
    },
    terminalWorkspace: {
      input: '',
      height: 420,
      commandHistory: [],
      updatedAt: 0,
    },
    codingWorkspace: {
      selectedArtifactId: 'artifact-runtime-hook',
      wrap: false,
      updatedAt: 0,
    },
    diagnosticsWorkspace: {
      expandedSections: [],
      updatedAt: 0,
    },
  });
  useWorkstationStore.persist.clearStorage();
}

describe('workstationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    resetWorkstationStore();
  });

  it('deduplicates command history and recent prompts with bounded retention', () => {
    const store = useWorkstationStore.getState();

    store.recordPrompt('  continue the release notes  ', 'chat');
    useWorkstationStore.getState().recordPrompt('continue the release notes', 'chat');
    useWorkstationStore.getState().recordCommand({
      kind: 'workspace',
      label: 'Switch to coding',
      value: 'coding',
      workspace: 'coding',
    });

    expect(useWorkstationStore.getState().recentPrompts).toHaveLength(1);
    expect(useWorkstationStore.getState().recentPrompts[0]).toMatchObject({
      kind: 'prompt',
      value: 'continue the release notes',
      useCount: 2,
    });
    expect(useWorkstationStore.getState().commandHistory.map((entry) => entry.kind)).toEqual([
      'workspace',
      'prompt',
    ]);
  });

  it('recovers invalid persisted workstation state and clamps unsafe values', () => {
    const repaired = sanitizeHydratedWorkstationState({
      metadata: {
        schemaVersion: 1,
        restoredAt: null,
        persistedAt: Date.now(),
      },
      commandHistory: [
        { id: 'bad', kind: 'prompt', label: 'x', value: 'x', createdAt: Date.now(), useCount: 1 },
        { id: 'dupe', kind: 'prompt', label: 'x again', value: 'x', createdAt: Date.now(), useCount: 5 },
      ],
      workspaceUi: {
        chat: { scrollTop: -4, updatedAt: Date.now() },
        terminal: { scrollTop: 900000, updatedAt: Date.now() },
      },
      voiceWorkspace: {
        text: 'hello',
        voice: 'default',
        speed: 9,
        volume: -1,
        updatedAt: Date.now(),
      },
      terminalWorkspace: {
        input: 'status',
        height: 999,
        commandHistory: ['one', 'two'],
        updatedAt: Date.now(),
      },
      diagnosticsWorkspace: {
        expandedSections: ['runtime-telemetry', 'runtime-telemetry', 'provider-health'],
        updatedAt: Date.now(),
      },
    });

    expect(repaired.commandHistory).toHaveLength(1);
    expect(repaired.workspaceUi?.chat?.scrollTop).toBe(0);
    expect(repaired.workspaceUi?.terminal?.scrollTop).toBe(200000);
    expect(repaired.voiceWorkspace).toMatchObject({ speed: 1.5, volume: 0 });
    expect(repaired.terminalWorkspace).toMatchObject({ input: 'status', height: 680 });
    expect(repaired.diagnosticsWorkspace?.expandedSections).toEqual(['runtime-telemetry', 'provider-health']);
  });

  it('invalidates stale persisted state instead of restoring old workflow context', () => {
    const repaired = sanitizeHydratedWorkstationState({
      metadata: {
        schemaVersion: 2,
        restoredAt: Date.now(),
        persistedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
      },
      commandHistory: [
        { id: 'old', kind: 'prompt', label: 'old prompt', value: 'old prompt', createdAt: Date.now(), useCount: 1 },
      ],
      recentPrompts: [
        { id: 'old', kind: 'prompt', label: 'old prompt', value: 'old prompt', createdAt: Date.now(), useCount: 1 },
      ],
      workspaceUi: {
        chat: { scrollTop: 120, updatedAt: Date.now() },
      },
      workflowContexts: [
        {
          id: 'workflow:old',
          type: 'terminal-output',
          title: 'Old output',
          summary: 'stale',
          sourceWorkspace: 'terminal',
          payload: { output: 'old' },
          createdAt: Date.now(),
          useCount: 1,
        },
      ],
      attachedWorkflowContextIds: ['workflow:old'],
    });

    expect(repaired.metadata?.invalidationReason).toBe('stale persisted workstation state');
    expect(repaired.commandHistory).toEqual([]);
    expect(repaired.recentPrompts).toEqual([]);
    expect(repaired.workspaceUi).toEqual({});
    expect(repaired.workflowContexts).toEqual([]);
    expect(repaired.attachedWorkflowContextIds).toEqual([]);
  });

  it('stores bounded workflow context packets and deduplicates attachments', () => {
    const store = useWorkstationStore.getState();

    const firstId = store.addWorkflowContext({
      type: 'terminal-output',
      title: 'Terminal output',
      sourceWorkspace: 'terminal',
      payload: {
        command: 'npm test',
        output: 'all tests passed',
      },
    }, { attach: true });
    const secondId = useWorkstationStore.getState().addWorkflowContext({
      type: 'terminal-output',
      title: 'Terminal output',
      sourceWorkspace: 'terminal',
      payload: {
        command: 'npm test',
        output: 'all tests passed',
      },
    }, { attach: true });

    expect(firstId).toBe(secondId);
    expect(useWorkstationStore.getState().workflowContexts).toHaveLength(1);
    expect(useWorkstationStore.getState().workflowContexts[0]).toMatchObject({
      type: 'terminal-output',
      useCount: 2,
    });
    expect(useWorkstationStore.getState().attachedWorkflowContextIds).toEqual([firstId]);
  });

  it('repairs invalid workflow context references and strips unsafe payload values', () => {
    const repaired = sanitizeHydratedWorkstationState({
      metadata: {
        schemaVersion: 2,
        restoredAt: null,
        persistedAt: Date.now(),
      },
      workflowContexts: [
        {
          id: 'workflow:image',
          type: 'image-artifact',
          title: 'Image artifact',
          summary: 'generated',
          sourceWorkspace: 'image',
          payload: {
            url: 'blob:http://local/unsafe',
            prompt: 'A workstation',
          },
          createdAt: Date.now(),
          useCount: 1,
        },
      ],
      attachedWorkflowContextIds: ['workflow:image', 'workflow:missing', 'workflow:image'],
    });

    expect(repaired.workflowContexts).toHaveLength(1);
    expect(repaired.workflowContexts?.[0].payload.url).toBeUndefined();
    expect(repaired.attachedWorkflowContextIds).toEqual(['workflow:image']);
  });
});
