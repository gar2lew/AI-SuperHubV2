import { modelRegistry } from './registry';

const PROVIDER_PREFIX = /^(puter|openai|anthropic|ollama|openrouter)-/;

export function resolveProviderRuntimeModelId(
  internalOrRuntimeId: string | undefined,
  providerId: string,
  fallbackRuntimeId: string
): string {
  if (!internalOrRuntimeId) return fallbackRuntimeId;

  const resolution = modelRegistry.resolveRuntimeModelId(internalOrRuntimeId, providerId);
  if (resolution.valid && resolution.runtimeId) return resolution.runtimeId;

  if (modelRegistry.get(internalOrRuntimeId)) {
    throw new Error(
      `Invalid runtime model mapping for ${internalOrRuntimeId}: ${resolution.reason ?? 'unknown'}`
    );
  }

  if (PROVIDER_PREFIX.test(internalOrRuntimeId)) {
    throw new Error(`Missing runtime model mapping for ${internalOrRuntimeId}`);
  }

  return internalOrRuntimeId;
}
