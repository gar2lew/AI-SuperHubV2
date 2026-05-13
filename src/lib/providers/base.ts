import type { Message, AIChunk, LegacyModel } from '@/types';

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly models: LegacyModel[];
  readonly isEnabled: boolean;

  chat(messages: Message[]): Promise<string>;
  stream(messages: Message[], abortSignal?: AbortSignal, modelId?: string): AsyncGenerator<AIChunk>;
  validateConfig(): boolean;
}

export abstract class BaseProvider implements AIProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly models: LegacyModel[];
  abstract readonly isEnabled: boolean;

  abstract chat(messages: Message[]): Promise<string>;
  abstract stream(messages: Message[], abortSignal?: AbortSignal, modelId?: string): AsyncGenerator<AIChunk>;

  validateConfig(): boolean {
    return true;
  }

  /** Extract plain text from multimodal content for provider APIs that need strings */
  protected extractText(content: Message['content']): string {
    return content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }

  /** Format messages for provider APIs that accept structured content */
  protected formatMessages(messages: Message[]): { role: string; content: string }[] {
    return messages.map((m) => ({
      role: m.role,
      content: this.extractText(m.content),
    }));
  }

  /** Normalize a text string into AIChunk stream */
  protected *textToChunks(text: string): Generator<AIChunk> {
    yield { type: 'text', content: text };
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
