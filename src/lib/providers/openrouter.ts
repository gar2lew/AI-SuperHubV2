import { BaseProvider } from './base';
import { findLast } from '@/lib/utils';
import type { Message, AIChunk, LegacyModel } from '@/types';

const OPENROUTER_MODELS: LegacyModel[] = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'OpenRouter — GPT-5 access',
    contextWindow: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'deepseek-v4',
    name: 'DeepSeek V4',
    description: 'OpenRouter — DeepSeek V4',
    contextWindow: 64000,
    supportsVision: false,
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'OpenRouter — Claude Sonnet',
    contextWindow: 200000,
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
];

export class OpenRouterProvider extends BaseProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  readonly description = 'OpenRouter — unified API for many models';
  readonly models = OPENROUTER_MODELS;
  readonly isEnabled = false;

  async chat(): Promise<string> {
    return 'OpenRouter provider placeholder';
  }

  async *stream(messages: Message[], abortSignal?: AbortSignal): AsyncGenerator<AIChunk> {
    const response = this.generateMockResponse(messages);
    const tokens = response.split(' ');
    for (let i = 0; i < tokens.length; i++) {
      if (abortSignal?.aborted) {
        yield { type: 'status', content: 'aborted' };
        return;
      }
      await this.delay(20 + Math.random() * 40);
      yield { type: 'text', content: (i > 0 ? ' ' : '') + tokens[i] };
    }
  }

  private generateMockResponse(messages: Message[]): string {
    const lastUserMessage = findLast(messages, (m: Message) => m.role === 'user');
    const prompt = lastUserMessage ? this.extractText(lastUserMessage.content).toLowerCase() : '';
    if (prompt.includes('code')) {
      return "Here's an OpenRouter code example:\n\n```javascript\nconst fetchData = async () => {\n  try {\n    const res = await fetch('/api/data');\n    const data = await res.json();\n    return data;\n  } catch (err) {\n    console.error('Fetch failed:', err);\n    throw err;\n  }\n};\n```\n\nAlways wrap async operations in try/catch for robust error handling. Consider using AbortController for request cancellation.";
    }
    return "This is a simulated OpenRouter response. OpenRouter provides a single API endpoint for accessing models from OpenAI, Anthropic, Google, and many others. Add your API key to get started.";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
