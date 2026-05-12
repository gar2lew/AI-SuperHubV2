import { PuterProvider } from './puter/index';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { OpenRouterProvider } from './openrouter';
import type { AIProvider } from './base';

export const providers: AIProvider[] = [
  new PuterProvider(),
  new OpenAIProvider(),
  new AnthropicProvider(),
  new OllamaProvider(),
  new OpenRouterProvider(),
];

export function getProvider(id: string): AIProvider | undefined {
  return providers.find((p) => p.id === id);
}

export function getEnabledProviders(): AIProvider[] {
  return providers.filter((p) => p.isEnabled);
}

export { PuterProvider, OpenAIProvider, AnthropicProvider, OllamaProvider, OpenRouterProvider };
export type { AIProvider } from './base';
