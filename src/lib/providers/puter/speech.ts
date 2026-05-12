import type { AIChunk } from '@/types';
import { normalizePuterResponse, normalizeTTSResponse } from './normalize';
import { safePuterSTT, safePuterTTS } from './runtime';

export interface SpeechOptions {
  voice?: string;
}

export async function textToSpeech(text: string, options: SpeechOptions = {}): Promise<Blob> {
  const artifact = normalizeTTSResponse(await safePuterTTS(text, options), options.voice);
  if (artifact.blob) return artifact.blob;
  const response = await fetch(artifact.url);
  return response.blob();
}

export async function textToSpeechArtifact(text: string, options: SpeechOptions = {}) {
  return normalizeTTSResponse(await safePuterTTS(text, options), options.voice);
}

export async function speechToText(audio: Blob): Promise<string> {
  const response = await safePuterSTT(audio);
  return normalizePuterResponse(response)
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export async function* streamSpeechToText(audio: Blob): AsyncGenerator<AIChunk> {
  yield { type: 'status', content: 'transcribing' };
  const text = await speechToText(audio);
  if (text) yield { type: 'text', content: text };
  yield { type: 'status', content: 'done' };
}
