import { BaseProvider } from './base';
import { findLast } from '@/lib/utils';
import type { Message, AIChunk, LegacyModel } from '@/types';

const OPENAI_MODELS: LegacyModel[] = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'OpenAI GPT-5',
    contextWindow: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI GPT-4o',
    contextWindow: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
];

export class OpenAIProvider extends BaseProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly description = 'OpenAI API — requires API key';
  readonly models = OPENAI_MODELS;
  readonly isEnabled = false;

  async chat(): Promise<string> {
    return 'OpenAI provider placeholder';
  }

  async *stream(messages: Message[], abortSignal?: AbortSignal): AsyncGenerator<AIChunk> {
    const response = this.generateMockResponse(messages);
    const tokens = response.split(' ');
    for (let i = 0; i < tokens.length; i++) {
      if (abortSignal?.aborted) {
        yield { type: 'status', content: 'aborted' };
        return;
      }
      await this.delay(25 + Math.random() * 40);
      yield { type: 'text', content: (i > 0 ? ' ' : '') + tokens[i] };
    }
  }

  private generateMockResponse(messages: Message[]): string {
    const lastUserMessage = findLast(messages, (m: Message) => m.role === 'user');
    const prompt = lastUserMessage ? this.extractText(lastUserMessage.content).toLowerCase() : '';
    if (prompt.includes('code')) {
      return "Here's an OpenAI-style code example:\n\n```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n```\n\nThis recursive implementation is elegant but inefficient for large n. Consider memoization for production use.";
    }
    return "This is a simulated OpenAI response. When you add your API key in settings, this will connect to the real OpenAI API for genuine completions.";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
