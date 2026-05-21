import type { RuntimeCapability } from '@/lib/models/capability-matrix';
import { toolRegistry } from './registry';

export type ToolOrchestrationMode =
  | 'none'
  | 'weather'
  | 'news'
  | 'market'
  | 'url'
  | 'realtime-lookup';

export interface ToolExecutionIntent {
  toolEligible: boolean;
  toolId?: string;
  orchestrationMode: ToolOrchestrationMode;
  requiredCapabilities: RuntimeCapability[];
  reasons: string[];
  input: Record<string, unknown>;
}

export interface ToolEligibilityResult {
  eligible: boolean;
  toolId?: string;
  reason?: 'no-tool-intent' | 'tool-unavailable';
}

interface ToolEligibilityOptions {
  availableToolIds?: string[];
}

const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/i;
const WEATHER_PATTERN = /\b(weather|forecast|temperature|rain|wind)\b/i;
const NEWS_PATTERN = /\b(latest|breaking|news|headline|current events?)\b/i;
const MARKET_PATTERN = /\b(stock|stocks|share price|market|ticker|nasdaq|nyse|crypto|bitcoin|btc|eth|price)\b/i;
const REALTIME_PATTERN = /\b(today|current|now|latest|recent|live|status)\b/i;

let lastToolOrchestrationIntent: ToolExecutionIntent | null = null;

function baseIntent(prompt: string): ToolExecutionIntent {
  return {
    toolEligible: false,
    orchestrationMode: 'none',
    requiredCapabilities: [],
    reasons: [],
    input: { query: prompt },
  };
}

function withTool(
  prompt: string,
  toolId: string,
  orchestrationMode: Exclude<ToolOrchestrationMode, 'none'>,
  reason: string,
  input: Record<string, unknown> = { query: prompt }
): ToolExecutionIntent {
  return {
    toolEligible: true,
    toolId,
    orchestrationMode,
    requiredCapabilities: ['realtimeWeb', 'tools'],
    reasons: [reason],
    input,
  };
}

export function detectToolExecutionIntent(prompt: string): ToolExecutionIntent {
  const normalized = prompt.trim();
  const urlMatch = normalized.match(URL_PATTERN)?.[0];
  const intent =
    urlMatch
      ? withTool(normalized, 'url.retrieve', 'url', 'prompt contains a URL', { url: urlMatch, query: normalized })
      : WEATHER_PATTERN.test(normalized)
        ? withTool(normalized, 'weather.lookup', 'weather', 'prompt requests realtime weather')
        : MARKET_PATTERN.test(normalized)
          ? withTool(normalized, 'market.lookup', 'market', 'prompt requests realtime market data')
          : NEWS_PATTERN.test(normalized)
            ? withTool(normalized, 'news.lookup', 'news', 'prompt requests latest news')
            : REALTIME_PATTERN.test(normalized)
              ? withTool(normalized, 'web.query', 'realtime-lookup', 'prompt references current realtime information')
              : baseIntent(normalized);
  lastToolOrchestrationIntent = intent;
  return intent;
}

export function resolveToolEligibility(
  intent: ToolExecutionIntent,
  options: ToolEligibilityOptions = {}
): ToolEligibilityResult {
  if (!intent.toolEligible || !intent.toolId) {
    return { eligible: false, reason: 'no-tool-intent' };
  }
  const available = new Set(options.availableToolIds ?? toolRegistry.getAll().map((tool) => tool.id));
  if (!available.has(intent.toolId)) {
    return { eligible: false, toolId: intent.toolId, reason: 'tool-unavailable' };
  }
  return { eligible: true, toolId: intent.toolId };
}

export function getLastToolOrchestrationIntent(): ToolExecutionIntent | null {
  return lastToolOrchestrationIntent;
}
