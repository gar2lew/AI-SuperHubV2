import type { ProviderHealth } from '@/types';

// ============================================================
// PROVIDER HEALTH TRACKING
// Lightweight monitoring with exponential backoff cooldown.
// ============================================================

const healthStore = new Map<string, ProviderHealth>();

const DEFAULT_HEALTH: Omit<ProviderHealth, 'providerId'> = {
  latencyMs: 0,
  failures: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  consecutiveFailures: 0,
  disabled: false,
  disabledUntil: null,
};

/** Cooldown durations in ms: 5s, 15s, 45s, 2min, 6min, 18min */
const COOLDOWN_MS = [5000, 15000, 45000, 120000, 360000, 1080000];

function getCooldownMs(consecutiveFailures: number): number {
  const index = Math.min(consecutiveFailures - 1, COOLDOWN_MS.length - 1);
  return COOLDOWN_MS[Math.max(0, index)];
}

function getOrCreate(providerId: string): ProviderHealth {
  if (!healthStore.has(providerId)) {
    healthStore.set(providerId, {
      providerId,
      ...DEFAULT_HEALTH,
    });
  }
  return healthStore.get(providerId)!;
}

/** Record a successful provider call. */
export function recordSuccess(providerId: string, latencyMs: number): void {
  const h = getOrCreate(providerId);
  h.latencyMs = latencyMs;
  h.lastSuccessAt = Date.now();
  h.consecutiveFailures = 0;
  h.disabled = false;
  h.disabledUntil = null;
}

/** Record a failed provider call. */
export function recordFailure(providerId: string): void {
  const h = getOrCreate(providerId);
  h.failures += 1;
  h.lastFailureAt = Date.now();
  h.consecutiveFailures += 1;

  // Exponential backoff cooldown
  const cooldown = getCooldownMs(h.consecutiveFailures);
  h.disabled = true;
  h.disabledUntil = Date.now() + cooldown;
}

/** Check if a provider is currently healthy. */
export function isHealthy(providerId: string): boolean {
  const h = getOrCreate(providerId);

  // Check if cooldown has expired
  if (h.disabled && h.disabledUntil && Date.now() > h.disabledUntil) {
    h.disabled = false;
    // Keep disabledUntil so we know it was recently cooled down
  }

  return !h.disabled;
}

/** Get health data for a provider. */
export function getHealth(providerId: string): ProviderHealth {
  return getOrCreate(providerId);
}

/** Get all health records. */
export function getAllHealth(): ProviderHealth[] {
  return Array.from(healthStore.values());
}

/** Reset health for a provider. */
export function resetHealth(providerId: string): void {
  healthStore.set(providerId, {
    providerId,
    ...DEFAULT_HEALTH,
  });
}

/** Get providers sorted by health (best first). */
export function getHealthyProviders(providerIds: string[]): string[] {
  return providerIds.filter(isHealthy).sort((a, b) => {
    const ha = getHealth(a);
    const hb = getHealth(b);
    if (ha.consecutiveFailures !== hb.consecutiveFailures) {
      return ha.consecutiveFailures - hb.consecutiveFailures;
    }
    return ha.latencyMs - hb.latencyMs;
  });
}

/** Get cooldown info for diagnostics. */
export function getCooldownInfo(providerId: string): {
  isInCooldown: boolean;
  cooldownRemainingMs: number;
  cooldownDurationMs: number;
} {
  const h = getOrCreate(providerId);
  if (!h.disabled || !h.disabledUntil) {
    return { isInCooldown: false, cooldownRemainingMs: 0, cooldownDurationMs: 0 };
  }
  const remaining = Math.max(0, h.disabledUntil - Date.now());
  const duration = getCooldownMs(h.consecutiveFailures);
  return { isInCooldown: true, cooldownRemainingMs: remaining, cooldownDurationMs: duration };
}
