import { describe, expect, it } from 'vitest';
import {
  detectToolExecutionIntent,
  getLastToolOrchestrationIntent,
  resolveToolEligibility,
} from '@/lib/tools/orchestration';

describe('tool orchestration detection', () => {
  it('maps weather prompts to the weather lookup tool', () => {
    const intent = detectToolExecutionIntent('What is the weather today in Perth?');

    expect(intent).toMatchObject({
      toolEligible: true,
      toolId: 'weather.lookup',
      orchestrationMode: 'weather',
    });
    expect(intent.requiredCapabilities).toContain('realtimeWeb');
  });

  it('maps latest/current prompts to news or general realtime tools', () => {
    expect(detectToolExecutionIntent('latest AI policy news today')).toMatchObject({
      toolId: 'news.lookup',
      orchestrationMode: 'news',
    });
    expect(detectToolExecutionIntent('current status of the Perth trains')).toMatchObject({
      toolId: 'web.query',
      orchestrationMode: 'realtime-lookup',
    });
  });

  it('maps market and URL prompts to bounded deterministic tools', () => {
    expect(detectToolExecutionIntent('current stock price for MSFT')).toMatchObject({
      toolId: 'market.lookup',
      orchestrationMode: 'market',
    });
    expect(detectToolExecutionIntent('summarize https://example.com/release-notes')).toMatchObject({
      toolId: 'url.retrieve',
      orchestrationMode: 'url',
    });
  });

  it('returns transparent eligibility rejection when the tool is unavailable', () => {
    const intent = detectToolExecutionIntent('What is the weather now?');
    const eligibility = resolveToolEligibility(intent, {
      availableToolIds: ['news.lookup'],
    });

    expect(eligibility).toMatchObject({
      eligible: false,
      reason: 'tool-unavailable',
      toolId: 'weather.lookup',
    });
  });

  it('records the latest tool orchestration intent for diagnostics', () => {
    const intent = detectToolExecutionIntent('latest market news');

    expect(getLastToolOrchestrationIntent()).toEqual(intent);
  });
});
