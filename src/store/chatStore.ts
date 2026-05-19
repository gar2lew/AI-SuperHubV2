import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ActiveStreamState,
  Conversation,
  ContextFrame,
  ContextFramePolicy,
  ContextFrameScope,
  ContextFrameTraceEvent,
  ExecutionCapability,
  ExecutionCapabilityMetadata,
  ExecutionPipeline,
  ExecutionPipelineStage,
  ExecutionPipelineTraceEvent,
  ExecutionPolicy,
  ExecutionPriority,
  ExecutionSchedulingState,
  ExecutionTraceEvent,
  ExecutionTraceEventType,
  ExecutionRuntime,
  Message,
  AIChunk,
  ContentPart,
  StreamLifecycleEvent,
  StreamLifecycleState,
} from '@/types';
import { generateId, messageToTitle, finalizeChunks } from '@/lib/utils';
import { DEFAULT_PRESET_ID, resolvePresetToModel } from '@/lib/models/presets';
import { getChunkSequence, StreamEngine } from '@/lib/streaming/stream-engine';
import { recordSuccess, recordFailure } from '@/lib/providers/health';
import { recordProviderStreamInterruption } from '@/lib/providers/analytics';
import { formatProviderError } from '@/lib/providers/errors';

export interface DraftAttachmentMetadata {
  name: string;
  mimeType?: string;
  size?: number;
  lastModified?: number;
  persistenceState: 'metadata-only';
}

export interface ConversationDraft {
  text: string;
  attachments: DraftAttachmentMetadata[];
  updatedAt: number;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  drafts: Record<string, ConversationDraft>;
  isStreaming: boolean;
  activeStream: ActiveStreamState | null;
  lastStream: ActiveStreamState | null;
  activeExecutionId: string | null;
  executionsById: Record<string, ExecutionRuntime>;
  pipelinesById: Record<string, ExecutionPipeline>;
  contextFramesById: Record<string, ContextFrame>;
  activeContextFrameId: string | null;
  streamEngine: StreamEngine | null;
  abortController: AbortController | null;
  // Stream ownership for zombie prevention
  currentStreamId: string | null;

  // Actions
  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  archiveConversation: (id: string) => void;
  reopenConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  updateConversationMetadata: (id: string, updates: Pick<Conversation, 'summary' | 'tags'>) => void;
  setDraft: (conversationId: string, draft: { text: string; attachments?: Omit<DraftAttachmentMetadata, 'persistenceState'>[] }) => void;
  clearDraft: (conversationId: string) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'createdAt'> & { id?: string }) => string;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  createExecution: (input: {
    messageId?: string;
    parentExecutionId?: string | null;
    groupId?: string | null;
    dependencyExecutionIds?: string[];
    policy?: ExecutionPolicy;
    priority?: ExecutionPriority;
    schedulingState?: ExecutionSchedulingState;
    capability?: ExecutionCapability;
    capabilityMetadata?: ExecutionCapabilityMetadata;
    providerId?: string;
    modelId?: string;
    runtimeModelId?: string;
    retryCount?: number;
  }) => string;
  createToolExecution: (input?: {
    messageId?: string;
    toolName?: string;
    toolStatus?: ExecutionCapabilityMetadata['toolStatus'];
    providerId?: string;
    modelId?: string;
    runtimeModelId?: string;
    policy?: ExecutionPolicy;
  }) => string;
  createRetrievalExecution: (input?: {
    messageId?: string;
    retrievalSourceCount?: number;
    retrievalLatency?: number;
  }) => string;
  createWorkspaceExecution: (input?: {
    messageId?: string;
    workspaceId?: string;
    analysisScope?: string;
  }) => string;
  createChildExecution: (parentExecutionId: string, input?: {
    messageId?: string;
    capability?: ExecutionCapability;
    capabilityMetadata?: ExecutionCapabilityMetadata;
    providerId?: string;
    modelId?: string;
    runtimeModelId?: string;
    groupId?: string | null;
    policy?: ExecutionPolicy;
  }) => string;
  attachExecutionParent: (executionId: string, parentExecutionId: string | null) => void;
  attachExecutionDependency: (executionId: string, dependencyExecutionId: string) => void;
  attachExecutionToMessage: (executionId: string, messageId: string) => void;
  completeExecution: (executionId: string, partialText?: string) => void;
  failExecution: (executionId: string, reason: string) => void;
  interruptExecution: (executionId: string, reason: string) => void;
  recoverExecution: (executionId: string, reason: string) => void;
  retryExecution: (parentExecutionId: string, input?: {
    capability?: ExecutionCapability;
    capabilityMetadata?: ExecutionCapabilityMetadata;
    providerId?: string;
    modelId?: string;
    runtimeModelId?: string;
  }) => string;
  getActiveExecution: () => ExecutionRuntime | undefined;
  getExecutionsByCapability: (capability: ExecutionCapability) => ExecutionRuntime[];
  getLatestExecutionForMessage: (messageId: string) => ExecutionRuntime | undefined;
  getExecutionTimeline: (executionId?: string) => StreamLifecycleEvent[];
  getExecutionStatus: (executionId?: string) => string;
  getExecutionChildren: (executionId: string) => ExecutionRuntime[];
  getExecutionParent: (executionId: string) => ExecutionRuntime | undefined;
  getExecutionDescendants: (executionId: string) => ExecutionRuntime[];
  getExecutionGraph: (executionId: string) => ExecutionGraphNode | undefined;
  getExecutionTrace: (executionId: string) => ExecutionTraceEvent[];
  getExecutionSummary: (executionId: string) => ExecutionSummary | undefined;
  getExecutionGraphSummary: (executionId: string) => ExecutionGraphSummary | undefined;
  getExecutionStatusSnapshot: () => ExecutionStatusSnapshot;
  getActiveExecutionSummary: () => ExecutionSummary | undefined;
  canRetryExecution: (executionId: string) => GovernanceDecision;
  canCreateChildExecution: (parentExecutionId: string) => GovernanceDecision;
  canAttachDependency: (executionId: string, dependencyExecutionId: string) => GovernanceDecision;
  hasExceededExecutionBudget: (executionId: string) => boolean;
  hasExceededDepthLimit: (executionId: string, dependencyExecutionId: string) => boolean;
  enforceExecutionTimeout: (executionId: string) => void;
  getExecutionPolicySummary: (executionId: string) => ExecutionPolicySummary | undefined;
  getExecutionBudgetSummary: (executionId: string) => ExecutionBudgetSummary | undefined;
  getGovernanceViolations: (executionId: string) => ExecutionTraceEvent[];
  isExecutionReady: (executionId: string) => boolean;
  getBlockedExecutions: () => ExecutionRuntime[];
  getReadyExecutions: () => ExecutionRuntime[];
  scheduleExecution: (executionId: string) => void;
  markExecutionWaiting: (executionId: string, waitingOnExecutionIds: string[]) => void;
  resolveExecutionDependency: (executionId: string, dependencyExecutionId: string) => void;
  getExecutionPriorityQueue: () => ExecutionRuntime[];
  getSchedulingSnapshot: () => SchedulingSnapshot;
  getExecutionQueueSummary: () => ExecutionQueueSummary;
  getBlockedExecutionSummary: () => BlockedExecutionSummary[];
  getPriorityDistribution: () => Record<ExecutionPriority, number>;
  createPipeline: (stages: ExecutionPipelineStage[]) => string;
  advancePipelineStage: (pipelineId: string, expectedStage?: ExecutionPipelineStage) => void;
  attachExecutionToPipeline: (pipelineId: string, input: {
    capability: ExecutionCapability;
    stage: ExecutionPipelineStage;
    dependencyExecutionIds?: string[];
    priority?: ExecutionPriority;
    policy?: ExecutionPolicy;
  }) => string;
  attachExistingExecutionToPipeline: (pipelineId: string, executionId: string, stage: ExecutionPipelineStage) => void;
  completePipeline: (pipelineId: string) => void;
  failPipeline: (pipelineId: string, reason: string) => void;
  getPipelineExecutions: (pipelineId: string) => ExecutionRuntime[];
  getPipelineSummary: (pipelineId: string) => PipelineSummary | undefined;
  getPipelineStatusSnapshot: () => PipelineStatusSnapshot;
  getPipelineStageSummary: (pipelineId: string) => PipelineStageSummary[];
  getPipelineExecutionGraph: (pipelineId: string) => PipelineExecutionGraph | undefined;
  getActivePipelines: () => ExecutionPipeline[];
  createContextFrame: (input: {
    scope: ContextFrameScope;
    parentFrameId?: string | null;
    pipelineId?: string | null;
    executionId?: string | null;
    metadata?: Record<string, unknown>;
    contextKeys?: string[];
    policy?: ContextFramePolicy;
  }) => string;
  attachFrameToExecution: (frameId: string, executionId: string) => void;
  inheritContextFrame: (parentFrameId: string, input: {
    scope: ContextFrameScope;
    pipelineId?: string | null;
    executionId?: string | null;
    metadata?: Record<string, unknown>;
    contextKeys?: string[];
  }) => string;
  resolveExecutionContext: (executionId: string) => { frameIds: string[]; contextKeys: string[] };
  getPipelineContextFrames: (pipelineId: string) => ContextFrame[];
  getContextFrameHierarchy: (frameId: string) => ContextFrame[];
  getContextFrameSummary: (frameId: string) => ContextFrameSummary | undefined;
  getExecutionContextSummary: (executionId: string) => { executionId: string; frameIds: string[]; contextKeys: string[] };
  getPipelineContextSummary: (pipelineId: string) => PipelineContextSummary;
  getContextPropagationGraph: (frameId: string) => ContextPropagationGraph | undefined;
  getContextGovernanceViolations: (frameId: string) => ContextFrameTraceEvent[];
  startStreaming: (
    conversationId: string,
    providerId: string,
    modelId: string,
    runtimeModelId?: string,
    retryPrompt?: string
  ) => string;
  appendChunk: (chunk: AIChunk) => void;
  finalizeStream: (conversationId: string, streamId: string) => void;
  stopStreaming: () => void;
  setAbortController: (controller: AbortController | null) => void;
  getActiveConversation: () => Conversation | undefined;
  getMessages: (conversationId: string) => Message[];
  getStreamText: () => string;
  getStreamReasoning: () => string;
  getStreamStatus: () => string;
  getStreamLifecycle: () => StreamLifecycleState;
  getStreamTimeline: () => StreamLifecycleEvent[];
  beginStreaming: () => void;
  beginFallback: (providerId: string, status: string) => void;
  markInterrupted: (reason: string) => void;
  markRecovered: (reason: string) => void;
  failStream: (reason: string) => void;
  getCurrentStreamId: () => string | null;
}

interface ExecutionGraphNode {
  executionId: string;
  capability: ExecutionCapability;
  groupId?: string | null;
  parentExecutionId?: string | null;
  dependencyExecutionIds: string[];
  children: ExecutionGraphNode[];
}

interface ExecutionSummary {
  executionId: string;
  messageId: string;
  capability: ExecutionCapability;
  lifecycle: StreamLifecycleState;
  parentExecutionId?: string | null;
  groupId?: string | null;
  durationMs?: number;
  retryCount: number;
  childExecutionCount: number;
  dependencyCount: number;
  fallbackCount: number;
  interruptionCount: number;
  recoveryCount: number;
  fallbackLatencyMs?: number;
  timeToRecoveryMs?: number;
}

interface ExecutionGraphSummary {
  rootExecutionId: string;
  groupId?: string | null;
  totalExecutions: number;
  capabilities: ExecutionCapability[];
  dependencyEdges: Array<{ fromExecutionId: string; dependsOnExecutionId: string }>;
  stages: Array<{ executionId: string; depth: number; capability: ExecutionCapability; lifecycle: StreamLifecycleState }>;
}

interface ExecutionStatusSnapshot {
  activeExecutionId: string | null;
  activeLifecycle: StreamLifecycleState | null;
  totalExecutions: number;
  runningExecutions: number;
  failedExecutions: number;
  interruptedExecutions: number;
}

interface GovernanceDecision {
  allowed: boolean;
  reason?: string;
}

interface ExecutionPolicySummary {
  executionId: string;
  policy: ExecutionPolicy;
}

interface ExecutionBudgetSummary {
  executionId: string;
  retryCount: number;
  childExecutionCount: number;
  dependencyDepth: number;
  fallbackCount: number;
  durationMs: number;
  exceeded: boolean;
  exceededReasons: string[];
}

interface SchedulingSnapshot {
  totalExecutions: number;
  readyExecutions: number;
  waitingExecutions: number;
  scheduledExecutions: number;
  blockedExecutions: number;
  runningExecutions: number;
  completedExecutions: number;
}

interface ExecutionQueueSummary {
  queuedExecutionIds: string[];
  blockedExecutionIds: string[];
}

interface BlockedExecutionSummary {
  executionId: string;
  waitingOnExecutionIds: string[];
  dependencyCount: number;
}

interface PipelineSummary {
  pipelineId: string;
  status: ExecutionPipeline['status'];
  currentStage: ExecutionPipelineStage | null;
  executionCount: number;
  completedStageCount: number;
  blockedStageCount: number;
  failedStageCount: number;
}

interface PipelineStatusSnapshot {
  totalPipelines: number;
  runningPipelines: number;
  completedPipelines: number;
  failedPipelines: number;
  blockedPipelines: number;
}

interface PipelineStageSummary {
  stage: ExecutionPipelineStage;
  status: 'pending' | 'running' | 'blocked' | 'completed' | 'failed';
  executionIds: string[];
}

interface PipelineExecutionGraph {
  pipelineId: string;
  executionIds: string[];
  dependencyEdges: Array<{ fromExecutionId: string; dependsOnExecutionId: string }>;
}

interface ContextFrameSummary {
  frameId: string;
  scope: ContextFrameScope;
  inheritedDepth: number;
  contextKeyCount: number;
  inheritedContextKeys: string[];
  localContextKeys: string[];
}

interface PipelineContextSummary {
  pipelineId: string;
  frameIds: string[];
  propagatedContextKeys: string[];
  isolatedFrameIds: string[];
}

interface ContextPropagationGraph {
  frameId: string;
  descendants: ContextPropagationGraph[];
}

const createDefaultConversation = (): Conversation => ({
  id: generateId(),
  title: 'New Conversation',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  presetId: DEFAULT_PRESET_ID,
  providerId: 'puter',
  modelId: resolvePresetToModel(DEFAULT_PRESET_ID),
});

function generateStreamId(): string {
  return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function generatePipelineId(): string {
  return `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateContextFrameId(): string {
  return `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function serializeAttachmentMetadata(part: Extract<ContentPart, { type: 'image' | 'audio' | 'file' }>) {
  return {
    ...(part.type === 'file' ? { type: 'file' as const } : part.type === 'image' ? { type: 'image' as const } : { type: 'audio' as const }),
    ...(part.url ? { url: part.url } : {}),
    name: part.name ?? part.file?.name,
    mimeType: part.mimeType ?? part.file?.type,
    size: part.size ?? part.file?.size,
    lastModified: part.lastModified ?? part.file?.lastModified,
    persistenceState: 'metadata-only' as const,
  };
}

export function serializeContentForPersistence(content: ContentPart[]): ContentPart[] {
  return content.map((part) => {
    if (part.type === 'text') return part;
    return serializeAttachmentMetadata(part);
  });
}

function normalizeTags(tags: unknown): string[] {
  return Array.isArray(tags)
    ? Array.from(
        new Set(
          tags
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      )
    : [];
}

function createLifecycleEvent(
  type: StreamLifecycleState,
  activeStream: ActiveStreamState,
  details: Partial<StreamLifecycleEvent> = {}
): StreamLifecycleEvent {
  return {
    executionId: activeStream.executionId,
    groupId: undefined,
    type,
    at: Date.now(),
    providerId: activeStream.providerId,
    modelId: activeStream.modelId,
    ...details,
  };
}

function createExecutionEvent(
  type: StreamLifecycleState,
  execution: ExecutionRuntime,
  details: Partial<StreamLifecycleEvent> = {}
): StreamLifecycleEvent {
  return {
    executionId: execution.executionId,
    capability: execution.capability,
    capabilityMetadata: execution.capabilityMetadata,
    parentExecutionId: execution.parentExecutionId,
    groupId: execution.groupId,
    type,
    at: Date.now(),
    providerId: execution.providerId,
    modelId: execution.modelId,
    ...details,
  };
}

function capabilityStatus(capability: ExecutionCapability, lifecycle: StreamLifecycleState): string {
  if (lifecycle === 'failed') return 'Execution failed';
  if (lifecycle === 'interrupted') return 'Execution interrupted';
  if (lifecycle === 'completed') return '';
  if (lifecycle === 'recovered') return 'Recovering...';
  if (lifecycle === 'fallback') return 'Switching provider...';

  switch (capability) {
    case 'context-retrieval':
      return 'Retrieving workspace context...';
    case 'workspace-analysis':
      return 'Analyzing workspace...';
    case 'tool-call':
      return 'Calling tool...';
    case 'system-task':
      return 'Running system task...';
    case 'chat-generation':
    default:
      return 'Generating response...';
  }
}

function uniqueExistingIds(ids: string[] | undefined, executionsById: Record<string, ExecutionRuntime>): string[] {
  return Array.from(new Set(ids ?? [])).filter((id) => Boolean(executionsById[id]));
}

function collectChildIds(
  executionsById: Record<string, ExecutionRuntime>,
  executionId: string,
  visited = new Set<string>()
): string[] {
  if (visited.has(executionId)) return [];
  visited.add(executionId);
  const execution = executionsById[executionId];
  if (!execution) return [];
  return uniqueExistingIds(execution.childExecutionIds, executionsById).flatMap((childId) => [
    childId,
    ...collectChildIds(executionsById, childId, visited),
  ]);
}

function dependencyHasPath(
  executionsById: Record<string, ExecutionRuntime>,
  fromExecutionId: string,
  targetExecutionId: string,
  visited = new Set<string>()
): boolean {
  if (fromExecutionId === targetExecutionId) return true;
  if (visited.has(fromExecutionId)) return false;
  visited.add(fromExecutionId);
  const execution = executionsById[fromExecutionId];
  if (!execution) return false;
  return uniqueExistingIds(execution.dependencyExecutionIds, executionsById).some((dependencyId) =>
    dependencyHasPath(executionsById, dependencyId, targetExecutionId, visited)
  );
}

function dependencyDepth(
  executionsById: Record<string, ExecutionRuntime>,
  executionId: string,
  visited = new Set<string>()
): number {
  if (visited.has(executionId)) return 0;
  visited.add(executionId);
  const execution = executionsById[executionId];
  const dependencies = uniqueExistingIds(execution?.dependencyExecutionIds, executionsById);
  if (dependencies.length === 0) return 0;
  return 1 + Math.max(...dependencies.map((dependencyId) => dependencyDepth(executionsById, dependencyId, new Set(visited))));
}

function buildExecutionGraph(
  executionsById: Record<string, ExecutionRuntime>,
  executionId: string,
  visited = new Set<string>()
): ExecutionGraphNode | undefined {
  if (visited.has(executionId)) return undefined;
  const execution = executionsById[executionId];
  if (!execution) return undefined;
  visited.add(executionId);
  return {
    executionId,
    capability: execution.capability,
    groupId: execution.groupId,
    parentExecutionId: execution.parentExecutionId,
    dependencyExecutionIds: uniqueExistingIds(execution.dependencyExecutionIds, executionsById),
    children: uniqueExistingIds(execution.childExecutionIds, executionsById)
      .map((childId) => buildExecutionGraph(executionsById, childId, visited))
      .filter((node): node is ExecutionGraphNode => Boolean(node)),
  };
}

function createTraceEvent(
  execution: ExecutionRuntime,
  eventType: ExecutionTraceEventType,
  metadata?: Record<string, unknown>
): ExecutionTraceEvent {
  return {
    executionId: execution.executionId,
    capability: execution.capability,
    lifecycle: execution.lifecycle,
    timestamp: Date.now(),
    eventType,
    providerId: execution.providerId,
    modelId: execution.modelId,
    ...(metadata ? { metadata } : {}),
  };
}

function traceTypeForLifecycle(lifecycle: StreamLifecycleState): ExecutionTraceEventType {
  switch (lifecycle) {
    case 'fallback':
      return 'fallback';
    case 'interrupted':
      return 'interrupted';
    case 'recovered':
      return 'recovered';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'status';
  }
}

function summarizeExecution(execution: ExecutionRuntime | undefined): ExecutionSummary | undefined {
  if (!execution) return undefined;
  const trace = execution.trace ?? [];
  const completedTrace = [...trace].reverse().find((event) =>
    event.eventType === 'completed' || event.eventType === 'failed' || event.eventType === 'interrupted'
  );
  const fallbackTrace = trace.find((event) => event.eventType === 'fallback');
  const interruptedTrace = trace.find((event) => event.eventType === 'interrupted');
  const recoveredTrace = trace.find((event) => event.eventType === 'recovered');
  return {
    executionId: execution.executionId,
    messageId: execution.messageId,
    capability: execution.capability,
    lifecycle: execution.lifecycle,
    parentExecutionId: execution.parentExecutionId,
    groupId: execution.groupId,
    durationMs: completedTrace ? completedTrace.timestamp - execution.startedAt : Date.now() - execution.startedAt,
    retryCount: execution.retryCount,
    childExecutionCount: execution.childExecutionIds?.length ?? 0,
    dependencyCount: execution.dependencyExecutionIds?.length ?? 0,
    fallbackCount: trace.filter((event) => event.eventType === 'fallback').length,
    interruptionCount: trace.filter((event) => event.eventType === 'interrupted').length,
    recoveryCount: trace.filter((event) => event.eventType === 'recovered').length,
    ...(fallbackTrace ? { fallbackLatencyMs: fallbackTrace.timestamp - execution.startedAt } : {}),
    ...(interruptedTrace && recoveredTrace ? { timeToRecoveryMs: recoveredTrace.timestamp - execution.startedAt } : {}),
  };
}

function flattenGraphStages(
  executionsById: Record<string, ExecutionRuntime>,
  executionId: string,
  depth = 0,
  visited = new Set<string>()
): Array<{ execution: ExecutionRuntime; depth: number }> {
  if (visited.has(executionId)) return [];
  const execution = executionsById[executionId];
  if (!execution) return [];
  visited.add(executionId);
  return [
    { execution, depth },
    ...uniqueExistingIds(execution.childExecutionIds, executionsById).flatMap((childId) =>
      flattenGraphStages(executionsById, childId, depth + 1, visited)
    ),
  ];
}

function governanceDecision(allowed: boolean, reason?: string): GovernanceDecision {
  return allowed ? { allowed } : { allowed, reason };
}

function appendGovernanceTrace(
  execution: ExecutionRuntime,
  eventType: 'governance-denied' | 'governance-timeout',
  metadata: Record<string, unknown>
): ExecutionRuntime {
  return {
    ...execution,
    trace: [...(execution.trace ?? []), createTraceEvent(execution, eventType, metadata)],
    updatedAt: Date.now(),
  };
}

function canRetry(execution: ExecutionRuntime | undefined): GovernanceDecision {
  if (!execution) return governanceDecision(false, 'missing execution');
  const maxRetries = execution.policy?.maxRetries;
  if (maxRetries !== undefined && execution.retryCount >= maxRetries) {
    return governanceDecision(false, 'retry limit exceeded');
  }
  return governanceDecision(true);
}

function canCreateChild(execution: ExecutionRuntime | undefined): GovernanceDecision {
  if (!execution) return governanceDecision(false, 'missing parent execution');
  const maxChildren = execution.policy?.maxChildExecutions;
  if (maxChildren !== undefined && (execution.childExecutionIds?.length ?? 0) >= maxChildren) {
    return governanceDecision(false, 'child execution limit exceeded');
  }
  return governanceDecision(true);
}

function wouldExceedDependencyDepth(
  executionsById: Record<string, ExecutionRuntime>,
  executionId: string,
  dependencyExecutionId: string
): boolean {
  const execution = executionsById[executionId];
  const maxDepth = execution?.policy?.maxDependencyDepth;
  if (maxDepth === undefined) return false;
  const nextDependencyIds = Array.from(new Set([...(execution.dependencyExecutionIds ?? []), dependencyExecutionId]));
  const synthetic: Record<string, ExecutionRuntime> = {
    ...executionsById,
    [executionId]: { ...execution, dependencyExecutionIds: nextDependencyIds },
  };
  return dependencyDepth(synthetic, executionId) > maxDepth;
}

function executionBudgetSummary(execution: ExecutionRuntime | undefined, executionsById: Record<string, ExecutionRuntime>): ExecutionBudgetSummary | undefined {
  if (!execution) return undefined;
  const durationMs = Date.now() - execution.startedAt;
  const fallbackCount = (execution.trace ?? []).filter((event) => event.eventType === 'fallback').length;
  const dependencyDepthValue = dependencyDepth(executionsById, execution.executionId);
  const exceededReasons = [
    ...(execution.policy?.maxRetries !== undefined && execution.retryCount > execution.policy.maxRetries ? ['retry limit exceeded'] : []),
    ...(execution.policy?.maxExecutionDurationMs !== undefined && durationMs > execution.policy.maxExecutionDurationMs ? ['execution duration exceeded'] : []),
    ...(execution.policy?.maxChildExecutions !== undefined && (execution.childExecutionIds?.length ?? 0) > execution.policy.maxChildExecutions ? ['child execution limit exceeded'] : []),
    ...(execution.policy?.maxDependencyDepth !== undefined && dependencyDepthValue > execution.policy.maxDependencyDepth ? ['dependency depth limit exceeded'] : []),
  ];
  return {
    executionId: execution.executionId,
    retryCount: execution.retryCount,
    childExecutionCount: execution.childExecutionIds?.length ?? 0,
    dependencyDepth: dependencyDepthValue,
    fallbackCount,
    durationMs,
    exceeded: exceededReasons.length > 0,
    exceededReasons,
  };
}

const priorityRank: Record<ExecutionPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function unresolvedDependencyIds(execution: ExecutionRuntime, executionsById: Record<string, ExecutionRuntime>): string[] {
  return uniqueExistingIds(execution.dependencyExecutionIds, executionsById).filter((dependencyId) => {
    const dependency = executionsById[dependencyId];
    return dependency.lifecycle !== 'completed' || dependency.schedulingState !== 'completed';
  });
}

function hasWaitPath(
  executionsById: Record<string, ExecutionRuntime>,
  fromExecutionId: string,
  targetExecutionId: string,
  visited = new Set<string>()
): boolean {
  if (fromExecutionId === targetExecutionId) return true;
  if (visited.has(fromExecutionId)) return false;
  visited.add(fromExecutionId);
  const execution = executionsById[fromExecutionId];
  if (!execution) return false;
  return uniqueExistingIds(execution.waitingOnExecutionIds, executionsById).some((waitingId) =>
    hasWaitPath(executionsById, waitingId, targetExecutionId, visited)
  );
}

function applySchedulingTrace(
  execution: ExecutionRuntime,
  schedulingState: ExecutionSchedulingState,
  eventType: ExecutionTraceEventType,
  metadata?: Record<string, unknown>
): ExecutionRuntime {
  return {
    ...execution,
    schedulingState,
    trace: [...(execution.trace ?? []), createTraceEvent(execution, eventType, metadata)],
    updatedAt: Date.now(),
  };
}

function createPipelineTraceEvent(
  pipelineId: string,
  eventType: ExecutionPipelineTraceEvent['eventType'],
  stage?: ExecutionPipelineStage | null,
  metadata?: Record<string, unknown>
): ExecutionPipelineTraceEvent {
  return {
    pipelineId,
    eventType,
    timestamp: Date.now(),
    ...(stage !== undefined ? { stage } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function pipelineStageStatus(
  pipeline: ExecutionPipeline,
  stage: ExecutionPipelineStage,
  executionsById: Record<string, ExecutionRuntime>
): PipelineStageSummary['status'] {
  const stageIndex = pipeline.stages.indexOf(stage);
  const currentIndex = pipeline.currentStage ? pipeline.stages.indexOf(pipeline.currentStage) : pipeline.stages.length;
  const executions = pipeline.executionIds
    .map((executionId) => executionsById[executionId])
    .filter((execution): execution is ExecutionRuntime => Boolean(execution) && execution.pipelineStage === stage);
  if (pipeline.status === 'failed' && stage === pipeline.currentStage) return 'failed';
  if (executions.some((execution) => execution.lifecycle === 'failed')) return 'failed';
  if (executions.some((execution) => unresolvedDependencyIds(execution, executionsById).length > 0 || execution.schedulingState === 'waiting' || execution.schedulingState === 'blocked')) {
    return 'blocked';
  }
  if (stageIndex < currentIndex || executions.some((execution) => execution.lifecycle === 'completed')) return 'completed';
  if (stage === pipeline.currentStage) return 'running';
  return 'pending';
}

function summarizePipelineStages(
  pipeline: ExecutionPipeline,
  executionsById: Record<string, ExecutionRuntime>
): PipelineStageSummary[] {
  return pipeline.stages.map((stage) => ({
    stage,
    status: pipelineStageStatus(pipeline, stage, executionsById),
    executionIds: pipeline.executionIds.filter((executionId) => executionsById[executionId]?.pipelineStage === stage),
  }));
}

function createContextFrameTraceEvent(
  frameId: string,
  eventType: ContextFrameTraceEvent['eventType'],
  metadata?: Record<string, unknown>
): ContextFrameTraceEvent {
  return {
    frameId,
    eventType,
    timestamp: Date.now(),
    ...(metadata ? { metadata } : {}),
  };
}

function contextFrameHierarchy(framesById: Record<string, ContextFrame>, frameId: string): ContextFrame[] {
  const frame = framesById[frameId];
  if (!frame) return [];
  const parentHierarchy = frame.parentFrameId ? contextFrameHierarchy(framesById, frame.parentFrameId) : [];
  return [...parentHierarchy, frame];
}

function inheritedContextKeys(framesById: Record<string, ContextFrame>, frame: ContextFrame): string[] {
  return frame.parentFrameId
    ? contextFrameHierarchy(framesById, frame.parentFrameId).flatMap((parent) => parent.contextKeys)
    : [];
}

function contextDepth(framesById: Record<string, ContextFrame>, frameId: string): number {
  return Math.max(0, contextFrameHierarchy(framesById, frameId).length - 1);
}

function buildContextPropagationGraph(
  framesById: Record<string, ContextFrame>,
  frameId: string,
  visited = new Set<string>()
): ContextPropagationGraph | undefined {
  if (visited.has(frameId) || !framesById[frameId]) return undefined;
  visited.add(frameId);
  return {
    frameId,
    descendants: Object.values(framesById)
      .filter((frame) => frame.parentFrameId === frameId)
      .map((frame) => buildContextPropagationGraph(framesById, frame.frameId, visited))
      .filter((graph): graph is ContextPropagationGraph => Boolean(graph)),
  };
}

function transitionExecution(
  execution: ExecutionRuntime | undefined,
  lifecycle: StreamLifecycleState,
  details: {
    partialText?: string;
    recoveryReason?: string;
    fallbackReason?: string;
    providerId?: string;
    modelId?: string;
    runtimeModelId?: string;
    status?: string;
  } = {}
): ExecutionRuntime | undefined {
  if (!execution) return undefined;
  const metadata = {
    ...execution.metadata,
    ...(details.recoveryReason ? { recoveryReason: details.recoveryReason } : {}),
    ...(details.fallbackReason ? { fallbackReason: details.fallbackReason } : {}),
  };
  const next: ExecutionRuntime = {
    ...execution,
    ...(details.providerId ? { providerId: details.providerId } : {}),
    ...(details.modelId ? { modelId: details.modelId } : {}),
    ...(details.runtimeModelId ? { runtimeModelId: details.runtimeModelId } : {}),
    ...(details.partialText !== undefined ? { partialText: details.partialText } : {}),
    metadata,
    lifecycle,
    schedulingState: lifecycle === 'completed'
      ? 'completed'
      : lifecycle === 'failed' || lifecycle === 'interrupted'
        ? 'blocked'
        : execution.schedulingState,
    updatedAt: Date.now(),
    ...(lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'interrupted'
      ? { completedAt: Date.now() }
      : {}),
  };
  const shouldAppendEvent = execution.lifecycle !== lifecycle || details.status || details.recoveryReason || details.fallbackReason;
  const traceMetadata = {
    ...(details.status ? { status: details.status } : {}),
    ...(details.recoveryReason ? { recoveryReason: details.recoveryReason } : {}),
    ...(details.fallbackReason ? { fallbackReason: details.fallbackReason } : {}),
  };
  return {
    ...next,
    timeline: shouldAppendEvent
      ? [
          ...execution.timeline,
          createExecutionEvent(lifecycle, next, {
            status: details.status,
            reason: details.recoveryReason ?? details.fallbackReason,
          }),
        ]
      : execution.timeline,
    trace: shouldAppendEvent
      ? [
          ...(execution.trace ?? []),
          createTraceEvent(
            next,
            traceTypeForLifecycle(lifecycle),
            Object.keys(traceMetadata).length > 0 ? traceMetadata : undefined
          ),
        ]
      : execution.trace ?? [],
  };
}

function transitionActiveStream(
  activeStream: ActiveStreamState | null,
  lifecycle: StreamLifecycleState,
  details: Partial<Pick<ActiveStreamState, 'status' | 'recoveryReason' | 'partialText'>> = {},
  eventDetails: Partial<StreamLifecycleEvent> = {}
): ActiveStreamState | null {
  if (!activeStream) return null;
  if (activeStream.lifecycle === lifecycle && activeStream.status === details.status) {
    return {
      ...activeStream,
      ...details,
      updatedAt: Date.now(),
    };
  }
  const next: ActiveStreamState = {
    ...activeStream,
    ...details,
    lifecycle,
    updatedAt: Date.now(),
  };
  if (lifecycle === 'interrupted') {
    next.interruptedAt = Date.now();
  }
  return {
    ...next,
    timeline: [...activeStream.timeline, createLifecycleEvent(lifecycle, next, eventDetails)],
  };
}

function finalStreamSnapshot(
  activeStream: ActiveStreamState | null,
  lifecycle: StreamLifecycleState,
  details: Partial<Pick<ActiveStreamState, 'status' | 'recoveryReason' | 'partialText'>> = {},
  eventDetails: Partial<StreamLifecycleEvent> = {}
): ActiveStreamState | null {
  return transitionActiveStream(activeStream, lifecycle, details, eventDetails);
}

function sanitizeDrafts(drafts: Partial<Record<string, Partial<ConversationDraft>>> | undefined): Record<string, ConversationDraft> {
  if (!drafts || typeof drafts !== 'object') return {};
  return Object.fromEntries(
    Object.entries(drafts)
      .filter(([, draft]) => typeof draft?.text === 'string')
      .map(([conversationId, draft]) => [
        conversationId,
        {
          text: draft?.text ?? '',
          updatedAt: typeof draft?.updatedAt === 'number' ? draft.updatedAt : Date.now(),
          attachments: Array.isArray(draft?.attachments)
            ? draft.attachments.map((attachment) => ({
                name: attachment.name ?? 'Attachment',
                mimeType: attachment.mimeType,
                size: attachment.size,
                lastModified: attachment.lastModified,
                persistenceState: 'metadata-only' as const,
              }))
            : [],
        },
      ])
  );
}

type HydratedChatStateInput = Partial<Omit<ChatState, 'executionsById'>> & {
  executionsById?: Record<string, Partial<ExecutionRuntime>>;
};

export function sanitizeHydratedChatState(state: HydratedChatStateInput): Partial<ChatState> {
  const executionsById = state.executionsById ?? {};
  const hydratedExecutions: Record<string, ExecutionRuntime> = state.executionsById && typeof state.executionsById === 'object'
    ? Object.fromEntries(
        Object.entries(executionsById).map(([executionId, execution]) => {
          const capability = execution.capability ?? 'chat-generation';
          const capabilityMetadata = execution.capabilityMetadata;
          const resolvedExecutionId = execution.executionId ?? executionId;
          const startedAt = execution.startedAt ?? Date.now();
          const updatedAt = execution.updatedAt ?? startedAt;
          const lifecycle = execution.lifecycle ?? 'idle';
          return [
            executionId,
            {
              ...execution,
              executionId: resolvedExecutionId,
              messageId: execution.messageId ?? generateId(),
              capability,
              parentExecutionId: execution.parentExecutionId && executionsById[execution.parentExecutionId]
                ? execution.parentExecutionId
                : null,
              childExecutionIds: [],
              groupId: execution.groupId ?? null,
              dependencyExecutionIds: [],
              schedulingState: execution.schedulingState ?? (execution.dependencyExecutionIds?.length ? 'waiting' : 'ready'),
              priority: execution.priority ?? 'normal',
              waitingOnExecutionIds: execution.waitingOnExecutionIds ?? execution.dependencyExecutionIds ?? [],
              scheduledAt: execution.scheduledAt,
              pipelineId: execution.pipelineId ?? null,
              pipelineStage: execution.pipelineStage ?? null,
              ...(capabilityMetadata ? { capabilityMetadata } : {}),
              timeline: (execution.timeline ?? []).map((event) => ({
                ...event,
                executionId: event.executionId ?? resolvedExecutionId,
                capability: event.capability ?? capability,
                parentExecutionId: event.parentExecutionId ?? execution.parentExecutionId ?? null,
                groupId: event.groupId ?? execution.groupId ?? null,
                ...(event.capabilityMetadata ?? capabilityMetadata
                  ? { capabilityMetadata: event.capabilityMetadata ?? capabilityMetadata }
                  : {}),
              })),
              lifecycle,
              startedAt,
              updatedAt,
              retryCount: execution.retryCount ?? 0,
              trace: execution.trace ?? [
                {
                  executionId: resolvedExecutionId,
                  capability,
                  lifecycle,
                  timestamp: startedAt,
                  eventType: 'created' as const,
                  providerId: execution.providerId,
                  modelId: execution.modelId,
                },
                {
                  executionId: resolvedExecutionId,
                  capability,
                  lifecycle,
                  timestamp: startedAt,
                  eventType: 'started' as const,
                  providerId: execution.providerId,
                  modelId: execution.modelId,
                },
              ],
            },
          ];
        })
      )
    : {};
  for (const execution of Object.values(hydratedExecutions)) {
    execution.dependencyExecutionIds = uniqueExistingIds(
      executionsById[execution.executionId]?.dependencyExecutionIds,
      hydratedExecutions
    ).filter((dependencyId) => dependencyId !== execution.executionId);
  }
  for (const execution of Object.values(hydratedExecutions)) {
    const parentId = execution.parentExecutionId;
    if (parentId && hydratedExecutions[parentId]) {
      hydratedExecutions[parentId] = {
        ...hydratedExecutions[parentId],
        childExecutionIds: Array.from(new Set([...(hydratedExecutions[parentId].childExecutionIds ?? []), execution.executionId])),
      };
    }
  }
  if (state.activeExecutionId && hydratedExecutions[state.activeExecutionId]) {
    hydratedExecutions[state.activeExecutionId] = transitionExecution(
      hydratedExecutions[state.activeExecutionId],
      'interrupted',
      { recoveryReason: 'reload' }
    )!;
  }
  const interruptedActiveStream = state.activeStream
    ? finalStreamSnapshot(
        state.activeStream,
        'interrupted',
        { recoveryReason: state.activeStream.recoveryReason ?? 'reload' },
        { reason: state.activeStream.recoveryReason ?? 'reload' }
      )
    : null;
  const conversations = Array.isArray(state.conversations)
    ? state.conversations.map((conversation) => ({
        ...conversation,
        recovery: interruptedActiveStream?.conversationId === conversation.id
          ? {
              status: 'interrupted' as const,
              streamId: interruptedActiveStream.streamId,
              providerId: interruptedActiveStream.providerId,
              modelId: interruptedActiveStream.modelId,
              interruptedAt: interruptedActiveStream.interruptedAt ?? Date.now(),
              retryPrompt: conversation.streaming?.retryPrompt,
            }
          : conversation.streaming
          ? {
              status: 'interrupted' as const,
              streamId: conversation.streaming.streamId,
              providerId: conversation.streaming.providerId,
              modelId: conversation.streaming.modelId,
              interruptedAt: Date.now(),
              retryPrompt: conversation.streaming.retryPrompt,
            }
          : conversation.recovery,
        streaming: undefined,
      }))
    : [];
  const activeConversationId = conversations.some((conversation) => conversation.id === state.activeConversationId)
    ? state.activeConversationId
    : conversations[0]?.id ?? null;

  return {
    ...state,
    conversations,
    activeConversationId,
    drafts: sanitizeDrafts(state.drafts),
    isStreaming: false,
    activeStream: null,
    lastStream: interruptedActiveStream ?? state.lastStream ?? null,
    activeExecutionId: null,
    executionsById: hydratedExecutions,
    pipelinesById: state.pipelinesById && typeof state.pipelinesById === 'object' ? state.pipelinesById : {},
    contextFramesById: state.contextFramesById && typeof state.contextFramesById === 'object' ? state.contextFramesById : {},
    activeContextFrameId: null,
    streamEngine: null,
    abortController: null,
    currentStreamId: null,
  };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      drafts: {},
      isStreaming: false,
      activeStream: null,
      lastStream: null,
      activeExecutionId: null,
      executionsById: {},
      pipelinesById: {},
      contextFramesById: {},
      activeContextFrameId: null,
      streamEngine: null,
      abortController: null,
      currentStreamId: null,

      createConversation: () => {
        const { isStreaming, abortController, streamEngine } = get();
        if (isStreaming) {
          const streamingConversationId = streamEngine?.getDiagnostics().conversationId;
          const streaming = get().conversations.find((c) => c.id === streamingConversationId)?.streaming;
          if (streaming) {
            recordProviderStreamInterruption(streaming.providerId, 'conversation-reset');
          }
          abortController?.abort();
          set({ currentStreamId: null });
          get().markInterrupted('conversation-reset');
          streamEngine?.abort();
        }

        const conversation = createDefaultConversation();
        set((state) => ({
          isStreaming: false,
          activeStream: null,
          streamEngine: null,
          abortController: null,
          currentStreamId: null,
          conversations: [
            conversation,
            ...state.conversations.map((c) =>
              c.streaming ? { ...c, streaming: undefined } : c
            ),
          ],
          activeConversationId: conversation.id,
        }));
        return conversation.id;
      },

      setActiveConversation: (id) => {
        // Abort any active stream when switching conversations
        const { isStreaming, abortController, streamEngine } = get();
        if (isStreaming) {
          const streamingConversationId = streamEngine?.getDiagnostics().conversationId;
          const streaming = get().conversations.find((c) => c.id === streamingConversationId)?.streaming;
          if (streaming) {
            recordProviderStreamInterruption(streaming.providerId, 'conversation-switch');
          }
          get().markInterrupted('conversation-switch');
          set((state) => ({
            isStreaming: false,
            activeStream: null,
            streamEngine: null,
            abortController: null,
            currentStreamId: null,
            activeConversationId: id,
            conversations: state.conversations.map((c) =>
              c.id === streamingConversationId ? { ...c, streaming: undefined } : c
            ),
          }));
          abortController?.abort();
          streamEngine?.abort();
          return;
        }
        set({ activeConversationId: id });
      },

      deleteConversation: (id) => {
        set((state) => {
          const filtered = state.conversations.filter((c) => c.id !== id);
          return {
            conversations: filtered,
            activeConversationId:
              state.activeConversationId === id
                ? filtered[0]?.id || null
                : state.activeConversationId,
          };
        });
      },

      archiveConversation: (id) => {
        set((state) => {
          const conversations = state.conversations.map((c) =>
            c.id === id ? { ...c, archivedAt: Date.now(), streaming: undefined } : c
          );
          return {
            conversations,
            activeConversationId:
              state.activeConversationId === id
                ? conversations.find((c) => !c.archivedAt)?.id ?? conversations.find((c) => c.id !== id)?.id ?? null
                : state.activeConversationId,
          };
        });
      },

      reopenConversation: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, archivedAt: undefined } : c
          ),
          activeConversationId: state.conversations.some((c) => c.id === id) ? id : state.activeConversationId,
        }));
      },

      renameConversation: (id, title) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        }));
      },

      updateConversationMetadata: (id, updates) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...(updates.summary !== undefined ? { summary: updates.summary } : {}),
                  ...(updates.tags !== undefined ? { tags: normalizeTags(updates.tags) } : {}),
                  updatedAt: Date.now(),
                }
              : c
          ),
        }));
      },

      createExecution: (input) => {
        let executionId = generateExecutionId();
        let attempts = 0;
        while (get().executionsById[executionId]) {
          attempts += 1;
          executionId = `${generateExecutionId()}-${attempts}`;
        }
        const now = Date.now();
        const execution: ExecutionRuntime = {
          executionId,
          messageId: input.messageId ?? `msg-${executionId}`,
          parentExecutionId: input.parentExecutionId ?? null,
          childExecutionIds: [],
          groupId: input.groupId ?? null,
          dependencyExecutionIds: input.dependencyExecutionIds ?? [],
          policy: input.policy,
          schedulingState: input.schedulingState ?? (input.dependencyExecutionIds?.length ? 'waiting' : 'ready'),
          priority: input.priority ?? 'normal',
          waitingOnExecutionIds: input.dependencyExecutionIds ?? [],
          pipelineId: null,
          pipelineStage: null,
          capability: input.capability ?? 'chat-generation',
          capabilityMetadata: input.capabilityMetadata,
          providerId: input.providerId,
          modelId: input.modelId,
          runtimeModelId: input.runtimeModelId,
          lifecycle: 'thinking',
          startedAt: now,
          updatedAt: now,
          retryCount: input.retryCount ?? 0,
          partialText: '',
          timeline: [
            {
              executionId,
              capability: input.capability ?? 'chat-generation',
              capabilityMetadata: input.capabilityMetadata,
              parentExecutionId: input.parentExecutionId ?? null,
              groupId: input.groupId ?? null,
              type: 'thinking',
              at: now,
              providerId: input.providerId,
              modelId: input.modelId,
            },
          ],
          trace: [
            {
              executionId,
              capability: input.capability ?? 'chat-generation',
              lifecycle: 'thinking',
              timestamp: now,
              eventType: 'created',
              providerId: input.providerId,
              modelId: input.modelId,
              ...(input.parentExecutionId ? { metadata: { parentExecutionId: input.parentExecutionId } } : {}),
            },
            {
              executionId,
              capability: input.capability ?? 'chat-generation',
              lifecycle: 'thinking',
              timestamp: now,
              eventType: 'started',
              providerId: input.providerId,
              modelId: input.modelId,
            },
          ],
        };
        if ((execution.waitingOnExecutionIds ?? []).length > 0) {
          execution.trace = [
            ...execution.trace,
            createTraceEvent(execution, 'execution-blocked', {
              waitingOnExecutionIds: execution.waitingOnExecutionIds,
            }),
          ];
        }
        set((state) => {
          const parent = execution.parentExecutionId ? state.executionsById[execution.parentExecutionId] : undefined;
          return {
            activeExecutionId: executionId,
            executionsById: {
              ...state.executionsById,
              ...(parent
                ? {
                    [parent.executionId]: {
                      ...parent,
                      childExecutionIds: Array.from(new Set([...(parent.childExecutionIds ?? []), executionId])),
                      updatedAt: Date.now(),
                    },
                  }
                : {}),
              [executionId]: execution,
            },
          };
        });
        return executionId;
      },

      createToolExecution: (input = {}) => {
        return get().createExecution({
          messageId: input.messageId,
          capability: 'tool-call',
          capabilityMetadata: {
            ...(input.toolName ? { toolName: input.toolName } : {}),
            ...(input.toolStatus ? { toolStatus: input.toolStatus } : {}),
          },
          providerId: input.providerId,
          modelId: input.modelId,
          runtimeModelId: input.runtimeModelId,
          policy: input.policy,
        });
      },

      createRetrievalExecution: (input = {}) => {
        return get().createExecution({
          messageId: input.messageId,
          capability: 'context-retrieval',
          capabilityMetadata: {
            ...(input.retrievalSourceCount !== undefined ? { retrievalSourceCount: input.retrievalSourceCount } : {}),
            ...(input.retrievalLatency !== undefined ? { retrievalLatency: input.retrievalLatency } : {}),
          },
        });
      },

      createWorkspaceExecution: (input = {}) => {
        return get().createExecution({
          messageId: input.messageId,
          capability: 'workspace-analysis',
          capabilityMetadata: {
            ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
            ...(input.analysisScope ? { analysisScope: input.analysisScope } : {}),
          },
        });
      },

      createChildExecution: (parentExecutionId, input = {}) => {
        const parent = get().executionsById[parentExecutionId];
        if (!parent) {
          throw new Error('missing parent execution');
        }
        const decision = canCreateChild(parent);
        if (!decision.allowed) {
          set((state) => ({
            executionsById: {
              ...state.executionsById,
              [parentExecutionId]: appendGovernanceTrace(state.executionsById[parentExecutionId], 'governance-denied', {
                action: 'create-child',
                reason: decision.reason,
              }),
            },
          }));
          throw new Error(decision.reason);
        }
        return get().createExecution({
          messageId: input.messageId ?? parent.messageId,
          parentExecutionId,
          groupId: input.groupId ?? parent.groupId ?? parent.executionId,
          policy: input.policy ?? parent.policy,
          capability: input.capability ?? parent.capability,
          capabilityMetadata: input.capabilityMetadata,
          providerId: input.providerId ?? parent.providerId,
          modelId: input.modelId ?? parent.modelId,
          runtimeModelId: input.runtimeModelId ?? parent.runtimeModelId,
        });
      },

      attachExecutionParent: (executionId, parentExecutionId) => {
        set((state) => {
          const execution = state.executionsById[executionId];
          if (!execution) return {};
          const parent = parentExecutionId ? state.executionsById[parentExecutionId] : undefined;
          if (parentExecutionId && !parent) {
            throw new Error('missing parent execution');
          }
          if (parentExecutionId === executionId || (parentExecutionId && collectChildIds(state.executionsById, executionId).includes(parentExecutionId))) {
            throw new Error('circular execution graph');
          }

          const previousParent = execution.parentExecutionId ? state.executionsById[execution.parentExecutionId] : undefined;
          return {
            executionsById: {
              ...state.executionsById,
              ...(previousParent
                ? {
                    [previousParent.executionId]: {
                      ...previousParent,
                      childExecutionIds: (previousParent.childExecutionIds ?? []).filter((id) => id !== executionId),
                      updatedAt: Date.now(),
                    },
                  }
                : {}),
              ...(parent
                ? {
                    [parent.executionId]: {
                      ...parent,
                      childExecutionIds: Array.from(new Set([...(parent.childExecutionIds ?? []), executionId])),
                      updatedAt: Date.now(),
                    },
                  }
                : {}),
              [executionId]: {
                ...execution,
                parentExecutionId,
                groupId: parentExecutionId ? execution.groupId ?? parent?.groupId ?? parentExecutionId : execution.groupId,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      attachExecutionDependency: (executionId, dependencyExecutionId) => {
        const current = get().executionsById;
        const execution = current[executionId];
        const dependency = current[dependencyExecutionId];
        const denyDependency = (reason: string): never => {
          if (execution) {
            set((state) => ({
              executionsById: {
                ...state.executionsById,
                [executionId]: appendGovernanceTrace(state.executionsById[executionId], 'governance-denied', {
                  action: 'attach-dependency',
                  reason,
                }),
              },
            }));
          }
          throw new Error(reason);
        };
        if (!execution || !dependency || executionId === dependencyExecutionId) {
          denyDependency('invalid execution dependency');
        }
        if (dependencyHasPath(current, dependencyExecutionId, executionId)) {
          denyDependency('circular execution dependency');
        }
        if (wouldExceedDependencyDepth(current, executionId, dependencyExecutionId)) {
          denyDependency('dependency depth limit exceeded');
        }
        set((state) => {
          const execution = state.executionsById[executionId];
          if (!execution) return {};
          return {
            executionsById: {
              ...state.executionsById,
              [executionId]: {
                ...execution,
                dependencyExecutionIds: Array.from(new Set([...(execution.dependencyExecutionIds ?? []), dependencyExecutionId])),
                trace: [
                  ...(execution.trace ?? []),
                  createTraceEvent(execution, 'dependency-attached', { dependencyExecutionId }),
                ],
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      attachExecutionToMessage: (executionId, messageId) => {
        set((state) => {
          const execution = state.executionsById[executionId];
          if (!execution) return {};
          return {
            executionsById: {
              ...state.executionsById,
              [executionId]: {
                ...execution,
                messageId,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      completeExecution: (executionId, partialText) => {
        set((state) => {
          const execution = transitionExecution(state.executionsById[executionId], 'completed', { partialText });
          if (!execution) return {};
          return {
            activeExecutionId: state.activeExecutionId === executionId ? null : state.activeExecutionId,
            executionsById: {
              ...state.executionsById,
              [executionId]: execution,
            },
          };
        });
      },

      failExecution: (executionId, reason) => {
        set((state) => {
          const execution = transitionExecution(state.executionsById[executionId], 'failed', { recoveryReason: reason });
          if (!execution) return {};
          return {
            activeExecutionId: state.activeExecutionId === executionId ? null : state.activeExecutionId,
            executionsById: {
              ...state.executionsById,
              [executionId]: execution,
            },
          };
        });
      },

      interruptExecution: (executionId, reason) => {
        set((state) => {
          const execution = transitionExecution(state.executionsById[executionId], 'interrupted', { recoveryReason: reason });
          if (!execution) return {};
          return {
            activeExecutionId: state.activeExecutionId === executionId ? null : state.activeExecutionId,
            executionsById: {
              ...state.executionsById,
              [executionId]: execution,
            },
          };
        });
      },

      recoverExecution: (executionId, reason) => {
        set((state) => {
          const execution = transitionExecution(state.executionsById[executionId], 'recovered', { recoveryReason: reason });
          if (!execution) return {};
          return {
            activeExecutionId: executionId,
            executionsById: {
              ...state.executionsById,
              [executionId]: execution,
            },
          };
        });
      },

      retryExecution: (parentExecutionId, input) => {
        const parent = get().executionsById[parentExecutionId];
        const decision = canRetry(parent);
        if (!decision.allowed) {
          if (parent) {
            set((state) => ({
              executionsById: {
                ...state.executionsById,
                [parentExecutionId]: appendGovernanceTrace(state.executionsById[parentExecutionId], 'governance-denied', {
                  action: 'retry',
                  reason: decision.reason,
                }),
              },
            }));
          }
          throw new Error(decision.reason);
        }
        const executionId = get().createExecution({
          messageId: parent?.messageId,
          parentExecutionId,
          groupId: parent?.groupId ?? parentExecutionId,
          capability: input?.capability ?? parent?.capability ?? 'chat-generation',
          capabilityMetadata: input?.capabilityMetadata ?? parent?.capabilityMetadata,
          providerId: input?.providerId ?? parent?.providerId,
          modelId: input?.modelId ?? parent?.modelId,
          runtimeModelId: input?.runtimeModelId ?? parent?.runtimeModelId,
          retryCount: (parent?.retryCount ?? 0) + 1,
        });
        if (parent) {
          set((state) => ({
            executionsById: {
              ...state.executionsById,
              [parentExecutionId]: {
                ...state.executionsById[parentExecutionId],
                trace: [
                  ...(state.executionsById[parentExecutionId].trace ?? []),
                  createTraceEvent(state.executionsById[parentExecutionId], 'retry-initiated', { retryExecutionId: executionId }),
                ],
                updatedAt: Date.now(),
              },
            },
          }));
        }
        return executionId;
      },

      getActiveExecution: () => {
        const { activeExecutionId, executionsById } = get();
        return activeExecutionId ? executionsById[activeExecutionId] : undefined;
      },

      getExecutionsByCapability: (capability) => {
        return Object.values(get().executionsById)
          .filter((execution) => execution.capability === capability)
          .sort((a, b) => a.startedAt - b.startedAt);
      },

      getLatestExecutionForMessage: (messageId) => {
        return Object.values(get().executionsById)
          .filter((execution) => execution.messageId === messageId)
          .sort((a, b) => b.startedAt - a.startedAt)[0];
      },

      getExecutionTimeline: (executionId) => {
        const id = executionId ?? get().activeExecutionId;
        return id ? get().executionsById[id]?.timeline ?? [] : [];
      },

      getExecutionStatus: (executionId) => {
        const execution = executionId
          ? get().executionsById[executionId]
          : get().getActiveExecution();
        return execution ? capabilityStatus(execution.capability, execution.lifecycle) : '';
      },

      getExecutionChildren: (executionId) => {
        const { executionsById } = get();
        return uniqueExistingIds(executionsById[executionId]?.childExecutionIds, executionsById)
          .map((childId) => executionsById[childId]);
      },

      getExecutionParent: (executionId) => {
        const { executionsById } = get();
        const parentId = executionsById[executionId]?.parentExecutionId;
        return parentId ? executionsById[parentId] : undefined;
      },

      getExecutionDescendants: (executionId) => {
        const { executionsById } = get();
        return collectChildIds(executionsById, executionId).map((childId) => executionsById[childId]);
      },

      getExecutionGraph: (executionId) => {
        return buildExecutionGraph(get().executionsById, executionId);
      },

      getExecutionTrace: (executionId) => {
        return get().executionsById[executionId]?.trace ?? [];
      },

      getExecutionSummary: (executionId) => {
        return summarizeExecution(get().executionsById[executionId]);
      },

      getExecutionGraphSummary: (executionId) => {
        const { executionsById } = get();
        const root = executionsById[executionId];
        if (!root) return undefined;
        const flattened = flattenGraphStages(executionsById, executionId);
        const dependencyEdges = flattened.flatMap(({ execution }) =>
          uniqueExistingIds(execution.dependencyExecutionIds, executionsById).map((dependencyId) => ({
            fromExecutionId: execution.executionId,
            dependsOnExecutionId: dependencyId,
          }))
        );
        return {
          rootExecutionId: executionId,
          groupId: root.groupId,
          totalExecutions: flattened.length,
          capabilities: flattened.map(({ execution }) => execution.capability),
          dependencyEdges,
          stages: flattened.map(({ execution, depth }) => ({
            executionId: execution.executionId,
            depth,
            capability: execution.capability,
            lifecycle: execution.lifecycle,
          })),
        };
      },

      getExecutionStatusSnapshot: () => {
        const executions = Object.values(get().executionsById);
        const activeExecution = get().getActiveExecution();
        return {
          activeExecutionId: get().activeExecutionId,
          activeLifecycle: activeExecution?.lifecycle ?? null,
          totalExecutions: executions.length,
          runningExecutions: executions.filter((execution) =>
            execution.lifecycle === 'thinking' ||
            execution.lifecycle === 'streaming' ||
            execution.lifecycle === 'tool-running' ||
            execution.lifecycle === 'fallback' ||
            execution.lifecycle === 'recovered'
          ).length,
          failedExecutions: executions.filter((execution) => execution.lifecycle === 'failed').length,
          interruptedExecutions: executions.filter((execution) => execution.lifecycle === 'interrupted').length,
        };
      },

      getActiveExecutionSummary: () => {
        const activeExecution = get().getActiveExecution();
        return summarizeExecution(activeExecution);
      },

      canRetryExecution: (executionId) => {
        return canRetry(get().executionsById[executionId]);
      },

      canCreateChildExecution: (parentExecutionId) => {
        return canCreateChild(get().executionsById[parentExecutionId]);
      },

      canAttachDependency: (executionId, dependencyExecutionId) => {
        const executionsById = get().executionsById;
        const execution = executionsById[executionId];
        const dependency = executionsById[dependencyExecutionId];
        if (!execution || !dependency || executionId === dependencyExecutionId) {
          return governanceDecision(false, 'invalid execution dependency');
        }
        if (dependencyHasPath(executionsById, dependencyExecutionId, executionId)) {
          return governanceDecision(false, 'circular execution dependency');
        }
        if (wouldExceedDependencyDepth(executionsById, executionId, dependencyExecutionId)) {
          return governanceDecision(false, 'dependency depth limit exceeded');
        }
        return governanceDecision(true);
      },

      hasExceededExecutionBudget: (executionId) => {
        const execution = get().executionsById[executionId];
        if (!execution?.policy?.maxExecutionDurationMs) return false;
        return Date.now() - execution.startedAt > execution.policy.maxExecutionDurationMs;
      },

      hasExceededDepthLimit: (executionId, dependencyExecutionId) => {
        return wouldExceedDependencyDepth(get().executionsById, executionId, dependencyExecutionId);
      },

      enforceExecutionTimeout: (executionId) => {
        const execution = get().executionsById[executionId];
        if (!execution || !get().hasExceededExecutionBudget(executionId)) return;
        set((state) => ({
          executionsById: {
            ...state.executionsById,
            [executionId]: appendGovernanceTrace(state.executionsById[executionId], 'governance-timeout', {
              reason: 'execution duration exceeded',
            }),
          },
        }));
        get().failExecution(executionId, 'timeout-policy');
      },

      getExecutionPolicySummary: (executionId) => {
        const execution = get().executionsById[executionId];
        return execution ? { executionId, policy: execution.policy ?? {} } : undefined;
      },

      getExecutionBudgetSummary: (executionId) => {
        return executionBudgetSummary(get().executionsById[executionId], get().executionsById);
      },

      getGovernanceViolations: (executionId) => {
        return (get().executionsById[executionId]?.trace ?? []).filter((event) =>
          event.eventType === 'governance-denied' || event.eventType === 'governance-timeout'
        );
      },

      isExecutionReady: (executionId) => {
        const execution = get().executionsById[executionId];
        if (!execution) return false;
        return unresolvedDependencyIds(execution, get().executionsById).length === 0 &&
          (execution.schedulingState === 'ready' || execution.schedulingState === 'scheduled');
      },

      getBlockedExecutions: () => {
        const executionsById = get().executionsById;
        return Object.values(executionsById).filter((execution) =>
          execution.schedulingState === 'waiting' ||
          execution.schedulingState === 'blocked' ||
          unresolvedDependencyIds(execution, executionsById).length > 0
        );
      },

      getReadyExecutions: () => {
        const executionsById = get().executionsById;
        return Object.values(executionsById).filter((execution) =>
          unresolvedDependencyIds(execution, executionsById).length === 0 &&
          execution.schedulingState === 'ready'
        );
      },

      scheduleExecution: (executionId) => {
        set((state) => {
          const execution = state.executionsById[executionId];
          if (!execution) return {};
          const waitingOnExecutionIds = unresolvedDependencyIds(execution, state.executionsById);
          if (waitingOnExecutionIds.length > 0) {
            return {
              executionsById: {
                ...state.executionsById,
                [executionId]: {
                  ...applySchedulingTrace(execution, 'waiting', 'execution-blocked', { waitingOnExecutionIds }),
                  waitingOnExecutionIds,
                },
              },
            };
          }
          return {
            executionsById: {
              ...state.executionsById,
              [executionId]: {
                ...applySchedulingTrace(execution, 'scheduled', 'execution-scheduled'),
                scheduledAt: Date.now(),
                waitingOnExecutionIds: [],
              },
            },
          };
        });
      },

      markExecutionWaiting: (executionId, waitingOnExecutionIds) => {
        const current = get().executionsById;
        const execution = current[executionId];
        const uniqueWaitingIds = uniqueExistingIds(waitingOnExecutionIds, current);
        if (!execution) return;
        if (uniqueWaitingIds.some((waitingId) => waitingId === executionId || hasWaitPath(current, waitingId, executionId))) {
          set((state) => ({
            executionsById: {
              ...state.executionsById,
              [executionId]: appendGovernanceTrace(state.executionsById[executionId], 'governance-denied', {
                action: 'mark-waiting',
                reason: 'circular execution wait',
              }),
            },
          }));
          throw new Error('circular execution wait');
        }
        set((state) => ({
          executionsById: {
            ...state.executionsById,
            [executionId]: {
              ...applySchedulingTrace(state.executionsById[executionId], 'waiting', 'execution-blocked', {
                waitingOnExecutionIds: uniqueWaitingIds,
              }),
              waitingOnExecutionIds: uniqueWaitingIds,
            },
          },
        }));
      },

      resolveExecutionDependency: (executionId, dependencyExecutionId) => {
        set((state) => {
          const execution = state.executionsById[executionId];
          if (!execution) return {};
          const waitingOnExecutionIds = (execution.waitingOnExecutionIds ?? []).filter((id) => id !== dependencyExecutionId);
          const resolvedExecution = {
            ...execution,
            waitingOnExecutionIds,
            trace: [
              ...(execution.trace ?? []),
              createTraceEvent(execution, 'dependency-resolved', { dependencyExecutionId }),
            ],
            updatedAt: Date.now(),
          };
          const promoted = waitingOnExecutionIds.length === 0
            ? applySchedulingTrace(resolvedExecution, 'ready', 'execution-ready')
            : { ...resolvedExecution, schedulingState: 'waiting' as const };
          return {
            executionsById: {
              ...state.executionsById,
              [executionId]: promoted,
            },
          };
        });
      },

      getExecutionPriorityQueue: () => {
        return Object.values(get().executionsById)
          .filter((execution) => execution.schedulingState === 'scheduled')
          .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.startedAt - b.startedAt);
      },

      getSchedulingSnapshot: () => {
        const executions = Object.values(get().executionsById);
        return {
          totalExecutions: executions.length,
          readyExecutions: executions.filter((execution) => execution.schedulingState === 'ready').length,
          waitingExecutions: executions.filter((execution) => execution.schedulingState === 'waiting').length,
          scheduledExecutions: executions.filter((execution) => execution.schedulingState === 'scheduled').length,
          blockedExecutions: get().getBlockedExecutions().length,
          runningExecutions: executions.filter((execution) => execution.schedulingState === 'running').length,
          completedExecutions: executions.filter((execution) => execution.schedulingState === 'completed').length,
        };
      },

      getExecutionQueueSummary: () => {
        return {
          queuedExecutionIds: get().getExecutionPriorityQueue().map((execution) => execution.executionId),
          blockedExecutionIds: get().getBlockedExecutions().map((execution) => execution.executionId),
        };
      },

      getBlockedExecutionSummary: () => {
        return get().getBlockedExecutions().map((execution) => ({
          executionId: execution.executionId,
          waitingOnExecutionIds: execution.waitingOnExecutionIds ?? unresolvedDependencyIds(execution, get().executionsById),
          dependencyCount: execution.dependencyExecutionIds?.length ?? 0,
        }));
      },

      getPriorityDistribution: () => {
        return Object.values(get().executionsById).reduce<Record<ExecutionPriority, number>>(
          (counts, execution) => {
            counts[execution.priority] += 1;
            return counts;
          },
          { critical: 0, high: 0, normal: 0, low: 0 }
        );
      },

      createPipeline: (stages) => {
        if (stages.length === 0) throw new Error('pipeline requires at least one stage');
        let pipelineId = generatePipelineId();
        let attempts = 0;
        while (get().pipelinesById[pipelineId]) {
          attempts += 1;
          pipelineId = `${generatePipelineId()}-${attempts}`;
        }
        const now = Date.now();
        const pipeline: ExecutionPipeline = {
          pipelineId,
          stages,
          currentStage: stages[0] ?? null,
          status: 'running',
          executionIds: [],
          startedAt: now,
          updatedAt: now,
          trace: [
            createPipelineTraceEvent(pipelineId, 'pipeline-created', stages[0] ?? null),
            createPipelineTraceEvent(pipelineId, 'stage-started', stages[0] ?? null),
          ],
        };
        set((state) => ({
          pipelinesById: {
            ...state.pipelinesById,
            [pipelineId]: pipeline,
          },
        }));
        return pipelineId;
      },

      advancePipelineStage: (pipelineId, expectedStage) => {
        const pipeline = get().pipelinesById[pipelineId];
        if (!pipeline) return;
        const currentIndex = pipeline.currentStage ? pipeline.stages.indexOf(pipeline.currentStage) : pipeline.stages.length;
        const expectedIndex = expectedStage ? pipeline.stages.indexOf(expectedStage) : currentIndex;
        const deny = (reason: string): never => {
          set((state) => ({
            pipelinesById: {
              ...state.pipelinesById,
              [pipelineId]: {
                ...state.pipelinesById[pipelineId],
                trace: [
                  ...state.pipelinesById[pipelineId].trace,
                  createPipelineTraceEvent(pipelineId, 'pipeline-governance-denied', state.pipelinesById[pipelineId].currentStage, { reason }),
                ],
                updatedAt: Date.now(),
              },
            },
          }));
          throw new Error(reason);
        };
        if (expectedStage && expectedIndex > currentIndex) deny('invalid pipeline stage order');
        if (expectedStage && expectedIndex < currentIndex) deny('duplicate pipeline stage progression');
        const nextStage = pipeline.stages[currentIndex + 1] ?? null;
        const nextStatus = nextStage ? 'running' : 'completed';
        set((state) => ({
          pipelinesById: {
            ...state.pipelinesById,
            [pipelineId]: {
              ...state.pipelinesById[pipelineId],
              currentStage: nextStage,
              status: nextStatus,
              updatedAt: Date.now(),
              ...(nextStatus === 'completed' ? { completedAt: Date.now() } : {}),
              trace: [
                ...state.pipelinesById[pipelineId].trace,
                createPipelineTraceEvent(pipelineId, 'stage-completed', pipeline.currentStage),
                ...(nextStage
                  ? [createPipelineTraceEvent(pipelineId, 'stage-started', nextStage)]
                  : [createPipelineTraceEvent(pipelineId, 'pipeline-completed', null)]),
              ],
            },
          },
        }));
      },

      attachExecutionToPipeline: (pipelineId, input) => {
        const pipeline = get().pipelinesById[pipelineId];
        if (!pipeline) throw new Error('missing pipeline');
        if (!pipeline.stages.includes(input.stage)) throw new Error('invalid pipeline stage');
        const executionId = get().createExecution({
          capability: input.capability,
          dependencyExecutionIds: input.dependencyExecutionIds,
          priority: input.priority,
          policy: input.policy,
        });
        get().attachExistingExecutionToPipeline(pipelineId, executionId, input.stage);
        return executionId;
      },

      attachExistingExecutionToPipeline: (pipelineId, executionId, stage) => {
        set((state) => {
          const pipeline = state.pipelinesById[pipelineId];
          const execution = state.executionsById[executionId];
          if (!pipeline || !execution) return {};
          const nextExecutionIds = Array.from(new Set([...pipeline.executionIds, executionId]));
          const isBlocked = unresolvedDependencyIds(execution, state.executionsById).length > 0;
          return {
            pipelinesById: {
              ...state.pipelinesById,
              [pipelineId]: {
                ...pipeline,
                executionIds: nextExecutionIds,
                updatedAt: Date.now(),
                trace: [
                  ...pipeline.trace,
                  ...(isBlocked ? [createPipelineTraceEvent(pipelineId, 'stage-blocked', stage, { executionId })] : []),
                ],
              },
            },
            executionsById: {
              ...state.executionsById,
              [executionId]: {
                ...execution,
                pipelineId,
                pipelineStage: stage,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      completePipeline: (pipelineId) => {
        set((state) => {
          const pipeline = state.pipelinesById[pipelineId];
          if (!pipeline) return {};
          return {
            pipelinesById: {
              ...state.pipelinesById,
              [pipelineId]: {
                ...pipeline,
                status: 'completed',
                currentStage: null,
                completedAt: Date.now(),
                updatedAt: Date.now(),
                trace: [...pipeline.trace, createPipelineTraceEvent(pipelineId, 'pipeline-completed', null)],
              },
            },
          };
        });
      },

      failPipeline: (pipelineId, reason) => {
        set((state) => {
          const pipeline = state.pipelinesById[pipelineId];
          if (!pipeline) return {};
          return {
            pipelinesById: {
              ...state.pipelinesById,
              [pipelineId]: {
                ...pipeline,
                status: 'failed',
                updatedAt: Date.now(),
                trace: [
                  ...pipeline.trace,
                  createPipelineTraceEvent(pipelineId, 'stage-failed', pipeline.currentStage, { reason }),
                  createPipelineTraceEvent(pipelineId, 'pipeline-failed', pipeline.currentStage, { reason }),
                ],
              },
            },
          };
        });
      },

      getPipelineExecutions: (pipelineId) => {
        const { pipelinesById, executionsById } = get();
        return (pipelinesById[pipelineId]?.executionIds ?? [])
          .map((executionId) => executionsById[executionId])
          .filter((execution): execution is ExecutionRuntime => Boolean(execution));
      },

      getPipelineSummary: (pipelineId) => {
        const pipeline = get().pipelinesById[pipelineId];
        if (!pipeline) return undefined;
        const stages = summarizePipelineStages(pipeline, get().executionsById);
        return {
          pipelineId,
          status: pipeline.status,
          currentStage: pipeline.currentStage,
          executionCount: pipeline.executionIds.length,
          completedStageCount: stages.filter((stage) => stage.status === 'completed').length,
          blockedStageCount: stages.filter((stage) => stage.status === 'blocked').length,
          failedStageCount: stages.filter((stage) => stage.status === 'failed').length,
        };
      },

      getPipelineStatusSnapshot: () => {
        const pipelines = Object.values(get().pipelinesById);
        return {
          totalPipelines: pipelines.length,
          runningPipelines: pipelines.filter((pipeline) => pipeline.status === 'running').length,
          completedPipelines: pipelines.filter((pipeline) => pipeline.status === 'completed').length,
          failedPipelines: pipelines.filter((pipeline) => pipeline.status === 'failed').length,
          blockedPipelines: pipelines.filter((pipeline) =>
            summarizePipelineStages(pipeline, get().executionsById).some((stage) => stage.status === 'blocked')
          ).length,
        };
      },

      getPipelineStageSummary: (pipelineId) => {
        const pipeline = get().pipelinesById[pipelineId];
        return pipeline ? summarizePipelineStages(pipeline, get().executionsById) : [];
      },

      getPipelineExecutionGraph: (pipelineId) => {
        const pipeline = get().pipelinesById[pipelineId];
        if (!pipeline) return undefined;
        return {
          pipelineId,
          executionIds: pipeline.executionIds,
          dependencyEdges: pipeline.executionIds.flatMap((executionId) =>
            uniqueExistingIds(get().executionsById[executionId]?.dependencyExecutionIds, get().executionsById).map((dependencyId) => ({
              fromExecutionId: executionId,
              dependsOnExecutionId: dependencyId,
            }))
          ),
        };
      },

      getActivePipelines: () => {
        return Object.values(get().pipelinesById).filter((pipeline) => pipeline.status === 'running');
      },

      createContextFrame: (input) => {
        let frameId = generateContextFrameId();
        let attempts = 0;
        while (get().contextFramesById[frameId]) {
          attempts += 1;
          frameId = `${generateContextFrameId()}-${attempts}`;
        }
        const now = Date.now();
        const frame: ContextFrame = {
          frameId,
          scope: input.scope,
          parentFrameId: input.parentFrameId ?? null,
          pipelineId: input.pipelineId ?? null,
          executionId: input.executionId ?? null,
          createdAt: now,
          updatedAt: now,
          metadata: input.metadata,
          contextKeys: Array.from(new Set(input.contextKeys ?? [])),
          policy: input.policy,
          trace: [createContextFrameTraceEvent(frameId, 'frame-created')],
        };
        set((state) => ({
          activeContextFrameId: frameId,
          contextFramesById: {
            ...state.contextFramesById,
            [frameId]: frame,
          },
        }));
        return frameId;
      },

      attachFrameToExecution: (frameId, executionId) => {
        set((state) => {
          const frame = state.contextFramesById[frameId];
          if (!frame || !state.executionsById[executionId]) return {};
          return {
            contextFramesById: {
              ...state.contextFramesById,
              [frameId]: {
                ...frame,
                executionId,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      inheritContextFrame: (parentFrameId, input) => {
        const parent = get().contextFramesById[parentFrameId];
        if (!parent) throw new Error('missing parent context frame');
        const inheritedKeys = [...inheritedContextKeys(get().contextFramesById, parent), ...parent.contextKeys];
        const localKeys = Array.from(new Set(input.contextKeys ?? []));
        const policy = parent.policy;
        const deny = (reason: string): never => {
          set((state) => ({
            contextFramesById: {
              ...state.contextFramesById,
              [parentFrameId]: {
                ...state.contextFramesById[parentFrameId],
                trace: [
                  ...state.contextFramesById[parentFrameId].trace,
                  createContextFrameTraceEvent(parentFrameId, 'context-governance-denied', { reason }),
                ],
                updatedAt: Date.now(),
              },
            },
          }));
          throw new Error(reason);
        };
        if (policy?.maxInheritedDepth !== undefined && contextDepth(get().contextFramesById, parentFrameId) + 1 > policy.maxInheritedDepth) {
          deny('context inheritance depth exceeded');
        }
        if (policy?.maxContextKeyCount !== undefined && Array.from(new Set([...inheritedKeys, ...localKeys])).length > policy.maxContextKeyCount) {
          deny('context key limit exceeded');
        }
        if (policy?.restrictedPropagationScopes?.includes(input.scope)) {
          deny('context propagation restricted');
        }

        const frameId = get().createContextFrame({
          scope: input.scope,
          parentFrameId,
          pipelineId: input.pipelineId ?? parent.pipelineId,
          executionId: input.executionId ?? null,
          metadata: input.metadata,
          contextKeys: localKeys,
          policy,
        });
        set((state) => ({
          contextFramesById: {
            ...state.contextFramesById,
            [frameId]: {
              ...state.contextFramesById[frameId],
              trace: [
                createContextFrameTraceEvent(frameId, 'frame-created'),
                createContextFrameTraceEvent(frameId, 'frame-inherited', { parentFrameId }),
                createContextFrameTraceEvent(frameId, 'context-propagated', { inheritedContextKeys: inheritedKeys }),
              ],
            },
          },
        }));
        return frameId;
      },

      resolveExecutionContext: (executionId) => {
        const frame = Object.values(get().contextFramesById).find((candidate) => candidate.executionId === executionId);
        if (!frame) return { frameIds: [], contextKeys: [] };
        const hierarchy = contextFrameHierarchy(get().contextFramesById, frame.frameId);
        return {
          frameIds: hierarchy.map((item) => item.frameId),
          contextKeys: Array.from(new Set(hierarchy.flatMap((item) => item.contextKeys))),
        };
      },

      getPipelineContextFrames: (pipelineId) => {
        return Object.values(get().contextFramesById).filter((frame) => frame.pipelineId === pipelineId);
      },

      getContextFrameHierarchy: (frameId) => {
        return contextFrameHierarchy(get().contextFramesById, frameId);
      },

      getContextFrameSummary: (frameId) => {
        const frame = get().contextFramesById[frameId];
        if (!frame) return undefined;
        const inheritedKeys = inheritedContextKeys(get().contextFramesById, frame);
        return {
          frameId,
          scope: frame.scope,
          inheritedDepth: contextDepth(get().contextFramesById, frameId),
          contextKeyCount: Array.from(new Set([...inheritedKeys, ...frame.contextKeys])).length,
          inheritedContextKeys: Array.from(new Set(inheritedKeys)),
          localContextKeys: frame.contextKeys,
        };
      },

      getExecutionContextSummary: (executionId) => ({
        executionId,
        ...get().resolveExecutionContext(executionId),
      }),

      getPipelineContextSummary: (pipelineId) => {
        const frames = get().getPipelineContextFrames(pipelineId);
        const propagatedFrames = frames.filter((frame) => frame.scope !== 'tool' || Boolean(frame.parentFrameId));
        return {
          pipelineId,
          frameIds: frames.map((frame) => frame.frameId),
          propagatedContextKeys: Array.from(new Set(propagatedFrames.flatMap((frame) => frame.contextKeys))),
          isolatedFrameIds: frames.filter((frame) => frame.scope === 'tool' && !frame.parentFrameId).map((frame) => frame.frameId),
        };
      },

      getContextPropagationGraph: (frameId) => {
        return buildContextPropagationGraph(get().contextFramesById, frameId);
      },

      getContextGovernanceViolations: (frameId) => {
        const collectFrameIds = (id: string): string[] => [
          id,
          ...Object.values(get().contextFramesById)
            .filter((frame) => frame.parentFrameId === id)
            .flatMap((frame) => collectFrameIds(frame.frameId)),
        ];
        return collectFrameIds(frameId).flatMap((id) =>
          (get().contextFramesById[id]?.trace ?? []).filter((event) => event.eventType === 'context-governance-denied')
        );
      },

      setDraft: (conversationId, draft) => {
        set((state) => ({
          drafts: {
            ...state.drafts,
            [conversationId]: {
              text: draft.text,
              updatedAt: Date.now(),
              attachments: (draft.attachments ?? []).map((attachment) => ({
                name: attachment.name,
                mimeType: attachment.mimeType,
                size: attachment.size,
                lastModified: attachment.lastModified,
                persistenceState: 'metadata-only',
              })),
            },
          },
        }));
      },

      clearDraft: (conversationId) => {
        set((state) => {
          const { [conversationId]: _removed, ...drafts } = state.drafts;
          return { drafts };
        });
      },

      addMessage: (conversationId, message) => {
        const newMessage: Message = {
          ...message,
          id: message.id ?? generateId(),
          createdAt: Date.now(),
        };
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [...c.messages, newMessage],
                  updatedAt: Date.now(),
                  title:
                    c.messages.length === 0 && message.role === 'user'
                      ? messageToTitle(message.content)
                      : c.title,
                }
              : c
          ),
        }));
        return newMessage.id;
      },

      updateMessage: (conversationId, messageId, updates) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, ...updates } : m
                  ),
                }
              : c
          ),
        }));
      },

      startStreaming: (conversationId, providerId, modelId, runtimeModelId, retryPrompt) => {
        if (get().currentStreamId || get().isStreaming) {
          throw new Error('stream already active');
        }
        const streamId = generateStreamId();
        const now = Date.now();
        const messageId = `msg-${streamId}`;
        const executionId = get().createExecution({
          messageId,
          providerId,
          modelId,
          runtimeModelId,
          retryCount: retryPrompt ? 1 : 0,
        });

        const engine = new StreamEngine(
          {
            onChunk: (_chunk) => {
              // Individual chunk callback (for future real-time tool handling)
            },
            onBatch: (chunks) => {
              // Ownership check: ignore batches from stale streams
              if (get().currentStreamId !== streamId) return;

              set((state) => ({
                activeStream: chunks.some((chunk) => chunk.type === 'text' || chunk.type === 'reasoning')
                  ? transitionActiveStream(state.activeStream, 'streaming', {
                      partialText: finalizeChunks(state.streamEngine?.getBuffer() || [])
                        .filter((part) => part.type === 'text')
                        .map((part) => part.text)
                        .join(''),
                    })
                  : state.activeStream,
                executionsById: chunks.some((chunk) => chunk.type === 'text' || chunk.type === 'reasoning')
                  ? {
                      ...state.executionsById,
                      [executionId]: transitionExecution(
                        state.executionsById[executionId],
                        'streaming',
                        {
                          partialText: finalizeChunks(state.streamEngine?.getBuffer() || [])
                            .filter((part) => part.type === 'text')
                            .map((part) => part.text)
                            .join(''),
                        }
                      )!,
                    }
                  : state.executionsById,
                conversations: state.conversations.map((c) => {
                  if (c.id !== conversationId) return c;

                  const acceptedChunks: AIChunk[] = [];
                  let lastSequence = c.streaming?.lastSequence ?? -1;

                  for (const chunk of chunks) {
                    const sequence = getChunkSequence(chunk);
                    if (typeof sequence === 'number') {
                      if (sequence <= lastSequence) continue;
                      lastSequence = sequence;
                    }
                    acceptedChunks.push(chunk);
                  }

                  return {
                    ...c,
                    streaming: {
                      ...c.streaming!,
                      buffer: [...(c.streaming?.buffer || []), ...acceptedChunks],
                      lastSequence,
                    },
                  };
                }),
              }));
            },
            onDone: () => {
              if (get().currentStreamId !== streamId) return;
              get().finalizeStream(conversationId, streamId);
            },
            onError: (err) => {
              if (get().currentStreamId !== streamId) return;
              console.error('Stream error:', err);
              recordFailure(providerId);
              get().failStream('provider');
              const bufferedContent = finalizeChunks(get().streamEngine?.getBuffer() || []);
              if (bufferedContent.length === 0) {
                get().addMessage(conversationId, {
                  role: 'assistant',
                  content: [
                    {
                      type: 'text',
                      text: `Error: ${formatProviderError(err)}`,
                    },
                  ],
                  metadata: {
                    executionId,
                    provider: providerId,
                    model: modelId,
                    runtimeModel: runtimeModelId,
                    retryable: true,
                    retryPrompt,
                    failureKind: 'provider',
                  },
                });
              }
              get().finalizeStream(conversationId, streamId);
            },
            onAbort: () => {
              if (get().currentStreamId !== streamId) return;
              recordProviderStreamInterruption(providerId);
              get().markInterrupted('abort');
              get().finalizeStream(conversationId, streamId);
            },
            onTimeout: () => {
              if (get().currentStreamId !== streamId) return;
              console.warn('Stream timed out');
              recordFailure(providerId, 'timeout');
              get().failStream('timeout');
              get().addMessage(conversationId, {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: `Error: ${formatProviderError(new Error('Stream timed out'))}`,
                  },
                ],
                metadata: {
                  provider: providerId,
                  model: modelId,
                  runtimeModel: runtimeModelId,
                  retryable: true,
                  retryPrompt,
                  failureKind: 'timeout',
                },
              });
              get().finalizeStream(conversationId, streamId);
            },
          },
          { coalesceText: true, flushIntervalMs: 32, maxBufferSize: 80, timeoutMs: 60000 },
          {
            streamId,
            conversationId,
            providerId,
            modelId,
            runtimeModelId,
            retryCount: retryPrompt ? 1 : 0,
          }
        );

        engine.start();

        set((state) => ({
          isStreaming: true,
          activeStream: {
            streamId,
            executionId,
            conversationId,
            lifecycle: 'thinking',
            providerId,
            modelId,
            runtimeModelId,
            startedAt: now,
            updatedAt: now,
            partialText: '',
            timeline: [
              {
                executionId,
                type: 'thinking',
                at: now,
                providerId,
                modelId,
              },
            ],
          },
          streamEngine: engine,
          currentStreamId: streamId,
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  streaming: {
                    isActive: true,
                    buffer: [],
                    startedAt: Date.now(),
                    providerId,
                    modelId,
                    runtimeModelId,
                    retryPrompt,
                    streamId,
                    lastSequence: -1,
                  },
                }
              : c
          ),
        }));

        return streamId;
      },

      appendChunk: (chunk) => {
        const { streamEngine } = get();
        streamEngine?.push(chunk);
      },

      finalizeStream: (conversationId, streamId) => {
        // Ownership check: prevent zombie stream updates
        if (get().currentStreamId !== streamId) {
          return;
        }

        const { streamEngine } = get();
        streamEngine?.flushPending();
        const buffer = streamEngine?.getBuffer() || [];
        const content = finalizeChunks(buffer);
        const partialText = content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('');

        // Record success if we got content
        const streaming = get()
          .conversations.find((c) => c.id === conversationId)?.streaming;
        if (streaming && content.length > 0) {
          const latency = Date.now() - streaming.startedAt;
          recordSuccess(streaming.providerId, latency);
        }

        if (content.length > 0) {
          const activeExecutionId = get().activeExecutionId;
          const activeExecution = activeExecutionId
            ? get().executionsById[activeExecutionId]
            : undefined;
          get().addMessage(conversationId, {
            id: activeExecution?.messageId,
            role: 'assistant',
            content,
            metadata: {
              executionId: activeExecution?.executionId,
              provider: streaming?.providerId,
              model: streaming?.modelId,
              runtimeModel: streaming?.runtimeModelId,
              latencyMs: streaming ? Date.now() - streaming.startedAt : undefined,
            },
          });
        }
        streamEngine?.completeExternally();

        set((state) => ({
          executionsById: state.activeExecutionId
            ? {
                ...state.executionsById,
                [state.activeExecutionId]: transitionExecution(
                  state.executionsById[state.activeExecutionId],
                  state.activeStream?.lifecycle === 'failed'
                    ? 'failed'
                    : state.activeStream?.lifecycle === 'interrupted'
                      ? 'interrupted'
                      : 'completed',
                  {
                    partialText,
                    recoveryReason: state.activeStream?.recoveryReason,
                  }
                )!,
              }
            : state.executionsById,
          activeExecutionId: null,
          isStreaming: false,
          lastStream: finalStreamSnapshot(
            state.activeStream,
            state.activeStream?.lifecycle === 'failed'
              ? 'failed'
              : state.activeStream?.lifecycle === 'interrupted'
                ? 'interrupted'
                : 'completed',
            { partialText }
          ),
          activeStream: null,
          streamEngine: null,
          abortController: null,
          currentStreamId: null,
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, streaming: undefined }
              : c
          ),
        }));
      },

      stopStreaming: () => {
        const { abortController, streamEngine } = get();
        const streamingConversationId = streamEngine?.getDiagnostics().conversationId;
        const streaming = get().conversations.find((c) => c.id === streamingConversationId)?.streaming;
        if (streaming) {
          recordProviderStreamInterruption(streaming.providerId, 'user-stop');
        }
        get().markInterrupted('user-stop');
        set((state) => ({
          isStreaming: false,
          lastStream: state.activeStream,
          activeStream: null,
          activeExecutionId: null,
          streamEngine: null,
          abortController: null,
          currentStreamId: null,
          conversations: state.conversations.map((c) =>
            c.id === streamingConversationId ? { ...c, streaming: undefined } : c
          ),
        }));
        abortController?.abort();
        streamEngine?.abort();
      },

      setAbortController: (controller) => {
        set({ abortController: controller });
      },

      getActiveConversation: () => {
        const { conversations, activeConversationId } = get();
        return conversations.find((c) => c.id === activeConversationId);
      },

      getMessages: (conversationId) => {
        const { conversations } = get();
        return conversations.find((c) => c.id === conversationId)?.messages || [];
      },

      getStreamText: () => {
        const active = get().getActiveConversation();
        return (active?.streaming?.buffer || [])
          .filter((c): c is Extract<AIChunk, { type: 'text' }> => c.type === 'text')
          .map((c) => c.content)
          .join('');
      },

      getStreamReasoning: () => {
        const active = get().getActiveConversation();
        return (active?.streaming?.buffer || [])
          .filter((c): c is Extract<AIChunk, { type: 'reasoning' }> => c.type === 'reasoning')
          .map((c) => c.content)
          .join('');
      },

      getStreamStatus: () => {
        const activeStreamStatus = get().activeStream?.status;
        if (activeStreamStatus) return activeStreamStatus;
        const active = get().getActiveConversation();
        const chunkStatus = (active?.streaming?.buffer || [])
          .filter((c): c is Extract<AIChunk, { type: 'status' }> => c.type === 'status')
          .map((c) => c.content)
          .at(-1);
        return chunkStatus ?? get().getExecutionStatus();
      },

      getStreamLifecycle: () => {
        return get().activeStream?.lifecycle ?? 'idle';
      },

      getStreamTimeline: () => {
        return get().activeStream?.timeline ?? get().lastStream?.timeline ?? [];
      },

      beginStreaming: () => {
        set((state) => ({
          activeStream: transitionActiveStream(state.activeStream, 'streaming'),
          executionsById: state.activeExecutionId
            ? {
                ...state.executionsById,
                [state.activeExecutionId]: transitionExecution(state.executionsById[state.activeExecutionId], 'streaming')!,
              }
            : state.executionsById,
        }));
      },

      beginFallback: (providerId, status) => {
        set((state) => ({
          activeStream: transitionActiveStream(
            state.activeStream,
            'fallback',
            { status },
            { providerId, status }
          ),
          executionsById: state.activeExecutionId
            ? {
                ...state.executionsById,
                [state.activeExecutionId]: transitionExecution(
                  state.executionsById[state.activeExecutionId],
                  'fallback',
                  { providerId, status, fallbackReason: status }
                )!,
              }
            : state.executionsById,
        }));
      },

      markInterrupted: (reason) => {
        set((state) => ({
          activeStream: transitionActiveStream(
            state.activeStream,
            'interrupted',
            { recoveryReason: reason },
            { reason }
          ),
          executionsById: state.activeExecutionId
            ? {
                ...state.executionsById,
                [state.activeExecutionId]: transitionExecution(
                  state.executionsById[state.activeExecutionId],
                  'interrupted',
                  { recoveryReason: reason }
                )!,
              }
            : state.executionsById,
        }));
      },

      markRecovered: (reason) => {
        set((state) => ({
          activeStream: transitionActiveStream(
            state.activeStream,
            'recovered',
            { recoveryReason: reason },
            { reason }
          ),
          executionsById: state.activeExecutionId
            ? {
                ...state.executionsById,
                [state.activeExecutionId]: transitionExecution(
                  state.executionsById[state.activeExecutionId],
                  'recovered',
                  { recoveryReason: reason }
                )!,
              }
            : state.executionsById,
        }));
      },

      failStream: (reason) => {
        set((state) => ({
          activeStream: transitionActiveStream(
            state.activeStream,
            'failed',
            { recoveryReason: reason },
            { reason }
          ),
          executionsById: state.activeExecutionId
            ? {
                ...state.executionsById,
                [state.activeExecutionId]: transitionExecution(
                  state.executionsById[state.activeExecutionId],
                  'failed',
                  { recoveryReason: reason }
                )!,
              }
            : state.executionsById,
        }));
      },

      getCurrentStreamId: () => {
        return get().currentStreamId;
      },
    }),
    {
      name: 'ai-workstation-chat',
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeHydratedChatState(persisted as Partial<ChatState>),
      }),
      partialize: (state) => ({
        conversations: state.conversations.map((c) => ({
          ...c,
          streaming: undefined,
          messages: c.messages.map((m) => ({
            ...m,
            content: m.content.map((part) => {
              return serializeContentForPersistence([part])[0];
            }),
          })),
        })),
        activeConversationId: state.activeConversationId,
        drafts: state.drafts,
        activeStream: state.activeStream,
        lastStream: state.lastStream,
        activeExecutionId: state.activeExecutionId,
        executionsById: state.executionsById,
        pipelinesById: state.pipelinesById,
        contextFramesById: state.contextFramesById,
      }),
    }
  )
);
