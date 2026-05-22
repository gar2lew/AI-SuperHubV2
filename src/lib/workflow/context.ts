import type { WorkspaceId } from '@/store/settingsStore';
import { boundedText, dedupeBy, isStaleTimestamp } from '@/lib/persistence/governance';

export type WorkflowContextType =
  | 'text'
  | 'code'
  | 'terminal-output'
  | 'tool-result'
  | 'image-artifact'
  | 'diagnostics-snapshot'
  | 'prompt'
  | 'workspace-note';

export interface WorkflowContextPayload {
  text?: string;
  code?: string;
  language?: string;
  command?: string;
  output?: string;
  artifactId?: string;
  prompt?: string;
  url?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface WorkflowContextPacket {
  id: string;
  type: WorkflowContextType;
  title: string;
  summary: string;
  sourceWorkspace: WorkspaceId | 'diagnostics' | 'tools';
  payload: WorkflowContextPayload;
  createdAt: number;
  useCount: number;
}

export interface WorkflowContextInput {
  type: WorkflowContextType;
  title: string;
  summary?: string;
  sourceWorkspace: WorkflowContextPacket['sourceWorkspace'];
  payload: WorkflowContextPayload;
  createdAt?: number;
}

export const WORKFLOW_CONTEXT_HISTORY_LIMIT = 32;
export const WORKFLOW_CONTEXT_ATTACHMENT_LIMIT = 8;
export const WORKFLOW_CONTEXT_TEXT_LIMIT = 2400;
export const WORKFLOW_CONTEXT_SUMMARY_LIMIT = 220;

const now = () => Date.now();

const allowedTypes = new Set<WorkflowContextType>([
  'text',
  'code',
  'terminal-output',
  'tool-result',
  'image-artifact',
  'diagnostics-snapshot',
  'prompt',
  'workspace-note',
]);

const allowedSources = new Set<WorkflowContextPacket['sourceWorkspace']>([
  'chat',
  'coding',
  'image',
  'voice',
  'terminal',
  'diagnostics',
  'tools',
]);

export function workflowContextId(input: Pick<WorkflowContextInput, 'type' | 'sourceWorkspace' | 'title' | 'payload'>) {
  const rawValue = [
    input.type,
    input.sourceWorkspace,
    input.title,
    input.payload.text,
    input.payload.code,
    input.payload.command,
    input.payload.output,
    input.payload.artifactId,
    input.payload.prompt,
  ]
    .filter(Boolean)
    .join(':')
    .toLowerCase();
  return `workflow:${hashString(rawValue)}`;
}

export function createWorkflowContextPacket(input: WorkflowContextInput): WorkflowContextPacket {
  const title = boundedText(input.title, 80) || contextTypeLabel(input.type);
  const payload = sanitizeWorkflowPayload(input.payload);
  return {
    id: workflowContextId({ ...input, title, payload }),
    type: allowedTypes.has(input.type) ? input.type : 'text',
    title,
    summary: boundedText(input.summary, WORKFLOW_CONTEXT_SUMMARY_LIMIT) || summarizePayload(payload) || title,
    sourceWorkspace: allowedSources.has(input.sourceWorkspace) ? input.sourceWorkspace : 'chat',
    payload,
    createdAt: isStaleTimestamp(input.createdAt) ? now() : input.createdAt ?? now(),
    useCount: 1,
  };
}

export function sanitizeWorkflowContexts(value: unknown, limit = WORKFLOW_CONTEXT_HISTORY_LIMIT): WorkflowContextPacket[] {
  const entries = Array.isArray(value) ? value : [];
  return dedupeBy(
    entries
      .filter((entry): entry is Partial<WorkflowContextPacket> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => {
        const type = allowedTypes.has(entry.type as WorkflowContextType) ? entry.type as WorkflowContextType : 'text';
        const sourceWorkspace = allowedSources.has(entry.sourceWorkspace as WorkflowContextPacket['sourceWorkspace'])
          ? entry.sourceWorkspace as WorkflowContextPacket['sourceWorkspace']
          : 'chat';
        const payload = sanitizeWorkflowPayload(entry.payload);
        const title = boundedText(entry.title, 80) || contextTypeLabel(type);
        const packet: WorkflowContextPacket = {
          id: boundedText(entry.id, 96) || workflowContextId({ type, sourceWorkspace, title, payload }),
          type,
          title,
          summary: boundedText(entry.summary, WORKFLOW_CONTEXT_SUMMARY_LIMIT) || summarizePayload(payload) || title,
          sourceWorkspace,
          payload,
          createdAt: isStaleTimestamp(entry.createdAt) ? now() : entry.createdAt as number,
          useCount: Math.max(1, Math.min(99, Number(entry.useCount) || 1)),
        };
        return packet;
      }),
    (entry) => entry.id,
    limit
  );
}

export function sanitizeAttachedWorkflowContextIds(value: unknown, contexts: WorkflowContextPacket[]) {
  if (!Array.isArray(value)) return [];
  const validIds = new Set(contexts.map((context) => context.id));
  return Array.from(new Set(value.map((item) => boundedText(item, 96)).filter((id) => id && validIds.has(id)))).slice(
    0,
    WORKFLOW_CONTEXT_ATTACHMENT_LIMIT
  );
}

export function formatWorkflowContextsForPrompt(contexts: WorkflowContextPacket[]) {
  if (contexts.length === 0) return '';
  const lines = contexts.slice(0, WORKFLOW_CONTEXT_ATTACHMENT_LIMIT).map((context, index) => {
    const body = contextPayloadText(context);
    return [
      `[${index + 1}] ${contextTypeLabel(context.type)} from ${context.sourceWorkspace}: ${context.title}`,
      context.summary ? `Summary: ${context.summary}` : '',
      body ? `Content: ${body}` : '',
    ].filter(Boolean).join('\n');
  });
  return `Attached workstation context:\n${lines.join('\n\n')}`;
}

export function contextPayloadText(context: WorkflowContextPacket) {
  const payload = context.payload;
  return boundedText(
    payload.code || payload.output || payload.text || payload.prompt || payload.url || payload.artifactId || '',
    WORKFLOW_CONTEXT_TEXT_LIMIT
  );
}

export function contextTypeLabel(type: WorkflowContextType) {
  return type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sanitizeWorkflowPayload(payload: unknown): WorkflowContextPayload {
  if (!payload || typeof payload !== 'object') return {};
  const value = payload as WorkflowContextPayload;
  const metadata = value.metadata && typeof value.metadata === 'object'
    ? Object.fromEntries(
        Object.entries(value.metadata)
          .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) || item === null)
          .slice(0, 12)
      )
    : undefined;
  return {
    text: boundedText(value.text, WORKFLOW_CONTEXT_TEXT_LIMIT),
    code: boundedText(value.code, WORKFLOW_CONTEXT_TEXT_LIMIT),
    language: boundedText(value.language, 40),
    command: boundedText(value.command, 240),
    output: boundedText(value.output, WORKFLOW_CONTEXT_TEXT_LIMIT),
    artifactId: boundedText(value.artifactId, 120),
    prompt: boundedText(value.prompt, 600),
    url: sanitizeContextUrl(value.url),
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function sanitizeContextUrl(url: unknown) {
  const value = boundedText(url, 500);
  if (!value || value.startsWith('blob:') || value.startsWith('data:')) return undefined;
  return value;
}

function summarizePayload(payload: WorkflowContextPayload) {
  return boundedText(payload.text || payload.code || payload.output || payload.prompt || payload.url || payload.artifactId, WORKFLOW_CONTEXT_SUMMARY_LIMIT);
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
