import { describe, expect, it } from 'vitest';
import { buildCopilotHelpResponse, isCopilotHelpQuestion } from './copilotHelp';

describe('copilotHelp', () => {
  it('detects help questions', () => {
    expect(isCopilotHelpQuestion('how can you help?')).toBe(true);
    expect(isCopilotHelpQuestion('How can you help me')).toBe(true);
    expect(isCopilotHelpQuestion('what can you do')).toBe(true);
    expect(isCopilotHelpQuestion('list collections from mytrains')).toBe(false);
  });

  it('suggests the migration workflow prompt', () => {
    expect(buildCopilotHelpResponse()).toContain('Guide me through the migration workflow');
  });
});
