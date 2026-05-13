import { Code2, Image, MessageSquare, Mic2, Terminal } from 'lucide-react';
import { useSettingsStore, type WorkspaceId } from '@/store/settingsStore';

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

  return (
    <nav className="workspace-nav px-3 py-2" aria-label="Workspace navigation">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto">
        {WORKSPACES.map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => setActiveWorkspace(workspace.id)}
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
      </div>
    </nav>
  );
}
