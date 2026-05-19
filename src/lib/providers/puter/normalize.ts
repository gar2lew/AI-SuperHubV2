import type { Message, AIChunk, ContentPart } from '@/types';
import { trackObjectUrlCreated } from '@/lib/diagnostics/resourceTracker';
import { toPuterMessages, type PuterStreamChunk } from './types';

export interface NormalizedImageArtifact {
  id: string;
  type: 'image';
  url: string;
  prompt?: string;
  model?: string;
  createdAt: number;
}

export interface NormalizedTTSArtifact {
  id: string;
  type: 'audio';
  url: string;
  blob?: Blob;
  voice?: string;
  createdAt: number;
}

function artifactId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function responseText(response: unknown): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    const candidate = record.text || record.message || record.content || record.response;
    if (typeof candidate === 'string') return candidate;
  }
  return String(response ?? '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function imageElementSrc(response: unknown): string {
  if (typeof HTMLImageElement !== 'undefined' && response instanceof HTMLImageElement) {
    return response.currentSrc || response.src;
  }

  if (
    isRecord(response) &&
    typeof response.tagName === 'string' &&
    response.tagName.toLowerCase() === 'img' &&
    typeof response.src === 'string'
  ) {
    return response.src;
  }

  return '';
}

function firstImageUrl(response: unknown): string {
  if (!response) return '';

  if (typeof response === 'string') {
    return response.startsWith('data:') || response.startsWith('blob:') || /^https?:\/\//.test(response)
      ? response
      : `data:image/png;base64,${response}`;
  }

  if (response instanceof Blob) {
    const objectUrl = URL.createObjectURL(response);
    trackObjectUrlCreated(objectUrl);
    return objectUrl;
  }

  const elementSrc = imageElementSrc(response);
  if (elementSrc) return elementSrc;

  if (Array.isArray(response)) {
    for (const item of response) {
      const url = firstImageUrl(item);
      if (url) return url;
    }
    return '';
  }

  if (!isRecord(response)) return '';

  for (const key of ['url', 'src', 'image', 'image_url', 'dataUrl', 'data_url', 'b64_json', 'base64']) {
    const candidate = response[key];
    if (typeof candidate === 'string') {
      return candidate.startsWith('data:') || candidate.startsWith('blob:') || /^https?:\/\//.test(candidate)
        ? candidate
        : `data:image/png;base64,${candidate}`;
    }
  }

  for (const key of ['data', 'images', 'output', 'result']) {
    const url = firstImageUrl(response[key]);
    if (url) return url;
  }

  return '';
}

export function normalizePuterChunk(chunk: unknown, sequence?: number): AIChunk {
  if (!chunk) {
    return { type: 'status', content: 'empty', metadata: { sequence } };
  }

  if (typeof chunk === 'string') {
    return { type: 'text', content: chunk };
  }

  const record = chunk as PuterStreamChunk & Record<string, unknown>;
  if (record.done) {
    return { type: 'status', content: 'done', metadata: { sequence } };
  }

  const text = record.text || record.content || record.delta || record.message;
  if (typeof text === 'string') {
    return { type: 'text', content: text };
  }

  const status = record.status || record.type || 'event';
  return {
    type: 'status',
    content: String(status),
    metadata: { sequence },
  };
}

export function normalizePuterResponse(response: unknown): ContentPart[] {
  const text = responseText(response);
  return text ? [{ type: 'text', text }] : [];
}

export function normalizeVisionResponse(response: unknown): ContentPart[] {
  return normalizePuterResponse(response);
}

export function normalizeTTSResponse(response: unknown, voice?: string): NormalizedTTSArtifact {
  const blob = response instanceof Blob ? response : undefined;
  const url = typeof response === 'string'
    ? response
    : blob
      ? URL.createObjectURL(blob)
      : response && typeof response === 'object' && typeof (response as { url?: unknown }).url === 'string'
        ? String((response as { url: string }).url)
        : '';
  if (blob) trackObjectUrlCreated(url);

  return {
    id: artifactId('audio'),
    type: 'audio',
    url,
    blob,
    voice,
    createdAt: Date.now(),
  };
}

export function normalizeImageResponse(
  response: unknown,
  prompt?: string,
  model?: string
): NormalizedImageArtifact {
  const url = firstImageUrl(response);

  if (!url) {
    throw new Error('Puter image response did not include a renderable image URL');
  }

  return {
    id: artifactId('image'),
    type: 'image',
    url,
    prompt,
    model,
    createdAt: Date.now(),
  };
}

export function normalizeChunk(chunk: unknown): AIChunk {
  return normalizePuterChunk(chunk);
}

export function normalizeResponse(response: unknown): ContentPart[] {
  return normalizePuterResponse(response);
}

export function formatMessages(messages: Message[]): ReturnType<typeof toPuterMessages> {
  return toPuterMessages(messages);
}

export function extractSystemPrompt(messages: Message[]): string | undefined {
  const system = messages.find((m) => m.role === 'system');
  if (!system) return undefined;
  return system.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}
