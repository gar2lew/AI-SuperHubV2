import type { Conversation, ContentPart, WorkspaceMetadata } from '@/types';

export interface SearchResult<T> {
  item: T;
  score: number;
  matchedFields: string[];
}

export interface ConversationSearchOptions {
  includeArchived?: boolean;
}

const FIELD_WEIGHTS: Record<string, number> = {
  title: 5,
  name: 5,
  intent: 5,
  category: 4,
  tags: 4,
  summary: 3,
  description: 3,
  pinnedContext: 2,
  messages: 1,
};

function tokenize(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter(Boolean)
    )
  );
}

function textFromContent(content: ContentPart[]): string {
  return content
    .map((part) => {
      if (part.type === 'text') return part.text;
      return [part.name, part.mimeType, part.persistenceState].filter(Boolean).join(' ');
    })
    .join(' ');
}

function scoreFields<T>(item: T, fields: Record<string, string>, tokens: string[]): SearchResult<T> | null {
  const matchedFields: string[] = [];
  let score = 0;

  for (const [field, value] of Object.entries(fields)) {
    const haystack = value.toLowerCase();
    const matches = tokens.filter((token) => haystack.includes(token));
    if (matches.length === 0) continue;
    matchedFields.push(field);
    score += matches.length * (FIELD_WEIGHTS[field] ?? 1);
  }

  return score > 0 ? { item, score, matchedFields } : null;
}

export function searchConversations(
  conversations: Conversation[],
  query: string,
  options: ConversationSearchOptions = {}
): SearchResult<Conversation>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  return conversations
    .filter((conversation) => options.includeArchived || !conversation.archivedAt)
    .map((conversation) =>
      scoreFields(
        conversation,
        {
          title: conversation.title,
          summary: conversation.summary ?? '',
          tags: conversation.tags?.join(' ') ?? '',
          messages: conversation.messages.map((message) => textFromContent(message.content)).join(' '),
        },
        tokens
      )
    )
    .filter((result): result is SearchResult<Conversation> => Boolean(result))
    .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt);
}

export function searchWorkspaces(
  workspaces: WorkspaceMetadata[],
  query: string
): SearchResult<WorkspaceMetadata>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  return workspaces
    .map((workspace) =>
      scoreFields(
        workspace,
        {
          name: workspace.name,
          intent: workspace.intent ?? '',
          category: workspace.category ?? '',
          tags: workspace.tags?.join(' ') ?? '',
          summary: workspace.summary ?? '',
          description: workspace.description ?? '',
          pinnedContext: workspace.pinnedContext
            .map((block) => `${block.title} ${block.content}`)
            .join(' '),
        },
        tokens
      )
    )
    .filter((result): result is SearchResult<WorkspaceMetadata> => Boolean(result))
    .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt);
}
