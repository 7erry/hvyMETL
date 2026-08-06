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

  it('requires Atlas cluster sizing section with working set and tier guidance', () => {
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('§8 MongoDB Atlas cluster sizing');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('Working Set');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('M40 vs M50');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('Sharding Verdict');
    expect(buildOptimizeSchemaUserPrompt('finops')).toContain('§8 Atlas cluster sizing');
  });

  it('requires vector search documentation when indexes exist', () => {
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('$vectorSearch');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('numCandidates');
  });

  it('requires field-based Atlas Search vs Vector Search guidance in §6', () => {
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('autocomplete');
    expect(COPILOT_ARCHITECTURE_RESPONSE_INSTRUCTIONS).toContain('Hybrid search');
    expect(buildArchitectureReviewUserPrompt('products')).toContain('hybrid search');
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

  it('includes studio vector search indexes in system context', () => {
    const prompt = buildCopilotSystemPrompt({
      tables: [],
      relationships: [],
      guardrailIssues: [],
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
      vectorSearchIndexes: [
        {
          database: 'csv_to_atlas',
          collection: 'products',
          path: 'description',
          indexName: 'autoEmbed_description_voyage-4-lite',
          model: 'voyage-4-lite',
          quantization: 'scalar',
          numDimensions: 1024,
          similarity: 'cosine',
        },
      ],
    });
    expect(prompt).toContain('Atlas vector search indexes');
    expect(prompt).toContain('csv_to_atlas.products');
    expect(prompt).toContain('$vectorSearch');
  });

  it('includes migration-plan search field hints in system context', () => {
    const prompt = buildCopilotSystemPrompt({
      tables: [],
      relationships: [],
      guardrailIssues: [],
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
      searchFieldHints: [
        {
          collection: 'products',
          field: 'product_name',
          kind: 'Atlas Search (autocomplete)',
          summary: 'Atlas Search autocomplete on this field.',
        },
        {
          collection: 'products',
          field: 'description',
          kind: 'Atlas Vector Search (autoEmbed)',
          summary: 'Vector Search autoEmbed on this field.',
        },
      ],
    });
    expect(prompt).toContain('Search field hints');
    expect(prompt).toContain('products.product_name');
    expect(prompt).toContain('products.description');
  });
});
