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
  name?: string;
  size?: number;
  lastModified?: number;
  mimeType?: string;
  persistenceState?: 'available' | 'metadata-only' | 'missing';
}

export interface AudioPart {
  type: 'audio';
  url?: string;
  file?: File;
  name?: string;
  size?: number;
  lastModified?: number;
  mimeType?: string;
  persistenceState?: 'available' | 'metadata-only' | 'missing';
}

export interface FilePart {
  type: 'file';
  file?: File;
  url?: string;
  name?: string;
  size?: number;
  lastModified?: number;
  mimeType?: string;
  persistenceState?: 'available' | 'metadata-only' | 'missing';
}

export type ContentPart = TextPart | ImagePart | AudioPart | FilePart;

// --------------------------------------------------
// AI Chunk (normalized streaming events)
// --------------------------------------------------

export interface AIChunkMetadata extends Record<string, unknown> {
  sequence?: number;
  streamId?: string;
  conversationId?: string;
}

export interface TextChunk {
  type: 'text';
  content: string;
  metadata?: AIChunkMetadata;
}

export interface ReasoningChunk {
  type: 'reasoning';
  content: string;
  metadata?: AIChunkMetadata;
}

export interface ToolCallChunk {
  type: 'tool_call';
  content: string;
  metadata: AIChunkMetadata & {
    toolId: string;
    arguments?: Record<string, unknown>;
  };
}

export interface ToolResultChunk {
  type: 'tool_result';
  content: string;
  metadata: AIChunkMetadata & {
    toolId: string;
    result?: unknown;
  };
}

export interface StatusChunk {
  type: 'status';
  content: string;
  metadata?: AIChunkMetadata;
}

export type AIChunk = TextChunk | ReasoningChunk | ToolCallChunk | ToolResultChunk | StatusChunk;

// --------------------------------------------------
// Stream Lifecycle
// --------------------------------------------------

export type StreamLifecycleState =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'tool-running'
  | 'fallback'
  | 'interrupted'
  | 'recovered'
  | 'completed'
  | 'failed';

export interface StreamLifecycleEvent {
  executionId?: string;
  capability?: ExecutionCapability;
  capabilityMetadata?: ExecutionCapabilityMetadata;
  parentExecutionId?: string | null;
  groupId?: string | null;
  type: StreamLifecycleState;
  at: number;
  providerId?: string;
  modelId?: string;
  status?: string;
  reason?: string;
}

export interface ActiveStreamState {
  streamId: string;
  executionId: string;
  conversationId: string;
  lifecycle: StreamLifecycleState;
  providerId: string;
  modelId: string;
  runtimeModelId?: string;
  startedAt: number;
  updatedAt: number;
  interruptedAt?: number;
  recoveryReason?: string;
  status?: string;
  partialText: string;
  timeline: StreamLifecycleEvent[];
}

export type ExecutionCapability =
  | 'chat-generation'
  | 'context-retrieval'
  | 'workspace-analysis'
  | 'tool-call'
  | 'system-task';

export interface ExecutionCapabilityMetadata {
  toolName?: string;
  toolStatus?: 'pending' | 'running' | 'success' | 'error';
  retrievalSourceCount?: number;
  retrievalLatency?: number;
  workspaceId?: string;
  analysisScope?: string;
}

export type ExecutionTraceEventType =
  | 'created'
  | 'started'
  | 'status'
  | 'fallback'
  | 'interrupted'
  | 'recovered'
  | 'completed'
  | 'failed'
  | 'dependency-attached'
  | 'retry-initiated'
  | 'governance-denied'
  | 'governance-timeout'
  | 'execution-blocked'
  | 'dependency-resolved'
  | 'execution-ready'
  | 'execution-scheduled'
  | 'execution-promoted';

export interface ExecutionTraceEvent {
  executionId: string;
  capability: ExecutionCapability;
  lifecycle: StreamLifecycleState;
  timestamp: number;
  eventType: ExecutionTraceEventType;
  providerId?: string;
  modelId?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionPolicy {
  maxRetries?: number;
  maxExecutionDurationMs?: number;
  maxChildExecutions?: number;
  maxDependencyDepth?: number;
  allowCapabilityFallback?: boolean;
  allowParallelChildren?: boolean;
}

export type ExecutionSchedulingState =
  | 'ready'
  | 'waiting'
  | 'blocked'
  | 'scheduled'
  | 'running'
  | 'completed';

export type ExecutionPriority =
  | 'critical'
  | 'high'
  | 'normal'
  | 'low';

export type ExecutionPipelineStage =
  | 'context-retrieval'
  | 'workspace-analysis'
  | 'tool-preparation'
  | 'tool-execution'
  | 'response-synthesis'
  | 'finalization';

export type ExecutionPipelineStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed';

export type ExecutionPipelineTraceEventType =
  | 'pipeline-created'
  | 'stage-started'
  | 'stage-completed'
  | 'stage-blocked'
  | 'stage-failed'
  | 'pipeline-completed'
  | 'pipeline-failed'
  | 'pipeline-governance-denied';

export interface ExecutionPipelineTraceEvent {
  pipelineId: string;
  eventType: ExecutionPipelineTraceEventType;
  timestamp: number;
  stage?: ExecutionPipelineStage | null;
  executionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionPipeline {
  pipelineId: string;
  stages: ExecutionPipelineStage[];
  currentStage: ExecutionPipelineStage | null;
  status: ExecutionPipelineStatus;
  executionIds: string[];
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  trace: ExecutionPipelineTraceEvent[];
}

export type ContextFrameScope =
  | 'conversation'
  | 'pipeline'
  | 'execution'
  | 'workspace'
  | 'tool';

export type ContextFrameTraceEventType =
  | 'frame-created'
  | 'frame-inherited'
  | 'context-propagated'
  | 'context-isolated'
  | 'context-governance-denied';

export interface ContextFramePolicy {
  maxInheritedDepth?: number;
  maxContextKeyCount?: number;
  restrictedPropagationScopes?: ContextFrameScope[];
}

export interface ContextFrameTraceEvent {
  frameId: string;
  eventType: ContextFrameTraceEventType;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ContextFrame {
  frameId: string;
  scope: ContextFrameScope;
  parentFrameId?: string | null;
  pipelineId?: string | null;
  executionId?: string | null;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
  contextKeys: string[];
  policy?: ContextFramePolicy;
  trace: ContextFrameTraceEvent[];
}

export interface ExecutionRuntime {
  executionId: string;
  messageId: string;
  parentExecutionId?: string | null;
  childExecutionIds?: string[];
  groupId?: string | null;
  dependencyExecutionIds?: string[];
  policy?: ExecutionPolicy;
  schedulingState: ExecutionSchedulingState;
  priority: ExecutionPriority;
  scheduledAt?: number;
  waitingOnExecutionIds?: string[];
  pipelineId?: string | null;
  pipelineStage?: ExecutionPipelineStage | null;
  capability: ExecutionCapability;
  capabilityMetadata?: ExecutionCapabilityMetadata;
  providerId?: string;
  modelId?: string;
  runtimeModelId?: string;
  lifecycle: StreamLifecycleState;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  retryCount: number;
  partialText?: string;
  metadata?: {
    recoveryReason?: string;
    fallbackReason?: string;
  };
  timeline: StreamLifecycleEvent[];
  trace: ExecutionTraceEvent[];
}

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
  executionId?: string;
  provider?: string;
  model?: string;
  runtimeModel?: string;
  preset?: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  attachments?: string[];
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  retryable?: boolean;
  retryPrompt?: string;
  failureKind?: 'timeout' | 'provider' | 'network';
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
  summary?: string;
  tags?: string[];
  pinnedContextIds?: string[];
  archivedAt?: number;
  recovery?: {
    status: 'clean' | 'interrupted' | 'failed';
    streamId?: string;
    providerId?: string;
    modelId?: string;
    interruptedAt: number;
    retryPrompt?: string;
  };
  // Stream state is isolated per-conversation for future parallel chats
  streaming?: {
    isActive: boolean;
    buffer: AIChunk[];
    startedAt: number;
    providerId: string;
    modelId: string;
    runtimeModelId?: string;
    retryPrompt?: string;
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
  | 'image'
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
  runtimeId?: string;
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

export type ModelProviderCategory =
  | 'preset'
  | 'openai'
  | 'anthropic'
  | 'local'
  | 'puter'
  | 'openrouter'
  | 'specialized';

export interface ModelMetadata {
  id: string;
  runtimeId?: string;
  providerName: string;
  modelName: string;
  category: ModelProviderCategory;
  capabilities: Capability[];
  multimodal: boolean;
  streaming: boolean;
  image: boolean;
  voice: boolean;
  codingOptimized: boolean;
  reasoningOptimized: boolean;
  providerBadge?: string;
  advanced?: boolean;
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
// Workspace Continuity
// --------------------------------------------------

export interface WorkspaceContextBlock {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  priority?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceMetadata {
  id: string;
  name: string;
  intent?: string;
  category?: string;
  tags?: string[];
  description?: string;
  summary?: string;
  pinnedContext: WorkspaceContextBlock[];
  preferences: {
    providerId?: ProviderId;
    modelId?: string;
    autoInjectPinnedContext: boolean;
  };
  createdAt: number;
  updatedAt: number;
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
