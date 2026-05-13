import type { AIChunk, AIChunkMetadata } from '@/types';
import { recordClientError } from '@/lib/diagnostics/client-errors';
import {
  recordStreamAbort,
  recordStreamChunk,
  recordStreamComplete,
  recordStreamError,
  recordStreamStart,
} from '@/lib/telemetry/runtimeTelemetry';

// ============================================================
// STREAM ENGINE
// Centralized streaming orchestration with timeout protection.
// NOT store-centric. Store receives batched updates.
// ============================================================

export interface StreamEngineOptions {
  /** Batch flush interval in ms. Default: 16 (one frame) */
  flushIntervalMs?: number;
  /** Max chunks to buffer before forced flush */
  maxBufferSize?: number;
  /** Coalesce consecutive text chunks into one */
  coalesceText?: boolean;
  /** Stream timeout in ms. Default: 60000 (1 minute) */
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: StreamEngineOptions = {
  flushIntervalMs: 16,
  maxBufferSize: 50,
  coalesceText: true,
  timeoutMs: 60000,
};

export interface StreamCallbacks {
  onChunk: (chunk: AIChunk) => void;
  onBatch: (chunks: AIChunk[]) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  onAbort: () => void;
  onTimeout?: () => void;
}

export interface StreamOwner {
  streamId: string;
  conversationId?: string;
  providerId?: string;
  modelId?: string;
}

export interface StreamDiagnostics {
  chunkCount: number;
  bufferedCount: number;
  pendingCount: number;
  lastChunkAt: number;
  startedAt: number;
  durationMs: number;
  throughputPerSecond: number;
  streamId?: string;
  conversationId?: string;
  isRunning: boolean;
}

export function getChunkSequence(chunk: AIChunk): number | undefined {
  return chunk.metadata?.sequence;
}

/**
 * StreamEngine manages chunk buffering, throttling, coalescing, and timeout.
 * Uses requestAnimationFrame for UI-friendly batching.
 */
export class StreamEngine {
  private buffer: AIChunk[] = [];
  private pending: AIChunk[] = [];
  private rafId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private options: Required<StreamEngineOptions>;
  private callbacks: StreamCallbacks;
  private lastChunkAt = 0;
  private chunkCount = 0;
  private sequence = 0;
  private startedAt = 0;
  private owner?: StreamOwner;
  private seenSequences = new Set<number>();
  private lastSequence = -1;

  constructor(callbacks: StreamCallbacks, options: StreamEngineOptions = {}, owner?: StreamOwner) {
    this.callbacks = callbacks;
    this.options = { ...DEFAULT_OPTIONS, ...options } as Required<StreamEngineOptions>;
    this.owner = owner;
  }

  /** Start the engine. */
  start(): void {
    this.isRunning = true;
    this.buffer = [];
    this.pending = [];
    this.lastChunkAt = Date.now();
    this.startedAt = Date.now();
    this.chunkCount = 0;
    this.sequence = 0;
    this.lastSequence = -1;
    this.seenSequences.clear();
    recordStreamStart({
      streamId: this.owner?.streamId ?? 'unowned-stream',
      conversationId: this.owner?.conversationId,
      providerId: this.owner?.providerId ?? 'unknown',
      modelId: this.owner?.modelId ?? 'unknown',
    });
    this.startTimeout();
  }

  /** Start the timeout timer. */
  private startTimeout(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      if (this.isRunning) {
        console.warn('[StreamEngine] Stream timed out after', this.options.timeoutMs, 'ms');
        this.callbacks.onTimeout?.();
        this.error(new Error('Stream timed out'));
      }
    }, this.options.timeoutMs);
  }

  /** Reset timeout on activity. */
  private resetTimeout(): void {
    this.lastChunkAt = Date.now();
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.startTimeout();
    }
  }

  /** Queue a chunk. Batched via RAF for performance. */
  push(chunk: AIChunk): void {
    if (!this.isRunning) return;

    const enriched = this.withMetadata(chunk);
    const sequence = getChunkSequence(enriched);
    if (typeof sequence === 'number') {
      if (sequence <= this.lastSequence) return;
      if (this.seenSequences.has(sequence)) return;
      this.seenSequences.add(sequence);
      this.lastSequence = sequence;
    }

    this.pending.push(enriched);
    this.chunkCount++;
    recordStreamChunk(this.owner?.streamId ?? 'unowned-stream', String(enriched.content).length);
    this.resetTimeout();

    // Force flush if buffer gets too large
    if (this.pending.length >= this.options.maxBufferSize) {
      this.flush();
      return;
    }

    // Schedule RAF flush
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.flush();
      });
    }
  }

  /** Flush pending chunks to callbacks. */
  private flush(): void {
    if (this.pending.length === 0) return;

    const batch = this.options.coalesceText
      ? this.coalesceTextChunks(this.pending)
      : [...this.pending];

    this.pending = [];
    this.buffer.push(...batch);

    // Notify callbacks
    for (const chunk of batch) {
      this.callbacks.onChunk(chunk);
    }
    this.callbacks.onBatch(batch);
  }

  /** Coalesce consecutive text chunks to reduce re-renders. */
  private coalesceTextChunks(chunks: AIChunk[]): AIChunk[] {
    const result: AIChunk[] = [];
    let textAccumulator = '';
    let lastMetadata: AIChunkMetadata | undefined;

    for (const chunk of chunks) {
      if (chunk.type === 'text') {
        textAccumulator += chunk.content;
        lastMetadata = chunk.metadata;
      } else {
        // Flush accumulated text before non-text chunk
        if (textAccumulator) {
          result.push({ type: 'text', content: textAccumulator, metadata: lastMetadata });
          textAccumulator = '';
          lastMetadata = undefined;
        }
        result.push(chunk);
      }
    }

    // Flush remaining text
    if (textAccumulator) {
      result.push({ type: 'text', content: textAccumulator, metadata: lastMetadata });
    }

    return result;
  }

  private withMetadata(chunk: AIChunk): AIChunk {
    const sequence = chunk.metadata?.sequence ?? this.sequence++;
    if (typeof chunk.metadata?.sequence === 'number') {
      this.sequence = Math.max(this.sequence, chunk.metadata.sequence + 1);
    }

    const metadata: AIChunkMetadata = {
      ...(chunk.metadata || {}),
      streamId: this.owner?.streamId,
      conversationId: this.owner?.conversationId,
      sequence,
    };

    switch (chunk.type) {
      case 'tool_call':
      case 'tool_result':
        return { ...chunk, metadata: { ...chunk.metadata, ...metadata } };
      default:
        return { ...chunk, metadata };
    }
  }

  /** Signal completion. */
  done(): void {
    this.flush();
    this.isRunning = false;
    this.clearTimeout();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.callbacks.onDone();
    recordStreamComplete(this.owner?.streamId ?? 'unowned-stream');
  }

  /** Signal error. */
  error(err: Error): void {
    this.flush();
    this.isRunning = false;
    this.clearTimeout();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.callbacks.onError(err);
    recordClientError({
      source: 'stream',
      error: err,
      context: {
        streamId: this.owner?.streamId,
        conversationId: this.owner?.conversationId,
        providerId: this.owner?.providerId,
        modelId: this.owner?.modelId,
      },
    });
    recordStreamError(this.owner?.streamId ?? 'unowned-stream');
  }

  /** Signal abort. */
  abort(): void {
    this.flush();
    this.isRunning = false;
    this.clearTimeout();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.callbacks.onAbort();
    recordStreamAbort(this.owner?.streamId ?? 'unowned-stream');
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /** Get accumulated buffer. */
  getBuffer(): AIChunk[] {
    return [...this.buffer];
  }

  /** Check if engine is active. */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /** Get diagnostics. */
  getDiagnostics(): StreamDiagnostics {
    return {
      chunkCount: this.chunkCount,
      bufferedCount: this.buffer.length,
      pendingCount: this.pending.length,
      lastChunkAt: this.lastChunkAt,
      startedAt: this.startedAt,
      durationMs: this.startedAt ? Date.now() - this.startedAt : 0,
      throughputPerSecond:
        this.startedAt && Date.now() > this.startedAt
          ? Math.round((this.chunkCount / (Date.now() - this.startedAt)) * 1000)
          : 0,
      streamId: this.owner?.streamId,
      conversationId: this.owner?.conversationId,
      isRunning: this.isRunning,
    };
  }

  /** Dispose resources. */
  dispose(): void {
    this.abort();
    this.buffer = [];
    this.pending = [];
  }
}

/**
 * Convenience: run a provider stream through the engine.
 */
export async function runStream(
  stream: AsyncGenerator<AIChunk>,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  options?: StreamEngineOptions
): Promise<AIChunk[]> {
  const engine = new StreamEngine(callbacks, options);
  engine.start();

  try {
    for await (const chunk of stream) {
      if (abortSignal?.aborted) {
        engine.abort();
        return engine.getBuffer();
      }
      engine.push(chunk);
    }
    engine.done();
  } catch (err) {
    engine.error(err as Error);
  }

  return engine.getBuffer();
}
