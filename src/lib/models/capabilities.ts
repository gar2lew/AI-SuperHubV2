import type { Capability, AIModel } from '@/types';

export const ALL_CAPABILITIES: Capability[] = [
  'chat',
  'vision',
  'image',
  'coding',
  'reasoning',
  'research',
  'tts',
  'stt',
  'tools',
];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  chat: 'Chat',
  vision: 'Vision',
  image: 'Image',
  coding: 'Coding',
  reasoning: 'Reasoning',
  research: 'Research',
  tts: 'Text-to-Speech',
  stt: 'Speech-to-Text',
  tools: 'Tools',
};

/** Check if a model supports a specific capability. */
export function supportsCapability(model: AIModel | undefined, capability: Capability): boolean {
  if (!model) return false;
  return model.capabilities.includes(capability);
}

/** Check if a model supports ALL required capabilities. */
export function supportsAllCapabilities(
  model: AIModel | undefined,
  required: Capability[]
): boolean {
  if (!model) return false;
  return required.every((c) => model.capabilities.includes(c));
}

/** Check if a model supports ANY of the required capabilities. */
export function supportsAnyCapability(
  model: AIModel | undefined,
  required: Capability[]
): boolean {
  if (!model) return false;
  return required.some((c) => model.capabilities.includes(c));
}

/** Guard: throw if model doesn't support required capability. */
export function guardCapability(
  model: AIModel | undefined,
  capability: Capability,
  action: string
): void {
  if (!supportsCapability(model, capability)) {
    throw new Error(
      `Model ${model?.label || 'unknown'} does not support ${CAPABILITY_LABELS[capability]}. Cannot ${action}.`
    );
  }
}

/** Get human-readable capability list for a model. */
export function getCapabilityLabels(model: AIModel): string[] {
  return model.capabilities.map((c) => CAPABILITY_LABELS[c]);
}
