import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ContentPart, AIChunk } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function findLast<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return undefined;
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

// ============================================================
// Message Content Helpers
// ============================================================

/** Extract plain text from a message's content parts */
export function extractText(content: ContentPart[]): string {
  return content
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** Create a text-only content part array */
export function textContent(text: string): ContentPart[] {
  return [{ type: 'text', text }];
}

/** Check if message has any non-text content */
export function isMultimodal(content: ContentPart[]): boolean {
  return content.some((part) => part.type !== 'text');
}

/** Get all image parts from content */
export function extractImages(content: ContentPart[]): Extract<ContentPart, { type: 'image' }>[] {
  return content.filter((part): part is Extract<ContentPart, { type: 'image' }> => part.type === 'image');
}

/** Get all file parts from content */
export function extractFiles(content: ContentPart[]): Extract<ContentPart, { type: 'file' }>[] {
  return content.filter((part): part is Extract<ContentPart, { type: 'file' }> => part.type === 'file');
}

/** Build a display title from message content */
export function messageToTitle(content: ContentPart[]): string {
  const text = extractText(content);
  return truncate(text, 50) || 'New Conversation';
}

// ============================================================
// Streaming Helpers
// ============================================================

/** Concatenate text chunks into a single string */
export function chunksToText(chunks: AIChunk[]): string {
  return chunks
    .filter((c): c is Extract<AIChunk, { type: 'text' }> => c.type === 'text')
    .map((c) => c.content)
    .join('');
}

/** Extract reasoning content from chunks */
export function chunksToReasoning(chunks: AIChunk[]): string {
  return chunks
    .filter((c): c is Extract<AIChunk, { type: 'reasoning' }> => c.type === 'reasoning')
    .map((c) => c.content)
    .join('');
}

/** Check if any chunk is a tool call */
export function hasToolCalls(chunks: AIChunk[]): boolean {
  return chunks.some((c) => c.type === 'tool_call');
}

/** Convert AIChunk array to ContentPart array for final message */
export function finalizeChunks(chunks: AIChunk[]): ContentPart[] {
  const text = chunksToText(chunks);
  return text ? textContent(text) : [];
}

/** Copy message content to clipboard */
export async function copyMessageContent(content: ContentPart[]): Promise<void> {
  const text = extractText(content);
  await navigator.clipboard.writeText(text);
}
