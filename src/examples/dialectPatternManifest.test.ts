import { describe, expect, it } from 'vitest';
import { SUPPORTED_DIALECT_IDS } from '../dialects.js';
import {
  DIALECT_PATTERN_MANIFEST,
  DIALECT_EXAMPLE_PATTERNS,
  dialectExampleFor,
  dialectExamplePickerLabel,
} from './dialectPatternManifest.js';

describe('dialectPatternManifest', () => {
  it('covers thirteen design patterns across all supported dialects', () => {
    expect(DIALECT_EXAMPLE_PATTERNS).toHaveLength(13);
    expect(DIALECT_PATTERN_MANIFEST).toHaveLength(SUPPORTED_DIALECT_IDS.length);
    const assigned = new Set(DIALECT_PATTERN_MANIFEST.map((entry) => entry.pattern));
    expect(assigned.size).toBeGreaterThan(8);
  });

  it('formats Load example picker labels as Dialect - Profile', () => {
    const db2 = dialectExampleFor('db2');
    expect(db2).toBeDefined();
    expect(dialectExamplePickerLabel(db2!)).toMatch(/^IBM Db2 - /);

    const jsonSchema = dialectExampleFor('json-schema');
    expect(jsonSchema?.fileName).toBe('json-schema.json');
    expect(dialectExamplePickerLabel(jsonSchema!)).toMatch(/^JSON Schema - /);
  });
});
