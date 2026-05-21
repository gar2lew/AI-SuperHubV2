import { Code2, Image, MessageSquare, Mic2, Terminal } from 'lucide-react';
import { useResponsive } from '@/hooks/useResponsive';
import { useSettingsStore, type WorkspaceId } from '@/store/settingsStore';
import { useWorkstationStore } from '@/store/workstationStore';

const WORKSPACES: Array<{ id: WorkspaceId; label: string; icon: React.ElementType }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'coding', label: 'Coding', icon: Code2 },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'voice', label: 'Voice', icon: Mic2 },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
];

export function WorkspaceNav() {
  const activeWorkspace = useSettingsStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useSettingsStore((s) => s.setActiveWorkspace);
  const recentWorkspaces = useSettingsStore((s) => s.recentWorkspaces);
  const recordCommand = useWorkstationStore((s) => s.recordCommand);
  const { isMobile, isTablet } = useResponsive();

  const activateWorkspace = (workspace: WorkspaceId) => {
    setActiveWorkspace(workspace);
    recordCommand({
      kind: 'workspace',
      label: `Switch to ${workspace}`,
      value: workspace,
      workspace,
    });
  };

  return (
    <nav className="workspace-nav px-3 py-2" aria-label="Workspace navigation">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto">
        {WORKSPACES.map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => activateWorkspace(workspace.id)}
            aria-current={activeWorkspace === workspace.id ? 'page' : undefined}
            aria-label={`${workspace.label} workspace`}
            className={`workspace-tab flex min-h-10 shrink-0 items-center gap-2 px-3.5 text-[0.92rem] font-medium ${
              activeWorkspace === workspace.id
                ? 'is-active text-white'
                : 'text-text-muted'
            }`}
          >
            <workspace.icon size={16} />
            <span>{workspace.label}</span>
          </button>
        ))}
        {!isMobile && !isTablet && (
          <div className="recent-workspace-chips ml-auto flex items-center gap-1" aria-label="Recent workspaces">
            {recentWorkspaces.slice(0, 3).map((workspaceId) => {
              const workspace = WORKSPACES.find((item) => item.id === workspaceId);
              if (!workspace || workspace.id === activeWorkspace) return null;
              return (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => activateWorkspace(workspace.id)}
                  className="recent-workspace-chip"
                  aria-label={`Resume ${workspace.label} workspace`}
                >
                  <workspace.icon size={13} />
                  <span>{workspace.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
