import type { AIModel, ModelMetadata, ModelProviderCategory } from '@/types';

const PROVIDER_NAMES: Record<string, string> = {
  puter: 'Puter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
};

const PROVIDER_BADGES: Record<string, string> = {
  puter: 'Puter',
  openai: 'OpenAI',
  anthropic: 'Claude',
  ollama: 'Local',
  openrouter: 'Router',
};

const CATEGORY_BY_PROVIDER: Record<string, ModelProviderCategory> = {
  puter: 'puter',
  openai: 'openai',
  anthropic: 'anthropic',
  ollama: 'local',
  openrouter: 'openrouter',
};

const CATEGORY_LABELS: Record<ModelProviderCategory, string> = {
  preset: 'Preset Models',
  puter: 'Puter Ecosystem',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  local: 'Local',
  openrouter: 'OpenRouter',
  specialized: 'Specialized',
};

export function getModelMetadata(model: AIModel): ModelMetadata {
  const capabilities = model.capabilities;
  const category = model.tags?.includes('other-models')
    ? 'puter'
    : CATEGORY_BY_PROVIDER[model.provider] ?? 'specialized';

  return {
    id: model.id,
    providerName: PROVIDER_NAMES[model.provider] ?? model.provider,
    modelName: model.label,
    category,
    capabilities,
    multimodal: !!model.multimodal,
    streaming: capabilities.includes('chat'),
    image: capabilities.includes('image'),
    voice: capabilities.includes('tts') || capabilities.includes('stt'),
    codingOptimized: capabilities.includes('coding') || model.specializations?.includes('coding') === true,
    reasoningOptimized:
      capabilities.includes('reasoning') || model.specializations?.some((item) => item.includes('reasoning')) === true,
    providerBadge: PROVIDER_BADGES[model.provider] ?? model.provider,
    advanced: model.tags?.includes('other-models') ?? false,
  };
}

export function getModelCategoryLabel(category: ModelProviderCategory): string {
  return CATEGORY_LABELS[category];
}

export function getProviderDisplayName(providerId: string): string {
  return PROVIDER_NAMES[providerId] ?? providerId;
}
