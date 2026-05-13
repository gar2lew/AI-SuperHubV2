import type { Message } from '@/types';
import { recordClientError } from '@/lib/diagnostics/client-errors';
import { recordFallback } from '@/lib/telemetry/runtimeTelemetry';
import { formatMessages, extractSystemPrompt } from './normalize';

const PUTER_SCRIPT_SRC = 'https://js.puter.com/v2/';
const DEFAULT_LOAD_TIMEOUT_MS = 10000;
const DEFAULT_OPERATION_TIMEOUT_MS = 60000;
const FAILURE_COOLDOWN_MS = 15000;

type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'cooldown' | 'error';

interface PuterAI {
  chat?: (messages: ReturnType<typeof formatMessages>, options: SafeChatOptions & { system?: string }) => unknown;
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
    getUser?: () => unknown;
  };
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
}

export interface SafeChatOptions {
  model?: string;
  stream?: boolean;
  timeoutMs?: number;
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
};

let puterLoadPromise: Promise<void> | null = null;

function now() {
  return Date.now();
}

function isBrowserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function markFailure(error: unknown) {
  runtimeState.error = error instanceof Error ? error.message : String(error);
  runtimeState.lastFailureAt = now();
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
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Puter script')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = PUTER_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Puter script'));
    document.head.appendChild(script);
  });
}

export async function ensurePuterLoaded(timeoutMs = DEFAULT_LOAD_TIMEOUT_MS) {
  assertNotInCooldown();

  if (!isBrowserReady()) {
    throw new Error('Puter runtime unavailable outside the browser');
  }

  if (window.puter) {
    runtimeState.loaded = true;
    runtimeState.ready = true;
    runtimeState.loading = false;
    runtimeState.status = 'ready';
    runtimeState.initializedAt ||= now();
    return window.puter;
  }

  if (!puterLoadPromise) {
    runtimeState.loading = true;
    runtimeState.status = 'loading';
    puterLoadPromise = withTimeout(injectPuterScript(), timeoutMs, 'Puter load');
  }

  try {
    await puterLoadPromise;
    if (!window.puter) throw new Error('Puter loaded but unavailable');

    runtimeState.loaded = true;
    runtimeState.ready = true;
    runtimeState.loading = false;
    runtimeState.status = 'ready';
    runtimeState.initializedAt = now();
    runtimeState.error = null;
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
    markFailure(error);
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
  return !!window.puter?.ai && (!runtimeState.cooldownUntil || runtimeState.cooldownUntil <= now());
}

export function getPuterReadiness() {
  return runtimeState.status;
}

export async function ensurePuterAuthenticated() {
  const puter = await ensurePuterLoaded();
  try {
    const user = await withTimeout(
      Promise.resolve(puter.auth?.getUser?.()),
      DEFAULT_LOAD_TIMEOUT_MS,
      'Puter auth check'
    );
    runtimeState.authenticated = !!user;
    runtimeState.lastAuthCheckAt = now();
    return !!user;
  } catch {
    runtimeState.authenticated = false;
    runtimeState.lastAuthCheckAt = now();
    return false;
  }
}

export async function safePuterChat(messages: Message[], options: SafeChatOptions = {}) {
  const puter = await ensurePuterLoaded();
  const chatApi = puter.ai?.chat;
  if (!chatApi) throw new Error('Puter chat is unavailable');

  const startedAt = now();
  const system = extractSystemPrompt(messages);
  const puterMessages = formatMessages(messages);

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
    runtimeState.error = null;
    runtimeState.status = 'ready';
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
    throw error;
  }
}

export async function safePuterImage(prompt: string, options: Record<string, unknown> = {}) {
  const puter = await ensurePuterLoaded();
  const imageApi = puter.ai?.txt2img || puter.ai?.img || puter.ai?.generateImage;
  if (!imageApi) throw new Error('Puter image generation is unavailable');
  const startedAt = now();
  const { timeoutMs, ...imageOptions } = options;
  const hasOptions = Object.keys(imageOptions).length > 0;

  try {
    const response = await withTimeout(
      Promise.resolve(imageApi(prompt, hasOptions ? imageOptions : undefined)),
      typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_OPERATION_TIMEOUT_MS,
      'Puter image'
    );
    runtimeState.providerLatencyMs = now() - startedAt;
    runtimeState.error = null;
    runtimeState.status = 'ready';
    return response;
  } catch (error) {
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
    throw error;
  }
}

export async function safePuterTTS(text: string, options: Record<string, unknown> = {}) {
  const puter = await ensurePuterLoaded();
  const ttsApi = puter.ai?.txt2speech || puter.ai?.tts;
  if (!ttsApi) throw new Error('Puter text-to-speech is unavailable');
  return withTimeout(Promise.resolve(ttsApi(text, options)), DEFAULT_OPERATION_TIMEOUT_MS, 'Puter TTS');
}

export async function safePuterSTT(audio: Blob, options: Record<string, unknown> = {}) {
  const puter = await ensurePuterLoaded();
  const sttApi = puter.ai?.speech2txt || puter.ai?.stt;
  if (!sttApi) throw new Error('Puter speech-to-text is unavailable');
  return withTimeout(Promise.resolve(sttApi(audio, options)), DEFAULT_OPERATION_TIMEOUT_MS, 'Puter STT');
}

export function setActivePuterStream(streamId: string | null) {
  runtimeState.activeStreamId = streamId;
}

export function recordPuterFallbackEvent(fromProvider?: string, toProvider?: string) {
  runtimeState.fallbackEvents += 1;
  recordFallback(fromProvider, toProvider);
}

export function getPuterRuntimeState(): PuterRuntimeState {
  return { ...runtimeState };
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
  } satisfies PuterRuntimeState);
  puterLoadPromise = null;
}
