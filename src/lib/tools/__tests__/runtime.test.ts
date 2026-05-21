import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createToolRuntime,
  normalizeToolError,
  type RuntimeToolDefinition,
} from '@/lib/tools/runtime';
import { realtimeToolDefinitions } from '@/lib/tools/builtin-tools';

const fastTool: RuntimeToolDefinition = {
  id: 'test.fast',
  name: 'Fast Tool',
  description: 'Completes immediately',
  category: 'web',
  capabilities: ['tools'],
  parameters: {},
  handler: async (input) => ({ ok: true, input }),
};

function createNeverTool(onAbort?: () => void): RuntimeToolDefinition {
  return {
    id: 'test.never',
    name: 'Never Tool',
    description: 'Waits until aborted',
    category: 'web',
    capabilities: ['tools'],
    parameters: {},
    handler: async (_input, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => {
          onAbort?.();
          reject(normalizeToolError(new DOMException('Aborted', 'AbortError'), 'test.never'));
        });
      }),
  };
}

describe('ToolRuntime', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('completes a tool execution with trace and latency metadata', async () => {
    const runtime = createToolRuntime({ tools: [fastTool] });

    const result = await runtime.execute({
      toolId: 'test.fast',
      input: { query: 'weather perth' },
      ownerId: 'conversation-1',
    });

    expect(result.state).toBe('completed');
    expect(result.output).toEqual({ ok: true, input: { query: 'weather perth' } });
    expect(result.executionId).toMatch(/^tool-test-fast-/);
    expect(result.trace.map((event) => event.type)).toEqual(['created', 'started', 'completed']);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(runtime.getSnapshot().activeCount).toBe(0);
  });

  it('executes builtin weather tooling as bounded normalized metadata', async () => {
    const runtime = createToolRuntime({ tools: realtimeToolDefinitions });

    const result = await runtime.execute({
      toolId: 'weather.lookup',
      input: { location: 'Perth' },
    });

    expect(result.state).toBe('completed');
    expect(result.output).toMatchObject({
      kind: 'weather',
      query: 'Perth',
      status: 'metadata-only',
      source: 'ai-superhub-tool-runtime',
    });
  });

  it('times out and cleans active ownership deterministically', async () => {
    vi.useFakeTimers();
    const runtime = createToolRuntime({ tools: [createNeverTool()], defaultPolicy: { timeoutMs: 100 } });

    const pending = runtime.execute({ toolId: 'test.never', input: {} });
    await vi.advanceTimersByTimeAsync(150);
    const result = await pending;

    expect(result.state).toBe('timeout');
    expect(result.error).toMatchObject({ code: 'tool-timeout', retryable: true });
    expect(result.trace.map((event) => event.type)).toContain('timeout');
    expect(runtime.getSnapshot()).toMatchObject({
      activeCount: 0,
      timeoutCount: 1,
    });
  });

  it('cancels a running execution and releases the abort signal', async () => {
    vi.useFakeTimers();
    const onAbort = vi.fn();
    const runtime = createToolRuntime({ tools: [createNeverTool(onAbort)], defaultPolicy: { timeoutMs: 1000 } });

    const pending = runtime.execute({ toolId: 'test.never', input: {} });
    const activeId = runtime.getSnapshot().activeExecutions[0]?.executionId;
    expect(activeId).toBeTruthy();

    runtime.cancel(activeId!, 'user-abort');
    await vi.runOnlyPendingTimersAsync();
    const result = await pending;

    expect(result.state).toBe('cancelled');
    expect(result.error).toMatchObject({ code: 'tool-cancelled', retryable: true });
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot()).toMatchObject({
      activeCount: 0,
      cancellationCount: 1,
    });
  });

  it('suppresses duplicate running requests by dedupe key', async () => {
    vi.useFakeTimers();
    const runtime = createToolRuntime({ tools: [createNeverTool()], defaultPolicy: { timeoutMs: 1000 } });

    const first = runtime.execute({ toolId: 'test.never', input: {}, dedupeKey: 'same-weather' });
    const duplicate = await runtime.execute({ toolId: 'test.never', input: {}, dedupeKey: 'same-weather' });

    expect(duplicate.state).toBe('rejected');
    expect(duplicate.error).toMatchObject({ code: 'tool-duplicate-suppressed', retryable: false });
    expect(runtime.getSnapshot().duplicateSuppressionCount).toBe(1);

    runtime.cancel(runtime.getSnapshot().activeExecutions[0]!.executionId, 'cleanup');
    await vi.runOnlyPendingTimersAsync();
    await first;
  });

  it('enforces max concurrent executions without queuing hidden work', async () => {
    vi.useFakeTimers();
    const runtime = createToolRuntime({
      tools: [createNeverTool(), fastTool],
      defaultPolicy: { timeoutMs: 1000, maxConcurrent: 1 },
    });

    const first = runtime.execute({ toolId: 'test.never', input: {} });
    const rejected = await runtime.execute({ toolId: 'test.fast', input: {} });

    expect(rejected.state).toBe('rejected');
    expect(rejected.error).toMatchObject({ code: 'tool-concurrency-limit', retryable: true });
    expect(runtime.getSnapshot().rejectedCount).toBe(1);

    runtime.cancel(runtime.getSnapshot().activeExecutions[0]!.executionId, 'cleanup');
    await vi.runOnlyPendingTimersAsync();
    await first;
  });
});
