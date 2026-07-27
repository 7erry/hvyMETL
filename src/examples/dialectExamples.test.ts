/**
 * Regression tests for bundled per-dialect design-pattern examples.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_DIALECT_IDS } from '../dialects.js';
import { buildMigrationPlan } from '../design/patternSelector.js';
import { getProfile } from '../profiles/profiles.js';
import type { PatternId } from '../types.js';
import { parseDdlToModel } from '../utilities/ddlParser.js';
import { parseSchemaImport } from '../utilities/schemaImport.js';
import {
  DIALECT_PATTERN_MANIFEST,
  dialectExampleFor,
} from './dialectPatternManifest.js';
import {
  PATTERN_SIGNATURE_TABLES,
  renderDialectExampleFile,
} from './dialectExampleTemplates.js';

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../examples/dialects');

/** Strip schema/database qualifiers from parsed table names. */
function baseTableName(name: string): string {
  const segment = name.split('.').pop() ?? name;
  return segment.replace(/"/g, '').toLowerCase();
}

/** Patterns the rule engine can detect from DDL shape alone (no live row counts). */
const STRUCTURAL_PATTERNS: PatternId[] = ['tree', 'attribute', 'polymorphic', 'schema-versioning'];

describe('dialectPatternManifest', () => {
  it('assigns exactly one example per supported dialect', () => {
    expect(DIALECT_PATTERN_MANIFEST).toHaveLength(SUPPORTED_DIALECT_IDS.length);
    const dialectIds = DIALECT_PATTERN_MANIFEST.map((entry) => entry.dialectId).sort();
    expect(dialectIds).toEqual([...SUPPORTED_DIALECT_IDS].sort());
  });

  it('lookup returns manifest entry by dialect id', () => {
    expect(dialectExampleFor('postgresql')?.pattern).toBe('outlier');
    expect(dialectExampleFor('dynamodb')?.fileName).toBe('dynamodb.yaml');
  });
});

describe('dialect example files', () => {
  it.each(DIALECT_PATTERN_MANIFEST.map((entry) => [entry.dialectId, entry] as const))(
    '%s example parses and includes pattern signature tables',
    (dialectId, entry) => {
      const filePath = join(EXAMPLES_DIR, entry.fileName);
      const ddl = readFileSync(filePath, 'utf8');
      expect(ddl).toContain(entry.pattern);

      const model =
        dialectId === 'dynamodb'
          ? parseSchemaImport(ddl, dialectId, `ddl:${dialectId}`)
          : parseDdlToModel(ddl, `ddl:${dialectId}`);

      expect(model.tables.length).toBeGreaterThan(0);

      const tableNames = new Set(model.tables.map((table) => baseTableName(table.name)));
      for (const expected of PATTERN_SIGNATURE_TABLES[entry.pattern]) {
        expect(tableNames.has(expected.toLowerCase())).toBe(true);
      }
    },
  );

  it.each(DIALECT_PATTERN_MANIFEST.filter((entry) => STRUCTURAL_PATTERNS.includes(entry.pattern)).map(
    (entry) => [entry.dialectId, entry] as const,
  ))('%s example triggers %s in the design engine', (dialectId, entry) => {
    const ddl = readFileSync(join(EXAMPLES_DIR, entry.fileName), 'utf8');
    const model =
      dialectId === 'dynamodb'
        ? parseSchemaImport(ddl, dialectId, `ddl:${dialectId}`)
        : parseDdlToModel(ddl, `ddl:${dialectId}`);

    const plan = buildMigrationPlan(model, getProfile(entry.suggestedProfileId));

    if (entry.pattern === 'schema-versioning') {
      expect(plan.collections.length).toBeGreaterThan(0);
      expect(
        plan.collections.every((collection) =>
          collection.patterns.some((decision) => decision.pattern === 'schema-versioning'),
        ),
      ).toBe(true);
      return;
    }

    const patterns = new Set(plan.collections.flatMap((collection) => collection.patterns.map((p) => p.pattern)));
    expect(patterns.has(entry.pattern)).toBe(true);
  });
});

describe('dialect example generator', () => {
  it('clickhouse DDL uses unique column names per table', () => {
    const ddl = renderDialectExampleFile('clickhouse', 'embed');
    const model = parseDdlToModel(ddl, 'ddl:clickhouse');
    for (const table of model.tables) {
      const columnNames = table.columns.map((column) => column.name.toLowerCase());
      expect(new Set(columnNames).size).toBe(columnNames.length);
    }
  });

  it('rendered output matches committed files byte-for-byte', () => {
    for (const entry of DIALECT_PATTERN_MANIFEST) {
      const expected = readFileSync(join(EXAMPLES_DIR, entry.fileName), 'utf8');
      const rendered = renderDialectExampleFile(entry.dialectId, entry.pattern);
      expect(rendered).toBe(expected);
    }
  });
});
