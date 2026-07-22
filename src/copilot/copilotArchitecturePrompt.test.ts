import { describe, expect, it } from 'vitest';
import {
  buildArchitectureReviewUserPrompt,
  COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS,
  OPTIMIZE_SCHEMA_USER_PROMPT,
} from './copilotArchitecturePrompt.js';
import { buildCopilotSystemPrompt } from './copilotPrompt.js';

describe('copilotArchitecturePrompt', () => {
  it('requires Before/After schema code and production patterns', () => {
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('Before');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('After');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('Subset');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('Time-Series');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('16 MB BSON');
  });

  it('requires collapsible details for deep sections', () => {
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('<details>');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('Verdict callout');
  });

  it('builds focused architecture review user prompts', () => {
    const prompt = buildArchitectureReviewUserPrompt('trains');
    expect(prompt).toContain('trains');
    expect(prompt).toContain('Tell me about');
    expect(prompt).toContain('<details>');
  });

  it('defines optimize schema quick-action prompt', () => {
    expect(OPTIMIZE_SCHEMA_USER_PROMPT).toContain('loaded schema');
  });
});

describe('buildCopilotSystemPrompt', () => {
  it('includes architecture response instructions and schema context', () => {
    const prompt = buildCopilotSystemPrompt({
      tables: [{ name: 'trains', columnCount: 8, rowCount: 120 }],
      relationships: [
        { childTable: 'train_telemetry', parentTable: 'trains', isBounded: false, maxChildrenPerParent: 0 },
      ],
      guardrailIssues: [
        {
          tableName: 'train_telemetry',
          label: 'Unbounded Array',
          detail: 'High volume child',
          severity: 'warning',
        },
      ],
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
    });

    expect(prompt).toContain('Principal MongoDB Data Architect');
    expect(prompt).toContain('trains');
    expect(prompt).toContain('train_telemetry');
    expect(prompt).toContain('Architecture & schema analysis responses');
    expect(prompt).toContain('Indexes & query strategy');
  });
});
