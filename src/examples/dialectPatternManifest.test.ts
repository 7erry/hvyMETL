import { describe, expect, it } from 'vitest';
import { DIALECT_PATTERN_MANIFEST, DIALECT_EXAMPLE_PATTERNS } from './dialectPatternManifest.js';

describe('dialectPatternManifest', () => {
  it('covers thirteen design patterns across twenty-three dialects', () => {
    expect(DIALECT_EXAMPLE_PATTERNS).toHaveLength(13);
    expect(DIALECT_PATTERN_MANIFEST).toHaveLength(23);
    const assigned = new Set(DIALECT_PATTERN_MANIFEST.map((entry) => entry.pattern));
    expect(assigned.size).toBeGreaterThan(8);
  });
});
