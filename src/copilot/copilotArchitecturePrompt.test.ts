import { describe, expect, it } from 'vitest';
import {
  buildArchitectureReviewUserPrompt,
  buildOptimizeSchemaUserPrompt,
  buildPostImportArchitectureReviewPrompt,
  COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS,
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

  it('defines optimize schema quick-action prompt with target database title', () => {
    const prompt = buildOptimizeSchemaUserPrompt('finops');
    expect(prompt).toContain('finops');
    expect(prompt).toContain('# finops — Architecture Review');
    expect(prompt).not.toContain('loaded schema');
  });

  it('builds post-import collective architecture review prompt with database title', () => {
    const prompt = buildPostImportArchitectureReviewPrompt('finops');
    expect(prompt).toContain('finops');
    expect(prompt).toContain('# finops — Architecture Review');
    expect(prompt).toContain('Architecture Review');
    expect(prompt).toContain('collections imported');
  });

  it('requires database name instead of Loaded Schema in collective review titles', () => {
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('never generic labels like "Loaded Schema"');
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
