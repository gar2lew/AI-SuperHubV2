import type { Message } from '@/types';
import { estimateTokens } from './estimate';

/**
 * Prune messages to fit within a token limit.
 * Keeps system message and most recent messages.
 */
export function pruneContext(messages: Message[], limit: number): Message[] {
  let pruned = [...messages];

  while (estimateTokens(pruned) > limit && pruned.length > 1) {
    const systemIndex = pruned.findIndex((m) => m.role === 'system');
    const dropIndex = systemIndex === 0 ? 1 : 0;
    pruned = pruned.filter((_, i) => i !== dropIndex);
  }

  return pruned;
}

/**
 * Check if context exceeds token limit.
 */
export function needsPruning(messages: Message[], limit: number): boolean {
  return estimateTokens(messages) > limit;
}
