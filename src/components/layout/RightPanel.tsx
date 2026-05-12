import { useState } from 'react';
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
  Zap,
  AlertTriangle,
  Clock,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useChatStore } from '@/store/chatStore';
import { toolRegistry } from '@/lib/tools/registry';
import { getAllHealth, getCooldownInfo } from '@/lib/providers/health';
import { getPuterProviderStatus } from '@/lib/providers/puter';

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

export function RightPanel() {
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);
  const [activeTab, setActiveTab] = useState<RightPanelTab>('files');

  return (
    <div className="flex flex-col h-full w-full sm:w-80 bg-bg-secondary">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <h3 className="text-sm font-semibold text-text-primary">Utilities</h3>
        <button
          onClick={toggleRightPanel}
          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          aria-label="Close utilities panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-label={`${tab.label} tab`}
            aria-selected={activeTab === tab.id}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <tab.icon size={14} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'files' && <FilesTab />}
        {activeTab === 'uploads' && <UploadsTab />}
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'artifacts' && <ArtifactsTab />}
        {activeTab === 'diagnostics' && <DiagnosticsTab />}
      </div>
    </div>
  );
}

function FilesTab() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary border border-border-subtle">
        <Image size={18} className="text-accent" />
        <div>
          <p className="text-sm text-text-primary">image.png</p>
          <p className="text-xs text-text-muted">2.4 MB · Image</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary border border-border-subtle">
        <FileCode size={18} className="text-warning" />
        <div>
          <p className="text-sm text-text-primary">script.ts</p>
          <p className="text-xs text-text-muted">12 KB · TypeScript</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary border border-border-subtle">
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
          className="p-3 rounded-lg bg-bg-tertiary border border-border-subtle hover:border-border-default transition-colors cursor-pointer"
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

function DiagnosticsTab() {
  const activeConversation = useChatStore((s) => s.getActiveConversation)();
  const currentStreamId = useChatStore((s) => s.getCurrentStreamId());
  const healthRecords = getAllHealth();
  const puterStatus = getPuterProviderStatus();
  const diagnostics = useChatStore((s) => s.streamEngine?.getDiagnostics());

  const streaming = activeConversation?.streaming;
  const durationMs = streaming ? Date.now() - streaming.startedAt : 0;
  const chunkCount = streaming?.buffer.length || 0;
  const chunkRate = durationMs > 0 ? Math.round((chunkCount / durationMs) * 1000) : 0;
  const fps = diagnostics?.throughputPerSecond ? Math.min(60, diagnostics.throughputPerSecond) : 0;
  const streamHealth = !streaming ? 'idle' : chunkRate > 0 ? 'streaming' : 'warming';

  return (
    <div className="space-y-4">
      <div className="diagnostic-summary">
        <MetricBadge label="Runtime" value={puterStatus.readiness} tone={puterStatus.available ? 'success' : 'warning'} />
        <MetricBadge label="Stream" value={streamHealth} tone={streaming ? 'success' : 'neutral'} />
        <MetricBadge label="FPS" value={String(fps)} tone={fps > 0 ? 'success' : 'neutral'} />
      </div>
      {/* Puter Runtime Status */}
      <div className="p-3 rounded-lg bg-bg-tertiary border border-border-subtle">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-accent" />
          Puter Runtime
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Status</span>
            <span className={puterStatus.available ? 'text-success' : 'text-warning'}>
              {puterStatus.available ? 'Available' : puterStatus.readiness}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Readiness</span>
            <span className="text-text-secondary">{puterStatus.readiness}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Auth</span>
            <span className="text-text-secondary">
              {puterStatus.runtime.authenticated ? 'Signed in' : 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Timeouts</span>
            <span className="text-text-secondary">{puterStatus.runtime.timeoutEvents}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Fallbacks</span>
            <span className="text-text-secondary">{puterStatus.runtime.fallbackEvents}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Latency</span>
            <span className="text-text-secondary">
              {puterStatus.runtime.providerLatencyMs ?? 0}ms
            </span>
          </div>
        </div>
      </div>

      {/* Active Stream */}
      {streaming && (
        <div className="p-3 rounded-lg bg-bg-tertiary border border-border-subtle">
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap size={12} className="text-accent" />
            Active Stream
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Stream ID</span>
              <span className="text-text-secondary font-mono truncate max-w-[120px]">{currentStreamId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Provider</span>
              <span className="text-text-secondary">{streaming.providerId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Model</span>
              <span className="text-text-secondary">{streaming.modelId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Duration</span>
              <span className="text-text-secondary">{Math.round(durationMs / 1000)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Chunks</span>
              <span className="text-text-secondary">{chunkCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Chunk Rate</span>
              <span className="text-text-secondary flex items-center gap-1">
                <TrendingUp size={10} />
                {chunkRate}/s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Stream FPS</span>
              <span className="text-text-secondary">{fps}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Pending</span>
            <span className="text-text-secondary">{diagnostics?.pendingCount ?? 0}</span>
            </div>
            <div className="sparkline" aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => (
                <span key={index} style={{ height: `${18 + ((index + chunkRate) * 9) % 62}%` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="p-3 rounded-lg bg-bg-tertiary border border-border-subtle">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
          Memory
        </h4>
        <p className="text-xs text-text-muted">
          {activeConversation && activeConversation.messages.length > 80
            ? 'Large conversation. Consider starting a fresh thread.'
            : 'No memory pressure warning.'}
        </p>
      </div>

      {/* Provider Health */}
      <div className="p-3 rounded-lg bg-bg-tertiary border border-border-subtle">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Activity size={12} className="text-success" />
          Provider Health
        </h4>
        {healthRecords.length === 0 ? (
          <p className="text-xs text-text-muted">No health data yet</p>
        ) : (
          <div className="space-y-2">
            {healthRecords.map((h) => {
              const cooldown = getCooldownInfo(h.providerId);
              return (
                <div key={h.providerId} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">{h.providerId}</span>
                    <div className="flex items-center gap-2">
                      {h.disabled && <AlertTriangle size={12} className="text-error" />}
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                          h.disabled
                            ? 'bg-error/10 text-error'
                            : h.consecutiveFailures > 0
                            ? 'bg-warning/10 text-warning'
                            : 'bg-success/10 text-success'
                        }`}
                      >
                        {h.disabled ? 'Cooldown' : h.consecutiveFailures > 0 ? 'Degraded' : 'Healthy'}
                      </span>
                    </div>
                  </div>
                  {cooldown.isInCooldown && (
                    <div className="flex justify-between mt-0.5 text-[10px] text-text-muted">
                      <span>Cooldown</span>
                      <span>{Math.round(cooldown.cooldownRemainingMs / 1000)}s remaining</span>
                    </div>
                  )}
                  {h.latencyMs > 0 && (
                    <div className="flex justify-between mt-0.5 text-[10px] text-text-muted">
                      <span>Latency</span>
                      <span>{h.latencyMs}ms</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Model Info */}
      {activeConversation && (
        <div className="p-3 rounded-lg bg-bg-tertiary border border-border-subtle">
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock size={12} className="text-accent" />
            Conversation
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Model</span>
              <span className="text-text-secondary">{activeConversation.modelId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Preset</span>
              <span className="text-text-secondary">{activeConversation.presetId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Messages</span>
              <span className="text-text-secondary">{activeConversation.messages.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'neutral';
}) {
  return (
    <div className={`metric-badge ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
