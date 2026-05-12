import type { Message, AIChunk } from '@/types';

/** Puter.js specific message format */
export interface PuterMessage {
  role: string;
  content: string;
}

/** Puter.js streaming response chunk */
export interface PuterStreamChunk {
  text: string;
  done?: boolean;
}

/** Puter.js chat options */
export interface PuterChatOptions {
  model?: string;
  stream?: boolean;
  system?: string;
}

/** Normalize raw Puter response to AIChunk */
export function normalizePuterChunk(chunk: PuterStreamChunk): AIChunk {
  return {
    type: 'text',
    content: chunk.text,
  };
}

/** Convert our Message[] to Puter.js format */
export function toPuterMessages(messages: Message[]): PuterMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(''),
  }));
}
