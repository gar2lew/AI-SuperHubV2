export type ProviderAnalyticsEventType =
  | 'success'
  | 'failure'
  | 'timeout'
  | 'fallback'
  | 'stream_interruption'
  | 'recovery';

export interface ProviderAnalyticsEvent {
  type: ProviderAnalyticsEventType;
  providerId: string;
  timestamp: number;
  latencyMs?: number;
  targetProviderId?: string;
  reason?: string;
}

export interface FallbackTransitionMetric {
  fromProviderId: string;
  toProviderId: string;
  count: number;
}

export interface ProviderAnalyticsSummary {
  providerId: string;
  eventCount: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  fallbackCount: number;
  streamInterruptionCount: number;
  recoveryCount: number;
  successRate: number;
  timeoutFrequency: number;
  streamInterruptionFrequency: number;
  averageLatencyMs: number | null;
  qualityScore: number;
  quality: 'excellent' | 'good' | 'degraded' | 'critical';
  fallbackTransitions: FallbackTransitionMetric[];
  lastEventAt: number | null;
  windowMs: number;
}

const ROLLING_WINDOW_MS = 30 * 60 * 1000;
const MAX_EVENTS_PER_PROVIDER = 100;

const analyticsStore = new Map<string, ProviderAnalyticsEvent[]>();

function now(): number {
  return Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getEvents(providerId: string): ProviderAnalyticsEvent[] {
  if (!analyticsStore.has(providerId)) {
    analyticsStore.set(providerId, []);
  }
  return analyticsStore.get(providerId)!;
}

function trimEvents(providerId: string): ProviderAnalyticsEvent[] {
  const cutoff = now() - ROLLING_WINDOW_MS;
  const events = getEvents(providerId)
    .filter((event) => event.timestamp >= cutoff)
    .slice(-MAX_EVENTS_PER_PROVIDER);
  analyticsStore.set(providerId, events);
  return events;
}

function recordEvent(event: Omit<ProviderAnalyticsEvent, 'timestamp'>): void {
  const events = getEvents(event.providerId);
  events.push({ ...event, timestamp: now() });
  trimEvents(event.providerId);
}

export function recordProviderSuccess(providerId: string, latencyMs: number): void {
  recordEvent({ type: 'success', providerId, latencyMs });
}

export function recordProviderFailure(providerId: string, reason = 'error'): void {
  recordEvent({ type: 'failure', providerId, reason });
}

export function recordProviderTimeout(providerId: string): void {
  recordEvent({ type: 'timeout', providerId, reason: 'timeout' });
}

export function recordProviderFallbackTransition(
  fromProviderId: string,
  toProviderId: string
): void {
  if (fromProviderId === toProviderId) return;
  recordEvent({
    type: 'fallback',
    providerId: fromProviderId,
    targetProviderId: toProviderId,
  });
}

export function recordProviderStreamInterruption(providerId: string, reason = 'abort'): void {
  recordEvent({ type: 'stream_interruption', providerId, reason });
}

export function recordProviderRecovery(providerId: string): void {
  recordEvent({ type: 'recovery', providerId });
}

export function getProviderAnalytics(providerId: string): ProviderAnalyticsSummary {
  const events = trimEvents(providerId);
  const successEvents = events.filter((event) => event.type === 'success');
  const successCount = successEvents.length;
  const failureCount = events.filter((event) => event.type === 'failure').length;
  const timeoutCount = events.filter((event) => event.type === 'timeout').length;
  const fallbackEvents = events.filter((event) => event.type === 'fallback');
  const streamInterruptionCount = events.filter((event) => event.type === 'stream_interruption').length;
  const recoveryCount = events.filter((event) => event.type === 'recovery').length;
  const outcomeCount = successCount + failureCount + timeoutCount + streamInterruptionCount;
  const latencyEvents = successEvents.filter((event) => typeof event.latencyMs === 'number');
  const averageLatencyMs =
    latencyEvents.length > 0
      ? Math.round(
          latencyEvents.reduce((total, event) => total + (event.latencyMs ?? 0), 0) /
            latencyEvents.length
        )
      : null;

  const successRate = outcomeCount > 0 ? successCount / outcomeCount : 1;
  const timeoutFrequency = outcomeCount > 0 ? timeoutCount / outcomeCount : 0;
  const streamInterruptionFrequency =
    outcomeCount > 0 ? streamInterruptionCount / outcomeCount : 0;

  const fallbackTransitions = fallbackEvents.reduce<FallbackTransitionMetric[]>((metrics, event) => {
    if (!event.targetProviderId) return metrics;
    const existing = metrics.find(
      (metric) =>
        metric.fromProviderId === event.providerId &&
        metric.toProviderId === event.targetProviderId
    );
    if (existing) {
      existing.count += 1;
    } else {
      metrics.push({
        fromProviderId: event.providerId,
        toProviderId: event.targetProviderId,
        count: 1,
      });
    }
    return metrics;
  }, []);

  const latencyComponent =
    averageLatencyMs === null ? 15 : clamp(15 - averageLatencyMs / 400, 0, 15);
  const stabilityComponent = clamp(
    15 - timeoutFrequency * 8 - streamInterruptionFrequency * 5 - fallbackEvents.length,
    0,
    15
  );
  const recoveryBonus = clamp(recoveryCount * 2, 0, 5);
  const qualityScore = clamp(
    Math.round(successRate * 70 + latencyComponent + stabilityComponent + recoveryBonus),
    0,
    100
  );
  const quality =
    qualityScore >= 90
      ? 'excellent'
      : qualityScore >= 75
        ? 'good'
        : qualityScore >= 50
          ? 'degraded'
          : 'critical';

  return {
    providerId,
    eventCount: events.length,
    successCount,
    failureCount,
    timeoutCount,
    fallbackCount: fallbackEvents.length,
    streamInterruptionCount,
    recoveryCount,
    successRate,
    timeoutFrequency,
    streamInterruptionFrequency,
    averageLatencyMs,
    qualityScore,
    quality,
    fallbackTransitions,
    lastEventAt: events.at(-1)?.timestamp ?? null,
    windowMs: ROLLING_WINDOW_MS,
  };
}

export function getAllProviderAnalytics(): ProviderAnalyticsSummary[] {
  return Array.from(analyticsStore.keys())
    .map((providerId) => getProviderAnalytics(providerId))
    .filter((summary) => summary.eventCount > 0)
    .sort((a, b) => a.providerId.localeCompare(b.providerId));
}

export function resetProviderAnalytics(providerId: string): void {
  analyticsStore.delete(providerId);
}

export function resetAllProviderAnalytics(): void {
  analyticsStore.clear();
}
