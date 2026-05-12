import type { Message } from '@/types';
import { extractText } from '@/lib/utils';

/**
 * Format messages for Puter.js API.
 * Puter expects simple { role, content } objects with flat text.
 */
export function formatForPuter(messages: Message[]): { role: string; content: string }[] {
  return messages.map((m) => ({
    role: m.role,
    content: extractText(m.content),
  }));
}

/**
 * Extract system prompt for Puter.js options.
 */
export function extractSystemPrompt(messages: Message[]): string | undefined {
  const system = messages.find((m) => m.role === 'system');
  if (!system) return undefined;
  return extractText(system.content);
}
