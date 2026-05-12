import { BaseProvider } from './base';
import { findLast } from '@/lib/utils';
import type { Message, AIChunk, LegacyModel } from '@/types';

const OLLAMA_MODELS: LegacyModel[] = [
  {
    id: 'llama-maverick',
    name: 'Llama Maverick',
    description: 'Meta Llama Maverick — local inference',
    contextWindow: 128000,
    supportsVision: false,
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'deepseek-v4',
    name: 'DeepSeek V4',
    description: 'DeepSeek V4 — local inference',
    contextWindow: 64000,
    supportsVision: false,
    supportsStreaming: true,
    supportsTools: true,
  },
];

export class OllamaProvider extends BaseProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama';
  readonly description = 'Local models via Ollama — runs on your machine';
  readonly models = OLLAMA_MODELS;
  readonly isEnabled = true;

  async chat(): Promise<string> {
    return 'Ollama provider placeholder';
  }

  async *stream(messages: Message[], abortSignal?: AbortSignal): AsyncGenerator<AIChunk> {
    const response = this.generateMockResponse(messages);
    const tokens = response.split(' ');
    for (let i = 0; i < tokens.length; i++) {
      if (abortSignal?.aborted) {
        yield { type: 'status', content: 'aborted' };
        return;
      }
      await this.delay(15 + Math.random() * 30);
      yield { type: 'text', content: (i > 0 ? ' ' : '') + tokens[i] };
    }
  }

  private generateMockResponse(messages: Message[]): string {
    const lastUserMessage = findLast(messages, (m: Message) => m.role === 'user');
    const prompt = lastUserMessage ? this.extractText(lastUserMessage.content).toLowerCase() : '';
    if (prompt.includes('code')) {
      return "Here's a local Ollama code example:\n\n```go\npackage main\n\nimport \"fmt\"\n\nfunc main() {\n    ch := make(chan string, 1)\n    ch <- \"Hello from Go!\"\n    fmt.Println(<-ch)\n}\n```\n\nGo channels are a powerful concurrency primitive. The buffered channel here has capacity 1, allowing send without an immediate receiver.";
    }
    return "This is a simulated Ollama local response. Ollama lets you run large language models entirely on your own hardware. Install Ollama and pull a model to get started.";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
