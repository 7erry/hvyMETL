import { describe, expect, it } from 'vitest';
import type { MigrationPlan } from '../../src/types.js';
import { architectureReviewCollectionDiagramsHtml } from '../../src/copilot/architectureReviewCollectionDiagram.js';
import { architectureReviewToHtml } from '../../src/copilot/architectureReviewHtml.js';

const samplePlan: MigrationPlan = {
  source: 'example',
  profileId: 'ecommerce',
  telemetry: { readWriteRatio: 80, peakRpm: 1000, dataGrowthGbPerMonth: 1 },
  writeConcern: { w: 'majority' },
  readPreference: { mode: 'primaryPreferred' },
  compression: { snappy: true },
  pool: { maxPoolSize: 100 },
  generatedAt: '2026-01-01T00:00:00.000Z',
  collections: [
    {
      name: 'products',
      sourceTable: 'products',
      mergedTables: ['products'],
      idDerivation: { sourceColumns: ['product_id'], strategy: 'direct' },
      patterns: [{ pattern: 'extended-reference', target: 'products', reason: 'test', knowledgeSource: 'test' }],
      jsonSchema: {
        properties: {
          _id: { bsonType: 'objectId' },
          description: { bsonType: 'string' },
          reviews: { bsonType: 'array', items: { bsonType: 'object' }, maxItems: 50 },
        },
      },
      indexes: [{ keys: { description: 1 }, options: { name: 'description_1' }, reason: 'search' }],
      embeddedArrays: [{ field: 'reviews', sourceTable: 'reviews', joinColumn: 'product_id' }],
      extendedReferences: [],
      computedFields: [],
    },
  ],
};

describe('architectureReviewCollectionDiagram', () => {
  it('renders a diagram card per collection with fields and patterns', () => {
    const html = architectureReviewCollectionDiagramsHtml(samplePlan);
    expect(html).toContain('Collections diagrams');
    expect(html).toContain('class="collection-diagram__name">products</span>');
    expect(html).toContain('⊕ reviews');
    expect(html).toContain('array&lt;object&gt;[≤50]');
    expect(html).toContain('extended-reference');
  });

  it('injects collection diagrams into architecture review HTML after the title', () => {
    const html = architectureReviewToHtml('# Shop — Architecture Review\n\n> Verdict', {
      migrationPlan: samplePlan,
    });
    expect(html.indexOf('<h1>Shop — Architecture Review</h1>')).toBeLessThan(
      html.indexOf('class="collection-diagram__name">products</span>'),
    );
    expect(html).toContain('Collections diagrams');
  });
});
