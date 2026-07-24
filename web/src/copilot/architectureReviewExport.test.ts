import { describe, expect, it } from 'vitest';
import { architectureReviewFilename, isArchitectureReviewContent } from './architectureReviewExport';

describe('architectureReviewExport web helpers', () => {
  it('re-exports architecture review detection helpers', () => {
    expect(isArchitectureReviewContent('# Orders — Architecture Review\n')).toBe(true);
    expect(architectureReviewFilename('# Orders — Architecture Review\n')).toBe('Orders — Architecture Review.md');
  });
});
