import { BaseProvider } from './base';
import { findLast } from '@/lib/utils';
import type { Message, AIChunk, LegacyModel } from '@/types';

const ANTHROPIC_MODELS: LegacyModel[] = [
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'Anthropic Claude Sonnet',
    contextWindow: 200000,
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    description: 'Anthropic Claude Opus',
    contextWindow: 200000,
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
];

export class AnthropicProvider extends BaseProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  readonly description = 'Claude API — requires API key';
  readonly models = ANTHROPIC_MODELS;
  readonly isEnabled = false;

  async chat(): Promise<string> {
    return 'Anthropic provider placeholder';
  }

  async *stream(messages: Message[], abortSignal?: AbortSignal): AsyncGenerator<AIChunk> {
    const response = this.generateMockResponse(messages);
    const tokens = response.split(' ');
    for (let i = 0; i < tokens.length; i++) {
      if (abortSignal?.aborted) {
        yield { type: 'status', content: 'aborted' };
        return;
      }
      await this.delay(20 + Math.random() * 35);
      yield { type: 'text', content: (i > 0 ? ' ' : '') + tokens[i] };
    }
  }

  private generateMockResponse(messages: Message[]): string {
    const lastUserMessage = findLast(messages, (m: Message) => m.role === 'user');
    const prompt = lastUserMessage ? this.extractText(lastUserMessage.content).toLowerCase() : '';
    if (prompt.includes('code')) {
      return "Here's a Claude-style thoughtful code example:\n\n```rust\nfn main() {\n    let numbers = vec![1, 2, 3, 4, 5];\n    let sum: i32 = numbers.iter().sum();\n    println!(\"Sum: {}\", sum);\n}\n```\n\nRust's iterator methods provide zero-cost abstractions. The `iter()` method borrows each element, while `into_iter()` would consume the vector.";
    }
    return "This is a simulated Anthropic Claude response. Claude is known for its thoughtful, nuanced answers. Add your API key to experience the real thing.";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
