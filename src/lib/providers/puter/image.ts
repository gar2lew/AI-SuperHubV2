import type { ContentPart } from '@/types';
import { recordClientError } from '@/lib/diagnostics/client-errors';
import { resolveProviderRuntimeModelId } from '@/lib/models/runtime-ids';
import { recordFailure, recordSuccess } from '@/lib/providers/health';
import { normalizeImageResponse, normalizeVisionResponse } from './normalize';
import { safePuterChat, safePuterImage } from './runtime';

export interface ImageGenerationOptions {
  model?: string;
  width?: number;
  height?: number;
  abortSignal?: AbortSignal;
  quality?: string;
  provider?: string;
}

export type ImageGenerationEvent =
  | { type: 'status'; content: string }
  | { type: 'artifact'; artifact: ReturnType<typeof normalizeImageResponse> };

export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<string> {
  const artifact = normalizeImageArtifact(await requestPuterImage(prompt, options), prompt, options.model);
  return artifact.url;
}

export async function* streamImageGeneration(
  prompt: string,
  options: ImageGenerationOptions = {}
): AsyncGenerator<ImageGenerationEvent> {
  yield { type: 'status', content: 'queued' };
  if (options.abortSignal?.aborted) {
    yield { type: 'status', content: 'aborted' };
    return;
  }

  yield { type: 'status', content: 'generating' };
  const response = await requestPuterImage(prompt, options);
  if (options.abortSignal?.aborted) {
    yield { type: 'status', content: 'aborted' };
    return;
  }

  yield { type: 'artifact', artifact: normalizeImageArtifact(response, prompt, options.model) };
  yield { type: 'status', content: 'done' };
}

function normalizeImageArtifact(response: unknown, prompt: string, model?: string) {
  try {
    return normalizeImageResponse(response, prompt, model);
  } catch (error) {
    recordClientError({
      source: 'provider-call',
      error,
      context: {
        providerId: 'puter',
        operation: 'image-normalize',
        model,
      },
    });
    recordFailure('puter');
    throw error;
  }
}

export async function visionChat(messages: unknown[]): Promise<string> {
  const response = await safePuterChat(messages as never, { stream: false });
  return normalizeVisionResponse(response)
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

async function requestPuterImage(prompt: string, options: ImageGenerationOptions) {
  const startedAt = Date.now();
  const { abortSignal, width, height, ...puterOptions } = options;
  const requestOptions: Record<string, unknown> = {
    ...puterOptions,
    ...(typeof puterOptions.model === 'string'
      ? { model: resolveProviderRuntimeModelId(puterOptions.model, 'puter', 'gpt-image-1-mini') }
      : {}),
    ...(typeof width === 'number' && typeof height === 'number' ? { ratio: { w: width, h: height } } : {}),
  };

  try {
    const response = await safePuterImage(prompt, requestOptions);
    if (abortSignal?.aborted) {
      throw new DOMException('Image generation aborted', 'AbortError');
    }
    recordSuccess('puter', Date.now() - startedAt);
    return response;
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      recordFailure('puter');
    }
    throw error;
  }
}
