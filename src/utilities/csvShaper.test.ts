import { describe, expect, it } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseDdlToModel } from './ddlParser.js';
import { enrichModelFromCsv } from './csvModelEnrichment.js';
import { buildDirectEmbedPlansByTable, buildMigrationPlan } from '../design/patternSelector.js';
import { getProfile } from '../profiles/profiles.js';
import { parseCsv } from './csv.js';
import { collectionNeedsShapedCsv, shapeCollectionCsv } from './csvShaper.js';
import { applyCardinalityOverrides, buildForceEmbedOverridesForAll } from '../../web/src/cardinalityOverrides.ts';

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

  it('nests absorbed grandchildren inside embedded arrays when Force All is enabled', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hvymetl-shape-nested-'));
    try {
      writeFileSync(
        join(tempDir, 'refdata_tbmd_label.csv'),
        'id,code\nlbl-1,LBL1\n',
        'utf8',
      );
      writeFileSync(
        join(tempDir, 'interval.csv'),
        'id,tbmd_label_id,data\nint-1,lbl-1,interval-data\n',
        'utf8',
      );
      writeFileSync(
        join(tempDir, 'container.csv'),
        'id,interval_id,file_size,file_format\ncon-1,int-1,4096,mp4\n',
        'utf8',
      );

      const ddl = `
        CREATE TABLE refdata_tbmd_label (
          id VARCHAR(255) PRIMARY KEY,
          code VARCHAR(255)
        );
        CREATE TABLE interval (
          id VARCHAR(255) PRIMARY KEY,
          tbmd_label_id VARCHAR(255) REFERENCES refdata_tbmd_label(id),
          data TEXT
        );
        CREATE TABLE container (
          id VARCHAR(255) PRIMARY KEY,
          interval_id VARCHAR(255) REFERENCES interval(id),
          file_size BIGINT,
          file_format VARCHAR(255)
        );
      `;
      const baseModel = parseDdlToModel(ddl, 'ddl:postgres');
      const model = applyCardinalityOverrides(baseModel, {}, buildForceEmbedOverridesForAll(baseModel, true));
      const profile = getProfile('catalog');
      const plan = buildMigrationPlan(model, profile);
      const refdata = plan.collections.find((collection) => collection.sourceTable === 'refdata_tbmd_label');
      expect(refdata).toBeDefined();
      expect(refdata?.embeddedArrays.some((array) => array.sourceTable === 'interval')).toBe(true);

      const embedPlansByTable = buildDirectEmbedPlansByTable(model, profile);
      expect(embedPlansByTable.get('interval')?.some((array) => array.sourceTable === 'container')).toBe(true);

      const shapedPath = join(tempDir, 'refdataTbmdLabel.csv');
      shapeCollectionCsv(refdata!, model, tempDir, shapedPath, embedPlansByTable);

      const rows = parseCsv(readFileSync(shapedPath, 'utf8'));
      const headers = rows[0];
      const intervalIndex = headers.indexOf('interval[]');
      expect(intervalIndex).toBeGreaterThan(-1);

      const intervals = JSON.parse(rows[1][intervalIndex]) as Array<Record<string, unknown>>;
      expect(intervals).toHaveLength(1);
      expect(intervals[0].data).toBe('interval-data');
      expect(intervals[0].container).toEqual([
        expect.objectContaining({ fileSize: '4096', fileFormat: 'mp4' }),
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('nests container rows for the foundrymam DDL under Force All', () => {
    const ddlPath = join(process.cwd(), '.tmp-foundrymam.ddl');
    const ddl = readFileSync(ddlPath, 'utf8');
    const tempDir = mkdtempSync(join(tmpdir(), 'hvymetl-shape-foundrymam-'));
    try {
      writeFileSync(
        join(tempDir, 'refdata_tbmd_label.csv'),
        'id,code,label\npk_00000000,LBL1,Primary\n',
        'utf8',
      );
      writeFileSync(
        join(tempDir, 'interval.csv'),
        'id,tbmd_label_id,data\npk_int_1,pk_00000000,interval-data\n',
        'utf8',
      );
      writeFileSync(
        join(tempDir, 'container.csv'),
        'id,interval_id,file_size,file_format,data\npk_con_1,pk_int_1,8192,mxf,container-data\n',
        'utf8',
      );

      const baseModel = parseDdlToModel(ddl, 'ddl:postgres');
      const model = applyCardinalityOverrides(baseModel, {}, buildForceEmbedOverridesForAll(baseModel, true));
      const profile = getProfile('catalog');
      const plan = buildMigrationPlan(model, profile);
      const refdata = plan.collections.find((collection) => collection.sourceTable === 'refdata_tbmd_label');
      expect(refdata).toBeDefined();

      const shapedPath = join(tempDir, 'refdataTbmdLabel.csv');
      shapeCollectionCsv(
        refdata!,
        model,
        tempDir,
        shapedPath,
        buildDirectEmbedPlansByTable(model, profile),
      );

      const rows = parseCsv(readFileSync(shapedPath, 'utf8'));
      const intervalIndex = rows[0].indexOf('interval[]');
      const intervals = JSON.parse(rows[1][intervalIndex]) as Array<Record<string, unknown>>;
      expect(intervals[0].container).toEqual([
        expect.objectContaining({ fileSize: '8192', fileFormat: 'mxf', data: 'container-data' }),
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
