import { describe, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseDdlToModel } from './ddlParser.js';
import { enrichModelFromCsv } from './csvModelEnrichment.js';
import { buildMigrationPlan } from '../design/patternSelector.js';
import { getProfile } from '../profiles/profiles.js';
import { parseCsv } from './csv.js';
import { collectionNeedsShapedCsv, shapeCollectionCsv } from './csvShaper.js';

const ORACLE_ROOT = join(process.cwd(), 'examples', 'oracle');

describe('csvShaper', () => {
  it('writes embedded JSON array columns into shaped orders CSV', () => {
    const ddl = readFileSync(join(ORACLE_ROOT, 'oracle-all.ddl'), 'utf8');
    const model = enrichModelFromCsv(parseDdlToModel(ddl, 'ddl:oracle'), ORACLE_ROOT);
    const plan = buildMigrationPlan(model, getProfile('catalog'));
    const orders = plan.collections.find((collection) => collection.name === 'orders');
    expect(orders).toBeDefined();
    expect(collectionNeedsShapedCsv(orders!)).toBe(true);

    const tempDir = mkdtempSync(join(tmpdir(), 'hvymetl-shape-'));
    try {
      const shapedPath = join(tempDir, 'orders.csv');
      shapeCollectionCsv(orders!, model, ORACLE_ROOT, shapedPath);

      const rows = parseCsv(readFileSync(shapedPath, 'utf8'));
      const headers = rows[0];
      const embedHeader = headers.find((header) => header.endsWith('[]') && header.toLowerCase().includes('order'));
      expect(embedHeader).toBeDefined();

      const embedIndex = headers.indexOf(embedHeader!);
      const firstDataRow = rows[1];
      const parsed = JSON.parse(firstDataRow[embedIndex]);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
