import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSchemaImportWithMeta } from './schemaImport.js';
import {
  isHvyMetlDiagramExportRecord,
  isSqlStructuralModelRecord,
  parseStructuralModelJsonImport,
} from './structuralModelJsonParser.js';

const CMS_DIAGRAM = join(process.cwd(), 'examples', 'cms', 'hvymetl-diagram-CMS.json');

describe('structuralModelJsonParser', () => {
  it('detects hvymetl diagram exports', () => {
    const root = JSON.parse(readFileSync(CMS_DIAGRAM, 'utf8')) as unknown;
    expect(isHvyMetlDiagramExportRecord(root)).toBe(true);
    expect(isSqlStructuralModelRecord(root)).toBe(false);
  });

  it('imports diagram JSON with embedded DDL and dialect', () => {
    const text = readFileSync(CMS_DIAGRAM, 'utf8');
    const parsed = parseStructuralModelJsonImport(text, 'json:test');
    expect(parsed?.model.tables.length).toBeGreaterThan(0);
    expect(parsed?.ddlText).toMatch(/CREATE TABLE/i);
    expect(parsed?.dialect).toBe('postgresql');
  });

  it('imports bare SqlStructuralModel JSON through parseSchemaImportWithMeta', () => {
    const diagram = JSON.parse(readFileSync(CMS_DIAGRAM, 'utf8')) as {
      model: { source: string; tables: unknown[]; relationships: unknown[] };
    };
    const bare = JSON.stringify(diagram.model);
    const result = parseSchemaImportWithMeta(bare, 'postgresql');
    expect(result.model.tables.length).toBe(diagram.model.tables.length);
    expect(result.resolvedDialect).toBe('postgresql');
    expect(result.displayText).toMatch(/CREATE TABLE/i);
  });
});
