import type { AIChunk } from '@/types';

/**
 * Placeholder for Puter.js TTS (Text-to-Speech).
 * Future: puter.ai.txt2speech(text, { voice: '...' })
 */
export async function textToSpeech(_text: string, _options?: { voice?: string }): Promise<Blob> {
  throw new Error('TTS not yet implemented');
}

/**
 * Placeholder for Puter.js STT (Speech-to-Text).
 * Future: puter.ai.speech2txt(audioBlob)
 */
export async function speechToText(_audio: Blob): Promise<string> {
  throw new Error('STT not yet implemented');
}

/**
 * Streaming STT adapter.
 * Future: yield partial transcriptions as they arrive.
 */
export async function* streamSpeechToText(_audio: Blob): AsyncGenerator<AIChunk> {
  throw new Error('Streaming STT not yet implemented');
}
