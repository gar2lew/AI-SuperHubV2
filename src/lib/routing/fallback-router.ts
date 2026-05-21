import type { AIProvider } from '@/lib/providers/base';
import { getProvider } from '@/lib/providers';
import { modelRegistry } from '@/lib/models/registry';
import { isHealthy } from '@/lib/providers/health';
import {
  getMissingCapabilities,
  resolveCapabilityFallbacks,
  type RuntimeCapability,
} from '@/lib/models/capability-matrix';

const SAFE_FALLBACK_MODEL_ID = 'ollama-llama-maverick';

export interface RoutingResult {
  provider: AIProvider;
  modelId: string;
  runtimeModelId: string;
  usedFallback: boolean;
  fallbackChain: string[];
}

export interface RouteRejection {
  modelId: string;
  providerId?: string;
  reason:
    | 'model-missing'
    | 'provider-missing'
    | 'provider-disabled'
    | 'provider-config-unavailable'
    | 'provider-unhealthy'
    | 'runtime-id-missing'
    | 'runtime-id-malformed'
    | 'provider-mismatch'
    | 'capability-missing';
  missingCapabilities?: RuntimeCapability[];
}

export interface CapabilityRoutingTraceEvent {
  type:
    | 'capability-required'
    | 'capability-missing'
    | 'capability-fallback'
    | 'capability-satisfied';
  modelId?: string;
  providerId?: string;
  capabilities: RuntimeCapability[];
}

export interface RoutingDiagnostics {
  requestedModelId: string;
  preferredProvider?: string;
  fallbackChain: string[];
  resolvedModelId?: string;
  resolvedRuntimeModelId?: string;
  resolvedProviderId?: string;
  usedFallback: boolean;
  safeFallbackUsed: boolean;
  rejections: RouteRejection[];
  requiredCapabilities: RuntimeCapability[];
  capabilityTrace: CapabilityRoutingTraceEvent[];
  orchestrationMode?: 'standard' | 'capability-routed';
}

export interface RoutingOptions {
  preferredProvider?: string;
  preferredModel?: string;
  allowFallback?: boolean;
  maxRetries?: number;
  respectHealth?: boolean;
  requiredCapabilities?: RuntimeCapability[];
  requiresWebAccess?: boolean;
  requiresVision?: boolean;
  requiresStreaming?: boolean;
  requiresReasoning?: boolean;
  requiresToolExecution?: boolean;
  requiresImageGeneration?: boolean;
  requiresVoice?: boolean;
  orchestrationMode?: 'standard-chat' | 'web-query' | 'media-generation' | 'voice' | 'tool-eligible';
}

const DEFAULT_OPTIONS: RoutingOptions = {
  allowFallback: true,
  maxRetries: 2,
  respectHealth: true,
};

let lastRoutingDiagnostics: RoutingDiagnostics | null = null;

export function getLastRoutingDiagnostics(): RoutingDiagnostics | null {
  return lastRoutingDiagnostics;
}

function withSafeFallback(chain: string[]): string[] {
  return chain.includes(SAFE_FALLBACK_MODEL_ID) ? chain : [...chain, SAFE_FALLBACK_MODEL_ID];
}

function withCapabilityFallbacks(chain: string[], requiredCapabilities: RuntimeCapability[]): string[] {
  if (requiredCapabilities.length === 0) return chain;
  const capabilityFallbacks = resolveCapabilityFallbacks(chain[0] ?? SAFE_FALLBACK_MODEL_ID, requiredCapabilities)
    .map((profile) => profile.modelId);
  return Array.from(new Set([...chain, ...capabilityFallbacks]));
}

function capabilitiesFromOptions(options: RoutingOptions): RuntimeCapability[] {
  return Array.from(new Set([
    ...(options.requiredCapabilities ?? []),
    ...(options.requiresWebAccess ? ['realtimeWeb' as const] : []),
    ...(options.requiresVision ? ['vision' as const] : []),
    ...(options.requiresStreaming ? ['streaming' as const] : []),
    ...(options.requiresReasoning ? ['reasoning' as const] : []),
    ...(options.requiresToolExecution ? ['tools' as const] : []),
    ...(options.requiresImageGeneration ? ['imageGeneration' as const] : []),
    ...(options.requiresVoice ? ['speechToText' as const, 'textToSpeech' as const] : []),
  ]));
}

function rejectionForProvider(modelId: string, providerId: string): RouteRejection | null {
  const provider = getProvider(providerId);
  if (!provider) return { modelId, providerId, reason: 'provider-missing' };
  if (!provider.isEnabled) return { modelId, providerId, reason: 'provider-disabled' };
  if (!provider.validateConfig()) {
    return { modelId, providerId, reason: 'provider-config-unavailable' };
  }
  return null;
}

function commitDiagnostics(diagnostics: RoutingDiagnostics, route: RoutingResult | null) {
  lastRoutingDiagnostics = {
    ...diagnostics,
    resolvedModelId: route?.modelId,
    resolvedRuntimeModelId: route?.runtimeModelId,
    resolvedProviderId: route?.provider.id,
    usedFallback: route?.usedFallback ?? false,
  };
}

/**
 * Resolve a model ID to a provider + model pair.
 * Falls back through the model's fallback chain if the primary is unavailable.
 * Respects provider health when respectHealth is true.
 */
export function resolveRoute(
  modelId: string,
  options: RoutingOptions = {}
): RoutingResult | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const requiredCapabilities = capabilitiesFromOptions(opts);

  // Build fallback chain
  const baseChain = modelRegistry.resolveFallbackChain(modelId);
  const capabilityChain = withCapabilityFallbacks(baseChain, requiredCapabilities);
  const chain = opts.allowFallback ? withSafeFallback(capabilityChain) : capabilityChain;
  const diagnostics: RoutingDiagnostics = {
    requestedModelId: modelId,
    preferredProvider: opts.preferredProvider,
    fallbackChain: chain,
    usedFallback: false,
    safeFallbackUsed: false,
    rejections: [],
    requiredCapabilities,
    capabilityTrace: requiredCapabilities.length > 0
      ? [{ type: 'capability-required', modelId, capabilities: requiredCapabilities }]
      : [],
    orchestrationMode: opts.orchestrationMode === 'standard-chat'
      ? 'standard'
      : requiredCapabilities.length > 0 ? 'capability-routed' : 'standard',
  };

  if (baseChain.length === 0) {
    diagnostics.rejections.push({ modelId, reason: 'model-missing' });
  }

  for (const id of chain) {
    const model = modelRegistry.get(id);
    if (!model) {
      diagnostics.rejections.push({ modelId: id, reason: 'model-missing' });
      continue;
    }

    // Preferred provider is honored only when the selected model belongs to it.
    // Cross-provider model remapping stays explicit in the registry fallback chain.
    const providerId =
      opts.preferredProvider && opts.preferredProvider === model.provider
        ? opts.preferredProvider
        : model.provider;
    const missingCapabilities = getMissingCapabilities(model, requiredCapabilities);
    if (missingCapabilities.length > 0) {
      diagnostics.rejections.push({
        modelId: id,
        providerId,
        reason: 'capability-missing',
        missingCapabilities,
      });
      diagnostics.capabilityTrace.push({
        type: 'capability-missing',
        modelId: id,
        providerId,
        capabilities: missingCapabilities,
      });
      if (!opts.allowFallback) break;
      continue;
    }
    const provider = getProvider(providerId);
    const providerRejection = rejectionForProvider(id, providerId);
    const runtimeResolution = modelRegistry.resolveRuntimeModelId(id, providerId);

    if (provider && !providerRejection && runtimeResolution.valid && runtimeResolution.runtimeId) {
      // Health check
      if (opts.respectHealth && !isHealthy(provider.id)) {
        diagnostics.rejections.push({ modelId: id, providerId: provider.id, reason: 'provider-unhealthy' });
        continue;
      }

      const usedProviderFallback = Boolean(
        opts.preferredProvider && opts.preferredProvider !== provider.id
      );

      const route = {
        provider,
        modelId: model.id,
        runtimeModelId: runtimeResolution.runtimeId,
        usedFallback: id !== modelId || usedProviderFallback,
        fallbackChain: id === SAFE_FALLBACK_MODEL_ID ? chain : baseChain,
      };
      if (requiredCapabilities.length > 0) {
        diagnostics.capabilityTrace.push({
          type: id !== modelId ? 'capability-fallback' : 'capability-satisfied',
          modelId: id,
          providerId: provider.id,
          capabilities: requiredCapabilities,
        });
        if (id !== modelId) {
          diagnostics.capabilityTrace.push({
            type: 'capability-satisfied',
            modelId: id,
            providerId: provider.id,
            capabilities: requiredCapabilities,
          });
        }
      }
      commitDiagnostics(diagnostics, route);
      return route;
    }
    if (providerRejection) diagnostics.rejections.push(providerRejection);
    if (!runtimeResolution.valid) {
      diagnostics.rejections.push({
        modelId: id,
        providerId,
        reason: runtimeResolution.reason ?? 'runtime-id-missing',
      });
    }

    // If preferred provider doesn't work, try the model's native provider
    if (opts.preferredProvider && opts.preferredProvider !== model.provider) {
      const nativeProvider = getProvider(model.provider);
      const nativeRejection = rejectionForProvider(id, model.provider);
      const nativeRuntimeResolution = modelRegistry.resolveRuntimeModelId(id, model.provider);
      if (
        nativeProvider &&
        !nativeRejection &&
        nativeRuntimeResolution.valid &&
        nativeRuntimeResolution.runtimeId &&
        (!opts.respectHealth || isHealthy(nativeProvider.id))
      ) {
        const route = {
          provider: nativeProvider,
          modelId: model.id,
          runtimeModelId: nativeRuntimeResolution.runtimeId,
          usedFallback: true,
          fallbackChain: id === SAFE_FALLBACK_MODEL_ID ? chain : baseChain,
        };
        commitDiagnostics(diagnostics, route);
        return route;
      }
      if (nativeRejection) diagnostics.rejections.push(nativeRejection);
      if (!nativeRuntimeResolution.valid) {
        diagnostics.rejections.push({
          modelId: id,
          providerId: model.provider,
          reason: nativeRuntimeResolution.reason ?? 'runtime-id-missing',
        });
      }
    }

    if (!opts.allowFallback) break;
  }

  const safeModel = modelRegistry.get(SAFE_FALLBACK_MODEL_ID);
  const safeProvider = safeModel ? getProvider(safeModel.provider) : undefined;
  const safeRejection = safeModel ? rejectionForProvider(SAFE_FALLBACK_MODEL_ID, safeModel.provider) : null;
  const safeRuntimeResolution = modelRegistry.resolveRuntimeModelId(SAFE_FALLBACK_MODEL_ID, safeModel?.provider);
  const safeMissingCapabilities = getMissingCapabilities(safeModel, requiredCapabilities);
  if (
    opts.allowFallback &&
    safeModel &&
    safeProvider &&
    !safeRejection &&
    safeMissingCapabilities.length === 0 &&
    safeRuntimeResolution.valid &&
    safeRuntimeResolution.runtimeId
  ) {
    const route = {
      provider: safeProvider,
      modelId: safeModel.id,
      runtimeModelId: safeRuntimeResolution.runtimeId,
      usedFallback: true,
      fallbackChain: chain,
    };
    commitDiagnostics({ ...diagnostics, safeFallbackUsed: true }, route);
    return route;
  }
  if (safeModel && safeMissingCapabilities.length > 0) {
    diagnostics.rejections.push({
      modelId: SAFE_FALLBACK_MODEL_ID,
      providerId: safeModel.provider,
      reason: 'capability-missing',
      missingCapabilities: safeMissingCapabilities,
    });
  }
  if (safeRejection) diagnostics.rejections.push(safeRejection);
  if (!safeRuntimeResolution.valid) {
    diagnostics.rejections.push({
      modelId: SAFE_FALLBACK_MODEL_ID,
      providerId: safeModel?.provider,
      reason: safeRuntimeResolution.reason ?? 'runtime-id-missing',
    });
  }
  commitDiagnostics(diagnostics, null);
  return null;
}

/**
 * Try a route and return the result or null on failure.
 * Used for runtime failover during streaming.
 */
export async function tryRoute(
  modelId: string,
  options?: RoutingOptions
): Promise<RoutingResult | null> {
  return resolveRoute(modelId, options);
}

/**
 * Get all available routes for a given model, ordered by preference.
 * Respects provider health.
 */
export function getAvailableRoutes(modelId: string): RoutingResult[] {
  const chain = modelRegistry.resolveFallbackChain(modelId);
  const results: RoutingResult[] = [];

  for (const id of chain) {
    const model = modelRegistry.get(id);
    if (!model) continue;

    const provider = getProvider(model.provider);
    if (provider && provider.isEnabled && isHealthy(provider.id)) {
      results.push({
        provider,
        modelId: model.id,
        runtimeModelId: modelRegistry.resolveRuntimeModelId(model.id, model.provider).runtimeId ?? model.id,
        usedFallback: id !== modelId,
        fallbackChain: chain,
      });
    }
  }

  return results;
}

/**
 * Get the next healthy fallback provider from a chain.
 * Used when the primary provider fails mid-stream.
 */
export function getNextHealthyFallback(
  fallbackChain: string[],
  currentProviderId: string
): RoutingResult | null {
  const currentIndex = fallbackChain.findIndex((id) => {
    const model = modelRegistry.get(id);
    return model?.provider === currentProviderId;
  });

  if (currentIndex === -1) return null;

  for (let i = currentIndex + 1; i < fallbackChain.length; i++) {
    const model = modelRegistry.get(fallbackChain[i]);
    if (!model) continue;

    const provider = getProvider(model.provider);
    if (provider && provider.isEnabled && isHealthy(provider.id)) {
      return {
        provider,
        modelId: model.id,
        runtimeModelId: modelRegistry.resolveRuntimeModelId(model.id, model.provider).runtimeId ?? model.id,
        usedFallback: true,
        fallbackChain,
      };
    }
  }

  return null;
}
