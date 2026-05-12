import type { Message } from '@/types';

/**
 * Format messages for OpenAI API.
 * OpenAI supports multimodal content arrays.
 */
export function formatForOpenAI(messages: Message[]): unknown[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image') {
        return {
          type: 'image_url',
          image_url: { url: part.url || '' },
        };
      }
      return { type: 'text', text: '' };
    }),
  }));
}
