import { describe, expect, it } from 'vitest';
import { architectureReviewDocTitle, architectureReviewToHtml } from '../../src/copilot/architectureReviewHtml.js';

describe('architectureReviewHtml', () => {
  it('converts headings, tables, and code blocks to HTML', () => {
    const html = architectureReviewToHtml(`# Trains — Architecture Review

> **Verdict:** Detach telemetry.

| Pattern | Choice |
| --- | --- |
| Naive | Reference |

\`\`\`ts
type Train = { id: string };
\`\`\`
`);
    expect(html).toContain('<h1>Trains — Architecture Review</h1>');
    expect(html).toContain('<strong>Verdict:</strong>');
    expect(html).toContain('<table');
    expect(html).toContain('type Train');
  });

  it('builds a Google Doc title from the review heading', () => {
    expect(architectureReviewDocTitle('# Orders — Architecture Review\n')).toBe('Orders — Architecture Review');
  });
});
