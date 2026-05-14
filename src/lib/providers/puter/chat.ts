import type { Message, AIChunk } from '@/types';
import { findLast } from '@/lib/utils';
import { resolveProviderRuntimeModelId } from '@/lib/models/runtime-ids';
import { normalizePuterChunk, normalizePuterResponse } from './normalize';
import { safePuterChat, setActivePuterStream } from './runtime';

const DEFAULT_PUTER_CHAT_MODEL = 'gpt-4o';

export async function mockChat(messages: Message[]): Promise<string> {
  const lastUser = findLast(messages, (m: Message) => m.role === 'user');
  const prompt = lastUser
    ? lastUser.content
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('')
        .toLowerCase()
    : '';

  if (prompt.includes('code') || prompt.includes('function')) {
    return "Here's a simple example:\n\n```typescript\nfunction greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet('World'));\n```\n\nThis function takes a name parameter and returns a greeting string.";
  }
  if (prompt.includes('hello') || prompt.includes('hi')) {
    return "Hello! I'm your AI assistant powered by Puter.js. What would you like to work on today?";
  }
  return 'I understand your message. In production, this connects to Puter.js for real AI responses.';
}

export async function* mockStream(
  messages: Message[],
  abortSignal?: AbortSignal
): AsyncGenerator<AIChunk> {
  const response = await mockChat(messages);
  const tokens = response.split(' ');

  for (let i = 0; i < tokens.length; i++) {
    if (abortSignal?.aborted) {
      yield { type: 'status', content: 'aborted' };
      return;
    }
    await delay(30 + Math.random() * 50);
    yield normalizePuterChunk({ text: (i > 0 ? ' ' : '') + tokens[i] }, i);
  }

  yield { type: 'status', content: 'done' };
}

export async function* puterStream(
  messages: Message[],
  abortSignal?: AbortSignal,
  modelId?: string
): AsyncGenerator<AIChunk> {
  const streamId = `puter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  setActivePuterStream(streamId);

  try {
    const stream = await safePuterChat(messages, {
      model: resolveProviderRuntimeModelId(modelId, 'puter', DEFAULT_PUTER_CHAT_MODEL),
      stream: true,
    });

    let sequence = 0;
    for await (const chunk of stream as AsyncIterable<unknown>) {
      if (abortSignal?.aborted) {
        yield { type: 'status', content: 'aborted', metadata: { streamId, sequence } };
        return;
      }

      const normalized = normalizePuterChunk(chunk, sequence++);
      yield normalized;

      if (normalized.type === 'status' && normalized.content === 'done') {
        return;
      }
    }

    yield { type: 'status', content: 'done', metadata: { streamId, sequence } };
  } finally {
    setActivePuterStream(null);
  }
}

export async function puterChat(messages: Message[], modelId?: string): Promise<string> {
  const response = await safePuterChat(messages, {
    model: resolveProviderRuntimeModelId(modelId, 'puter', DEFAULT_PUTER_CHAT_MODEL),
    stream: false,
  });

  return normalizePuterResponse(response)
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
