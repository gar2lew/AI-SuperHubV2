import type { RuntimeToolDefinition, ToolCategory } from './runtime';

type BuiltinToolKind = ToolCategory | 'realtime';

interface NormalizedRealtimeOutput {
  kind: BuiltinToolKind;
  query: string;
  status: 'metadata-only';
  summary: string;
  source: 'ai-superhub-tool-runtime';
  observedAt: number;
  metadata?: Record<string, unknown>;
}

function textInput(input: Record<string, unknown>, key = 'query'): string {
  const value = input[key] ?? input.prompt ?? input.url ?? input.symbol ?? '';
  return String(value).trim();
}

function normalizedOutput(
  kind: BuiltinToolKind,
  query: string,
  summary: string,
  metadata?: Record<string, unknown>
): NormalizedRealtimeOutput {
  return {
    kind,
    query,
    status: 'metadata-only',
    summary,
    source: 'ai-superhub-tool-runtime',
    observedAt: Date.now(),
    metadata,
  };
}

export const realtimeToolDefinitions: RuntimeToolDefinition[] = [
  {
    id: 'weather.lookup',
    name: 'Weather Lookup',
    description: 'Bounded realtime weather lookup request metadata',
    category: 'weather',
    capabilities: ['realtimeWeb', 'tools'],
    parameters: {
      location: { type: 'string', description: 'Location or forecast query' },
      query: { type: 'string', description: 'Weather query' },
    },
    policy: { timeoutMs: 8_000, maxConcurrent: 2 },
    handler: async (input) => {
      const query = textInput(input, 'location') || textInput(input);
      return normalizedOutput(
        'weather',
        query,
        'Weather lookup requested. Live provider routing should use realtime-capable models for final synthesis.'
      );
    },
  },
  {
    id: 'news.lookup',
    name: 'News Lookup',
    description: 'Bounded latest-news lookup request metadata',
    category: 'news',
    capabilities: ['realtimeWeb', 'tools', 'research'],
    parameters: {
      query: { type: 'string', description: 'News topic or current-events query' },
    },
    policy: { timeoutMs: 8_000, maxConcurrent: 2 },
    handler: async (input) =>
      normalizedOutput(
        'news',
        textInput(input),
        'Latest-news lookup requested. Runtime should avoid static-only providers for final synthesis.'
      ),
  },
  {
    id: 'web.query',
    name: 'Realtime Web Query',
    description: 'General realtime lookup metadata for current information prompts',
    category: 'web',
    capabilities: ['realtimeWeb', 'tools', 'research'],
    parameters: {
      query: { type: 'string', description: 'Realtime lookup query' },
    },
    policy: { timeoutMs: 8_000, maxConcurrent: 2 },
    handler: async (input) =>
      normalizedOutput(
        'realtime',
        textInput(input),
        'Realtime lookup requested. This deterministic wrapper records intent without scraping arbitrary websites.'
      ),
  },
  {
    id: 'url.retrieve',
    name: 'URL Retrieval',
    description: 'URL retrieval intent normalization without unrestricted scraping',
    category: 'url',
    capabilities: ['realtimeWeb', 'tools', 'research'],
    parameters: {
      url: { type: 'string', description: 'URL to inspect through a bounded retrieval path' },
    },
    policy: { timeoutMs: 8_000, maxConcurrent: 1 },
    handler: async (input) => {
      const rawUrl = textInput(input, 'url') || textInput(input);
      let hostname: string | undefined;
      try {
        hostname = new URL(rawUrl).hostname;
      } catch {
        hostname = undefined;
      }
      return normalizedOutput(
        'url',
        rawUrl,
        'URL retrieval requested. The runtime preserved URL intent without unrestricted page scraping.',
        { hostname }
      );
    },
  },
  {
    id: 'market.lookup',
    name: 'Market Lookup',
    description: 'Bounded market/stock lookup request metadata',
    category: 'market',
    capabilities: ['realtimeWeb', 'tools', 'research'],
    parameters: {
      symbol: { type: 'string', description: 'Ticker or market symbol' },
      query: { type: 'string', description: 'Market lookup query' },
    },
    policy: { timeoutMs: 8_000, maxConcurrent: 2 },
    handler: async (input) =>
      normalizedOutput(
        'market',
        textInput(input, 'symbol') || textInput(input),
        'Market lookup requested. Runtime should preserve provider/tool capability boundaries for final synthesis.'
      ),
  },
];
