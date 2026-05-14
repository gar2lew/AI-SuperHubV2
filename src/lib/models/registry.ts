import type { AIModel, Capability, ModelTier } from '@/types';

const RUNTIME_MODEL_IDS: Record<string, string> = {
  'puter-gpt-5': 'gpt-5',
  'puter-claude-sonnet-4': 'claude-sonnet-4',
  'openai-gpt-5': 'gpt-5',
  'openai-gpt-4o': 'gpt-4o',
  'anthropic-claude-sonnet-4': 'claude-sonnet-4',
  'anthropic-claude-opus-4': 'claude-opus-4',
  'ollama-llama-maverick': 'llama-maverick',
  'ollama-deepseek-v4': 'deepseek-v4',
  'openrouter-gpt-5': 'gpt-5',
  'openrouter-claude-sonnet-4': 'claude-sonnet-4',
  'openrouter-deepseek-v4': 'deepseek-v4',
};

const MALFORMED_RUNTIME_ID = /^(puter|openai|anthropic|ollama|openrouter)-/;

export interface RuntimeModelResolution {
  internalId: string;
  runtimeId: string | null;
  providerId?: string;
  valid: boolean;
  reason?: 'model-missing' | 'runtime-id-missing' | 'runtime-id-malformed' | 'provider-mismatch';
}

const PUTER_ECOSYSTEM_MODELS: AIModel[] = [
  {
    id: 'moonshotai/kimi-k2-instruct',
    label: 'Kimi K2 Instruct',
    provider: 'puter',
    capabilities: ['chat', 'coding', 'reasoning'],
    tier: 'advanced',
    multimodal: false,
    contextWindow: 128000,
    languages: ['en', 'zh'],
    specializations: ['agentic-coding', 'reasoning'],
    fallbacks: ['puter-claude-sonnet-4', 'puter-gpt-5'],
    tags: ['moonshot', 'coding', 'reasoning', 'other-models'],
  },
  {
    id: 'qwen/qwen3-coder',
    label: 'Qwen3 Coder',
    provider: 'puter',
    capabilities: ['chat', 'coding', 'reasoning', 'tools'],
    tier: 'advanced',
    multimodal: false,
    contextWindow: 128000,
    languages: ['en', 'zh'],
    specializations: ['coding', 'tool-use'],
    fallbacks: ['puter-gpt-5', 'openrouter-deepseek-v4'],
    tags: ['qwen', 'coding', 'other-models'],
  },
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'puter',
    capabilities: ['chat', 'vision', 'coding', 'reasoning', 'tools', 'research'],
    tier: 'balanced',
    multimodal: true,
    contextWindow: 200000,
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    specializations: ['writing', 'analysis', 'coding'],
    fallbacks: ['puter-claude-sonnet-4', 'puter-gpt-5'],
    tags: ['claude', 'anthropic', 'vision', 'other-models'],
  },
  {
    id: 'gpt-oss-120b',
    label: 'GPT OSS 120B',
    provider: 'puter',
    capabilities: ['chat', 'coding', 'reasoning'],
    tier: 'reasoning',
    multimodal: false,
    contextWindow: 128000,
    languages: ['en'],
    specializations: ['open-weights', 'reasoning'],
    fallbacks: ['puter-gpt-5', 'openrouter-deepseek-v4'],
    tags: ['gpt-oss', 'reasoning', 'other-models'],
  },
  {
    id: 'grok-3-mini',
    label: 'Grok 3 Mini',
    provider: 'puter',
    capabilities: ['chat', 'coding', 'reasoning'],
    tier: 'fast',
    multimodal: false,
    contextWindow: 128000,
    languages: ['en'],
    specializations: ['fast-reasoning'],
    fallbacks: ['puter-gpt-5'],
    tags: ['grok', 'fast', 'other-models'],
  },
  {
    id: 'mimo-vl-7b',
    label: 'Mimo VL 7B',
    provider: 'puter',
    capabilities: ['chat', 'vision'],
    tier: 'fast',
    multimodal: true,
    contextWindow: 32000,
    languages: ['en', 'zh'],
    specializations: ['vision', 'lightweight'],
    fallbacks: ['puter-gpt-5', 'openai-gpt-4o'],
    tags: ['mimo', 'vision', 'other-models'],
  },
  {
    id: 'microsoft/phi-4',
    label: 'Phi 4',
    provider: 'puter',
    capabilities: ['chat', 'coding', 'reasoning'],
    tier: 'fast',
    multimodal: false,
    contextWindow: 16000,
    languages: ['en'],
    specializations: ['small-model', 'reasoning'],
    fallbacks: ['puter-gpt-5'],
    tags: ['phi', 'fast', 'other-models'],
  },
  {
    id: 'amazon/nova-pro-v1',
    label: 'Nova Pro',
    provider: 'puter',
    capabilities: ['chat', 'vision', 'coding'],
    tier: 'balanced',
    multimodal: true,
    contextWindow: 300000,
    languages: ['en', 'es', 'fr', 'de', 'ja'],
    specializations: ['long-context', 'multimodal'],
    fallbacks: ['puter-gpt-5', 'puter-claude-sonnet-4'],
    tags: ['nova', 'vision', 'long-context', 'other-models'],
  },
  {
    id: 'zai-org/glm-4.5',
    label: 'GLM 4.5',
    provider: 'puter',
    capabilities: ['chat', 'coding', 'reasoning', 'tools'],
    tier: 'advanced',
    multimodal: false,
    contextWindow: 128000,
    languages: ['en', 'zh'],
    specializations: ['agentic-coding', 'reasoning'],
    fallbacks: ['puter-gpt-5', 'openrouter-deepseek-v4'],
    tags: ['glm', 'coding', 'reasoning', 'other-models'],
  },
  {
    id: 'seed-oss-36b-instruct',
    label: 'Seed OSS 36B',
    provider: 'puter',
    capabilities: ['chat', 'coding'],
    tier: 'balanced',
    multimodal: false,
    contextWindow: 32000,
    languages: ['en', 'zh'],
    specializations: ['open-weights', 'instruction'],
    fallbacks: ['puter-gpt-5'],
    tags: ['seed', 'open-weights', 'other-models'],
  },
  {
    id: 'upstage/solar-pro-2',
    label: 'Solar Pro 2',
    provider: 'puter',
    capabilities: ['chat', 'coding', 'reasoning'],
    tier: 'balanced',
    multimodal: false,
    contextWindow: 64000,
    languages: ['en', 'ko'],
    specializations: ['reasoning', 'multilingual'],
    fallbacks: ['puter-gpt-5'],
    tags: ['solar', 'reasoning', 'other-models'],
  },
  {
    id: 'kat-coder-pro',
    label: 'Kat Coder Pro',
    provider: 'puter',
    capabilities: ['chat', 'coding', 'tools'],
    tier: 'balanced',
    multimodal: false,
    contextWindow: 64000,
    languages: ['en'],
    specializations: ['coding'],
    fallbacks: ['qwen/qwen3-coder', 'puter-gpt-5'],
    tags: ['kat', 'coding', 'other-models'],
  },
  {
    id: 'gpt-image-1-mini',
    label: 'GPT Image 1 Mini',
    provider: 'puter',
    capabilities: ['image'],
    tier: 'fast',
    multimodal: false,
    specializations: ['image-generation'],
    fallbacks: ['gpt-image-1', 'dall-e-3'],
    tags: ['image', 'openai', 'other-models'],
  },
  {
    id: 'gpt-image-1',
    label: 'GPT Image 1',
    provider: 'puter',
    capabilities: ['image'],
    tier: 'balanced',
    multimodal: false,
    specializations: ['image-generation'],
    fallbacks: ['gpt-image-1-mini', 'dall-e-3'],
    tags: ['image', 'openai', 'other-models'],
  },
  {
    id: 'dall-e-3',
    label: 'DALL-E 3',
    provider: 'puter',
    capabilities: ['image'],
    tier: 'balanced',
    multimodal: false,
    specializations: ['image-generation'],
    fallbacks: ['gpt-image-1-mini'],
    tags: ['image', 'openai', 'other-models'],
  },
  {
    id: 'gemini-2.5-flash-image-preview',
    label: 'Gemini Flash Image',
    provider: 'puter',
    capabilities: ['image', 'vision'],
    tier: 'fast',
    multimodal: true,
    specializations: ['image-generation', 'image-to-image'],
    fallbacks: ['gpt-image-1-mini'],
    tags: ['image', 'gemini', 'other-models'],
  },
  {
    id: 'grok-2-image',
    label: 'Grok Image',
    provider: 'puter',
    capabilities: ['image'],
    tier: 'balanced',
    multimodal: false,
    specializations: ['image-generation'],
    fallbacks: ['gpt-image-1-mini'],
    tags: ['image', 'grok', 'other-models'],
  },
  {
    id: 'black-forest-labs/flux-schnell',
    label: 'FLUX Schnell',
    provider: 'puter',
    capabilities: ['image'],
    tier: 'fast',
    multimodal: false,
    specializations: ['image-generation', 'fast'],
    fallbacks: ['gpt-image-1-mini'],
    tags: ['image', 'flux', 'other-models'],
  },
];

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
  ...PUTER_ECOSYSTEM_MODELS,

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
    MODELS.forEach((m) => {
      this.models.set(m.id, {
        ...m,
        runtimeId: m.runtimeId ?? RUNTIME_MODEL_IDS[m.id] ?? m.id,
      });
    });
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

  resolveRuntimeModelId(modelId: string, providerId?: string): RuntimeModelResolution {
    const model = this.get(modelId);
    if (!model) {
      return {
        internalId: modelId,
        runtimeId: null,
        providerId,
        valid: false,
        reason: 'model-missing',
      };
    }

    if (providerId && model.provider !== providerId) {
      return {
        internalId: modelId,
        runtimeId: model.runtimeId ?? null,
        providerId,
        valid: false,
        reason: 'provider-mismatch',
      };
    }

    if (!model.runtimeId) {
      return {
        internalId: modelId,
        runtimeId: null,
        providerId: model.provider,
        valid: false,
        reason: 'runtime-id-missing',
      };
    }

    if (model.provider === 'puter' && MALFORMED_RUNTIME_ID.test(model.runtimeId)) {
      return {
        internalId: modelId,
        runtimeId: model.runtimeId,
        providerId: model.provider,
        valid: false,
        reason: 'runtime-id-malformed',
      };
    }

    return {
      internalId: modelId,
      runtimeId: model.runtimeId,
      providerId: model.provider,
      valid: true,
    };
  }
}

export const modelRegistry = new ModelRegistry();
