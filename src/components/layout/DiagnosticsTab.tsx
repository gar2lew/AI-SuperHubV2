import { useSyncExternalStore } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { DeploymentStatus } from '@/components/deployment/DeploymentStatus';
import { useChatStore } from '@/store/chatStore';
import { getAllHealth, getCooldownInfo, getHealth } from '@/lib/providers/health';
import { getAllProviderAnalytics, getProviderAnalytics } from '@/lib/providers/analytics';
import { getPuterProviderStatus } from '@/lib/providers/puter';
import {
  clearClientErrors,
  getClientErrorSnapshot,
  subscribeClientErrors,
} from '@/lib/diagnostics/client-errors';
import { getRuntimeTelemetrySnapshot } from '@/lib/telemetry/runtimeTelemetry';
import { deploymentMetadata } from '@/lib/deployment/metadata';
import { CAPABILITY_LABELS } from '@/lib/models/capabilities';
import { getModelMetadata } from '@/lib/models/metadata';
import { modelRegistry } from '@/lib/models/registry';
import { getLastRoutingDiagnostics } from '@/lib/routing/fallback-router';

export function DiagnosticsTab() {
  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId)
  );
  const currentStreamId = useChatStore((s) => s.getCurrentStreamId());
  const healthRecords = getAllHealth();
  const analyticsRecords = getAllProviderAnalytics();
  const runtimeTelemetry = getRuntimeTelemetrySnapshot();
  const providerIds = Array.from(
    new Set([
      ...healthRecords.map((record) => record.providerId),
      ...analyticsRecords.map((record) => record.providerId),
    ])
  ).sort();
  const puterStatus = getPuterProviderStatus();
  const routeDiagnostics = getLastRoutingDiagnostics();
  const diagnostics = useChatStore((s) => s.streamEngine?.getDiagnostics());
  const clientErrors = useSyncExternalStore(
    subscribeClientErrors,
    getClientErrorSnapshot,
    () => []
  );

  const streaming = activeConversation?.streaming;
  const activeModel = activeConversation ? modelRegistry.get(activeConversation.modelId) : undefined;
  const activeModelMetadata = activeModel ? getModelMetadata(activeModel) : undefined;
  const durationMs = streaming ? Date.now() - streaming.startedAt : 0;
  const chunkCount = streaming?.buffer.length || 0;
  const chunkRate = durationMs > 0 ? Math.round((chunkCount / durationMs) * 1000) : 0;
  const fps = diagnostics?.throughputPerSecond ? Math.min(60, diagnostics.throughputPerSecond) : 0;
  const streamHealth = !streaming ? 'idle' : chunkRate > 0 ? 'streaming' : 'warming';
  const runtimeModeLabel = formatRuntimeMode(puterStatus.runtime.executionMode, puterStatus.runtime.modeReason);

  return (
    <div className="space-y-4">
      <div className="diagnostic-summary">
        <MetricBadge
          label="Runtime"
          value={runtimeModeLabel}
          tone={puterStatus.runtime.executionMode === 'live' ? 'success' : puterStatus.runtime.executionMode === 'offline' ? 'neutral' : 'warning'}
        />
        <MetricBadge label="Stream" value={streamHealth} tone={streaming ? 'success' : 'neutral'} />
        <MetricBadge label="FPS" value={String(fps)} tone={fps > 0 ? 'success' : 'neutral'} />
        <MetricBadge label="Errors" value={String(clientErrors.length)} tone={clientErrors.length > 0 ? 'warning' : 'neutral'} />
        <MetricBadge label="Abort" value={`${Math.round(runtimeTelemetry.streams.abortRate * 100)}%`} tone={runtimeTelemetry.streams.aborted > 0 ? 'warning' : 'neutral'} />
      </div>

      <DeploymentStatus />

      <div className="telemetry-card p-3">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-accent" />
          Release Metadata
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Version</span>
            <span className="text-text-secondary">{deploymentMetadata.appVersion || 'unknown'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Build</span>
            <span className="text-text-secondary">{formatBuildTime(deploymentMetadata.deploymentTimestamp)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Environment</span>
            <span className="text-text-secondary">{deploymentMetadata.vercelEnv}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Commit</span>
            <span className="text-text-secondary">{deploymentMetadata.shortCommitSha || 'unknown'}</span>
          </div>
        </div>
      </div>

      {routeDiagnostics && (
        <div className="telemetry-card p-3">
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Activity size={12} className="text-accent" />
            Route Resolution
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Requested</span>
              <span className="max-w-[150px] truncate text-text-secondary">{routeDiagnostics.requestedModelId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Resolved</span>
              <span className="max-w-[150px] truncate text-text-secondary">
                {routeDiagnostics.resolvedModelId ?? 'none'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Provider</span>
              <span className="text-text-secondary">{routeDiagnostics.resolvedProviderId ?? 'none'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Runtime ID</span>
              <span className="max-w-[150px] truncate text-text-secondary">
                {routeDiagnostics.resolvedRuntimeModelId ?? 'none'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Fallback</span>
              <span className={routeDiagnostics.usedFallback ? 'text-warning' : 'text-success'}>
                {routeDiagnostics.safeFallbackUsed ? 'safe' : routeDiagnostics.usedFallback ? 'yes' : 'no'}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Chain</span>
              <p className="mt-1 max-h-12 overflow-hidden text-[11px] leading-4 text-text-secondary">
                {routeDiagnostics.fallbackChain.join(' -> ')}
              </p>
            </div>
            {routeDiagnostics.rejections.length > 0 && (
              <div className="rounded-md border border-warning/25 bg-warning/10 px-2 py-1 text-[11px] text-warning">
                {routeDiagnostics.rejections
                  .slice(-2)
                  .map((item) => `${item.providerId ?? item.modelId}: ${item.reason}`)
                  .join(' | ')}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="telemetry-card p-3">
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
            <span className="text-text-muted">Mode</span>
            <span className={puterStatus.runtime.executionMode === 'live' ? 'text-success' : 'text-warning'}>
              {runtimeModeLabel}
            </span>
          </div>
          {puterStatus.runtime.modeReason && (
            <div className="flex justify-between gap-3">
              <span className="text-text-muted">Mode reason</span>
              <span className="max-w-[150px] truncate text-right text-text-secondary">{puterStatus.runtime.modeReason}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">Readiness</span>
            <span className="text-text-secondary">{puterStatus.readiness}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Connection</span>
            <span className="text-text-secondary">{puterStatus.runtime.connectionState}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Auth</span>
            <span className="text-text-secondary">
              {puterStatus.runtime.authState}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Auth invalidated</span>
            <span className="text-text-secondary">{formatTimestamp(puterStatus.runtime.authInvalidatedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Models</span>
            <span className={puterStatus.runtime.modelFetchStatus === 'failed' ? 'text-warning' : 'text-text-secondary'}>
              {puterStatus.runtime.modelFetchStatus} ({puterStatus.runtime.discoveredModelCount})
            </span>
          </div>
          {puterStatus.runtime.modelFetchError && (
            <div className="rounded-md border border-warning/25 bg-warning/10 px-2 py-1 text-[11px] text-warning">
              {puterStatus.runtime.modelFetchError}
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">Last real exec</span>
            <span className="text-text-secondary">{formatTimestamp(puterStatus.runtime.lastSuccessfulRealExecutionAt)}</span>
          </div>
          {puterStatus.runtime.error && (
            <div className="rounded-md border border-error/25 bg-error/10 px-2 py-1 text-[11px] text-error">
              {puterStatus.runtime.error}
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">Timeouts</span>
            <span className="text-text-secondary">{puterStatus.runtime.timeoutEvents}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Reconnects</span>
            <span className="text-text-secondary">{puterStatus.runtime.reconnectAttempts}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Next reconnect</span>
            <span className="text-text-secondary">{formatTimestamp(puterStatus.runtime.nextReconnectAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Backoff</span>
            <span className="text-text-secondary">{puterStatus.runtime.lastReconnectDelayMs ?? 0}ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Reconnect exhausted</span>
            <span className={puterStatus.runtime.reconnectExhausted ? 'text-warning' : 'text-text-secondary'}>
              {puterStatus.runtime.reconnectExhausted ? 'yes' : 'no'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">WS failures</span>
            <span className="text-text-secondary">{puterStatus.runtime.websocketFailures}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Fallbacks</span>
            <span className="text-text-secondary">{puterStatus.runtime.fallbackEvents}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Retry blocks</span>
            <span className={puterStatus.runtime.duplicateRetryBlocks > 0 ? 'text-warning' : 'text-text-secondary'}>
              {puterStatus.runtime.duplicateRetryBlocks}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-text-muted">Recovery</span>
            <span className="max-w-[150px] truncate text-right text-text-secondary">
              {puterStatus.runtime.lastRecoveryDecision ?? 'none'}
            </span>
          </div>
          {puterStatus.runtime.lastRuntimeValidationFailure && (
            <div className="rounded-md border border-warning/25 bg-warning/10 px-2 py-1 text-[11px] text-warning">
              {puterStatus.runtime.lastRuntimeValidationFailure}
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">Latency</span>
            <span className="text-text-secondary">
              {puterStatus.runtime.providerLatencyMs ?? 0}ms
            </span>
          </div>
        </div>
      </div>

      {streaming && (
        <div className="telemetry-card p-3">
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
              <span className="text-text-muted">Runtime ID</span>
              <span className="text-text-secondary">{streaming.runtimeModelId ?? streaming.modelId}</span>
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

      <div className="telemetry-card p-3">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Activity size={12} className="text-accent" />
          Runtime Telemetry
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Streams</span>
            <span className="text-text-secondary">
              {runtimeTelemetry.streams.completed}/{runtimeTelemetry.streams.started} done
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Avg duration</span>
            <span className="text-text-secondary">{formatMs(runtimeTelemetry.streams.averageDurationMs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Avg chunks/s</span>
            <span className="text-text-secondary">
              {runtimeTelemetry.streams.averageThroughputPerSecond}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Fallbacks</span>
            <span className="text-text-secondary">{runtimeTelemetry.providers.fallbacks.count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Hydration</span>
            <span className="text-text-secondary">
              {runtimeTelemetry.hydration.durationMs === null
                ? 'pending'
                : formatMs(runtimeTelemetry.hydration.durationMs)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Workspace</span>
            <span className="text-text-secondary">
              {runtimeTelemetry.workspace.last
                ? `${runtimeTelemetry.workspace.last.workspace} ${formatMs(runtimeTelemetry.workspace.last.durationMs)}`
                : 'pending'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Viewport</span>
            <span className="text-text-secondary">
              {runtimeTelemetry.viewport.last
                ? `${runtimeTelemetry.viewport.last.width}x${runtimeTelemetry.viewport.last.height} ${runtimeTelemetry.viewport.last.deviceType}`
                : 'pending'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Keyboard inset</span>
            <span className="text-text-secondary">
              {runtimeTelemetry.viewport.last?.keyboardInset ?? 0}px
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Render samples</span>
            <span className="text-text-secondary">{runtimeTelemetry.render.recent.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">First token avg</span>
            <span className="text-text-secondary">{formatMs(runtimeTelemetry.performance.averageFirstTokenLatencyMs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Retry freq</span>
            <span className="text-text-secondary">{runtimeTelemetry.performance.retryFrequency}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Reconnect freq</span>
            <span className="text-text-secondary">{runtimeTelemetry.performance.reconnectFrequency}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Failure rate</span>
            <span className="text-text-secondary">{runtimeTelemetry.performance.providerFailureRate}</span>
          </div>
        </div>
      </div>

      <div className="telemetry-card p-3">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock size={12} className="text-accent" />
          Runtime Timeline
        </h4>
        {runtimeTelemetry.events.recent.length === 0 ? (
          <p className="text-xs text-text-muted">No runtime events captured</p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {runtimeTelemetry.events.recent.slice(-12).reverse().map((event) => (
              <div key={event.id} className="rounded-md border border-border-subtle/70 bg-bg-tertiary/35 p-2 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-text-secondary">{event.type}</span>
                  <span className="shrink-0 text-[10px] text-text-muted">{formatTime(event.at)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-text-muted">
                  {event.providerId && <><span>Provider</span><span className="truncate text-right">{event.providerId}</span></>}
                  {event.runtimeModelId && <><span>Runtime</span><span className="truncate text-right">{event.runtimeModelId}</span></>}
                  {event.streamId && <><span>Stream</span><span className="truncate text-right font-mono">{event.streamId}</span></>}
                  {typeof event.latencyMs === 'number' && <><span>Latency</span><span className="text-right">{formatMs(event.latencyMs)}</span></>}
                </div>
                {event.message && <p className="mt-1 break-words text-[10px] text-text-muted">{event.message}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="telemetry-card p-3">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
          Memory
        </h4>
        <p className="text-xs text-text-muted">
          {activeConversation && activeConversation.messages.length > 80
            ? 'Large conversation. Consider starting a fresh thread.'
            : 'No memory pressure warning.'}
        </p>
      </div>

      <div className="telemetry-card p-3">
        <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Activity size={12} className="text-success" />
          Provider Health
        </h4>
        {providerIds.length === 0 ? (
          <p className="text-xs text-text-muted">No health data yet</p>
        ) : (
          <div className="space-y-2">
            {providerIds.map((providerId) => {
              const h = getHealth(providerId);
              const analytics = getProviderAnalytics(providerId);
              const cooldown = getCooldownInfo(providerId);
              return (
                <div key={providerId} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">{providerId}</span>
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
                  {analytics.eventCount > 0 && (
                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
                      <span>Score</span>
                      <span className="text-right text-text-secondary">
                        {analytics.qualityScore} ({analytics.quality})
                      </span>
                      <span>Success</span>
                      <span className="text-right">{Math.round(analytics.successRate * 100)}%</span>
                      <span>Avg latency</span>
                      <span className="text-right">{analytics.averageLatencyMs ?? 0}ms</span>
                      <span>Timeout freq</span>
                      <span className="text-right">
                        {Math.round(analytics.timeoutFrequency * 100)}%
                      </span>
                      <span>Interrupt freq</span>
                      <span className="text-right">
                        {Math.round(analytics.streamInterruptionFrequency * 100)}%
                      </span>
                      <span>Fallbacks</span>
                      <span className="text-right">{analytics.fallbackCount}</span>
                      <span>Recoveries</span>
                      <span className="text-right">{analytics.recoveryCount}</span>
                      {analytics.fallbackTransitions[0] && (
                        <>
                          <span>Last fallback</span>
                          <span className="text-right">
                            {`${analytics.fallbackTransitions[0].fromProviderId} -> ${analytics.fallbackTransitions[0].toProviderId}`}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="telemetry-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={12} className={clientErrors.length > 0 ? 'text-warning' : 'text-text-muted'} />
            Client Errors
          </h4>
          {clientErrors.length > 0 && (
            <button
              type="button"
              onClick={clearClientErrors}
              className="icon-action p-1 text-text-muted hover:text-text-primary"
              title="Clear client errors"
              aria-label="Clear client errors"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
        {clientErrors.length === 0 ? (
          <p className="text-xs text-text-muted">No client errors captured</p>
        ) : (
          <div className="space-y-2">
            {clientErrors.slice(0, 5).map((entry) => (
              <div key={entry.id} className="rounded-md border border-border-subtle/70 bg-bg-tertiary/35 p-2 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium text-text-secondary">
                    {entry.source}
                  </span>
                  <span className="shrink-0 text-[10px] text-text-muted">
                    {entry.count > 1 ? `${entry.count}x · ` : ''}
                    {formatTime(entry.lastSeenAt)}
                  </span>
                </div>
                <p className="break-words text-text-primary">{entry.message}</p>
                {entry.context?.providerId && (
                  <p className="mt-1 truncate text-[10px] text-text-muted">
                    {entry.context.providerId}
                    {entry.context.modelId ? ` · ${entry.context.modelId}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeConversation && (
        <div className="telemetry-card p-3">
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock size={12} className="text-accent" />
            Conversation
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Model</span>
              <span className="text-text-secondary">{activeModel?.label ?? activeConversation.modelId}</span>
            </div>
            {activeModelMetadata && (
              <>
                <div className="flex justify-between">
                  <span className="text-text-muted">Provider</span>
                  <span className="text-text-secondary">{activeModelMetadata.providerName}</span>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {activeModelMetadata.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] text-text-muted"
                    >
                      {CAPABILITY_LABELS[capability]}
                    </span>
                  ))}
                </div>
              </>
            )}
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

function formatRuntimeMode(mode: string, reason?: string | null) {
  const base = mode.toUpperCase();
  if (!reason) return base;
  if (reason === 'unauthenticated-session') return `${base} (Unauthenticated)`;
  if (reason.includes('timeout')) return `${base} (Provider timeout)`;
  if (reason === 'developer override') return `${base} (Developer override)`;
  return base;
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function formatMs(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }
  return `${Math.round(value)}ms`;
}

function formatBuildTime(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return 'unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatTimestamp(value: number | null) {
  if (!value) return 'never';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
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
