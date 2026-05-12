import type { Message, AIChunk } from '@/types';
import { findLast } from '@/lib/utils';
import { normalizeChunk } from './normalize';
import { getPuterAI, isPuterAvailable, getPuterReadiness } from './runtime';
import { formatMessages, extractSystemPrompt } from './normalize';

// ============================================================
// MOCK STREAMING (fallback when Puter is unavailable)
// ============================================================

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
  return "I understand your message. In production, this connects to Puter.js for real AI responses.";
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
    yield normalizeChunk({ text: (i > 0 ? ' ' : '') + tokens[i] });
  }

  yield { type: 'status', content: 'done' };
}

// ============================================================
// REAL PUTER.JS STREAMING
// ============================================================

/**
 * Real Puter.js streaming adapter.
 * Uses puter.ai.chat() with stream: true.
 * Normalizes all output to AIChunk.
 */
export async function* puterStream(
  messages: Message[],
  abortSignal?: AbortSignal,
  modelId?: string
): AsyncGenerator<AIChunk> {
  // Check Puter availability
  if (!isPuterAvailable()) {
    console.warn('[PuterProvider] Puter.js not available, falling back to mock');
    yield* mockStream(messages, abortSignal);
    return;
  }

  const ai = getPuterAI();
  const puterMessages = formatMessages(messages);
  const system = extractSystemPrompt(messages);

  // Determine model: use provided or default
  const model = modelId || 'gpt-4o';

  try {
    const stream = await ai.chat(puterMessages, {
      model,
      stream: true,
      ...(system ? { system } : {}),
    });

    for await (const chunk of stream as AsyncIterable<{ text?: string; done?: boolean }>) {
      if (abortSignal?.aborted) {
        yield { type: 'status', content: 'aborted' };
        return;
      }

      if (chunk.done) {
        yield { type: 'status', content: 'done' };
        return;
      }

      if (chunk.text) {
        yield normalizeChunk({ text: chunk.text });
      }
    }

    yield { type: 'status', content: 'done' };
  } catch (err) {
    const error = err as Error;
    console.error('[PuterProvider] Stream error:', error);
    yield { type: 'status', content: `error: ${error.message}` };
    throw error;
  }
}

/**
 * Non-streaming chat for Puter.js.
 */
export async function puterChat(messages: Message[], modelId?: string): Promise<string> {
  if (!isPuterAvailable()) {
    console.warn('[PuterProvider] Puter.js not available, falling back to mock');
    return mockChat(messages);
  }

  const ai = getPuterAI();
  const puterMessages = formatMessages(messages);
  const system = extractSystemPrompt(messages);
  const model = modelId || 'gpt-4o';

  const response = await ai.chat(puterMessages, {
    model,
    ...(system ? { system } : {}),
  });

  // Puter returns the full text directly for non-streaming
  return typeof response === 'string' ? response : String(response);
}

/** Get provider readiness for diagnostics. */
export function getPuterProviderStatus(): {
  readiness: ReturnType<typeof getPuterReadiness>;
  available: boolean;
} {
  return {
    readiness: getPuterReadiness(),
    available: isPuterAvailable(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
