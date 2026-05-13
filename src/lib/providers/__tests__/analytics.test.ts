import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllProviderAnalytics,
  getProviderAnalytics,
  recordProviderFallbackTransition,
  recordProviderStreamInterruption,
  resetAllProviderAnalytics,
} from '@/lib/providers/analytics';
import { recordFailure, recordSuccess, resetHealth } from '@/lib/providers/health';

describe('provider analytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T08:00:00.000Z'));
    resetAllProviderAnalytics();
    resetHealth('puter');
  });

  it('tracks rolling provider quality metrics', () => {
    recordSuccess('puter', 100);
    recordSuccess('puter', 300);
    recordFailure('puter');
    recordFailure('puter', 'timeout');
    recordProviderStreamInterruption('puter', 'user-stop');
    recordProviderFallbackTransition('puter', 'ollama');

    const analytics = getProviderAnalytics('puter');

    expect(analytics).toMatchObject({
      providerId: 'puter',
      successCount: 2,
      failureCount: 1,
      timeoutCount: 1,
      fallbackCount: 1,
      streamInterruptionCount: 1,
      averageLatencyMs: 200,
    });
    expect(analytics.successRate).toBe(0.4);
    expect(analytics.timeoutFrequency).toBe(0.2);
    expect(analytics.streamInterruptionFrequency).toBe(0.2);
    expect(analytics.fallbackTransitions).toEqual([
      { fromProviderId: 'puter', toProviderId: 'ollama', count: 1 },
    ]);
    expect(analytics.qualityScore).toBeGreaterThanOrEqual(0);
    expect(analytics.qualityScore).toBeLessThanOrEqual(100);
  });

  it('records recovery events when health returns after a failure', () => {
    recordFailure('puter');
    recordSuccess('puter', 150);

    expect(getProviderAnalytics('puter')).toMatchObject({
      successCount: 1,
      failureCount: 1,
      recoveryCount: 1,
    });
  });

  it('keeps only the rolling provider window', () => {
    recordSuccess('puter', 100);
    vi.advanceTimersByTime(31 * 60 * 1000);
    recordSuccess('puter', 200);

    expect(getProviderAnalytics('puter')).toMatchObject({
      eventCount: 1,
      successCount: 1,
      averageLatencyMs: 200,
    });
    expect(getAllProviderAnalytics()).toHaveLength(1);
  });
});
