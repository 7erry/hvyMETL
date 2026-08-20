import { describe, expect, it } from 'vitest';
import { MONGODB_DOC_LINKS, mongodbDocLink } from '../../src/copilot/architectureReviewDocLinks.js';
import { architectureReviewToHtml } from '../../src/copilot/architectureReviewHtml.js';

describe('architectureReviewDocLinks', () => {
  it('builds markdown links for canonical MongoDB docs', () => {
    expect(mongodbDocLink('Atlas Vector Search', 'atlasVectorSearch')).toBe(
      `[Atlas Vector Search](${MONGODB_DOC_LINKS.atlasVectorSearch})`,
    );
    expect(MONGODB_DOC_LINKS.rankFusion).toContain('rankFusion');
    expect(MONGODB_DOC_LINKS.esrRule).toContain('equality-sort-range-rule');
  });
});

describe('architectureReviewHtml links', () => {
  it('converts markdown hyperlinks for Google Docs export', () => {
    const html = architectureReviewToHtml(
      `# Shop — Architecture Review

Use [Atlas Vector Search](${MONGODB_DOC_LINKS.atlasVectorSearch}) and [RRF](${MONGODB_DOC_LINKS.rankFusion}) in §6.
`,
    );
    expect(html).toContain(`href="${MONGODB_DOC_LINKS.atlasVectorSearch}"`);
    expect(html).toContain('Atlas Vector Search');
    expect(html).toContain(`href="${MONGODB_DOC_LINKS.rankFusion}"`);
  });
});
