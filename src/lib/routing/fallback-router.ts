import type { AIProvider } from '@/lib/providers/base';
import { getProvider } from '@/lib/providers';
import { modelRegistry } from '@/lib/models/registry';
import { isHealthy } from '@/lib/providers/health';

export interface RoutingResult {
  provider: AIProvider;
  modelId: string;
  usedFallback: boolean;
  fallbackChain: string[];
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
  const chain = modelRegistry.resolveFallbackChain(modelId);

  for (const id of chain) {
    const model = modelRegistry.get(id);
    if (!model) continue;

    // If a preferred provider is specified, try to find the model there
    const providerId = opts.preferredProvider || model.provider;
    const provider = getProvider(providerId);

    if (provider && provider.isEnabled && provider.validateConfig()) {
      // Health check
      if (opts.respectHealth && !isHealthy(provider.id)) {
        continue;
      }

      return {
        provider,
        modelId: model.id,
        usedFallback: id !== modelId,
        fallbackChain: chain,
      };
    }

    // If preferred provider doesn't work, try the model's native provider
    if (opts.preferredProvider && opts.preferredProvider !== model.provider) {
      const nativeProvider = getProvider(model.provider);
      if (
        nativeProvider &&
        nativeProvider.isEnabled &&
        nativeProvider.validateConfig() &&
        (!opts.respectHealth || isHealthy(nativeProvider.id))
      ) {
        return {
          provider: nativeProvider,
          modelId: model.id,
          usedFallback: true,
          fallbackChain: chain,
        };
      }
    }

    if (!opts.allowFallback) break;
  }

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
