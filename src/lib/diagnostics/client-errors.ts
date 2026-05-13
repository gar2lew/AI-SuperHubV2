export type ClientErrorSource =
  | 'window-error'
  | 'unhandled-rejection'
  | 'provider-init'
  | 'provider-call'
  | 'stream'
  | 'lazy-load'
  | 'manual';

export type ClientErrorSeverity = 'error' | 'warning';

export type ClientErrorContext = Record<string, string | number | boolean | null | undefined>;

export interface ClientErrorInput {
  source: ClientErrorSource;
  error?: unknown;
  message?: string;
  name?: string;
  severity?: ClientErrorSeverity;
  context?: Record<string, unknown>;
}

export interface ClientErrorEntry {
  id: string;
  source: ClientErrorSource;
  severity: ClientErrorSeverity;
  name: string;
  message: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  context?: ClientErrorContext;
}

type Listener = () => void;

const STORAGE_KEY = 'ai-superhub:client-errors';
const MAX_ENTRIES = 20;
const MAX_MESSAGE_LENGTH = 240;
const MAX_CONTEXT_VALUE_LENGTH = 120;

let entries: ClientErrorEntry[] = [];
let snapshot: ClientErrorEntry[] = [];
let loaded = false;
const listeners = new Set<Listener>();
const installedTargets = new WeakMap<EventTarget, () => void>();

function now() {
  return Date.now();
}

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function sanitizeString(value: string, maxLength = MAX_MESSAGE_LENGTH) {
  return truncate(value.replace(/\s+/g, ' ').trim(), maxLength);
}

function normalizeError(input: ClientErrorInput): { name: string; message: string } {
  const fallbackName = input.name || 'Error';
  const fallbackMessage = input.message || 'Unknown client error';

  if (input.error instanceof Error) {
    return {
      name: input.name || input.error.name || fallbackName,
      message: sanitizeString(input.message || input.error.message || fallbackMessage),
    };
  }

  if (typeof input.error === 'string') {
    return {
      name: fallbackName,
      message: sanitizeString(input.message || input.error || fallbackMessage),
    };
  }

  if (input.error && typeof input.error === 'object' && 'message' in input.error) {
    const message = String((input.error as { message?: unknown }).message || fallbackMessage);
    const name =
      input.name ||
      String((input.error as { name?: unknown }).name || fallbackName);
    return {
      name,
      message: sanitizeString(input.message || message),
    };
  }

  return {
    name: fallbackName,
    message: sanitizeString(fallbackMessage),
  };
}

function sanitizeContext(context?: Record<string, unknown>): ClientErrorContext | undefined {
  if (!context) return undefined;

  const sanitized = Object.entries(context).reduce<ClientErrorContext>((acc, [key, value]) => {
    if (value === undefined) return acc;
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      acc[key] = value;
      return acc;
    }
    if (typeof value === 'string') {
      acc[key] = sanitizeString(value, MAX_CONTEXT_VALUE_LENGTH);
    }
    return acc;
  }, {});

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function validateStoredEntry(value: unknown): ClientErrorEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<ClientErrorEntry>;
  if (
    typeof entry.id !== 'string' ||
    typeof entry.source !== 'string' ||
    typeof entry.name !== 'string' ||
    typeof entry.message !== 'string' ||
    typeof entry.count !== 'number' ||
    typeof entry.firstSeenAt !== 'number' ||
    typeof entry.lastSeenAt !== 'number'
  ) {
    return null;
  }

  return {
    id: entry.id,
    source: entry.source as ClientErrorSource,
    severity: entry.severity === 'warning' ? 'warning' : 'error',
    name: entry.name,
    message: entry.message,
    count: entry.count,
    firstSeenAt: entry.firstSeenAt,
    lastSeenAt: entry.lastSeenAt,
    context: sanitizeContext(entry.context),
  };
}

function refreshSnapshot() {
  snapshot = entries.map((entry) => ({
    ...entry,
    context: entry.context ? { ...entry.context } : undefined,
  }));
}

function load() {
  if (loaded) return;
  loaded = true;

  if (!canUseStorage()) return;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    entries = parsed
      .map(validateStoredEntry)
      .filter((entry): entry is ClientErrorEntry => !!entry)
      .slice(0, MAX_ENTRIES);
    refreshSnapshot();
  } catch {
    entries = [];
    refreshSnapshot();
  }
}

function persist() {
  if (!canUseStorage()) return;

  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Diagnostics must never make the app less stable.
  }
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function fingerprint(input: {
  source: ClientErrorSource;
  name: string;
  message: string;
  context?: ClientErrorContext;
}) {
  const provider = input.context?.providerId ?? '';
  const label = input.context?.label ?? '';
  return [input.source, input.name, input.message, provider, label].join('|');
}

function createId() {
  return `client-error-${now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function recordClientError(input: ClientErrorInput): ClientErrorEntry {
  load();

  const seenAt = now();
  const normalized = normalizeError(input);
  const context = sanitizeContext(input.context);
  const key = fingerprint({
    source: input.source,
    name: normalized.name,
    message: normalized.message,
    context,
  });
  const existingIndex = entries.findIndex((entry) => entry.id === key);

  if (existingIndex >= 0) {
    const existing = entries[existingIndex];
    const updated: ClientErrorEntry = {
      ...existing,
      count: existing.count + 1,
      lastSeenAt: seenAt,
      context: context || existing.context,
    };
    entries = [updated, ...entries.filter((_, index) => index !== existingIndex)];
    refreshSnapshot();
    persist();
    emit();
    return updated;
  }

  const entry: ClientErrorEntry = {
    id: key || createId(),
    source: input.source,
    severity: input.severity || 'error',
    name: normalized.name,
    message: normalized.message,
    count: 1,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    ...(context ? { context } : {}),
  };

  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  refreshSnapshot();
  persist();
  emit();
  return entry;
}

export function getClientErrorSnapshot(): ClientErrorEntry[] {
  load();
  return snapshot;
}

export function subscribeClientErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearClientErrors(): void {
  load();
  entries = [];
  refreshSnapshot();
  persist();
  emit();
}

export function installClientErrorCapture(target: Window = window): () => void {
  const existingDispose = installedTargets.get(target);
  if (existingDispose) return existingDispose;

  const handleWindowError = (event: Event) => {
    const errorEvent = event as ErrorEvent;
    recordClientError({
      source: 'window-error',
      error: errorEvent.error || errorEvent.message,
      message: errorEvent.message,
      context: {
        eventType: event.type,
      },
    });
  };

  const handleUnhandledRejection = (event: Event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    recordClientError({
      source: 'unhandled-rejection',
      error: rejectionEvent.reason,
      context: {
        eventType: event.type,
      },
    });
  };

  target.addEventListener('error', handleWindowError);
  target.addEventListener('unhandledrejection', handleUnhandledRejection);

  const dispose = () => {
    target.removeEventListener('error', handleWindowError);
    target.removeEventListener('unhandledrejection', handleUnhandledRejection);
    installedTargets.delete(target);
  };

  installedTargets.set(target, dispose);
  return dispose;
}

export function trackLazyImport<T>(loader: () => Promise<T>, label: string): Promise<T> {
  return loader().catch((error) => {
    recordClientError({
      source: 'lazy-load',
      error,
      context: { label },
    });
    throw error;
  });
}
