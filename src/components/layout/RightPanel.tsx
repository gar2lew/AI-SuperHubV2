import { lazy, Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  FileText,
  Image,
  FileCode,
  Wrench,
  Upload,
  Box,
  Activity,
} from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { toolRegistry } from '@/lib/tools/registry';
import { trackLazyImport } from '@/lib/diagnostics/client-errors';

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
  const [activeTab, setActiveTab] = useState<RightPanelTab>('files');

  return (
    <div className="utility-panel flex flex-col h-full w-full sm:w-[21rem]">
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

      <div className="panel-tabs flex">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-label={`${tab.label} tab`}
            aria-selected={activeTab === tab.id}
            className={`panel-tab flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[0.8rem] font-medium ${
              activeTab === tab.id
                ? 'is-active text-accent'
                : 'text-text-muted'
            }`}
          >
            <tab.icon size={14} />
            <span className="sr-only">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4">
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

function ToolsTab() {
  const tools = toolRegistry.getAll();
  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <motion.div
          key={tool.id}
          whileHover={{ scale: 1.01 }}
          className="telemetry-card p-3 cursor-pointer"
        >
          <p className="text-sm font-medium text-text-primary">{tool.name}</p>
          <p className="text-xs text-text-muted mt-0.5">{tool.description}</p>
          <p className="text-xs text-accent mt-1 font-mono">{tool.id}</p>
        </motion.div>
      ))}
    </div>
  );
}

function ArtifactsTab() {
  return (
    <div className="text-center py-8">
      <Box size={32} className="mx-auto mb-3 text-text-muted opacity-40" />
      <p className="text-sm text-text-muted">No artifacts yet</p>
      <p className="text-xs text-text-muted mt-1">Generated files will appear here</p>
    </div>
  );
}
