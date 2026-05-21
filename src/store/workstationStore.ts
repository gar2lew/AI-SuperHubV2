import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WorkspaceId, UtilityTabId } from '@/store/settingsStore';
import {
  boundedText,
  createPersistenceMetadata,
  dedupeBy,
  isStaleTimestamp,
  markPersisted,
  type PersistenceMetadata,
  WORKSTATION_SCHEMA_VERSION,
} from '@/lib/persistence/governance';

type CommandKind = 'command' | 'prompt' | 'workspace' | 'model';

export interface CommandHistoryEntry {
  id: string;
  kind: CommandKind;
  label: string;
  value: string;
  workspace?: WorkspaceId;
  createdAt: number;
  useCount: number;
}

interface WorkspaceUiState {
  scrollTop: number;
  updatedAt: number;
}

export interface ImageWorkspaceState {
  prompt: string;
  model: string;
  layout: 'grid' | 'compact';
  updatedAt: number;
}

export interface VoiceWorkspaceState {
  text: string;
  voice: string;
  speed: number;
  volume: number;
  updatedAt: number;
}

export interface TerminalWorkspaceState {
  input: string;
  height: number;
  commandHistory: string[];
  updatedAt: number;
}

export interface CodingWorkspaceState {
  selectedArtifactId: string | null;
  wrap: boolean;
  updatedAt: number;
}

export interface DiagnosticsWorkspaceState {
  expandedSections: string[];
  updatedAt: number;
}

interface WorkstationState {
  metadata: PersistenceMetadata;
  restoredNoticeDismissedAt: number | null;
  commandHistory: CommandHistoryEntry[];
  recentPrompts: CommandHistoryEntry[];
  workspaceUi: Partial<Record<WorkspaceId | UtilityTabId, WorkspaceUiState>>;
  imageWorkspace: ImageWorkspaceState;
  voiceWorkspace: VoiceWorkspaceState;
  terminalWorkspace: TerminalWorkspaceState;
  codingWorkspace: CodingWorkspaceState;
  diagnosticsWorkspace: DiagnosticsWorkspaceState;

  markRestoredNoticeDismissed: () => void;
  recordCommand: (entry: Omit<CommandHistoryEntry, 'id' | 'createdAt' | 'useCount'> & { createdAt?: number }) => void;
  recordPrompt: (prompt: string, workspace?: WorkspaceId) => void;
  setWorkspaceScroll: (workspace: WorkspaceId | UtilityTabId, scrollTop: number) => void;
  updateImageWorkspace: (updates: Partial<Omit<ImageWorkspaceState, 'updatedAt'>>) => void;
  updateVoiceWorkspace: (updates: Partial<Omit<VoiceWorkspaceState, 'updatedAt'>>) => void;
  updateTerminalWorkspace: (updates: Partial<Omit<TerminalWorkspaceState, 'updatedAt'>>) => void;
  updateCodingWorkspace: (updates: Partial<Omit<CodingWorkspaceState, 'updatedAt'>>) => void;
  toggleDiagnosticsSection: (section: string) => void;
}

const now = () => Date.now();

const defaultImageWorkspace: ImageWorkspaceState = {
  prompt: '',
  model: 'gpt-image-1-mini',
  layout: 'grid',
  updatedAt: 0,
};

const defaultVoiceWorkspace: VoiceWorkspaceState = {
  text: '',
  voice: 'default',
  speed: 1,
  volume: 0.85,
  updatedAt: 0,
};

const defaultTerminalWorkspace: TerminalWorkspaceState = {
  input: '',
  height: 420,
  commandHistory: [],
  updatedAt: 0,
};

const defaultCodingWorkspace: CodingWorkspaceState = {
  selectedArtifactId: 'artifact-runtime-hook',
  wrap: false,
  updatedAt: 0,
};

const defaultDiagnosticsWorkspace: DiagnosticsWorkspaceState = {
  expandedSections: [],
  updatedAt: 0,
};

function commandId(kind: CommandKind, value: string) {
  return `${kind}:${value.toLowerCase()}`;
}

function normalizeCommandHistory(value: unknown): CommandHistoryEntry[] {
  const entries = Array.isArray(value) ? value : [];
  return dedupeBy(
    entries
      .filter((entry): entry is Partial<CommandHistoryEntry> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => {
        const kind = ['command', 'prompt', 'workspace', 'model'].includes(String(entry.kind))
          ? entry.kind as CommandKind
          : 'command';
        const label = boundedText(entry.label, 96);
        const rawValue = boundedText(entry.value, 400);
        const createdAt = isStaleTimestamp(entry.createdAt) ? now() : entry.createdAt as number;
        return {
          id: commandId(kind, rawValue || label),
          kind,
          label: label || rawValue || 'Command',
          value: rawValue || label,
          workspace: entry.workspace,
          createdAt,
          useCount: Math.max(1, Number(entry.useCount) || 1),
        };
      })
      .filter((entry) => entry.value),
    (entry) => entry.id,
    24
  );
}

function normalizeScrollState(value: unknown): Partial<Record<WorkspaceId | UtilityTabId, WorkspaceUiState>> {
  if (!value || typeof value !== 'object') return {};
  const allowed = new Set(['chat', 'coding', 'image', 'voice', 'terminal', 'files', 'uploads', 'tools', 'artifacts', 'diagnostics']);
  return Object.fromEntries(
    Object.entries(value as Record<string, Partial<WorkspaceUiState>>)
      .filter(([key, entry]) => allowed.has(key) && entry && typeof entry === 'object')
      .map(([key, entry]) => [
        key,
        {
          scrollTop: Math.max(0, Math.min(200_000, Number(entry.scrollTop) || 0)),
          updatedAt: isStaleTimestamp(entry.updatedAt) ? now() : entry.updatedAt as number,
        },
      ])
  ) as Partial<Record<WorkspaceId | UtilityTabId, WorkspaceUiState>>;
}

export function sanitizeHydratedWorkstationState(state: Partial<WorkstationState>): Partial<WorkstationState> {
  const restoredAt = now();
  const persistedAt = state.metadata?.persistedAt;
  const stale = isStaleTimestamp(persistedAt, restoredAt);
  const metadata = {
    ...createPersistenceMetadata(restoredAt),
    ...(state.metadata && typeof state.metadata === 'object' ? state.metadata : {}),
    schemaVersion: WORKSTATION_SCHEMA_VERSION,
    restoredAt,
    persistedAt: stale ? restoredAt : persistedAt as number,
  };

  return {
    metadata: stale
      ? {
          ...metadata,
          invalidatedAt: restoredAt,
          invalidationReason: 'stale persisted workstation state',
        }
      : metadata,
    restoredNoticeDismissedAt: typeof state.restoredNoticeDismissedAt === 'number' ? state.restoredNoticeDismissedAt : null,
    commandHistory: stale ? [] : normalizeCommandHistory(state.commandHistory),
    recentPrompts: stale ? [] : normalizeCommandHistory(state.recentPrompts).filter((entry) => entry.kind === 'prompt'),
    workspaceUi: stale ? {} : normalizeScrollState(state.workspaceUi),
    imageWorkspace: {
      ...defaultImageWorkspace,
      ...(state.imageWorkspace && typeof state.imageWorkspace === 'object' ? state.imageWorkspace : {}),
      prompt: boundedText(state.imageWorkspace?.prompt, 1000),
      model: boundedText(state.imageWorkspace?.model, 120) || defaultImageWorkspace.model,
      layout: state.imageWorkspace?.layout === 'compact' ? 'compact' : 'grid',
      updatedAt: isStaleTimestamp(state.imageWorkspace?.updatedAt) ? 0 : state.imageWorkspace!.updatedAt,
    },
    voiceWorkspace: {
      ...defaultVoiceWorkspace,
      ...(state.voiceWorkspace && typeof state.voiceWorkspace === 'object' ? state.voiceWorkspace : {}),
      text: boundedText(state.voiceWorkspace?.text, 5000),
      voice: boundedText(state.voiceWorkspace?.voice, 80) || defaultVoiceWorkspace.voice,
      speed: Math.min(1.5, Math.max(0.75, Number(state.voiceWorkspace?.speed) || 1)),
      volume: Math.min(1, Math.max(0, Number(state.voiceWorkspace?.volume) || 0.85)),
      updatedAt: isStaleTimestamp(state.voiceWorkspace?.updatedAt) ? 0 : state.voiceWorkspace!.updatedAt,
    },
    terminalWorkspace: {
      ...defaultTerminalWorkspace,
      ...(state.terminalWorkspace && typeof state.terminalWorkspace === 'object' ? state.terminalWorkspace : {}),
      input: boundedText(state.terminalWorkspace?.input, 400),
      height: Math.min(680, Math.max(280, Number(state.terminalWorkspace?.height) || 420)),
      commandHistory: Array.isArray(state.terminalWorkspace?.commandHistory)
        ? state.terminalWorkspace.commandHistory.map((item) => boundedText(item, 300)).filter(Boolean).slice(0, 20)
        : [],
      updatedAt: isStaleTimestamp(state.terminalWorkspace?.updatedAt) ? 0 : state.terminalWorkspace!.updatedAt,
    },
    codingWorkspace: {
      ...defaultCodingWorkspace,
      ...(state.codingWorkspace && typeof state.codingWorkspace === 'object' ? state.codingWorkspace : {}),
      selectedArtifactId: boundedText(state.codingWorkspace?.selectedArtifactId, 120) || defaultCodingWorkspace.selectedArtifactId,
      wrap: Boolean(state.codingWorkspace?.wrap),
      updatedAt: isStaleTimestamp(state.codingWorkspace?.updatedAt) ? 0 : state.codingWorkspace!.updatedAt,
    },
    diagnosticsWorkspace: {
      ...defaultDiagnosticsWorkspace,
      expandedSections: Array.isArray(state.diagnosticsWorkspace?.expandedSections)
        ? Array.from(new Set(state.diagnosticsWorkspace.expandedSections.map((item) => boundedText(item, 80)).filter(Boolean))).slice(0, 12)
        : [],
      updatedAt: isStaleTimestamp(state.diagnosticsWorkspace?.updatedAt) ? 0 : state.diagnosticsWorkspace!.updatedAt,
    },
  };
}

export const useWorkstationStore = create<WorkstationState>()(
  persist(
    (set) => ({
      metadata: {
        schemaVersion: WORKSTATION_SCHEMA_VERSION,
        restoredAt: null,
        persistedAt: now(),
      },
      restoredNoticeDismissedAt: null,
      commandHistory: [],
      recentPrompts: [],
      workspaceUi: {},
      imageWorkspace: defaultImageWorkspace,
      voiceWorkspace: defaultVoiceWorkspace,
      terminalWorkspace: defaultTerminalWorkspace,
      codingWorkspace: defaultCodingWorkspace,
      diagnosticsWorkspace: defaultDiagnosticsWorkspace,

      markRestoredNoticeDismissed: () => set({ restoredNoticeDismissedAt: now() }),
      recordCommand: (entry) =>
        set((state) => {
          const createdAt = entry.createdAt ?? now();
          const value = boundedText(entry.value, entry.kind === 'prompt' ? 400 : 160);
          if (!value) return {};
          const nextEntry: CommandHistoryEntry = {
            id: commandId(entry.kind, value),
            kind: entry.kind,
            label: boundedText(entry.label, 96) || value,
            value,
            workspace: entry.workspace,
            createdAt,
            useCount: 1,
          };
          const previous = state.commandHistory.find((item) => item.id === nextEntry.id);
          return {
            metadata: markPersisted(state.metadata),
            commandHistory: dedupeBy(
              [
                previous
                  ? { ...previous, ...nextEntry, useCount: previous.useCount + 1, createdAt }
                  : nextEntry,
                ...state.commandHistory,
              ],
              (item) => item.id,
              24
            ),
            recentPrompts: nextEntry.kind === 'prompt'
              ? dedupeBy([nextEntry, ...state.recentPrompts], (item) => item.id, 12)
              : state.recentPrompts,
          };
        }),
      recordPrompt: (prompt, workspace = 'chat') =>
        set((state) => {
          const value = boundedText(prompt, 400);
          if (!value) return {};
          const entry: CommandHistoryEntry = {
            id: commandId('prompt', value),
            kind: 'prompt',
            label: value.length > 72 ? `${value.slice(0, 72)}...` : value,
            value,
            workspace,
            createdAt: now(),
            useCount: 1,
          };
          const previous = state.commandHistory.find((item) => item.id === entry.id);
          const merged = previous ? { ...previous, ...entry, useCount: previous.useCount + 1 } : entry;
          return {
            metadata: markPersisted(state.metadata),
            commandHistory: dedupeBy([merged, ...state.commandHistory], (item) => item.id, 24),
            recentPrompts: dedupeBy([merged, ...state.recentPrompts], (item) => item.id, 12),
          };
        }),
      setWorkspaceScroll: (workspace, scrollTop) =>
        set((state) => ({
          metadata: markPersisted(state.metadata),
          workspaceUi: {
            ...state.workspaceUi,
            [workspace]: {
              scrollTop: Math.max(0, Math.round(scrollTop)),
              updatedAt: now(),
            },
          },
        })),
      updateImageWorkspace: (updates) => set((state) => ({
        metadata: markPersisted(state.metadata),
        imageWorkspace: { ...state.imageWorkspace, ...updates, updatedAt: now() },
      })),
      updateVoiceWorkspace: (updates) => set((state) => ({
        metadata: markPersisted(state.metadata),
        voiceWorkspace: { ...state.voiceWorkspace, ...updates, updatedAt: now() },
      })),
      updateTerminalWorkspace: (updates) => set((state) => ({
        metadata: markPersisted(state.metadata),
        terminalWorkspace: { ...state.terminalWorkspace, ...updates, updatedAt: now() },
      })),
      updateCodingWorkspace: (updates) => set((state) => ({
        metadata: markPersisted(state.metadata),
        codingWorkspace: { ...state.codingWorkspace, ...updates, updatedAt: now() },
      })),
      toggleDiagnosticsSection: (section) => set((state) => {
        const expanded = new Set(state.diagnosticsWorkspace.expandedSections);
        if (expanded.has(section)) expanded.delete(section);
        else expanded.add(section);
        return {
          metadata: markPersisted(state.metadata),
          diagnosticsWorkspace: {
            expandedSections: Array.from(expanded).slice(0, 12),
            updatedAt: now(),
          },
        };
      }),
    }),
    {
      name: 'ai-workstation-continuity',
      version: WORKSTATION_SCHEMA_VERSION,
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeHydratedWorkstationState(persisted as Partial<WorkstationState>),
      }),
      migrate: (persisted) => sanitizeHydratedWorkstationState(persisted as Partial<WorkstationState>) as never,
      partialize: (state) => ({
        metadata: markPersisted(state.metadata),
        restoredNoticeDismissedAt: state.restoredNoticeDismissedAt,
        commandHistory: state.commandHistory,
        recentPrompts: state.recentPrompts,
        workspaceUi: state.workspaceUi,
        imageWorkspace: state.imageWorkspace,
        voiceWorkspace: state.voiceWorkspace,
        terminalWorkspace: state.terminalWorkspace,
        codingWorkspace: state.codingWorkspace,
        diagnosticsWorkspace: state.diagnosticsWorkspace,
      }),
    }
  )
);
