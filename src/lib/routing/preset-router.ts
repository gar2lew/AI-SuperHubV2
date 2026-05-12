import { getPreset, resolvePresetToModel, MODEL_PRESETS } from '@/lib/models/presets';
import { modelRegistry } from '@/lib/models/registry';
import { resolveRoute } from './fallback-router';
import type { Capability } from '@/types';

export interface PresetRoute {
  presetId: string;
  presetLabel: string;
  modelId: string;
  modelLabel: string;
  provider: string;
  capabilities: Capability[];
}

/**
 * Resolve a preset ID to a concrete model + provider route.
 */
export function resolvePreset(presetId: string): PresetRoute | null {
  const preset = getPreset(presetId);
  if (!preset) return null;

  const modelId = resolvePresetToModel(presetId);
  const model = modelRegistry.get(modelId);
  if (!model) return null;

  const route = resolveRoute(modelId);
  if (!route) return null;

  return {
    presetId: preset.id,
    presetLabel: preset.label,
    modelId: model.id,
    modelLabel: model.label,
    provider: route.provider.id,
    capabilities: preset.capabilities,
  };
}

/**
 * Get all available presets with their resolved routes.
 */
export function getAllPresetRoutes(): PresetRoute[] {
  return MODEL_PRESETS.map((p) => resolvePreset(p.id)).filter((r): r is PresetRoute => r !== null);
}

/**
 * Find the best preset for a given set of required capabilities.
 */
export function findBestPreset(required: Capability[]): PresetRoute | null {
  const matching = MODEL_PRESETS.filter((p) =>
    required.every((c) => p.capabilities.includes(c))
  );

  if (matching.length === 0) return null;

  // Prefer balanced tier, then advanced, then fast
  const tierOrder = ['balanced', 'advanced', 'fast', 'reasoning'];
  const sorted = matching.sort((a, b) => {
    const aModel = modelRegistry.get(resolvePresetToModel(a.id));
    const bModel = modelRegistry.get(resolvePresetToModel(b.id));
    const aTier = tierOrder.indexOf(aModel?.tier || 'balanced');
    const bTier = tierOrder.indexOf(bModel?.tier || 'balanced');
    return aTier - bTier;
  });

  return resolvePreset(sorted[0].id);
}
