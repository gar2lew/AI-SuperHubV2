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
    <nav className="workspace-nav border-b border-border-subtle bg-bg-secondary/95 px-3 py-2" aria-label="Workspace navigation">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto">
        {WORKSPACES.map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => setActiveWorkspace(workspace.id)}
            aria-current={activeWorkspace === workspace.id ? 'page' : undefined}
            aria-label={`${workspace.label} workspace`}
            className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
              activeWorkspace === workspace.id
                ? 'bg-accent text-white'
                : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
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
