import type { AIProvider } from '@/lib/providers/base';
import { getProvider } from '@/lib/providers';
import { modelRegistry } from '@/lib/models/registry';
import { isHealthy } from '@/lib/providers/health';

const SAFE_FALLBACK_MODEL_ID = 'ollama-llama-maverick';

export interface RoutingResult {
  provider: AIProvider;
  modelId: string;
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
    | 'provider-unhealthy';
}

export interface RoutingDiagnostics {
  requestedModelId: string;
  preferredProvider?: string;
  fallbackChain: string[];
  resolvedModelId?: string;
  resolvedProviderId?: string;
  usedFallback: boolean;
  safeFallbackUsed: boolean;
  rejections: RouteRejection[];
}

export interface RoutingOptions {
  preferredProvider?: string;
  preferredModel?: string;
  allowFallback?: boolean;
  maxRetries?: number;
  respectHealth?: boolean;
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

  // Build fallback chain
  const baseChain = modelRegistry.resolveFallbackChain(modelId);
  const chain = opts.allowFallback ? withSafeFallback(baseChain) : baseChain;
  const diagnostics: RoutingDiagnostics = {
    requestedModelId: modelId,
    preferredProvider: opts.preferredProvider,
    fallbackChain: chain,
    usedFallback: false,
    safeFallbackUsed: false,
    rejections: [],
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
    const provider = getProvider(providerId);
    const providerRejection = rejectionForProvider(id, providerId);

    if (provider && !providerRejection) {
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
        usedFallback: id !== modelId || usedProviderFallback,
        fallbackChain: id === SAFE_FALLBACK_MODEL_ID ? chain : baseChain,
      };
      commitDiagnostics(diagnostics, route);
      return route;
    }
    if (providerRejection) diagnostics.rejections.push(providerRejection);

    // If preferred provider doesn't work, try the model's native provider
    if (opts.preferredProvider && opts.preferredProvider !== model.provider) {
      const nativeProvider = getProvider(model.provider);
      const nativeRejection = rejectionForProvider(id, model.provider);
      if (
        nativeProvider &&
        !nativeRejection &&
        (!opts.respectHealth || isHealthy(nativeProvider.id))
      ) {
        const route = {
          provider: nativeProvider,
          modelId: model.id,
          usedFallback: true,
          fallbackChain: id === SAFE_FALLBACK_MODEL_ID ? chain : baseChain,
        };
        commitDiagnostics(diagnostics, route);
        return route;
      }
      if (nativeRejection) diagnostics.rejections.push(nativeRejection);
    }

    if (!opts.allowFallback) break;
  }

  const safeModel = modelRegistry.get(SAFE_FALLBACK_MODEL_ID);
  const safeProvider = safeModel ? getProvider(safeModel.provider) : undefined;
  const safeRejection = safeModel ? rejectionForProvider(SAFE_FALLBACK_MODEL_ID, safeModel.provider) : null;
  if (opts.allowFallback && safeModel && safeProvider && !safeRejection) {
    const route = {
      provider: safeProvider,
      modelId: safeModel.id,
      usedFallback: true,
      fallbackChain: chain,
    };
    commitDiagnostics({ ...diagnostics, safeFallbackUsed: true }, route);
    return route;
  }
  if (safeRejection) diagnostics.rejections.push(safeRejection);
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
        usedFallback: true,
        fallbackChain,
      };
    }
  }

  return null;
}
