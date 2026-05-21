import type { RuntimeCapability } from '@/lib/models/capability-matrix';
import type { ToolDefinition } from '@/types';
import { toolRegistry } from './registry';

export type ToolExecutionState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'rejected';

export type ToolCategory = 'weather' | 'news' | 'market' | 'url' | 'web';

export interface ToolExecutionPolicy {
  maxRetries?: number;
  maxConcurrent?: number;
  timeoutMs?: number;
  cooldownMs?: number;
  dedupeKey?: string;
}

export interface ToolExecutionRequest {
  toolId: string;
  input: Record<string, unknown>;
  ownerId?: string;
  conversationId?: string;
  streamId?: string;
  dedupeKey?: string;
  policy?: ToolExecutionPolicy;
}

export interface ToolExecutionError {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export interface ToolExecutionTrace {
  executionId: string;
  toolId: string;
  type:
    | 'created'
    | 'started'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timeout'
    | 'rejected'
    | 'duplicate-suppressed'
    | 'cooldown';
  at: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionResult<TOutput = unknown> {
  executionId: string;
  toolId: string;
  state: ToolExecutionState;
  output?: TOutput;
  error?: ToolExecutionError;
  startedAt?: number;
  completedAt?: number;
  latencyMs?: number;
  trace: ToolExecutionTrace[];
}

export interface ToolExecutionContext {
  executionId: string;
  signal: AbortSignal;
  ownerId?: string;
  conversationId?: string;
  streamId?: string;
}

export interface RuntimeToolDefinition extends Omit<ToolDefinition, 'handler'> {
  category: ToolCategory;
  capabilities: RuntimeCapability[];
  policy?: ToolExecutionPolicy;
  handler: (
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ) => Promise<unknown>;
}

export interface ToolExecutionSnapshot {
  activeCount: number;
  activeExecutions: Array<Pick<ToolExecutionResult, 'executionId' | 'toolId' | 'state' | 'startedAt'>>;
  recentExecutions: ToolExecutionResult[];
  completedCount: number;
  failedCount: number;
  timeoutCount: number;
  cancellationCount: number;
  rejectedCount: number;
  duplicateSuppressionCount: number;
  retryCount: number;
  lastExecutionAt?: number;
  lastFailureAt?: number;
}

interface ActiveToolExecution {
  request: ToolExecutionRequest;
  result: ToolExecutionResult;
  controller: AbortController;
  timeoutId?: ReturnType<typeof setTimeout>;
  dedupeKey?: string;
}

interface ToolRuntimeOptions {
  tools: RuntimeToolDefinition[];
  defaultPolicy?: ToolExecutionPolicy;
  maxRecentExecutions?: number;
}

const DEFAULT_POLICY: Required<Pick<ToolExecutionPolicy, 'maxConcurrent' | 'timeoutMs' | 'maxRetries' | 'cooldownMs'>> = {
  maxConcurrent: 3,
  timeoutMs: 12_000,
  maxRetries: 0,
  cooldownMs: 0,
};

const snapshotListeners = new Set<() => void>();

function now() {
  return Date.now();
}

function executionIdFor(toolId: string, count: number) {
  return `tool-${toolId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${count}`;
}

function isToolExecutionError(error: unknown): error is ToolExecutionError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      'retryable' in error
  );
}

export function normalizeToolError(error: unknown, toolId: string): ToolExecutionError {
  if (isToolExecutionError(error)) return error;
  const message = error instanceof Error ? error.message : String(error || 'Unknown tool execution error');
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' || /aborted/i.test(message)) {
    return {
      code: 'tool-cancelled',
      message: `${toolId} was cancelled`,
      retryable: true,
      details: message,
    };
  }
  return {
    code: 'tool-failed',
    message,
    retryable: true,
  };
}

export class ToolRuntime {
  private tools = new Map<string, RuntimeToolDefinition>();
  private activeExecutions = new Map<string, ActiveToolExecution>();
  private dedupeIndex = new Map<string, string>();
  private recentExecutions: ToolExecutionResult[] = [];
  private executionCounter = 0;
  private counters = {
    completedCount: 0,
    failedCount: 0,
    timeoutCount: 0,
    cancellationCount: 0,
    rejectedCount: 0,
    duplicateSuppressionCount: 0,
    retryCount: 0,
  };
  private lastExecutionAt: number | undefined;
  private lastFailureAt: number | undefined;
  private snapshotCache: ToolExecutionSnapshot | undefined;

  constructor(private readonly options: ToolRuntimeOptions) {
    for (const tool of options.tools) {
      this.tools.set(tool.id, tool);
    }
  }

  async execute<TOutput = unknown>(request: ToolExecutionRequest): Promise<ToolExecutionResult<TOutput>> {
    const tool = this.tools.get(request.toolId);
    const policy = {
      ...DEFAULT_POLICY,
      ...this.options.defaultPolicy,
      ...tool?.policy,
      ...request.policy,
    };
    const dedupeKey = request.dedupeKey ?? request.policy?.dedupeKey ?? policy.dedupeKey;

    if (!tool) {
      return this.rejectedResult<TOutput>(request.toolId, 'tool-unavailable', `Tool ${request.toolId} is not registered`);
    }

    if (dedupeKey && this.dedupeIndex.has(dedupeKey)) {
      this.counters.duplicateSuppressionCount += 1;
      return this.rejectedResult<TOutput>(
        request.toolId,
        'tool-duplicate-suppressed',
        'A matching tool execution is already running',
        [{ type: 'duplicate-suppressed', metadata: { dedupeKey } }]
      );
    }

    if (this.activeExecutions.size >= policy.maxConcurrent) {
      return this.rejectedResult<TOutput>(
        request.toolId,
        'tool-concurrency-limit',
        'Tool concurrency limit reached'
      );
    }

    const startedAt = now();
    const executionId = executionIdFor(request.toolId, ++this.executionCounter);
    const controller = new AbortController();
    const result: ToolExecutionResult = {
      executionId,
      toolId: request.toolId,
      state: 'running',
      startedAt,
      trace: [
        this.trace(executionId, request.toolId, 'created', 'Tool execution created', {
          ownerId: request.ownerId,
          conversationId: request.conversationId,
          streamId: request.streamId,
        }),
        this.trace(executionId, request.toolId, 'started', 'Tool execution started'),
      ],
    };
    const active: ActiveToolExecution = { request, result, controller, dedupeKey };
    this.activeExecutions.set(executionId, active);
    if (dedupeKey) this.dedupeIndex.set(dedupeKey, executionId);
    this.lastExecutionAt = startedAt;
    this.emit();

    active.timeoutId = setTimeout(() => {
      const current = this.activeExecutions.get(executionId);
      if (!current || current.result.state !== 'running') return;
      current.result.state = 'timeout';
      current.result.trace.push(this.trace(executionId, request.toolId, 'timeout', 'Tool execution timed out'));
      current.controller.abort('tool-timeout');
    }, policy.timeoutMs);

    try {
      const output = await tool.handler(request.input, {
        executionId,
        signal: controller.signal,
        ownerId: request.ownerId,
        conversationId: request.conversationId,
        streamId: request.streamId,
      });
      if (result.state === 'timeout') {
        return this.finish<TOutput>(active, {
          state: 'timeout',
          error: { code: 'tool-timeout', message: 'Tool execution timed out', retryable: true },
        });
      }
      if (result.state === 'cancelled') {
        return this.finish<TOutput>(active, {
          state: 'cancelled',
          error: { code: 'tool-cancelled', message: 'Tool execution was cancelled', retryable: true },
        });
      }
      return this.finish<TOutput>(active, { state: 'completed', output: output as TOutput });
    } catch (error) {
      if (result.state === 'timeout') {
        return this.finish<TOutput>(active, {
          state: 'timeout',
          error: { code: 'tool-timeout', message: 'Tool execution timed out', retryable: true },
        });
      }
      if (result.state === 'cancelled') {
        return this.finish<TOutput>(active, {
          state: 'cancelled',
          error: { code: 'tool-cancelled', message: 'Tool execution was cancelled', retryable: true },
        });
      }
      return this.finish<TOutput>(active, {
        state: 'failed',
        error: normalizeToolError(error, request.toolId),
      });
    }
  }

  cancel(executionId: string, reason = 'cancelled'): boolean {
    const active = this.activeExecutions.get(executionId);
    if (!active || active.result.state !== 'running') return false;
    active.result.state = 'cancelled';
    active.result.trace.push(this.trace(executionId, active.request.toolId, 'cancelled', reason));
    active.controller.abort(reason);
    this.emit();
    return true;
  }

  cancelAll(reason = 'runtime-cleanup'): void {
    for (const executionId of Array.from(this.activeExecutions.keys())) {
      this.cancel(executionId, reason);
    }
  }

  getSnapshot(): ToolExecutionSnapshot {
    if (!this.snapshotCache) {
      this.snapshotCache = this.buildSnapshot();
    }
    return this.snapshotCache;
  }

  private buildSnapshot(): ToolExecutionSnapshot {
    return {
      activeCount: this.activeExecutions.size,
      activeExecutions: Array.from(this.activeExecutions.values()).map((active) => ({
        executionId: active.result.executionId,
        toolId: active.result.toolId,
        state: active.result.state,
        startedAt: active.result.startedAt,
      })),
      recentExecutions: [...this.recentExecutions],
      ...this.counters,
      lastExecutionAt: this.lastExecutionAt,
      lastFailureAt: this.lastFailureAt,
    };
  }

  getExecutionTrace(executionId: string): ToolExecutionTrace[] {
    const active = this.activeExecutions.get(executionId);
    if (active) return [...active.result.trace];
    return this.recentExecutions.find((result) => result.executionId === executionId)?.trace ?? [];
  }

  subscribe(listener: () => void): () => void {
    snapshotListeners.add(listener);
    return () => snapshotListeners.delete(listener);
  }

  resetForTests(): void {
    this.cancelAll('test-reset');
    this.activeExecutions.clear();
    this.dedupeIndex.clear();
    this.recentExecutions = [];
    this.executionCounter = 0;
    this.counters = {
      completedCount: 0,
      failedCount: 0,
      timeoutCount: 0,
      cancellationCount: 0,
      rejectedCount: 0,
      duplicateSuppressionCount: 0,
      retryCount: 0,
    };
    this.lastExecutionAt = undefined;
    this.lastFailureAt = undefined;
    this.emit();
  }

  private rejectedResult<TOutput>(
    toolId: string,
    code: string,
    message: string,
    traceAdditions: Array<{ type: ToolExecutionTrace['type']; metadata?: Record<string, unknown> }> = []
  ): ToolExecutionResult<TOutput> {
    const executionId = executionIdFor(toolId, ++this.executionCounter);
    const at = now();
    const result: ToolExecutionResult<TOutput> = {
      executionId,
      toolId,
      state: 'rejected',
      startedAt: at,
      completedAt: at,
      latencyMs: 0,
      error: { code, message, retryable: code !== 'tool-duplicate-suppressed' },
      trace: [
        this.trace(executionId, toolId, 'created', 'Tool execution created'),
        ...traceAdditions.map((item) => this.trace(executionId, toolId, item.type, message, item.metadata)),
        this.trace(executionId, toolId, 'rejected', message),
      ],
    };
    this.counters.rejectedCount += 1;
    this.recordRecent(result);
    this.emit();
    return result;
  }

  private finish<TOutput>(
    active: ActiveToolExecution,
    patch: Pick<ToolExecutionResult<TOutput>, 'state' | 'output' | 'error'>
  ): ToolExecutionResult<TOutput> {
    const completedAt = now();
    const result = active.result as ToolExecutionResult<TOutput>;
    if (active.timeoutId) clearTimeout(active.timeoutId);
    this.activeExecutions.delete(result.executionId);
    if (active.dedupeKey) this.dedupeIndex.delete(active.dedupeKey);
    result.state = patch.state;
    result.output = patch.output;
    result.error = patch.error;
    result.completedAt = completedAt;
    result.latencyMs = Math.max(0, completedAt - (result.startedAt ?? completedAt));
    result.trace.push(this.trace(
      result.executionId,
      result.toolId,
      patch.state as ToolExecutionTrace['type'],
      `Tool execution ${patch.state}`
    ));

    if (patch.state === 'completed') this.counters.completedCount += 1;
    if (patch.state === 'failed') {
      this.counters.failedCount += 1;
      this.lastFailureAt = completedAt;
    }
    if (patch.state === 'timeout') {
      this.counters.timeoutCount += 1;
      this.lastFailureAt = completedAt;
    }
    if (patch.state === 'cancelled') this.counters.cancellationCount += 1;
    this.recordRecent(result);
    this.emit();
    return result;
  }

  private recordRecent(result: ToolExecutionResult): void {
    const max = this.options.maxRecentExecutions ?? 16;
    this.recentExecutions = [result, ...this.recentExecutions].slice(0, max);
  }

  private trace(
    executionId: string,
    toolId: string,
    type: ToolExecutionTrace['type'],
    message?: string,
    metadata?: Record<string, unknown>
  ): ToolExecutionTrace {
    return {
      executionId,
      toolId,
      type,
      at: now(),
      message,
      metadata,
    };
  }

  private emit(): void {
    this.snapshotCache = this.buildSnapshot();
    for (const listener of snapshotListeners) listener();
  }
}

export function createToolRuntime(options: ToolRuntimeOptions): ToolRuntime {
  return new ToolRuntime(options);
}

export const toolRuntime = createToolRuntime({
  tools: toolRegistry.getAll() as RuntimeToolDefinition[],
});

export function executeTool<TOutput = unknown>(
  request: ToolExecutionRequest
): Promise<ToolExecutionResult<TOutput>> {
  return toolRuntime.execute<TOutput>(request);
}

export function cancelToolExecution(executionId: string, reason?: string): boolean {
  return toolRuntime.cancel(executionId, reason);
}

export function getToolRuntimeSnapshot(): ToolExecutionSnapshot {
  return toolRuntime.getSnapshot();
}

export function subscribeToolRuntime(listener: () => void): () => void {
  return toolRuntime.subscribe(listener);
}

export function resetToolRuntimeForTests(): void {
  toolRuntime.resetForTests();
}
