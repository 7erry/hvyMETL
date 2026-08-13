import { describe, expect, it, afterEach } from 'vitest';
import {
  architectureReviewExportMarkdown,
  architectureReviewFilename,
  clearArchitectureExportsForTests,
  createArchitectureExport,
  isArchitectureReviewContent,
  readArchitectureExport,
} from './architectureReviewExport.js';

describe('architectureReviewExport', () => {
  afterEach(() => {
    clearArchitectureExportsForTests();
  });

  it('detects architecture review headings', () => {
    expect(isArchitectureReviewContent('# Trains — Architecture Review\n\nBody')).toBe(true);
    expect(isArchitectureReviewContent('# Trains - Architecture Review\n\nBody')).toBe(true);
    expect(isArchitectureReviewContent('Hello')).toBe(false);
  });

  it('builds a sanitized export filename', () => {
    expect(architectureReviewFilename('# Trains — Architecture Review\n')).toBe('Trains — Architecture Review.md');
  });

  it('strips collapsible HTML wrappers for export', () => {
    const exported = architectureReviewExportMarkdown(
      '# Orders — Architecture Review\n\n<details><summary>2. Analysis</summary>\n\nBody\n</details>',
    );
    expect(exported).toContain('## 2. Analysis');
    expect(exported).not.toContain('<details');
  });

  it('stores and retrieves short-lived exports', () => {
    const { token } = createArchitectureExport({
      content: '# Sensors — Architecture Review\n\nSummary',
      filename: 'Sensors — Architecture Review.md',
    });
    const entry = readArchitectureExport(token);
    expect(entry?.filename).toBe('Sensors — Architecture Review.md');
    expect(entry?.content).toContain('Sensors — Architecture Review');
  });
});
