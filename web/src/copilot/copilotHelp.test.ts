import { describe, expect, it } from 'vitest';
import { buildCopilotCommandsResponse, buildCopilotHelpResponse, isCopilotCommandsQuestion, isCopilotHelpQuestion } from './copilotHelp';

describe('copilotHelp', () => {
  it('detects help questions', () => {
    expect(isCopilotHelpQuestion('how can you help?')).toBe(true);
    expect(isCopilotHelpQuestion('How can you help me')).toBe(true);
    expect(isCopilotHelpQuestion('what can you do')).toBe(true);
    expect(isCopilotHelpQuestion('list collections from mytrains')).toBe(false);
  });

  it('detects commands list questions', () => {
    expect(isCopilotCommandsQuestion('what are all the commands you know?')).toBe(true);
    expect(isCopilotCommandsQuestion('list all commands')).toBe(true);
    expect(isCopilotCommandsQuestion('describe csv_to_atlas.sensors')).toBe(false);
  });

  it('suggests the migration workflow prompt', () => {
    expect(buildCopilotHelpResponse()).toContain('Guide me through the migration workflow');
    expect(buildCopilotHelpResponse()).toContain('copilot-action:');
    expect(buildCopilotHelpResponse()).toContain('Next step');
  });

  it('lists slash commands and inspect prompts', () => {
    expect(buildCopilotCommandsResponse()).toContain('/refresh-design');
    expect(buildCopilotCommandsResponse()).toContain('copilot-action:');
    expect(buildCopilotCommandsResponse()).toContain('describe `{db}.{collection}`');
    expect(buildCopilotCommandsResponse()).toContain('list databases');
    expect(buildCopilotCommandsResponse()).toContain('create vector search on `{collection}`');
    expect(buildCopilotCommandsResponse()).toContain('Vector search — Phase 3');
  });
});
