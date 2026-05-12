import { BaseProvider, ProviderError } from '@/lib/providers/base';
import { puterChat, puterStream, getPuterProviderStatus } from './chat';
import { textToSpeech, speechToText } from './speech';
import { generateImage, visionChat } from './image';
import { normalizeResponse, formatMessages } from './normalize';
import { isPuterAvailable, waitForPuter } from './runtime';
import type { Message, AIChunk, LegacyModel } from '@/types';

const PUTER_MODELS: LegacyModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI GPT-4o via Puter.js',
    contextWindow: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'Anthropic Claude Sonnet via Puter.js',
    contextWindow: 200000,
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
];

/**
 * Puter.js AI Provider.
 * Uses real puter.ai.chat() when available, falls back to mock.
 */
export class PuterProvider extends BaseProvider {
  readonly id = 'puter';
  readonly name = 'Puter';
  readonly description = 'AI via Puter.js — free tier available';
  readonly models = PUTER_MODELS;
  readonly isEnabled = true;

  validateConfig(): boolean {
    return isPuterAvailable();
  }

  // --- Chat ---

  async chat(messages: Message[]): Promise<string> {
    return puterChat(messages);
  }

  async *stream(messages: Message[], abortSignal?: AbortSignal): AsyncGenerator<AIChunk> {
    yield* puterStream(messages, abortSignal);
  }

  // --- Speech ---

  async tts(text: string, options?: { voice?: string }): Promise<Blob> {
    if (!isPuterAvailable()) {
      throw new ProviderError('Puter.js not available for TTS', this.id, 'NOT_AVAILABLE');
    }
    return textToSpeech(text, options);
  }

  async stt(audio: Blob): Promise<string> {
    if (!isPuterAvailable()) {
      throw new ProviderError('Puter.js not available for STT', this.id, 'NOT_AVAILABLE');
    }
    return speechToText(audio);
  }

  // --- Image ---

  async generateImage(prompt: string, options?: { width?: number; height?: number }): Promise<string> {
    if (!isPuterAvailable()) {
      throw new ProviderError('Puter.js not available for image generation', this.id, 'NOT_AVAILABLE');
    }
    return generateImage(prompt, options);
  }

  async vision(messages: unknown[]): Promise<string> {
    if (!isPuterAvailable()) {
      throw new ProviderError('Puter.js not available for vision', this.id, 'NOT_AVAILABLE');
    }
    return visionChat(messages);
  }
}

// Re-exports
export { puterChat, puterStream, textToSpeech, speechToText, generateImage, visionChat };
export { normalizeResponse, formatMessages };
export { isPuterAvailable, waitForPuter, getPuterProviderStatus };
