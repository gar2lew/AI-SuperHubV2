export const WORKSTATION_SCHEMA_VERSION = 2;
export const WORKSTATION_STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 14;

export interface PersistedStateEnvelope<TState extends Record<string, unknown>> {
  state: TState;
  version?: number;
}

export interface PersistenceMetadata {
  schemaVersion: number;
  restoredAt: number | null;
  persistedAt: number;
  invalidatedAt?: number;
  invalidationReason?: string;
}

export function createPersistenceMetadata(now = Date.now()): PersistenceMetadata {
  return {
    schemaVersion: WORKSTATION_SCHEMA_VERSION,
    restoredAt: now,
    persistedAt: now,
  };
}

export function markPersisted(metadata: PersistenceMetadata, now = Date.now()): PersistenceMetadata {
  return {
    ...metadata,
    schemaVersion: WORKSTATION_SCHEMA_VERSION,
    persistedAt: now,
  };
}

export function isStaleTimestamp(value: unknown, now = Date.now(), maxAgeMs = WORKSTATION_STALE_AFTER_MS) {
  return typeof value !== 'number' || !Number.isFinite(value) || now - value > maxAgeMs || value > now + 60_000;
}

export function boundedText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function boundedList<T>(items: T[], maxItems: number): T[] {
  return items.slice(0, maxItems);
}

export function dedupeBy<T>(items: T[], keyFor: (item: T) => string, maxItems: number): T[] {
  const seen = new Set<string>();
  const next: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(item);
    if (next.length >= maxItems) break;
  }
  return next;
}

export function parsePersistedEnvelope<TState extends Record<string, unknown>>(raw: string | null): PersistedStateEnvelope<TState> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state || typeof parsed.state !== 'object') {
      return null;
    }
    return parsed as PersistedStateEnvelope<TState>;
  } catch {
    return null;
  }
}
