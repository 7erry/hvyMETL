import { describe, expect, it } from 'vitest';
import { buildSizingAssistantSystemPrompt, SIZING_ASSISTANT_SYSTEM_PROMPT } from './sizingAssistantPrompt.js';

describe('sizingAssistant system prompt snapshot', () => {
  it('matches stable compiled system prompt shape', () => {
    const prompt = buildSizingAssistantSystemPrompt();
    expect(prompt).toMatchSnapshot();
    expect(SIZING_ASSISTANT_SYSTEM_PROMPT.length).toBeGreaterThan(2000);
    expect(prompt).toContain('update_sizing_parameters');
    expect(prompt).toContain('find_optimal_cluster_tier');
    expect(prompt).toContain('Sizing Logic Reference');
    expect(prompt).toContain('Infrastructure Architect Framework');
  });
});
