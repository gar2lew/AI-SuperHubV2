import type { Message } from '@/types';
import { recordClientError } from '@/lib/diagnostics/client-errors';
import { recordFallback, recordRuntimeEvent } from '@/lib/telemetry/runtimeTelemetry';
import { resetHealth } from '@/lib/providers/health';
import { formatMessages, extractSystemPrompt } from './normalize';

const PUTER_SCRIPT_SRC = 'https://js.puter.com/v2/';
const DEFAULT_LOAD_TIMEOUT_MS = 10000;
const DEFAULT_OPERATION_TIMEOUT_MS = 60000;
const FAILURE_COOLDOWN_MS = 15000;
const RETRY_RATE_LIMIT_MS = 1500;
const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_RECONNECT_DELAY_MS = 5000;

type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'cooldown' | 'error';
export type RuntimeExecutionMode = 'live' | 'mock' | 'fallback' | 'offline';
export type PuterSdkLoadState = 'idle' | 'loading' | 'loaded' | 'present' | 'failed';
export type RuntimeActivationSource =
  | 'unknown'
  | 'existing-window'
  | 'script-load'
  | 'reconnect'
  | 'revalidation'
  | 'deployment-refresh';
export type PuterConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'timeout'
  | 'reconnecting';
export type PuterAuthState = 'unknown' | 'authenticated' | 'unauthenticated' | 'expired';
export type PuterAuthRecoveryState = 'idle' | 'required' | 'recovering' | 'recovered' | 'failed';

interface PuterAI {
  chat?: (messages: ReturnType<typeof formatMessages>, options: SafeChatOptions & { system?: string }) => unknown;
  listModels?: () => unknown;
  txt2img?: (prompt: string | Record<string, unknown>, options?: Record<string, unknown> | boolean) => unknown;
  img?: (prompt: string | Record<string, unknown>, options?: Record<string, unknown> | boolean) => unknown;
  generateImage?: (prompt: string | Record<string, unknown>, options?: Record<string, unknown> | boolean) => unknown;
  txt2speech?: (text: string, options: Record<string, unknown>) => unknown;
  tts?: (text: string, options: Record<string, unknown>) => unknown;
  speech2txt?: (audio: Blob, options: Record<string, unknown>) => unknown;
  stt?: (audio: Blob, options: Record<string, unknown>) => unknown;
}

interface PuterRuntime {
  ai?: PuterAI;
  auth?: {
    isSignedIn?: () => unknown;
    getUser?: () => unknown;
    signIn?: () => unknown;
  };
}

export interface DiscoveredPuterModel {
  runtimeId: string;
  name: string;
  providerId?: string;
  providerName?: string;
  capabilities: string[];
  raw: unknown;
}

declare global {
  interface Window {
    puter?: PuterRuntime;
  }
}

export interface PuterRuntimeState {
  status: RuntimeStatus;
  loaded: boolean;
  ready: boolean;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  initializedAt: number | null;
  lastAuthCheckAt: number | null;
  lastFailureAt: number | null;
  cooldownUntil: number | null;
  timeoutEvents: number;
  fallbackEvents: number;
  providerLatencyMs: number | null;
  activeStreamId: string | null;
  connectionState: PuterConnectionState;
  authState: PuterAuthState;
  reconnectAttempts: number;
  websocketFailures: number;
  reconnectExhausted: boolean;
  lastReconnectAt: number | null;
  lastConnectionChangeAt: number | null;
  lastTimeoutAt: number | null;
  executionMode: RuntimeExecutionMode;
  modeReason: string | null;
  modeActivatedAt: number | null;
  lastSuccessfulRealExecutionAt: number | null;
  modelFetchStatus: 'idle' | 'success' | 'failed';
  modelFetchError: string | null;
  modelFetchAt: number | null;
  discoveredModelCount: number;
  lastRuntimeValidationAt: number | null;
  nextReconnectAt: number | null;
  lastReconnectDelayMs: number | null;
  retryRateLimitedUntil: number | null;
  duplicateRetryBlocks: number;
  authInvalidatedAt: number | null;
  lastRuntimeValidationFailure: string | null;
  lastRecoveryDecision: string | null;
  activeRequestCount: number;
  activeStreamCount: number;
  lastSuccessfulLiveRequestAt: number | null;
  lastProviderTimeoutAt: number | null;
  lastImageLatencyMs: number | null;
  lastTTSLatencyMs: number | null;
  lastSTTLatencyMs: number | null;
  imageGenerationCount: number;
  imageFailureCount: number;
  voiceRequestCount: number;
  voiceFailureCount: number;
  streamAbortEvents: number;
  lastStreamAbortReason: string | null;
  activeReconnectTimerCount: number;
  reconnectExhaustionCount: number;
  providerRecoverySuccessCount: number;
  runtimeValidationCount: number;
  activeStreamStartedAt: number | null;
  maxObservedStreamDurationMs: number;
  runtimeActivationSource: RuntimeActivationSource;
  authRefreshCount: number;
  offlineRecoveryCount: number;
  deployRefreshRecoveryCount: number;
  lastOfflineRecoveryAt: number | null;
  lastDeploymentRefreshAt: number | null;
  authRecoveryState: PuterAuthRecoveryState;
  authBootstrapRequiredAt: number | null;
  authBootstrapStartedAt: number | null;
  authBootstrapCompletedAt: number | null;
  authRecoveryAttempts: number;
  authRecoveryError: string | null;
  sdkLoadState: PuterSdkLoadState;
  sdkLoadStartedAt: number | null;
  sdkLoadedAt: number | null;
  sdkLoadError: string | null;
  sdkAlreadyPresent: boolean;
  sdkRetryCount: number;
}

export interface SafeChatOptions {
  model?: string;
  stream?: boolean;
  timeoutMs?: number;
}

export interface AuthBootstrapResult {
  ok: boolean;
  authState: PuterAuthState;
  mode: RuntimeExecutionMode;
  reason: string | null;
  error?: string;
}

const runtimeState: PuterRuntimeState = {
  status: 'idle',
  loaded: false,
  ready: false,
  authenticated: false,
  loading: false,
  error: null,
  initializedAt: null,
  lastAuthCheckAt: null,
  lastFailureAt: null,
  cooldownUntil: null,
  timeoutEvents: 0,
  fallbackEvents: 0,
  providerLatencyMs: null,
  activeStreamId: null,
  connectionState: 'disconnected',
  authState: 'unknown',
  reconnectAttempts: 0,
  websocketFailures: 0,
  reconnectExhausted: false,
  lastReconnectAt: null,
  lastConnectionChangeAt: null,
  lastTimeoutAt: null,
  executionMode: 'offline',
  modeReason: 'runtime-not-loaded',
  modeActivatedAt: null,
  lastSuccessfulRealExecutionAt: null,
  modelFetchStatus: 'idle',
  modelFetchError: null,
  modelFetchAt: null,
  discoveredModelCount: 0,
  lastRuntimeValidationAt: null,
  nextReconnectAt: null,
  lastReconnectDelayMs: null,
  retryRateLimitedUntil: null,
  duplicateRetryBlocks: 0,
  authInvalidatedAt: null,
  lastRuntimeValidationFailure: null,
  lastRecoveryDecision: null,
  activeRequestCount: 0,
  activeStreamCount: 0,
  lastSuccessfulLiveRequestAt: null,
  lastProviderTimeoutAt: null,
  lastImageLatencyMs: null,
  lastTTSLatencyMs: null,
  lastSTTLatencyMs: null,
  imageGenerationCount: 0,
  imageFailureCount: 0,
  voiceRequestCount: 0,
  voiceFailureCount: 0,
  streamAbortEvents: 0,
  lastStreamAbortReason: null,
  activeReconnectTimerCount: 0,
  reconnectExhaustionCount: 0,
  providerRecoverySuccessCount: 0,
  runtimeValidationCount: 0,
  activeStreamStartedAt: null,
  maxObservedStreamDurationMs: 0,
  runtimeActivationSource: 'unknown',
  authRefreshCount: 0,
  offlineRecoveryCount: 0,
  deployRefreshRecoveryCount: 0,
  lastOfflineRecoveryAt: null,
  lastDeploymentRefreshAt: null,
  authRecoveryState: 'idle',
  authBootstrapRequiredAt: null,
  authBootstrapStartedAt: null,
  authBootstrapCompletedAt: null,
  authRecoveryAttempts: 0,
  authRecoveryError: null,
  sdkLoadState: 'idle',
  sdkLoadStartedAt: null,
  sdkLoadedAt: null,
  sdkLoadError: null,
  sdkAlreadyPresent: false,
  sdkRetryCount: 0,
};

let puterLoadPromise: Promise<void> | null = null;
let runtimeBootstrapPromise: Promise<{ available: boolean; mode: RuntimeExecutionMode; reason: string | null }> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let authBootstrapPromise: Promise<AuthBootstrapResult> | null = null;
let listenersInstalled = false;
let discoveredModelsCache: { models: DiscoveredPuterModel[]; fetchedAt: number } | null = null;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

function now() {
  return Date.now();
}

function isBrowserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function setConnectionState(connectionState: PuterConnectionState) {
  if (runtimeState.connectionState !== connectionState) {
    runtimeState.connectionState = connectionState;
    runtimeState.lastConnectionChangeAt = now();
  }
}

function setRuntimeActivationSource(runtimeActivationSource: RuntimeActivationSource) {
  runtimeState.runtimeActivationSource = runtimeActivationSource;
}

function markSdkLoadStarted(alreadyPresent: boolean) {
  runtimeState.sdkLoadState = alreadyPresent ? 'present' : 'loading';
  runtimeState.sdkLoadStartedAt = now();
  runtimeState.sdkLoadError = null;
  runtimeState.sdkAlreadyPresent = alreadyPresent;
  if (!alreadyPresent) {
    runtimeState.sdkRetryCount += 1;
  }
}

function markSdkLoaded(alreadyPresent: boolean) {
  runtimeState.sdkLoadState = alreadyPresent ? 'present' : 'loaded';
  runtimeState.sdkLoadedAt = now();
  runtimeState.sdkLoadError = null;
  runtimeState.sdkAlreadyPresent = alreadyPresent;
}

function markSdkLoadFailed(error: unknown) {
  runtimeState.sdkLoadState = 'failed';
  runtimeState.sdkLoadError = error instanceof Error ? error.message : String(error);
}

function markAuthRecoveryRequired(reason: string) {
  if (runtimeState.authRecoveryState !== 'required') {
    runtimeState.authBootstrapRequiredAt = now();
  }
  runtimeState.authRecoveryState = 'required';
  runtimeState.authRecoveryError = null;
  runtimeState.lastRecoveryDecision = reason;
  setPuterRuntimeMode('mock', reason);
}

function markAuthRecoveryRecovered() {
  if (
    runtimeState.authRecoveryState === 'required' ||
    runtimeState.authRecoveryState === 'recovering' ||
    runtimeState.authRecoveryState === 'failed'
  ) {
    runtimeState.authRecoveryState = 'recovered';
    runtimeState.authBootstrapCompletedAt = now();
    runtimeState.authRecoveryError = null;
    runtimeState.lastRecoveryDecision = 'auth-recovered';
  }
}

export function setPuterRuntimeMode(executionMode: RuntimeExecutionMode, reason: string) {
  if (runtimeState.executionMode !== executionMode || runtimeState.modeReason !== reason) {
    runtimeState.executionMode = executionMode;
    runtimeState.modeReason = reason;
    runtimeState.modeActivatedAt = now();
  }
}

function markOperationalSuccess() {
  const recoveredFromRuntimePressure =
    runtimeState.reconnectAttempts > 0 ||
    runtimeState.reconnectExhausted ||
    runtimeState.connectionState === 'degraded' ||
    runtimeState.connectionState === 'reconnecting' ||
    runtimeState.connectionState === 'timeout';
  runtimeState.ready = true;
  runtimeState.loading = false;
  runtimeState.status = 'ready';
  runtimeState.error = null;
  runtimeState.cooldownUntil = null;
  runtimeState.reconnectAttempts = 0;
  runtimeState.reconnectExhausted = false;
  runtimeState.nextReconnectAt = null;
  runtimeState.lastReconnectDelayMs = null;
  runtimeState.retryRateLimitedUntil = null;
  runtimeState.lastRecoveryDecision = 'provider-operation-succeeded';
  runtimeState.lastSuccessfulRealExecutionAt = now();
  runtimeState.lastSuccessfulLiveRequestAt = now();
  if (recoveredFromRuntimePressure) {
    runtimeState.providerRecoverySuccessCount += 1;
  }
  setRuntimeActivationSource('revalidation');
  setPuterRuntimeMode('live', 'real-provider-execution');
  setConnectionState('connected');
}

function markRuntimeLoadedReady() {
  runtimeState.ready = true;
  runtimeState.loading = false;
  runtimeState.status = 'ready';
  runtimeState.error = null;
  if (runtimeState.authenticated) {
    setPuterRuntimeMode('live', 'authenticated-session');
  }
  setConnectionState('connected');
}

function isConnectionLikeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /websocket|socket|network|offline|disconnect|connection|transport|closed/i.test(message);
}

function isAuthLikeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /auth|login|permission|session|expired|unauthorized|forbidden|sign.?in/i.test(message);
}

function markFailure(error: unknown) {
  runtimeState.error = error instanceof Error ? error.message : String(error);
  runtimeState.lastFailureAt = now();
  if (/timeout/i.test(runtimeState.error)) {
    runtimeState.lastProviderTimeoutAt = now();
  }
  if (isConnectionLikeError(error)) {
    runtimeState.websocketFailures += 1;
    runtimeState.reconnectExhausted = false;
    setConnectionState('degraded');
  }
  if (isAuthLikeError(error)) {
    runtimeState.authState = /expired|session/i.test(runtimeState.error) ? 'expired' : 'unauthenticated';
    runtimeState.authenticated = false;
    runtimeState.authInvalidatedAt = now();
    runtimeState.lastRuntimeValidationFailure = runtimeState.error;
    discoveredModelsCache = null;
    runtimeState.discoveredModelCount = 0;
    recordRuntimeEvent({
      type: 'runtime_auth_failure',
      providerId: 'puter',
      message: runtimeState.error,
    });
  }
  setPuterRuntimeMode(isAuthLikeError(error) ? 'mock' : 'fallback', runtimeState.error || 'provider failure');
  runtimeState.cooldownUntil = now() + FAILURE_COOLDOWN_MS;
  runtimeState.status = 'cooldown';
  runtimeState.ready = false;
  runtimeState.loading = false;
}

function assertNotInCooldown() {
  if (runtimeState.cooldownUntil && runtimeState.cooldownUntil > now()) {
    throw new Error(`Puter runtime cooling down for ${runtimeState.cooldownUntil - now()}ms`);
  }
  if (runtimeState.status === 'cooldown') {
    runtimeState.status = runtimeState.loaded ? 'ready' : 'idle';
  }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      runtimeState.timeoutEvents += 1;
      runtimeState.lastTimeoutAt = now();
      setConnectionState('timeout');
      reject(new Error(`${label} timeout`));
    }, timeoutMs);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function injectPuterScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isBrowserReady()) {
      reject(new Error('Puter requires a browser runtime'));
      return;
    }

    if (window.puter) {
      resolve();
      return;
    }

    const existing = document.querySelector(`script[src="${PUTER_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.puter) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Puter script')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = PUTER_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Puter script'));
    document.head.appendChild(script);
  });
}

export async function ensurePuterLoaded(timeoutMs = DEFAULT_LOAD_TIMEOUT_MS) {
  assertNotInCooldown();

  if (!isBrowserReady()) {
    throw new Error('Puter runtime unavailable outside the browser');
  }
  installRuntimeListeners();

  if (window.puter) {
    runtimeState.loaded = true;
    runtimeState.initializedAt ||= now();
    markSdkLoaded(runtimeState.sdkLoadState !== 'loading' && runtimeState.sdkLoadState !== 'loaded');
    setRuntimeActivationSource('existing-window');
    markRuntimeLoadedReady();
    return window.puter;
  }

  if (!puterLoadPromise) {
    markSdkLoadStarted(false);
    runtimeState.loading = true;
    runtimeState.status = 'loading';
    setConnectionState(runtimeState.loaded ? 'reconnecting' : 'connecting');
    puterLoadPromise = withTimeout(injectPuterScript(), timeoutMs, 'Puter load');
  }

  try {
    await puterLoadPromise;
    if (!window.puter) throw new Error('Puter loaded but unavailable');

    runtimeState.loaded = true;
    runtimeState.initializedAt = now();
    markSdkLoaded(false);
    setRuntimeActivationSource('script-load');
    markRuntimeLoadedReady();
    return window.puter;
  } catch (error) {
    puterLoadPromise = null;
    recordClientError({
      source: 'provider-init',
      error,
      context: {
        providerId: 'puter',
        phase: 'load',
      },
    });
    markSdkLoadFailed(error);
    markFailure(error);
    setPuterRuntimeMode('offline', runtimeState.sdkLoadError || 'sdk-load-failed');
    throw error;
  }
}

export async function getPuter() {
  return ensurePuterLoaded();
}

export async function waitForPuter(timeoutMs = DEFAULT_LOAD_TIMEOUT_MS) {
  return ensurePuterLoaded(timeoutMs);
}

export function getPuterAISafe() {
  return window.puter?.ai ?? null;
}

export function getPuterAI() {
  const ai = getPuterAISafe();
  if (!ai) throw new Error('Puter AI runtime is not ready');
  return ai;
}

export function isPuterAvailable() {
  return !!window.puter?.ai &&
    runtimeState.authenticated &&
    runtimeState.executionMode === 'live' &&
    (!runtimeState.cooldownUntil || runtimeState.cooldownUntil <= now());
}

export function getPuterReadiness() {
  if (runtimeState.status === 'cooldown' && (!runtimeState.cooldownUntil || runtimeState.cooldownUntil <= now())) {
    runtimeState.status = runtimeState.loaded ? 'ready' : 'idle';
    runtimeState.ready = runtimeState.loaded;
    runtimeState.loading = false;
  }
  return runtimeState.status;
}

export async function ensurePuterAuthenticated() {
  return (await validatePuterSession()).authenticated;
}

export async function validatePuterSession() {
  const puter = await ensurePuterLoaded();
  runtimeState.runtimeValidationCount += 1;
  const wasUnauthenticated =
    runtimeState.authState === 'unauthenticated' ||
    runtimeState.authState === 'expired';
  try {
    const signedIn = puter.auth?.isSignedIn
      ? await withTimeout(Promise.resolve(puter.auth.isSignedIn()), DEFAULT_LOAD_TIMEOUT_MS, 'Puter sign-in check')
      : undefined;
    const user = await withTimeout(
      Promise.resolve(puter.auth?.getUser?.()),
      DEFAULT_LOAD_TIMEOUT_MS,
      'Puter auth check'
    );
    const authenticated = signedIn === false ? false : Boolean(user || signedIn);
    runtimeState.authenticated = authenticated;
    runtimeState.authState = authenticated ? 'authenticated' : 'unauthenticated';
    runtimeState.lastAuthCheckAt = now();
    runtimeState.lastRuntimeValidationAt = now();
    runtimeState.authInvalidatedAt = null;
    runtimeState.lastRuntimeValidationFailure = null;
    if (authenticated) {
      if (wasUnauthenticated) {
        runtimeState.authRefreshCount += 1;
      }
      markAuthRecoveryRecovered();
      setRuntimeActivationSource('revalidation');
    }
    if (authenticated) {
      setPuterRuntimeMode('live', 'authenticated-session');
    } else {
      markAuthRecoveryRequired('auth-required');
    }
    if (authenticated) {
      runtimeState.ready = true;
      runtimeState.status = 'ready';
      runtimeState.error = null;
    }
    return {
      authenticated,
      authState: runtimeState.authState,
      user: user ?? null,
    };
  } catch (error) {
    runtimeState.authenticated = false;
    runtimeState.authState = 'expired';
    runtimeState.lastAuthCheckAt = now();
    runtimeState.lastRuntimeValidationAt = now();
    runtimeState.authInvalidatedAt = now();
    runtimeState.lastRuntimeValidationFailure = error instanceof Error ? error.message : String(error);
    discoveredModelsCache = null;
    runtimeState.discoveredModelCount = 0;
    markAuthRecoveryRequired('expired-session');
    setConnectionState('degraded');
    recordRuntimeEvent({
      type: 'runtime_auth_failure',
      providerId: 'puter',
      message: error instanceof Error ? error.message : 'Puter auth check failed',
    });
    return {
      authenticated: false,
      authState: runtimeState.authState,
      user: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeDiscoveredModel(raw: unknown): DiscoveredPuterModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const runtimeId = record.id ?? record.model ?? record.name;
  if (typeof runtimeId !== 'string' || !runtimeId.trim()) return null;
  const provider = record.provider;
  const providerId = typeof provider === 'string'
    ? provider
    : provider && typeof provider === 'object' && typeof (provider as Record<string, unknown>).id === 'string'
      ? String((provider as Record<string, unknown>).id)
      : undefined;
  const providerName = provider && typeof provider === 'object' && typeof (provider as Record<string, unknown>).name === 'string'
    ? String((provider as Record<string, unknown>).name)
    : providerId;
  const capabilities = [
    ...(Array.isArray(record.capabilities) ? record.capabilities : []),
    ...(Array.isArray(record.modalities) ? record.modalities : []),
  ].filter((item): item is string => typeof item === 'string');
  return {
    runtimeId,
    name: typeof record.name === 'string' ? record.name : runtimeId,
    providerId,
    providerName,
    capabilities: Array.from(new Set(capabilities)),
    raw,
  };
}

export async function validatePuterModels(options: { force?: boolean } = {}) {
  const puter = await ensurePuterLoaded();
  if (!puter.ai?.listModels) {
    runtimeState.modelFetchStatus = 'failed';
    runtimeState.modelFetchError = 'Puter listModels unavailable';
    runtimeState.modelFetchAt = now();
    setPuterRuntimeMode('fallback', 'model-discovery-unavailable');
    return { ok: false, count: 0, models: [], error: runtimeState.modelFetchError };
  }
  if (!options.force && discoveredModelsCache && now() - discoveredModelsCache.fetchedAt < MODEL_CACHE_TTL_MS) {
    return { ok: true, count: discoveredModelsCache.models.length, models: discoveredModelsCache.models };
  }
  try {
    const response = await withTimeout(Promise.resolve(puter.ai.listModels()), DEFAULT_OPERATION_TIMEOUT_MS, 'Puter listModels');
    const rawModels = Array.isArray(response)
      ? response
      : response && typeof response === 'object' && Array.isArray((response as Record<string, unknown>).models)
        ? ((response as Record<string, unknown>).models as unknown[])
        : [];
    const models = rawModels.map(normalizeDiscoveredModel).filter((model): model is DiscoveredPuterModel => Boolean(model));
    discoveredModelsCache = { models, fetchedAt: now() };
    runtimeState.modelFetchStatus = 'success';
    runtimeState.modelFetchError = null;
    runtimeState.modelFetchAt = now();
    runtimeState.discoveredModelCount = models.length;
    return { ok: true, count: models.length, models };
  } catch (error) {
    runtimeState.modelFetchStatus = 'failed';
    runtimeState.modelFetchError = error instanceof Error ? error.message : String(error);
    runtimeState.modelFetchAt = now();
    setPuterRuntimeMode('fallback', runtimeState.modelFetchError);
    return { ok: false, count: 0, models: [], error: runtimeState.modelFetchError };
  }
}

export function getPuterDiscoveredModels() {
  return discoveredModelsCache?.models ?? [];
}

export async function validateRuntimeExecution() {
  try {
    const session = await validatePuterSession();
    if (!session.authenticated) {
      return {
        available: false,
        mode: runtimeState.executionMode,
        reason: session.authState === 'expired' ? 'expired-session' : 'auth-required',
      };
    }
    await validatePuterModels();
    runtimeState.lastSuccessfulRealExecutionAt = now();
    setPuterRuntimeMode('live', 'authenticated-session');
    return { available: true, mode: runtimeState.executionMode, reason: runtimeState.modeReason };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    setPuterRuntimeMode('offline', reason);
    return { available: false, mode: runtimeState.executionMode, reason };
  }
}

export function beginPuterRuntimeBootstrap() {
  if (runtimeBootstrapPromise) return runtimeBootstrapPromise;

  runtimeBootstrapPromise = (async () => {
    try {
      await ensurePuterLoaded();
      return await validateRuntimeExecution();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setPuterRuntimeMode('offline', reason);
      return {
        available: false,
        mode: runtimeState.executionMode,
        reason,
      };
    } finally {
      runtimeBootstrapPromise = null;
    }
  })();

  return runtimeBootstrapPromise;
}

export async function beginPuterAuthBootstrap(): Promise<AuthBootstrapResult> {
  if (authBootstrapPromise) return authBootstrapPromise;

  authBootstrapPromise = (async () => {
    try {
      const puter = await ensurePuterLoaded();
      const signIn = puter.auth?.signIn;

      runtimeState.authRecoveryAttempts += 1;
      runtimeState.authRecoveryState = 'recovering';
      runtimeState.authBootstrapStartedAt = now();
      runtimeState.authRecoveryError = null;
      runtimeState.lastRecoveryDecision = 'auth-bootstrap-started';
      recordRuntimeEvent({
        type: 'runtime_recovery',
        providerId: 'puter',
        message: 'puter-auth-bootstrap-started',
      });

      if (!signIn) {
        const error = 'Puter signIn unavailable';
        runtimeState.authRecoveryState = 'failed';
        runtimeState.authRecoveryError = error;
        runtimeState.lastRuntimeValidationFailure = error;
        runtimeState.lastRecoveryDecision = 'auth-bootstrap-unavailable';
        return {
          ok: false,
          authState: runtimeState.authState,
          mode: runtimeState.executionMode,
          reason: runtimeState.modeReason,
          error,
        };
      }

      await withTimeout(Promise.resolve(signIn()), DEFAULT_OPERATION_TIMEOUT_MS, 'Puter sign-in');
      const validation = await validateRuntimeExecution();
      if (!validation.available) {
        const error = validation.reason || 'auth-bootstrap-validation-failed';
        runtimeState.authRecoveryState = 'failed';
        runtimeState.authRecoveryError = error;
        runtimeState.lastRecoveryDecision = 'auth-bootstrap-failed';
        return {
          ok: false,
          authState: runtimeState.authState,
          mode: runtimeState.executionMode,
          reason: runtimeState.modeReason,
          error,
        };
      }

      markAuthRecoveryRecovered();
      runtimeState.lastRecoveryDecision = 'auth-bootstrap-succeeded';
      recordRuntimeEvent({
        type: 'runtime_recovery',
        providerId: 'puter',
        message: 'puter-auth-bootstrap-succeeded',
      });
      return {
        ok: true,
        authState: runtimeState.authState,
        mode: runtimeState.executionMode,
        reason: runtimeState.modeReason,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runtimeState.authRecoveryState = 'failed';
      runtimeState.authRecoveryError = message;
      runtimeState.lastRuntimeValidationFailure = message;
      runtimeState.lastRecoveryDecision = 'auth-bootstrap-failed';
      recordRuntimeEvent({
        type: 'runtime_auth_failure',
        providerId: 'puter',
        message,
      });
      return {
        ok: false,
        authState: runtimeState.authState,
        mode: runtimeState.executionMode,
        reason: runtimeState.modeReason,
        error: message,
      };
    } finally {
      authBootstrapPromise = null;
    }
  })();

  return authBootstrapPromise;
}

export async function safePuterChat(messages: Message[], options: SafeChatOptions = {}) {
  const puter = await ensurePuterLoaded();
  const validation = await validateRuntimeExecution();
  if (!validation.available) throw new Error(`Puter runtime unavailable: ${validation.reason}`);
  const chatApi = puter.ai?.chat;
  if (!chatApi) throw new Error('Puter chat is unavailable');

  const startedAt = now();
  const system = extractSystemPrompt(messages);
  const puterMessages = formatMessages(messages);

  runtimeState.activeRequestCount += 1;
  try {
    const response = await withTimeout(
      Promise.resolve(
        chatApi(puterMessages, {
          model: options.model || 'gpt-4o',
          stream: !!options.stream,
          ...(system ? { system } : {}),
        })
      ),
      options.timeoutMs || DEFAULT_OPERATION_TIMEOUT_MS,
      'Puter chat'
    );
    runtimeState.providerLatencyMs = now() - startedAt;
    markOperationalSuccess();
    return response;
  } catch (error) {
    recordClientError({
      source: 'provider-call',
      error,
      context: {
        providerId: 'puter',
        operation: 'chat',
        stream: !!options.stream,
      },
    });
    markFailure(error);
    scheduleReconnect();
    throw error;
  } finally {
    runtimeState.activeRequestCount = Math.max(0, runtimeState.activeRequestCount - 1);
  }
}

export async function safePuterImage(prompt: string, options: Record<string, unknown> = {}) {
  const puter = await ensurePuterLoaded();
  const validation = await validateRuntimeExecution();
  if (!validation.available) throw new Error(`Puter runtime unavailable: ${validation.reason}`);
  const imageApi = puter.ai?.txt2img || puter.ai?.img || puter.ai?.generateImage;
  if (!imageApi) throw new Error('Puter image generation is unavailable');
  const startedAt = now();
  const { timeoutMs, ...imageOptions } = options;
  const hasOptions = Object.keys(imageOptions).length > 0;

  runtimeState.activeRequestCount += 1;
  runtimeState.imageGenerationCount += 1;
  try {
    const response = await withTimeout(
      Promise.resolve(imageApi(prompt, hasOptions ? imageOptions : undefined)),
      typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_OPERATION_TIMEOUT_MS,
      'Puter image'
    );
    runtimeState.providerLatencyMs = now() - startedAt;
    runtimeState.lastImageLatencyMs = runtimeState.providerLatencyMs;
    markOperationalSuccess();
    return response;
  } catch (error) {
    runtimeState.imageFailureCount += 1;
    recordClientError({
      source: 'provider-call',
      error,
      context: {
        providerId: 'puter',
        operation: 'image',
        model: typeof imageOptions.model === 'string' ? imageOptions.model : undefined,
      },
    });
    markFailure(error);
    scheduleReconnect();
    throw error;
  } finally {
    runtimeState.activeRequestCount = Math.max(0, runtimeState.activeRequestCount - 1);
  }
}

export async function safePuterTTS(text: string, options: Record<string, unknown> = {}) {
  const puter = await ensurePuterLoaded();
  const validation = await validateRuntimeExecution();
  if (!validation.available) throw new Error(`Puter runtime unavailable: ${validation.reason}`);
  const ttsApi = puter.ai?.txt2speech || puter.ai?.tts;
  if (!ttsApi) throw new Error('Puter text-to-speech is unavailable');
  runtimeState.activeRequestCount += 1;
  runtimeState.voiceRequestCount += 1;
  try {
    const startedAt = now();
    const response = await withTimeout(Promise.resolve(ttsApi(text, options)), DEFAULT_OPERATION_TIMEOUT_MS, 'Puter TTS');
    runtimeState.providerLatencyMs = now() - startedAt;
    runtimeState.lastTTSLatencyMs = runtimeState.providerLatencyMs;
    markOperationalSuccess();
    return response;
  } catch (error) {
    runtimeState.voiceFailureCount += 1;
    markFailure(error);
    scheduleReconnect();
    throw error;
  } finally {
    runtimeState.activeRequestCount = Math.max(0, runtimeState.activeRequestCount - 1);
  }
}

export async function safePuterSTT(audio: Blob, options: Record<string, unknown> = {}) {
  const puter = await ensurePuterLoaded();
  const validation = await validateRuntimeExecution();
  if (!validation.available) throw new Error(`Puter runtime unavailable: ${validation.reason}`);
  const sttApi = puter.ai?.speech2txt || puter.ai?.stt;
  if (!sttApi) throw new Error('Puter speech-to-text is unavailable');
  runtimeState.activeRequestCount += 1;
  runtimeState.voiceRequestCount += 1;
  try {
    const startedAt = now();
    const response = await withTimeout(Promise.resolve(sttApi(audio, options)), DEFAULT_OPERATION_TIMEOUT_MS, 'Puter STT');
    runtimeState.providerLatencyMs = now() - startedAt;
    runtimeState.lastSTTLatencyMs = runtimeState.providerLatencyMs;
    markOperationalSuccess();
    return response;
  } catch (error) {
    runtimeState.voiceFailureCount += 1;
    markFailure(error);
    scheduleReconnect();
    throw error;
  } finally {
    runtimeState.activeRequestCount = Math.max(0, runtimeState.activeRequestCount - 1);
  }
}

export function setActivePuterStream(streamId: string | null) {
  if (!streamId && runtimeState.activeStreamStartedAt) {
    runtimeState.maxObservedStreamDurationMs = Math.max(
      runtimeState.maxObservedStreamDurationMs,
      now() - runtimeState.activeStreamStartedAt
    );
  }
  runtimeState.activeStreamId = streamId;
  runtimeState.activeStreamCount = streamId ? 1 : 0;
  runtimeState.activeStreamStartedAt = streamId ? now() : null;
}

export function recordPuterStreamAbort(reason: string) {
  runtimeState.streamAbortEvents += 1;
  runtimeState.lastStreamAbortReason = reason;
  runtimeState.activeStreamId = null;
  runtimeState.activeStreamCount = 0;
  runtimeState.activeStreamStartedAt = null;
  runtimeState.lastRecoveryDecision = 'stream-aborted';
  recordRuntimeEvent({
    type: 'stream_abort',
    providerId: 'puter',
    message: reason,
  });
}

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  runtimeState.activeReconnectTimerCount = 0;
  runtimeState.nextReconnectAt = null;
}

export function recordPuterDeploymentRefreshRecovery(reason = 'deployment-refresh') {
  clearReconnectTimer();
  runtimeState.deployRefreshRecoveryCount += 1;
  runtimeState.lastDeploymentRefreshAt = now();
  runtimeState.lastRecoveryDecision = 'deployment-refresh-recovery';
  runtimeState.reconnectAttempts = 0;
  runtimeState.reconnectExhausted = false;
  runtimeState.activeStreamId = null;
  runtimeState.activeStreamCount = 0;
  runtimeState.activeStreamStartedAt = null;
  setRuntimeActivationSource('deployment-refresh');
  recordRuntimeEvent({
    type: 'runtime_recovery',
    providerId: 'puter',
    message: reason,
  });
}

export function recordPuterFallbackEvent(fromProvider?: string, toProvider?: string) {
  runtimeState.fallbackEvents += 1;
  recordFallback(fromProvider, toProvider);
}

export function getPuterRuntimeState(): PuterRuntimeState {
  return { ...runtimeState };
}

export function resetPuterConnectionStateForRetry() {
  if (runtimeState.retryRateLimitedUntil && runtimeState.retryRateLimitedUntil > now()) {
    runtimeState.duplicateRetryBlocks += 1;
    runtimeState.lastRecoveryDecision = 'retry-rate-limited';
    recordRuntimeEvent({
      type: 'retry_triggered',
      providerId: 'puter',
      message: 'duplicate retry suppressed by runtime rate limit',
    });
    return false;
  }
  runtimeState.retryRateLimitedUntil = now() + RETRY_RATE_LIMIT_MS;
  runtimeState.cooldownUntil = null;
  runtimeState.status = runtimeState.loaded ? 'ready' : 'idle';
  runtimeState.ready = runtimeState.loaded;
  runtimeState.error = null;
  runtimeState.reconnectExhausted = false;
  runtimeState.lastRecoveryDecision = 'retry-recovery-reset';
  resetHealth('puter');
  setConnectionState(runtimeState.loaded ? 'reconnecting' : 'connecting');
  return true;
}

function scheduleReconnect() {
  if (!isBrowserReady()) return;
  if (reconnectTimer) return;
  if (runtimeState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    runtimeState.reconnectExhausted = true;
    runtimeState.reconnectExhaustionCount += 1;
    runtimeState.lastRecoveryDecision = 'reconnect-exhausted';
    if (runtimeState.connectionState === 'reconnecting') {
      setConnectionState('degraded');
    }
    return;
  }

  runtimeState.reconnectExhausted = false;
  runtimeState.reconnectAttempts += 1;
  runtimeState.lastReconnectAt = now();
  const reconnectDelayMs = getReconnectDelayMs(runtimeState.reconnectAttempts);
  runtimeState.lastReconnectDelayMs = reconnectDelayMs;
  runtimeState.nextReconnectAt = now() + reconnectDelayMs;
  runtimeState.lastRecoveryDecision = 'reconnect-scheduled';
  recordRuntimeEvent({
    type: 'websocket_reconnect',
    providerId: 'puter',
    reconnectCount: runtimeState.reconnectAttempts,
    message: `retrying in ${reconnectDelayMs}ms`,
  });
  setConnectionState('reconnecting');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    runtimeState.activeReconnectTimerCount = 0;
    runtimeState.nextReconnectAt = null;
    ensurePuterLoaded(5000)
      .then(() => ensurePuterAuthenticated())
      .then((authenticated) => {
        if (authenticated) {
          setRuntimeActivationSource('reconnect');
        } else {
          scheduleReconnect();
        }
      })
      .catch(() => {
        if (runtimeState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          scheduleReconnect();
        } else {
          runtimeState.reconnectExhausted = true;
          runtimeState.reconnectExhaustionCount += 1;
          runtimeState.lastRecoveryDecision = 'reconnect-exhausted';
          if (runtimeState.connectionState === 'reconnecting') {
            setConnectionState('degraded');
          }
        }
      });
  }, reconnectDelayMs);
  runtimeState.activeReconnectTimerCount = 1;
}

function getReconnectDelayMs(attempt: number) {
  const baseDelay = Math.min(1000 * 2 ** Math.max(0, attempt - 1), MAX_RECONNECT_DELAY_MS);
  const deterministicJitter = (attempt * 137) % 250;
  return Math.min(baseDelay + deterministicJitter, MAX_RECONNECT_DELAY_MS);
}

function installRuntimeListeners() {
  if (listenersInstalled || !isBrowserReady()) return;
  listenersInstalled = true;

  window.addEventListener('offline', () => {
    runtimeState.websocketFailures += 1;
    runtimeState.ready = false;
    runtimeState.loading = false;
    runtimeState.reconnectExhausted = false;
    runtimeState.lastRecoveryDecision = 'offline-detected';
    recordRuntimeEvent({
      type: 'websocket_disconnect',
      providerId: 'puter',
      message: 'browser offline',
    });
    setConnectionState('disconnected');
  });
  window.addEventListener('online', () => {
    runtimeState.offlineRecoveryCount += 1;
    runtimeState.lastOfflineRecoveryAt = now();
    runtimeState.lastRecoveryDecision = 'offline-recovery';
    scheduleReconnect();
  });
  window.addEventListener('pagehide', () => {
    recordPuterDeploymentRefreshRecovery('pagehide');
  });
  window.addEventListener('error', (event) => {
    if (isConnectionLikeError(event.message || event.error)) {
      runtimeState.websocketFailures += 1;
      setConnectionState('degraded');
      recordRuntimeEvent({
        type: 'websocket_disconnect',
        providerId: 'puter',
        message: String(event.message || 'window error'),
      });
      scheduleReconnect();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isConnectionLikeError(event.reason)) {
      runtimeState.websocketFailures += 1;
      setConnectionState('degraded');
      recordRuntimeEvent({
        type: 'websocket_disconnect',
        providerId: 'puter',
        message: event.reason instanceof Error ? event.reason.message : String(event.reason || 'unhandled rejection'),
      });
      scheduleReconnect();
    }
  });
}

export function resetPuterRuntimeForTests() {
  Object.assign(runtimeState, {
    status: 'idle',
    loaded: false,
    ready: false,
    authenticated: false,
    loading: false,
    error: null,
    initializedAt: null,
    lastAuthCheckAt: null,
    lastFailureAt: null,
    cooldownUntil: null,
    timeoutEvents: 0,
    fallbackEvents: 0,
    providerLatencyMs: null,
    activeStreamId: null,
    connectionState: 'disconnected',
    authState: 'unknown',
    reconnectAttempts: 0,
    websocketFailures: 0,
    reconnectExhausted: false,
    lastReconnectAt: null,
    lastConnectionChangeAt: null,
    lastTimeoutAt: null,
    executionMode: 'offline',
    modeReason: 'runtime-not-loaded',
    modeActivatedAt: null,
    lastSuccessfulRealExecutionAt: null,
    modelFetchStatus: 'idle',
    modelFetchError: null,
    modelFetchAt: null,
    discoveredModelCount: 0,
    lastRuntimeValidationAt: null,
    nextReconnectAt: null,
    lastReconnectDelayMs: null,
    retryRateLimitedUntil: null,
    duplicateRetryBlocks: 0,
    authInvalidatedAt: null,
    lastRuntimeValidationFailure: null,
    lastRecoveryDecision: null,
    activeRequestCount: 0,
    activeStreamCount: 0,
    lastSuccessfulLiveRequestAt: null,
    lastProviderTimeoutAt: null,
    lastImageLatencyMs: null,
    lastTTSLatencyMs: null,
    lastSTTLatencyMs: null,
    imageGenerationCount: 0,
    imageFailureCount: 0,
    voiceRequestCount: 0,
    voiceFailureCount: 0,
    streamAbortEvents: 0,
    lastStreamAbortReason: null,
    activeReconnectTimerCount: 0,
    reconnectExhaustionCount: 0,
    providerRecoverySuccessCount: 0,
    runtimeValidationCount: 0,
    activeStreamStartedAt: null,
    maxObservedStreamDurationMs: 0,
    runtimeActivationSource: 'unknown',
    authRefreshCount: 0,
    offlineRecoveryCount: 0,
    deployRefreshRecoveryCount: 0,
    lastOfflineRecoveryAt: null,
    lastDeploymentRefreshAt: null,
    authRecoveryState: 'idle',
    authBootstrapRequiredAt: null,
    authBootstrapStartedAt: null,
    authBootstrapCompletedAt: null,
    authRecoveryAttempts: 0,
    authRecoveryError: null,
    sdkLoadState: 'idle',
    sdkLoadStartedAt: null,
    sdkLoadedAt: null,
    sdkLoadError: null,
    sdkAlreadyPresent: false,
    sdkRetryCount: 0,
  } satisfies PuterRuntimeState);
  discoveredModelsCache = null;
  puterLoadPromise = null;
  runtimeBootstrapPromise = null;
  authBootstrapPromise = null;
  if (typeof document !== 'undefined') {
    document.querySelectorAll(`script[src="${PUTER_SCRIPT_SRC}"]`).forEach((script) => script.remove());
  }
  clearReconnectTimer();
}
