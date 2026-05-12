// ============================================================
// MULTIMODAL AI RUNTIME — TYPE SYSTEM
// ============================================================

// --------------------------------------------------
// Content Parts (multimodal message building blocks)
// --------------------------------------------------

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  url?: string;
  file?: File;
  mimeType?: string;
}

export interface AudioPart {
  type: 'audio';
  url?: string;
  file?: File;
  mimeType?: string;
}

export interface FilePart {
  type: 'file';
  file?: File;
  url?: string;
  name?: string;
  mimeType?: string;
}

export type ContentPart = TextPart | ImagePart | AudioPart | FilePart;

// --------------------------------------------------
// AI Chunk (normalized streaming events)
// --------------------------------------------------

export interface TextChunk {
  type: 'text';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ReasoningChunk {
  type: 'reasoning';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallChunk {
  type: 'tool_call';
  content: string;
  metadata: {
    toolId: string;
    arguments?: Record<string, unknown>;
  };
}

export interface ToolResultChunk {
  type: 'tool_result';
  content: string;
  metadata: {
    toolId: string;
    result?: unknown;
  };
}

export interface StatusChunk {
  type: 'status';
  content: string;
  metadata?: Record<string, unknown>;
}

export type AIChunk = TextChunk | ReasoningChunk | ToolCallChunk | ToolResultChunk | StatusChunk;

// --------------------------------------------------
// ToolCall
// --------------------------------------------------

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolCall {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  startedAt?: number;
  finishedAt?: number;
}

// --------------------------------------------------
// Message Metadata
// --------------------------------------------------

export interface MessageMetadata {
  provider?: string;
  model?: string;
  preset?: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  attachments?: string[];
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
}

// --------------------------------------------------
// Message (multimodal)
// --------------------------------------------------

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  role: MessageRole;
  content: ContentPart[];
  metadata?: MessageMetadata;
  createdAt: number;
}

// --------------------------------------------------
// Conversation
// --------------------------------------------------

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  presetId: string;
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  // Stream state is isolated per-conversation for future parallel chats
  streaming?: {
    isActive: boolean;
    buffer: AIChunk[];
    startedAt: number;
    providerId: string;
    modelId: string;
    streamId?: string;
    lastSequence?: number;
  };
}

// --------------------------------------------------
// Capabilities
// --------------------------------------------------

export type Capability =
  | 'chat'
  | 'vision'
  | 'coding'
  | 'reasoning'
  | 'research'
  | 'tts'
  | 'stt'
  | 'tools';

// --------------------------------------------------
// Model Registry
// --------------------------------------------------

export type ModelTier = 'fast' | 'balanced' | 'advanced' | 'reasoning';

export interface AIModel {
  id: string;
  label: string;
  provider: string;
  capabilities: Capability[];
  tier: ModelTier;
  multimodal?: boolean;
  contextWindow?: number;
  languages?: string[];
  specializations?: string[];
  fallbacks?: string[];
  tags?: string[];
}

// --------------------------------------------------
// Presets
// --------------------------------------------------

export interface ModelPreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  primary: string;
  fallbacks: string[];
  capabilities: Capability[];
}

// --------------------------------------------------
// Provider
// --------------------------------------------------

export interface AIProviderConfig {
  id: string;
  name: string;
  description: string;
  models: LegacyModel[];
  isEnabled: boolean;
  apiKey?: string;
  baseUrl?: string;
}

/** @deprecated Use AIModel from model registry instead */
export interface LegacyModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
}

// --------------------------------------------------
// Provider Health
// --------------------------------------------------

export interface ProviderHealth {
  providerId: string;
  latencyMs: number;
  failures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  disabled: boolean;
  disabledUntil: number | null;
}

// --------------------------------------------------
// Settings
// --------------------------------------------------

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  autoScroll: boolean;
  showTimestamps: boolean;
  persistConversations: boolean;
  experimentalFeatures: Record<string, boolean>;
  providerSettings: Record<string, Record<string, string>>;
}

// --------------------------------------------------
// Tools
// --------------------------------------------------

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler?: (args: Record<string, unknown>) => Promise<unknown>;
}

// --------------------------------------------------
// Legacy compatibility
// --------------------------------------------------

/** @deprecated Use ContentPart[] instead */
export interface Attachment {
  id: string;
  type: 'image' | 'pdf' | 'txt' | 'md' | 'code' | 'generic';
  name: string;
  size: number;
  url?: string;
  content?: string;
}

/** @deprecated Use AIChunk instead */
export interface StreamChunk {
  content: string;
  done: boolean;
}

export type ProviderId = 'puter' | 'openai' | 'anthropic' | 'ollama' | 'openrouter';
