import type { Message, AIChunk } from '@/types';

/** Puter.js specific message format */
export interface PuterMessage {
  role: string;
  content: string | Array<Record<string, unknown>>;
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
    content: m.content.map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image') return { type: 'image', url: part.url, mimeType: part.mimeType };
      if (part.type === 'audio') return { type: 'audio', url: part.url, mimeType: part.mimeType };
      return { type: 'file', url: part.url, name: part.name, mimeType: part.mimeType };
    }),
  }));
}
