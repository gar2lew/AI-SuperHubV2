import type { Message, AIChunk, ContentPart } from '@/types';
import { toPuterMessages, type PuterStreamChunk } from './types';

/**
 * Normalize a Puter.js stream chunk to our standard AIChunk.
 */
export function normalizeChunk(chunk: PuterStreamChunk): AIChunk {
  if (chunk.done) {
    return { type: 'status', content: 'done' };
  }
  return {
    type: 'text',
    content: chunk.text,
  };
}

/**
 * Normalize a complete Puter.js response string.
 */
export function normalizeResponse(text: string): ContentPart[] {
  return [{ type: 'text', text }];
}

/**
 * Convert our messages to Puter.js format.
 */
export function formatMessages(messages: Message[]): ReturnType<typeof toPuterMessages> {
  return toPuterMessages(messages);
}

/**
 * Extract system prompt from messages for Puter.js options.
 */
export function extractSystemPrompt(messages: Message[]): string | undefined {
  const system = messages.find((m) => m.role === 'system');
  if (!system) return undefined;
  return system.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}
