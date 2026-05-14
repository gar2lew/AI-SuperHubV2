import type { ModelPreset, Capability } from '@/types';

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'fast',
    label: 'Fast',
    emoji: '⚡',
    description: 'Quick responses for simple tasks',
    primary: 'ollama-llama-maverick',
    fallbacks: ['openrouter-deepseek-v4', 'openai-gpt-4o'],
    capabilities: ['chat', 'coding'],
  },
  {
    id: 'smart',
    label: 'Smart',
    emoji: '🧠',
    description: 'Balanced intelligence for most tasks',
    primary: 'puter-claude-sonnet-4',
    fallbacks: ['anthropic-claude-sonnet-4', 'openai-gpt-5'],
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools'],
  },
  {
    id: 'coding',
    label: 'Coding',
    emoji: '💻',
    description: 'Optimized for code generation and review',
    primary: 'openai-gpt-5',
    fallbacks: ['anthropic-claude-opus-4', 'ollama-deepseek-v4'],
    capabilities: ['chat', 'coding', 'reasoning', 'tools'],
  },
  {
    id: 'vision',
    label: 'Vision',
    emoji: '👁',
    description: 'See and understand images',
    primary: 'openai-gpt-4o',
    fallbacks: ['anthropic-claude-sonnet-4', 'puter-gpt-5'],
    capabilities: ['chat', 'vision', 'coding'],
  },
  {
    id: 'deep-think',
    label: 'Deep Think',
    emoji: '🔬',
    description: 'Maximum reasoning for complex problems',
    primary: 'anthropic-claude-opus-4',
    fallbacks: ['openrouter-deepseek-v4', 'openai-gpt-5'],
    capabilities: ['chat', 'coding', 'reasoning', 'research', 'tools'],
  },
];

export const DEFAULT_PRESET_ID = 'smart';
export const OTHER_MODELS_PRESET_ID = 'other-models';

export function getPreset(id: string): ModelPreset | undefined {
  return MODEL_PRESETS.find((p) => p.id === id);
}

export function getPresetForCapabilities(required: Capability[]): ModelPreset | undefined {
  return MODEL_PRESETS.find((p) =>
    required.every((c) => p.capabilities.includes(c))
  );
}

export function resolvePresetToModel(presetId: string): string {
  const preset = getPreset(presetId);
  return preset?.primary || MODEL_PRESETS[0].primary;
}
