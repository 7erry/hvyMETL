import { describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('matches embedded child rows when mock CSV integer FKs are written as decimals', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hvymetl-shape-decimal-fk-'));
    try {
      writeFileSync(join(tempDir, 'locations.csv'), 'location_id\n1\n2\n', 'utf8');
      writeFileSync(
        join(tempDir, 'company_assets.csv'),
        'asset_id,asset_name,location_id\n1,Laptop,1.0\n2,Desk,2.0\n',
        'utf8',
      );

      const model = parseDdlToModel(
        `CREATE TABLE company_assets (
          asset_id INT PRIMARY KEY,
          asset_name VARCHAR(100),
          location_id INT,
          CONSTRAINT fk_assets_location FOREIGN KEY (location_id) REFERENCES locations(location_id)
        );`,
        'ddl:oracle',
      );
      for (const relationship of model.relationships) {
        relationship.maxChildrenPerParent = 5;
        relationship.avgChildrenPerParent = 3;
        relationship.isBounded = true;
        relationship.cardinalitySource = 'developer';
      }
      const plan = buildMigrationPlan(model, getProfile('catalog'));
      const locations = plan.collections.find((collection) => collection.sourceTable === 'locations');
      expect(locations).toBeDefined();

      const shapedPath = join(tempDir, 'locations-shaped.csv');
      shapeCollectionCsv(locations!, model, tempDir, shapedPath);

      const rows = parseCsv(readFileSync(shapedPath, 'utf8'));
      const headers = rows[0];
      const embedIndex = headers.indexOf('companyAssets[]');
      expect(embedIndex).toBeGreaterThan(-1);
      expect(JSON.parse(rows[1][embedIndex])).toHaveLength(1);
      expect(JSON.parse(rows[2][embedIndex])).toHaveLength(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
