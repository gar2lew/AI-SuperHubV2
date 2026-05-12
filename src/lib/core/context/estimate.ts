import type { Message } from '@/types';

/**
 * Rough token estimation.
 * ~4 characters per token is a common heuristic.
 * Replace with a proper tokenizer for production.
 */
export function estimateTokens(messages: Message[]): number {
  return messages.reduce((acc, m) => {
    const text = m.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join(' ');
    return acc + Math.ceil(text.length / 4);
  }, 0);
}

/**
 * Estimate tokens for a single string.
 */
export function estimateStringTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
