import { describe, expect, it } from 'vitest';
import { MONGODB_DOC_LINKS, mongodbDocLink } from '../../src/copilot/architectureReviewDocLinks.js';
import { architectureReviewToHtml } from '../../src/copilot/architectureReviewHtml.js';

describe('architectureReviewDocLinks', () => {
  it('builds markdown links for canonical MongoDB docs', () => {
    expect(mongodbDocLink('MongoDB Vector Search', 'atlasVectorSearch')).toBe(
      `[MongoDB Vector Search](${MONGODB_DOC_LINKS.atlasVectorSearch})`,
    );
    expect(MONGODB_DOC_LINKS.rankFusion).toContain('rankFusion');
    expect(MONGODB_DOC_LINKS.esrRule).toContain('equality-sort-range-rule');
  });

  it('uses current MongoDB manual paths for design patterns', () => {
    expect(MONGODB_DOC_LINKS.subsetPattern).toBe(
      'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/subset-pattern/',
    );
    expect(MONGODB_DOC_LINKS.bucketPattern).toBe(
      'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/bucket-pattern/',
    );
    expect(MONGODB_DOC_LINKS.outlierPattern).toContain('group-data/outlier-pattern');
    expect(MONGODB_DOC_LINKS.attributePattern).toContain('group-data/attribute-pattern');
    expect(MONGODB_DOC_LINKS.polymorphicPattern).toContain('polymorphic-schema-pattern');
    expect(MONGODB_DOC_LINKS.inheritancePattern).toContain('inheritance-schema-pattern');
    expect(MONGODB_DOC_LINKS.designAntipatterns).toContain('design-antipatterns');
  });

  it('uses current MongoDB Search and Vector Search doc roots', () => {
    expect(MONGODB_DOC_LINKS.atlasSearch).toBe('https://www.mongodb.com/docs/search/');
    expect(MONGODB_DOC_LINKS.atlasVectorSearch).toBe('https://www.mongodb.com/docs/vector-search/');
    expect(MONGODB_DOC_LINKS.searchStage).toContain('/docs/search/query/aggregation-stages/search');
    expect(MONGODB_DOC_LINKS.vectorSearchStage).toContain('/docs/vector-search/query/aggregation-stages/vector-search-stage');
  });

  it('uses current data modeling intro and embedding paths', () => {
    expect(MONGODB_DOC_LINKS.dataModelingIntro).toBe('https://www.mongodb.com/docs/manual/data-modeling/');
    expect(MONGODB_DOC_LINKS.embeddedDocuments).toBe('https://www.mongodb.com/docs/manual/data-modeling/embedding/');
  });
});

describe('architectureReviewHtml links', () => {
  it('converts markdown hyperlinks for Google Docs export', () => {
    const html = architectureReviewToHtml(
      `# Shop — Architecture Review

Use [MongoDB Vector Search](${MONGODB_DOC_LINKS.atlasVectorSearch}) and [RRF](${MONGODB_DOC_LINKS.rankFusion}) in §6.
`,
    );
    expect(html).toContain(`href="${MONGODB_DOC_LINKS.atlasVectorSearch}"`);
    expect(html).toContain('MongoDB Vector Search');
    expect(html).toContain(`href="${MONGODB_DOC_LINKS.rankFusion}"`);
  });
});
