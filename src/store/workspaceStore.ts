import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderId, WorkspaceContextBlock, WorkspaceMetadata } from '@/types';
import { generateId } from '@/lib/utils';

interface WorkspaceState {
  workspaces: WorkspaceMetadata[];
  activeWorkspaceId: string | null;
  createWorkspace: (name?: string) => string;
  updateWorkspace: (id: string, updates: Partial<Omit<WorkspaceMetadata, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  setActiveWorkspace: (id: string) => void;
  upsertPinnedContext: (
    workspaceId: string,
    block: Partial<Pick<WorkspaceContextBlock, 'id' | 'priority'>> & Pick<WorkspaceContextBlock, 'title' | 'content' | 'enabled'>
  ) => string;
  getActiveWorkspace: () => WorkspaceMetadata | undefined;
  getInjectableContext: (workspaceId?: string | null) => string;
}

const defaultPreferences: WorkspaceMetadata['preferences'] = {
  autoInjectPinnedContext: true,
};

function createWorkspaceMetadata(name = 'Personal Workspace'): WorkspaceMetadata {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    pinnedContext: [],
    preferences: defaultPreferences,
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizePreferences(preferences?: Partial<WorkspaceMetadata['preferences']>): WorkspaceMetadata['preferences'] {
  return {
    providerId: preferences?.providerId as ProviderId | undefined,
    modelId: preferences?.modelId,
    autoInjectPinnedContext: preferences?.autoInjectPinnedContext ?? true,
  };
}

function normalizeTags(tags: unknown): string[] {
  return Array.isArray(tags)
    ? Array.from(
        new Set(
          tags
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      )
    : [];
}

function normalizeContextBlocks(blocks: unknown): WorkspaceContextBlock[] {
  return Array.isArray(blocks)
    ? blocks
        .filter((block): block is WorkspaceContextBlock => typeof block?.id === 'string')
        .map((block) => ({
          ...block,
          title: block.title || 'Context',
          content: block.content || '',
          enabled: block.enabled !== false,
          priority: typeof block.priority === 'number' ? block.priority : 0,
        }))
    : [];
}

export function sanitizeHydratedWorkspaceState(state: Partial<WorkspaceState>): Partial<WorkspaceState> {
  const workspaces = Array.isArray(state.workspaces)
    ? state.workspaces
        .filter((workspace): workspace is WorkspaceMetadata => typeof workspace?.id === 'string')
        .map((workspace) => ({
          ...workspace,
          name: workspace.name || 'Personal Workspace',
          tags: normalizeTags(workspace.tags),
          pinnedContext: normalizeContextBlocks(workspace.pinnedContext),
          preferences: sanitizePreferences(workspace.preferences),
        }))
    : [];
  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
    ? state.activeWorkspaceId
    : workspaces[0]?.id ?? null;

  return {
    ...state,
    workspaces,
    activeWorkspaceId,
  };
}

function buildInjectableContext(workspace: WorkspaceMetadata | undefined): string {
  if (!workspace || !workspace.preferences.autoInjectPinnedContext) return '';

  const sections = [`Workspace: ${workspace.name}`];
  if (workspace.description) sections.push(`Description: ${workspace.description}`);
  if (workspace.summary) sections.push(`Summary: ${workspace.summary}`);

  const enabledBlocks = workspace.pinnedContext
    .filter((block) => block.enabled && block.content.trim())
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.title.localeCompare(b.title));
  if (enabledBlocks.length > 0) {
    sections.push(
      [
        'Pinned context:',
        ...enabledBlocks.map((block) => `- [priority ${block.priority ?? 0}] ${block.title}: ${block.content}`),
      ].join('\n')
    );
  }

  return sections.join('\n\n');
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,

      createWorkspace: (name) => {
        const workspace = createWorkspaceMetadata(name);
        set((state) => ({
          workspaces: [workspace, ...state.workspaces],
          activeWorkspaceId: workspace.id,
        }));
        return workspace.id;
      },

      updateWorkspace: (id, updates) => {
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id
              ? {
                  ...workspace,
                  ...updates,
                  tags: updates.tags !== undefined ? normalizeTags(updates.tags) : workspace.tags,
                  preferences: updates.preferences
                    ? sanitizePreferences(updates.preferences)
                    : workspace.preferences,
                  updatedAt: Date.now(),
                }
              : workspace
          ),
        }));
      },

      setActiveWorkspace: (id) => {
        if (get().workspaces.some((workspace) => workspace.id === id)) {
          set({ activeWorkspaceId: id });
        }
      },

      upsertPinnedContext: (workspaceId, block) => {
        let id = block.id ?? generateId();
        set((state) => ({
          workspaces: state.workspaces.map((workspace) => {
            if (workspace.id !== workspaceId) return workspace;
            if (!block.id) {
              let attempts = 0;
              while (workspace.pinnedContext.some((item) => item.id === id)) {
                attempts += 1;
                id = `${generateId()}-${attempts}`;
              }
            }
            const existing = workspace.pinnedContext.find((item) => item.id === id);
            const nextBlock: WorkspaceContextBlock = {
              id,
              title: block.title,
              content: block.content,
              enabled: block.enabled,
              priority: block.priority ?? existing?.priority ?? 0,
              createdAt: existing?.createdAt ?? Date.now(),
              updatedAt: Date.now(),
            };
            return {
              ...workspace,
              pinnedContext: existing
                ? workspace.pinnedContext.map((item) => (item.id === id ? nextBlock : item))
                : [...workspace.pinnedContext, nextBlock],
              updatedAt: Date.now(),
            };
          }),
        }));
        return id;
      },

      getActiveWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get();
        return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
      },

      getInjectableContext: (workspaceId) => {
        const { workspaces, activeWorkspaceId } = get();
        return buildInjectableContext(
          workspaces.find((workspace) => workspace.id === (workspaceId ?? activeWorkspaceId))
        );
      },
    }),
    {
      name: 'ai-workstation-workspaces',
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeHydratedWorkspaceState(persisted as Partial<WorkspaceState>),
      }),
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
);
