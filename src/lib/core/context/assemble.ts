import type { Message, Conversation } from '@/types';
import { extractText, textContent } from '@/lib/utils';

export interface AssembleOptions {
  systemPrompt?: string;
  maxContextMessages?: number;
  includeSystem?: boolean;
}

const DEFAULT_OPTIONS: AssembleOptions = {
  maxContextMessages: 50,
  includeSystem: true,
};

/**
 * Assemble conversation context for provider calls.
 * Applies message limits and injects system prompt.
 */
export function assembleContext(
  conversation: Conversation,
  options: AssembleOptions = {}
): Message[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const messages: Message[] = [];

  // System prompt
  if (opts.includeSystem && (opts.systemPrompt || conversation.systemPrompt)) {
    messages.push(createSystemMessage(opts.systemPrompt || conversation.systemPrompt!));
  }

  // Conversation history with limit
  const history = opts.maxContextMessages
    ? conversation.messages.slice(-opts.maxContextMessages)
    : [...conversation.messages];

  messages.push(...history);
  return messages;
}

function createSystemMessage(text: string): Message {
  return {
    id: `sys-${Date.now()}`,
    role: 'system',
    content: textContent(text),
    createdAt: Date.now(),
  };
}

/**
 * Assemble flat text context for text-only providers.
 */
export function assembleTextContext(messages: Message[]): { role: string; content: string }[] {
  return messages.map((m) => ({
    role: m.role,
    content: extractText(m.content),
  }));
}

/**
 * Strip non-text content for providers that don't support multimodal.
 */
export function stripToText(messages: Message[]): Message[] {
  return messages.map((m) => ({
    ...m,
    content: m.content.filter(
      (c): c is { type: 'text'; text: string } => c.type === 'text'
    ),
  }));
}
