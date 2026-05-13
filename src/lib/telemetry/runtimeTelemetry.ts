import type { DeviceType } from '@/lib/responsive';

const MAX_RECENT = 50;

export interface StreamTelemetryStart {
  streamId: string;
  providerId: string;
  modelId: string;
  conversationId?: string;
}

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
}

interface CompletedStreamTelemetry {
  streamId: string;
  providerId: string;
  modelId: string;
  conversationId?: string;
  durationMs: number;
  chunkCount: number;
  byteCount: number;
  throughputPerSecond: number;
  bytesPerSecond: number;
  finishedAt: number;
  status: 'completed' | 'errored' | 'aborted';
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

const counters = {
  streamsStarted: 0,
  streamsCompleted: 0,
  streamsErrored: 0,
  streamsAborted: 0,
  fallbacks: 0,
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
    conversationId: active.conversationId,
    durationMs,
    chunkCount: active.chunkCount,
    byteCount: active.byteCount,
    throughputPerSecond: Math.round(active.chunkCount / seconds),
    bytesPerSecond: Math.round(active.byteCount / seconds),
    finishedAt,
    status,
  };

  activeStreams.delete(streamId);
  pushBounded(completedStreams, completed);

  if (status === 'completed') counters.streamsCompleted += 1;
  if (status === 'errored') counters.streamsErrored += 1;
  if (status === 'aborted') counters.streamsAborted += 1;
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
  counters.streamsStarted = 0;
  counters.streamsCompleted = 0;
  counters.streamsErrored = 0;
  counters.streamsAborted = 0;
  counters.fallbacks = 0;
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
    startedAt: timestamp(),
    chunkCount: 0,
    byteCount: 0,
    lastChunkAt: null,
  });
}

export function recordStreamChunk(streamId: string, byteLength = 0) {
  const active = activeStreams.get(streamId);
  if (!active) return;

  active.chunkCount += 1;
  active.byteCount += Math.max(0, byteLength);
  active.lastChunkAt = timestamp();
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

export function recordFallback(fromProvider?: string, toProvider?: string) {
  counters.fallbacks += 1;
  fallbackState.lastFromProvider = fromProvider;
  fallbackState.lastToProvider = toProvider;
  fallbackState.lastAt = timestamp();
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
  };
}
