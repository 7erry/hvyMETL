import { describe, expect, it } from 'vitest';
import {
  DIALECT_PATTERN_MANIFEST,
  DIALECT_EXAMPLE_PATTERNS,
  dialectExampleFor,
  dialectExamplePickerLabel,
} from './dialectPatternManifest.js';

describe('dialectPatternManifest', () => {
  it('covers thirteen design patterns across twenty-three dialects', () => {
    expect(DIALECT_EXAMPLE_PATTERNS).toHaveLength(13);
    expect(DIALECT_PATTERN_MANIFEST).toHaveLength(23);
    const assigned = new Set(DIALECT_PATTERN_MANIFEST.map((entry) => entry.pattern));
    expect(assigned.size).toBeGreaterThan(8);
  });

  it('formats Load example picker labels as Dialect - Profile', () => {
    const db2 = dialectExampleFor('db2');
    expect(db2).toBeDefined();
    expect(dialectExamplePickerLabel(db2!)).toBe('IBM Db2 - CMS');

    const clickhouse = dialectExampleFor('clickhouse');
    expect(dialectExamplePickerLabel(clickhouse!)).toBe('ClickHouse - Catalog');
  });
});
