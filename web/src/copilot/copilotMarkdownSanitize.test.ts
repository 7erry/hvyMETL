import { describe, expect, it } from 'vitest';
import { copilotMarkdownSanitizeSchema } from './copilotMarkdownSanitize';

describe('copilotMarkdownSanitizeSchema', () => {
  it('allows copilot-action href protocol for clickable workflow links', () => {
    expect(copilotMarkdownSanitizeSchema.protocols?.href).toContain('copilot-action');
  });
});
