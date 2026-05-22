import { lazy, memo, Suspense } from 'react';
import {
  X,
  FileText,
  Image,
  FileCode,
  Wrench,
  Upload,
  Box,
  Activity,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkstationStore } from '@/store/workstationStore';
import { toolRegistry } from '@/lib/tools/registry';
import { trackLazyImport } from '@/lib/diagnostics/client-errors';
import { contextTypeLabel } from '@/lib/workflow/context';

export type RightPanelTab = 'files' | 'uploads' | 'tools' | 'artifacts' | 'diagnostics';

interface TabConfig {
  id: RightPanelTab;
  icon: React.ElementType;
  label: string;
}

const TABS: TabConfig[] = [
  { id: 'files', icon: FileText, label: 'Files' },
  { id: 'uploads', icon: Upload, label: 'Uploads' },
  { id: 'tools', icon: Wrench, label: 'Tools' },
  { id: 'artifacts', icon: Box, label: 'Artifacts' },
  { id: 'diagnostics', icon: Activity, label: 'Diagnostics' },
];

const DiagnosticsTab = lazy(() =>
  trackLazyImport(
    () => import('./DiagnosticsTab').then((module) => ({ default: module.DiagnosticsTab })),
    'diagnostics tab'
  )
);

export function RightPanel() {
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);
  const activeTab = useSettingsStore((s) => s.lastUtilityTab);
  const setActiveTab = useSettingsStore((s) => s.setLastUtilityTab);

  return (
    <div className="utility-panel flex h-full w-full flex-col">
      <div className="panel-header flex items-center justify-between px-4 py-3">
        <h3 className="text-base font-semibold text-text-primary">Utilities</h3>
        <button
          onClick={toggleRightPanel}
          className="icon-action p-1 text-text-muted hover:text-text-primary"
          aria-label="Close utilities panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="panel-tabs utility-tabs flex" role="tablist" aria-label="Utility panel tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-label={`${tab.label} tab`}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`panel-tab flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1 py-2.5 text-[0.78rem] font-medium ${
              activeTab === tab.id
                ? 'is-active text-accent'
                : 'text-text-muted'
            }`}
          >
            <tab.icon size={14} />
            <span className="hidden min-w-0 truncate xl:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="utility-panel-content flex-1 overflow-y-auto p-3.5 sm:p-4">
        {activeTab === 'files' && <FilesTab />}
        {activeTab === 'uploads' && <UploadsTab />}
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'artifacts' && <ArtifactsTab />}
        {activeTab === 'diagnostics' && (
          <Suspense fallback={<div className="telemetry-card p-3 text-sm text-text-muted">Loading diagnostics...</div>}>
            <DiagnosticsTab />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function FilesTab() {
  return (
    <div className="space-y-3">
      <div className="telemetry-card flex items-center gap-3 p-3">
        <Image size={18} className="text-accent" />
        <div>
          <p className="text-sm text-text-primary">image.png</p>
          <p className="text-xs text-text-muted">2.4 MB · Image</p>
        </div>
      </div>
      <div className="telemetry-card flex items-center gap-3 p-3">
        <FileCode size={18} className="text-warning" />
        <div>
          <p className="text-sm text-text-primary">script.ts</p>
          <p className="text-xs text-text-muted">12 KB · TypeScript</p>
        </div>
      </div>
      <div className="telemetry-card flex items-center gap-3 p-3">
        <FileText size={18} className="text-success" />
        <div>
          <p className="text-sm text-text-primary">notes.md</p>
          <p className="text-xs text-text-muted">4 KB · Markdown</p>
        </div>
      </div>
      <p className="text-xs text-text-muted text-center py-4">Drag and drop files to upload</p>
    </div>
  );
}

function UploadsTab() {
  return (
    <div className="text-center py-8">
      <Upload size={32} className="mx-auto mb-3 text-text-muted opacity-40" />
      <p className="text-sm text-text-muted">No uploads yet</p>
      <p className="text-xs text-text-muted mt-1">Drag files into the chat to upload</p>
    </div>
  );
}

const ToolsTab = memo(function ToolsTab() {
  const tools = toolRegistry.getAll();
  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <div
          key={tool.id}
          className="telemetry-card tool-card p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-text-primary">{tool.name}</p>
            <span className="capability-chip">{tool.category}</span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">{tool.description}</p>
          <p className="text-xs text-accent mt-1 font-mono">{tool.id}</p>
          <div className="capability-chip-grid mt-2">
            {tool.capabilities.slice(0, 3).map((capability) => (
              <span key={capability} className="capability-chip">{capability}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

function ArtifactsTab() {
  const workflowContexts = useWorkstationStore((s) => s.workflowContexts);
  const attachWorkflowContext = useWorkstationStore((s) => s.attachWorkflowContext);
  const removeWorkflowContext = useWorkstationStore((s) => s.removeWorkflowContext);

  if (workflowContexts.length > 0) {
    return (
      <div className="workflow-artifact-list" aria-label="Reusable workflow artifacts">
        {workflowContexts.slice(0, 16).map((context) => (
          <div key={context.id} className="telemetry-card workflow-artifact-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{context.title}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                  {contextTypeLabel(context.type)} · {context.sourceWorkspace}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className="workflow-icon-action" onClick={() => attachWorkflowContext(context.id)} aria-label={`Attach ${context.title} to Chat`} title="Attach to Chat">
                  <MessageSquare size={13} />
                </button>
                <button type="button" className="workflow-icon-action danger" onClick={() => removeWorkflowContext(context.id)} aria-label={`Remove ${context.title}`} title="Remove artifact">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-text-secondary">{context.summary}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <Box size={32} className="mx-auto mb-3 text-text-muted opacity-40" />
      <p className="text-sm text-text-muted">No workflow artifacts yet</p>
      <p className="text-xs text-text-muted mt-1">Sent snippets and outputs will appear here</p>
    </div>
  );
}
