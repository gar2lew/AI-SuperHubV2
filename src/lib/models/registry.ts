import type { AIModel, Capability, ModelTier } from '@/types';

const MODELS: AIModel[] = [
  // Puter models
  {
    id: 'puter-gpt-5',
    label: 'GPT-5',
    provider: 'puter',
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools'],
    tier: 'advanced',
    multimodal: true,
    contextWindow: 128000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    specializations: ['general', 'coding', 'analysis'],
    fallbacks: ['puter-claude-sonnet-4', 'openai-gpt-4o'],
    tags: ['multilingual', 'coding', 'general', 'long-context'],
  },
  {
    id: 'puter-claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'puter',
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools', 'research'],
    tier: 'balanced',
    multimodal: true,
    contextWindow: 200000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko'],
    specializations: ['writing', 'analysis', 'coding'],
    fallbacks: ['puter-gpt-5', 'anthropic-claude-sonnet-4'],
    tags: ['multilingual', 'writing', 'analysis', 'long-context'],
  },

  // OpenAI models
  {
    id: 'openai-gpt-5',
    label: 'GPT-5',
    provider: 'openai',
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools', 'tts', 'stt'],
    tier: 'advanced',
    multimodal: true,
    contextWindow: 128000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ar'],
    specializations: ['general', 'coding', 'creative'],
    fallbacks: ['openai-gpt-4o', 'puter-gpt-5'],
    tags: ['multilingual', 'coding', 'creative', 'voice', 'general'],
  },
  {
    id: 'openai-gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    capabilities: ['chat', 'vision', 'coding', 'tools', 'tts', 'stt'],
    tier: 'balanced',
    multimodal: true,
    contextWindow: 128000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    specializations: ['general', 'vision'],
    fallbacks: ['openai-gpt-5', 'anthropic-claude-sonnet-4'],
    tags: ['multilingual', 'vision', 'voice', 'general'],
  },

  // Anthropic models
  {
    id: 'anthropic-claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'anthropic',
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools', 'research'],
    tier: 'balanced',
    multimodal: true,
    contextWindow: 200000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko'],
    specializations: ['writing', 'analysis', 'coding', 'research'],
    fallbacks: ['anthropic-claude-opus-4', 'openai-gpt-5'],
    tags: ['multilingual', 'writing', 'research', 'long-context'],
  },
  {
    id: 'anthropic-claude-opus-4',
    label: 'Claude Opus 4',
    provider: 'anthropic',
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools', 'research'],
    tier: 'advanced',
    multimodal: true,
    contextWindow: 200000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko'],
    specializations: ['complex-reasoning', 'research', 'coding'],
    fallbacks: ['anthropic-claude-sonnet-4', 'openai-gpt-5'],
    tags: ['multilingual', 'research', 'coding', 'long-context'],
  },

  // Ollama models
  {
    id: 'ollama-llama-maverick',
    label: 'Llama Maverick',
    provider: 'ollama',
    capabilities: ['chat', 'coding', 'tools'],
    tier: 'fast',
    multimodal: false,
    contextWindow: 128000,
    languages: ['en'],
    specializations: ['local', 'fast', 'coding'],
    fallbacks: ['ollama-deepseek-v4'],
    tags: ['local', 'fast', 'coding', 'cheap'],
  },
  {
    id: 'ollama-deepseek-v4',
    label: 'DeepSeek V4',
    provider: 'ollama',
    capabilities: ['chat', 'coding', 'reasoning'],
    tier: 'balanced',
    multimodal: false,
    contextWindow: 64000,
    languages: ['en', 'zh'],
    specializations: ['coding', 'reasoning', 'local'],
    fallbacks: ['ollama-llama-maverick'],
    tags: ['local', 'coding', 'reasoning', 'cheap'],
  },

  // OpenRouter models
  {
    id: 'openrouter-gpt-5',
    label: 'GPT-5 (OR)',
    provider: 'openrouter',
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools'],
    tier: 'advanced',
    multimodal: true,
    contextWindow: 128000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    specializations: ['general', 'coding'],
    fallbacks: ['openrouter-claude-sonnet-4', 'openrouter-deepseek-v4'],
    tags: ['multilingual', 'coding', 'general'],
  },
  {
    id: 'openrouter-claude-sonnet-4',
    label: 'Claude Sonnet 4 (OR)',
    provider: 'openrouter',
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools', 'research'],
    tier: 'balanced',
    multimodal: true,
    contextWindow: 200000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    specializations: ['writing', 'analysis'],
    fallbacks: ['openrouter-gpt-5', 'openrouter-deepseek-v4'],
    tags: ['multilingual', 'writing', 'analysis', 'long-context'],
  },
  {
    id: 'openrouter-deepseek-v4',
    label: 'DeepSeek V4 (OR)',
    provider: 'openrouter',
    capabilities: ['chat', 'coding', 'reasoning'],
    tier: 'reasoning',
    multimodal: false,
    contextWindow: 64000,
    languages: ['en', 'zh'],
    specializations: ['reasoning', 'coding', 'math'],
    fallbacks: ['openrouter-claude-sonnet-4'],
    tags: ['reasoning', 'coding', 'math', 'cheap'],
  },
];

class ModelRegistry {
  private models = new Map<string, AIModel>();

  constructor() {
    MODELS.forEach((m) => this.models.set(m.id, m));
  }

  get(id: string): AIModel | undefined {
    return this.models.get(id);
  }

  getAll(): AIModel[] {
    return Array.from(this.models.values());
  }

  getByProvider(providerId: string): AIModel[] {
    return this.getAll().filter((m) => m.provider === providerId);
  }

  getByCapability(capability: Capability): AIModel[] {
    return this.getAll().filter((m) => m.capabilities.includes(capability));
  }

  getByTier(tier: ModelTier): AIModel[] {
    return this.getAll().filter((m) => m.tier === tier);
  }

  getMultimodal(): AIModel[] {
    return this.getAll().filter((m) => m.multimodal);
  }

  getByTag(tag: string): AIModel[] {
    return this.getAll().filter((m) => m.tags?.includes(tag));
  }

  getFallbacks(modelId: string): AIModel[] {
    const model = this.get(modelId);
    if (!model?.fallbacks) return [];
    return model.fallbacks
      .map((id) => this.get(id))
      .filter((m): m is AIModel => m !== undefined);
  }

  resolveFallbackChain(modelId: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();
    const queue = [modelId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const model = this.get(current);
      if (!model) continue;

      chain.push(current);
      model.fallbacks?.forEach((f) => queue.push(f));
    }

    return chain;
  }
}

export const modelRegistry = new ModelRegistry();
