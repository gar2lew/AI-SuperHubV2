import type { AIModel } from '@/types';
import { modelRegistry } from './registry';

export type RuntimeCapability =
  | 'realtimeWeb'
  | 'streaming'
  | 'vision'
  | 'imageGeneration'
  | 'speechToText'
  | 'textToSpeech'
  | 'tools'
  | 'reasoning'
  | 'coding'
  | 'research'
  | 'fileSupport'
  | 'structuredOutput';

export interface ModelCapabilityProfile {
  modelId: string;
  providerId: string;
  label: string;
  capabilities: Record<RuntimeCapability, boolean>;
  realtimeWeb: boolean;
  streaming: boolean;
  vision: boolean;
  imageGeneration: boolean;
  speechToText: boolean;
  textToSpeech: boolean;
  tools: boolean;
  reasoning: boolean;
  coding: boolean;
  research: boolean;
  fileSupport: boolean;
  structuredOutput: boolean;
  maxContext: number;
  fallbackEligible: boolean;
}

export interface CapabilitySummary {
  modelId: string;
  label: string;
  supported: RuntimeCapability[];
  missing: RuntimeCapability[];
  maxContext: number;
  fallbackEligible: boolean;
}

export interface CapabilityIntent {
  requiresWebAccess: boolean;
  requiredCapabilities: RuntimeCapability[];
  orchestrationMode: 'standard-chat' | 'web-query' | 'media-generation' | 'voice' | 'tool-eligible';
  reasons: string[];
}

export const RUNTIME_CAPABILITY_LABELS: Record<RuntimeCapability, string> = {
  realtimeWeb: 'Realtime web',
  streaming: 'Streaming',
  vision: 'Vision',
  imageGeneration: 'Image generation',
  speechToText: 'Speech-to-text',
  textToSpeech: 'Text-to-speech',
  tools: 'Tools',
  reasoning: 'Reasoning',
  coding: 'Coding',
  research: 'Research',
  fileSupport: 'Files',
  structuredOutput: 'Structured output',
};

const WEB_INTENT_PATTERN = /\b(today|current|latest|now|news|weather|forecast|stock|price|prices|exchange rate|score|scores|recent)\b/i;
const TOOL_INTENT_PATTERN = /\b(tool|function|json schema|structured|call)\b/i;
const IMAGE_INTENT_PATTERN = /\b(generate|create|draw|render)\b.*\b(image|picture|illustration|photo)\b/i;
const VOICE_INTENT_PATTERN = /\b(transcribe|speech|voice|audio|tts|stt)\b/i;

function modelFromId(modelOrId: AIModel | string | undefined): AIModel | undefined {
  return typeof modelOrId === 'string' ? modelRegistry.get(modelOrId) : modelOrId;
}

function providerHasWebAccess(providerId: string) {
  return providerId === 'puter' || providerId === 'openai' || providerId === 'anthropic' || providerId === 'openrouter';
}

export function getModelCapabilities(modelOrId: AIModel | string | undefined): ModelCapabilityProfile | undefined {
  const model = modelFromId(modelOrId);
  if (!model) return undefined;
  const has = (capability: string) => model.capabilities.includes(capability as never);
  const imageGeneration = has('image');
  const textToSpeech = has('tts');
  const speechToText = has('stt');
  const tools = has('tools');
  const research = has('research');
  const reasoning = has('reasoning');
  const coding = has('coding');
  const vision = has('vision') || !!model.multimodal;
  const capabilities: Record<RuntimeCapability, boolean> = {
    realtimeWeb: providerHasWebAccess(model.provider) && (research || tools || model.provider === 'puter') && !imageGeneration,
    streaming: has('chat'),
    vision,
    imageGeneration,
    speechToText,
    textToSpeech,
    tools,
    reasoning,
    coding,
    research,
    fileSupport: vision || tools,
    structuredOutput: tools || model.provider === 'openai' || model.provider === 'puter',
  };
  return {
    modelId: model.id,
    providerId: model.provider,
    label: model.label,
    capabilities,
    ...capabilities,
    maxContext: model.contextWindow ?? 0,
    fallbackEligible: Boolean(model.fallbacks?.length) || has('chat') || imageGeneration,
  };
}

export function supportsRuntimeCapability(modelOrId: AIModel | string | undefined, capability: RuntimeCapability): boolean {
  return Boolean(getModelCapabilities(modelOrId)?.[capability]);
}

export function supportsCapability(modelOrId: AIModel | string | undefined, capability: RuntimeCapability): boolean {
  return supportsRuntimeCapability(modelOrId, capability);
}

export function getMissingCapabilities(modelOrId: AIModel | string | undefined, required: RuntimeCapability[]): RuntimeCapability[] {
  return required.filter((capability) => !supportsRuntimeCapability(modelOrId, capability));
}

export function getCapabilitySummary(modelId: string, required: RuntimeCapability[] = []): CapabilitySummary {
  const profile = getModelCapabilities(modelId);
  const supported = Object.keys(RUNTIME_CAPABILITY_LABELS).filter((capability) =>
    profile?.[capability as RuntimeCapability]
  ) as RuntimeCapability[];
  return {
    modelId,
    label: supported.map((capability) => RUNTIME_CAPABILITY_LABELS[capability]).join(', '),
    supported,
    missing: getMissingCapabilities(modelId, required),
    maxContext: profile?.maxContext ?? 0,
    fallbackEligible: profile?.fallbackEligible ?? false,
  };
}

export function resolveCapabilityFallbacks(modelId: string, required: RuntimeCapability[]): ModelCapabilityProfile[] {
  const preferred = new Set(modelRegistry.resolveFallbackChain(modelId));
  const preferredMatches = Array.from(preferred)
    .map((id) => getModelCapabilities(id))
    .filter((profile): profile is ModelCapabilityProfile => Boolean(profile))
    .filter((profile) => required.every((capability) => profile[capability]));
  const globalMatches = modelRegistry
    .getAll()
    .map((model) => getModelCapabilities(model))
    .filter((profile): profile is ModelCapabilityProfile => Boolean(profile))
    .filter((profile) => !preferred.has(profile.modelId))
    .filter((profile) => profile.fallbackEligible && required.every((capability) => profile[capability]));
  return [...preferredMatches, ...globalMatches];
}

export function detectCapabilityIntent(prompt: string): CapabilityIntent {
  const reasons: string[] = [];
  const requiredCapabilities: RuntimeCapability[] = ['streaming'];
  let orchestrationMode: CapabilityIntent['orchestrationMode'] = 'standard-chat';
  if (WEB_INTENT_PATTERN.test(prompt)) {
    requiredCapabilities.push('realtimeWeb');
    reasons.push('prompt references current or realtime information');
    orchestrationMode = 'web-query';
  }
  if (TOOL_INTENT_PATTERN.test(prompt)) {
    requiredCapabilities.push('tools');
    reasons.push('prompt is eligible for structured tool execution');
    orchestrationMode = 'tool-eligible';
  }
  if (IMAGE_INTENT_PATTERN.test(prompt)) {
    requiredCapabilities.splice(0, requiredCapabilities.length, 'imageGeneration');
    reasons.push('prompt requests image generation');
    orchestrationMode = 'media-generation';
  }
  if (VOICE_INTENT_PATTERN.test(prompt)) {
    requiredCapabilities.splice(0, requiredCapabilities.length, 'speechToText');
    reasons.push('prompt references voice or audio processing');
    orchestrationMode = 'voice';
  }
  const requiresWebAccess = requiredCapabilities.includes('realtimeWeb');
  return {
    requiresWebAccess,
    requiredCapabilities: Array.from(new Set(requiredCapabilities)),
    orchestrationMode,
    reasons,
  };
}
