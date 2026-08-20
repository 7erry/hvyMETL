import { describe, expect, it } from 'vitest';
import { conversationNeedsArchitectureInstructions } from './copilotArchitectureMode.js';
import { buildOptimizeSchemaUserPrompt } from './copilotArchitecturePrompt.js';

describe('conversationNeedsArchitectureInstructions', () => {
  it('returns false for ordinary copilot chat', () => {
    expect(
      conversationNeedsArchitectureInstructions([{ role: 'user', content: 'Explain embedding for orders' }]),
    ).toBe(false);
  });

  it('returns true when an Architecture Review user prompt is present', () => {
    expect(
      conversationNeedsArchitectureInstructions([
        { role: 'user', content: buildOptimizeSchemaUserPrompt('shop') },
      ]),
    ).toBe(true);
  });

  it('stays true after tool-loop assistant and tool messages', () => {
    expect(
      conversationNeedsArchitectureInstructions([
        { role: 'user', content: buildOptimizeSchemaUserPrompt('shop') },
        { role: 'assistant', content: '', tool_calls: [] },
        { role: 'tool', content: '{}', tool_call_id: 'call_1' },
        { role: 'user', content: 'Continue the architecture review.' },
      ]),
    ).toBe(true);
  });
});
