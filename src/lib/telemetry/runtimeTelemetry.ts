import type { DeviceType } from '@/lib/responsive';

const MAX_RECENT = 50;

export interface StreamTelemetryStart {
  streamId: string;
  providerId: string;
  modelId: string;
  runtimeModelId?: string;
  conversationId?: string;
  fallbackChain?: string[];
  retryCount?: number;
  reconnectCount?: number;
}

export type RuntimeEventType =
  | 'stream_start'
  | 'stream_complete'
  | 'stream_abort'
  | 'stream_timeout'
  | 'provider_fallback'
  | 'websocket_disconnect'
  | 'websocket_reconnect'
  | 'runtime_auth_failure'
  | 'runtime_recovery'
  | 'image_generation'
  | 'image_failure'
  | 'voice_start'
  | 'voice_failure'
  | 'retry_triggered';

export interface RuntimeEvent {
  id: string;
  type: RuntimeEventType;
  at: number;
  streamId?: string;
  conversationId?: string;
  providerId?: string;
  modelId?: string;
  runtimeModelId?: string;
  fallbackChain?: string[];
  latencyMs?: number;
  retryCount?: number;
  reconnectCount?: number;
  message?: string;
}

export type RuntimeEventInput = Omit<RuntimeEvent, 'id' | 'at'> & { at?: number };

export interface RenderTelemetryEntry {
  name: string;
  durationMs: number;
  at: number;
}

export interface WorkspaceActivationEntry {
  workspace: string;
  durationMs: number;
  at: number;
}

export interface ViewportTelemetryEntry {
  width: number;
  height: number;
  deviceType: DeviceType;
  orientation: 'portrait' | 'landscape';
  visualViewportHeight?: number;
  keyboardInset?: number;
  at: number;
}

interface ActiveStreamTelemetry extends StreamTelemetryStart {
  startedAt: number;
  chunkCount: number;
  byteCount: number;
  lastChunkAt: number | null;
  firstChunkAt: number | null;
}

interface CompletedStreamTelemetry {
  streamId: string;
  providerId: string;
  modelId: string;
  runtimeModelId?: string;
  conversationId?: string;
  fallbackChain?: string[];
  durationMs: number;
  firstTokenLatencyMs: number | null;
  chunkCount: number;
  byteCount: number;
  throughputPerSecond: number;
  bytesPerSecond: number;
  finishedAt: number;
  status: 'completed' | 'errored' | 'aborted';
  retryCount: number;
  reconnectCount: number;
}

interface AggregateTiming {
  count: number;
  lastMs: number;
  averageMs: number;
}

const activeStreams = new Map<string, ActiveStreamTelemetry>();
const completedStreams: CompletedStreamTelemetry[] = [];
const providerLatency = new Map<string, AggregateTiming>();
const renderByName = new Map<string, AggregateTiming>();
const renderRecent: RenderTelemetryEntry[] = [];
const workspaceByName = new Map<string, AggregateTiming>();
const workspaceRecent: WorkspaceActivationEntry[] = [];
const viewportRecent: ViewportTelemetryEntry[] = [];
const runtimeEvents: RuntimeEvent[] = [];

const counters = {
  streamsStarted: 0,
  streamsCompleted: 0,
  streamsErrored: 0,
  streamsAborted: 0,
  fallbacks: 0,
  retries: 0,
  reconnects: 0,
  providerFailures: 0,
};

const fallbackState: {
  lastFromProvider?: string;
  lastToProvider?: string;
  lastAt?: number;
} = {};

const hydrationState: {
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
} = {
  startedAt: null,
  completedAt: null,
  durationMs: null,
};

function timestamp() {
  return Date.now();
}

function pushBounded<T>(items: T[], item: T) {
  items.push(item);
  if (items.length > MAX_RECENT) {
    items.splice(0, items.length - MAX_RECENT);
  }
}

function createEventId(type: RuntimeEventType, at: number) {
  return `runtime-event-${type}-${at}-${Math.random().toString(36).slice(2, 8)}`;
}

export function recordRuntimeEvent(input: RuntimeEventInput): RuntimeEvent {
  const at = input.at ?? timestamp();
  const event: RuntimeEvent = {
    ...input,
    id: createEventId(input.type, at),
    at,
    fallbackChain: input.fallbackChain ? [...input.fallbackChain] : undefined,
  };

  if (event.type === 'retry_triggered') counters.retries += 1;
  if (event.type === 'websocket_reconnect') counters.reconnects += 1;
  if (
    event.type === 'runtime_auth_failure' ||
    event.type === 'image_failure' ||
    event.type === 'voice_failure'
  ) {
    counters.providerFailures += 1;
  }

  pushBounded(runtimeEvents, event);
  return event;
}

function updateTiming(map: Map<string, AggregateTiming>, key: string, durationMs: number) {
  const current = map.get(key);
  if (!current) {
    map.set(key, { count: 1, lastMs: durationMs, averageMs: durationMs });
    return;
  }

  const count = current.count + 1;
  map.set(key, {
    count,
    lastMs: durationMs,
    averageMs: Math.round((current.averageMs * current.count + durationMs) / count),
  });
}

function finalizeStream(streamId: string, status: CompletedStreamTelemetry['status']) {
  const active = activeStreams.get(streamId);
  if (!active) return;

  const finishedAt = timestamp();
  const durationMs = Math.max(0, finishedAt - active.startedAt);
  const seconds = Math.max(durationMs / 1000, 0.001);
  const completed: CompletedStreamTelemetry = {
    streamId,
    providerId: active.providerId,
    modelId: active.modelId,
    runtimeModelId: active.runtimeModelId,
    conversationId: active.conversationId,
    fallbackChain: active.fallbackChain ? [...active.fallbackChain] : undefined,
    durationMs,
    firstTokenLatencyMs: active.firstChunkAt === null ? null : Math.max(0, active.firstChunkAt - active.startedAt),
    chunkCount: active.chunkCount,
    byteCount: active.byteCount,
    throughputPerSecond: Math.round(active.chunkCount / seconds),
    bytesPerSecond: Math.round(active.byteCount / seconds),
    finishedAt,
    status,
    retryCount: active.retryCount ?? 0,
    reconnectCount: active.reconnectCount ?? 0,
  };

  activeStreams.delete(streamId);
  pushBounded(completedStreams, completed);

  if (status === 'completed') counters.streamsCompleted += 1;
  if (status === 'errored') counters.streamsErrored += 1;
  if (status === 'aborted') counters.streamsAborted += 1;
  recordRuntimeEvent({
    type: status === 'completed' ? 'stream_complete' : status === 'aborted' ? 'stream_abort' : 'stream_timeout',
    streamId,
    conversationId: active.conversationId,
    providerId: active.providerId,
    modelId: active.modelId,
    runtimeModelId: active.runtimeModelId,
    fallbackChain: active.fallbackChain,
    latencyMs: durationMs,
    retryCount: active.retryCount,
    reconnectCount: active.reconnectCount,
  });
}

function mapToRecord<T>(map: Map<string, T>): Record<string, T> {
  return Object.fromEntries(map.entries());
}

function average(items: number[]) {
  if (items.length === 0) return 0;
  return Math.round(items.reduce((sum, value) => sum + value, 0) / items.length);
}

export function resetRuntimeTelemetry() {
  activeStreams.clear();
  completedStreams.length = 0;
  providerLatency.clear();
  renderByName.clear();
  renderRecent.length = 0;
  workspaceByName.clear();
  workspaceRecent.length = 0;
  viewportRecent.length = 0;
  runtimeEvents.length = 0;
  counters.streamsStarted = 0;
  counters.streamsCompleted = 0;
  counters.streamsErrored = 0;
  counters.streamsAborted = 0;
  counters.fallbacks = 0;
  counters.retries = 0;
  counters.reconnects = 0;
  counters.providerFailures = 0;
  fallbackState.lastFromProvider = undefined;
  fallbackState.lastToProvider = undefined;
  fallbackState.lastAt = undefined;
  hydrationState.startedAt = null;
  hydrationState.completedAt = null;
  hydrationState.durationMs = null;
}

export function recordStreamStart(details: StreamTelemetryStart) {
  counters.streamsStarted += 1;
  activeStreams.set(details.streamId, {
    ...details,
    fallbackChain: details.fallbackChain ? [...details.fallbackChain] : undefined,
    startedAt: timestamp(),
    chunkCount: 0,
    byteCount: 0,
    lastChunkAt: null,
    firstChunkAt: null,
  });
  recordRuntimeEvent({
    type: 'stream_start',
    streamId: details.streamId,
    conversationId: details.conversationId,
    providerId: details.providerId,
    modelId: details.modelId,
    runtimeModelId: details.runtimeModelId,
    fallbackChain: details.fallbackChain,
    retryCount: details.retryCount,
    reconnectCount: details.reconnectCount,
  });
}

export function recordStreamChunk(streamId: string, byteLength = 0) {
  const active = activeStreams.get(streamId);
  if (!active) return;

  active.chunkCount += 1;
  active.byteCount += Math.max(0, byteLength);
  active.lastChunkAt = timestamp();
  active.firstChunkAt ??= active.lastChunkAt;
}

export function recordStreamComplete(streamId: string) {
  finalizeStream(streamId, 'completed');
}

export function recordStreamError(streamId: string) {
  finalizeStream(streamId, 'errored');
}

export function recordStreamAbort(streamId: string) {
  finalizeStream(streamId, 'aborted');
}

export function recordProviderLatency(providerId: string, latencyMs: number) {
  updateTiming(providerLatency, providerId, Math.max(0, latencyMs));
}

export function recordFallback(
  fromProvider?: string,
  toProvider?: string,
  correlation: Partial<Pick<RuntimeEvent, 'streamId' | 'conversationId' | 'modelId' | 'runtimeModelId' | 'fallbackChain'>> = {}
) {
  counters.fallbacks += 1;
  fallbackState.lastFromProvider = fromProvider;
  fallbackState.lastToProvider = toProvider;
  fallbackState.lastAt = timestamp();
  recordRuntimeEvent({
    type: 'provider_fallback',
    providerId: fromProvider,
    message: toProvider ? `${fromProvider ?? 'unknown'} -> ${toProvider}` : undefined,
    ...correlation,
  });
}

export function recordRenderTiming(name: string, durationMs: number) {
  const safeDuration = Math.max(0, Math.round(durationMs));
  updateTiming(renderByName, name, safeDuration);
  pushBounded(renderRecent, { name, durationMs: safeDuration, at: timestamp() });
}

export function recordWorkspaceActivation(workspace: string, durationMs: number) {
  const safeDuration = Math.max(0, Math.round(durationMs));
  updateTiming(workspaceByName, workspace, safeDuration);
  pushBounded(workspaceRecent, { workspace, durationMs: safeDuration, at: timestamp() });
}

export function recordHydrationStart(startedAt = timestamp()) {
  hydrationState.startedAt = startedAt;
  hydrationState.completedAt = null;
  hydrationState.durationMs = null;
}

export function recordHydrationComplete(completedAt = timestamp()) {
  if (hydrationState.startedAt === null) {
    hydrationState.startedAt = completedAt;
  }
  hydrationState.completedAt = completedAt;
  hydrationState.durationMs = Math.max(0, completedAt - hydrationState.startedAt);
}

export function recordViewportMetrics(metrics: Omit<ViewportTelemetryEntry, 'at'>) {
  pushBounded(viewportRecent, { ...metrics, at: timestamp() });
}

export function getRuntimeTelemetrySnapshot() {
  const completed = completedStreams.filter((stream) => stream.status === 'completed');
  const lastCompleted = completed.at(-1);
  const firstTokenLatencies = completed
    .map((stream) => stream.firstTokenLatencyMs)
    .filter((value): value is number => typeof value === 'number');

  return {
    streams: {
      started: counters.streamsStarted,
      completed: counters.streamsCompleted,
      errored: counters.streamsErrored,
      aborted: counters.streamsAborted,
      active: activeStreams.size,
      abortRate:
        counters.streamsStarted > 0
          ? Number((counters.streamsAborted / counters.streamsStarted).toFixed(2))
          : 0,
      lastDurationMs: lastCompleted?.durationMs ?? 0,
      averageDurationMs: average(completed.map((stream) => stream.durationMs)),
      lastThroughputPerSecond: lastCompleted?.throughputPerSecond ?? 0,
      averageThroughputPerSecond: average(completed.map((stream) => stream.throughputPerSecond)),
      lastBytesPerSecond: lastCompleted?.bytesPerSecond ?? 0,
      recent: [...completedStreams],
    },
    providers: {
      latencyByProvider: mapToRecord(providerLatency),
      fallbacks: {
        count: counters.fallbacks,
        lastFromProvider: fallbackState.lastFromProvider,
        lastToProvider: fallbackState.lastToProvider,
        lastAt: fallbackState.lastAt,
      },
    },
    render: {
      byName: mapToRecord(renderByName),
      recent: [...renderRecent],
    },
    workspace: {
      byName: mapToRecord(workspaceByName),
      recent: [...workspaceRecent],
      last: workspaceRecent.at(-1),
    },
    hydration: { ...hydrationState },
    viewport: {
      last: viewportRecent.at(-1),
      recent: [...viewportRecent],
    },
    events: {
      recent: [...runtimeEvents],
      latestFailures: runtimeEvents.filter((event) =>
        ['stream_timeout', 'runtime_auth_failure', 'image_failure', 'voice_failure', 'websocket_disconnect'].includes(
          event.type
        )
      ),
      retryHistory: runtimeEvents.filter((event) => event.type === 'retry_triggered'),
      reconnectHistory: runtimeEvents.filter((event) =>
        event.type === 'websocket_disconnect' || event.type === 'websocket_reconnect'
      ),
      providerSwitches: runtimeEvents.filter((event) => event.type === 'provider_fallback'),
      timeoutHistory: runtimeEvents.filter((event) => event.type === 'stream_timeout'),
    },
    performance: {
      averageStreamLatencyMs: average(completed.map((stream) => stream.durationMs)),
      averageFirstTokenLatencyMs: average(firstTokenLatencies),
      reconnectFrequency:
        counters.streamsStarted > 0 ? Number((counters.reconnects / counters.streamsStarted).toFixed(2)) : 0,
      retryFrequency:
        counters.streamsStarted > 0 ? Number((counters.retries / counters.streamsStarted).toFixed(2)) : 0,
      providerFailureRate:
        counters.streamsStarted > 0
          ? Number(((counters.streamsErrored + counters.providerFailures) / counters.streamsStarted).toFixed(2))
          : 0,
    },
  };
}
