import type { ContentPart } from '@/types';
import { normalizeImageResponse, normalizeVisionResponse } from './normalize';
import { safePuterChat, safePuterImage } from './runtime';

export interface ImageGenerationOptions {
  model?: string;
  width?: number;
  height?: number;
}

export type ImageGenerationEvent =
  | { type: 'status'; content: string }
  | { type: 'artifact'; artifact: ReturnType<typeof normalizeImageResponse> };

export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<string> {
  const artifact = normalizeImageResponse(await safePuterImage(prompt, options), prompt, options.model);
  return artifact.url;
}

export async function* streamImageGeneration(
  prompt: string,
  options: ImageGenerationOptions = {}
): AsyncGenerator<ImageGenerationEvent> {
  yield { type: 'status', content: 'queued' };
  const response = await safePuterImage(prompt, options);
  yield { type: 'artifact', artifact: normalizeImageResponse(response, prompt, options.model) };
  yield { type: 'status', content: 'done' };
}

export async function visionChat(messages: unknown[]): Promise<string> {
  const response = await safePuterChat(messages as never, { stream: false });
  return normalizeVisionResponse(response)
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
