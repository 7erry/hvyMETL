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

import { parseDynamoDbCloudFormationToModel } from './dynamodbCloudFormationParser.js';

const ORACLE_ROOT = join(process.cwd(), 'examples', 'oracle');
const ECOMMERCE_CATALOG_TEMPLATE = readFileSync(
  join(process.cwd(), 'examples', 'dynamodb', 'ecommerce-catalog-table.yaml'),
  'utf8',
);

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

  it('embeds reverse-embedded lookups on the cars collection when cars stays separate from models', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hvymetl-shape-reverse-cars-'));
    try {
      writeFileSync(join(tempDir, 'manufacturers.csv'), 'manufacturer_id,name\n1,Acme\n', 'utf8');
      writeFileSync(join(tempDir, 'models.csv'), 'model_id,manufacturer_id,name\n10,1,Sedan\n', 'utf8');
      writeFileSync(join(tempDir, 'paints.csv'), 'paint_id,color_name\n100,Red\n', 'utf8');
      writeFileSync(
        join(tempDir, 'cars.csv'),
        'car_id,model_id,paint_id,vin\n1000,10,100,VIN1\n',
        'utf8',
      );

      const ddl = `
        CREATE TABLE manufacturers (
          manufacturer_id INT PRIMARY KEY,
          name VARCHAR(100)
        );
        CREATE TABLE models (
          model_id INT PRIMARY KEY,
          manufacturer_id INT REFERENCES manufacturers(manufacturer_id),
          name VARCHAR(100)
        );
        CREATE TABLE paints (
          paint_id INT PRIMARY KEY,
          color_name VARCHAR(50)
        );
        CREATE TABLE cars (
          car_id INT PRIMARY KEY,
          model_id INT REFERENCES models(model_id),
          paint_id INT REFERENCES paints(paint_id),
          vin VARCHAR(17)
        );
      `;
      const baseModel = parseDdlToModel(ddl, 'ddl:postgres');
      const model = applyCardinalityOverrides(
        baseModel,
        {},
        {
          'manufacturers::models::manufacturer_id': true,
          'models::cars::model_id': true,
          'paints::cars::paint_id': true,
        },
        { 'paints::cars::paint_id': true },
      );
      const profile = getProfile('catalog');
      const plan = buildMigrationPlan(model, profile);
      const manufacturers = plan.collections.find((collection) => collection.sourceTable === 'manufacturers');
      const cars = plan.collections.find((collection) => collection.sourceTable === 'cars');
      expect(manufacturers).toBeDefined();
      expect(cars).toBeDefined();
      expect(manufacturers?.embeddedArrays.some((array) => array.sourceTable === 'cars')).toBe(false);

      const embedPlansByTable = buildDirectEmbedPlansByTable(model, profile);
      const shapedPath = join(tempDir, 'cars-shaped.csv');
      shapeCollectionCsv(cars!, model, tempDir, shapedPath, embedPlansByTable);

      const rows = parseCsv(readFileSync(shapedPath, 'utf8'));
      const paintIndex = rows[0].indexOf('paint');
      expect(paintIndex).toBeGreaterThan(-1);
      expect(JSON.parse(rows[1][paintIndex])).toEqual(
        expect.objectContaining({ colorName: 'Red' }),
      );
      expect(JSON.parse(rows[1][paintIndex])).not.toHaveProperty('paintId');
      expect(rows[0]).not.toContain('paintId');
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

  it('renames DynamoDB attribute columns to semantic MongoDB field names during shaping', () => {
    const model = parseDynamoDbCloudFormationToModel(ECOMMERCE_CATALOG_TEMPLATE);
    const plan = buildMigrationPlan(model, getProfile('catalog'));
    const collection = plan.collections[0]!;
    expect(collectionNeedsShapedCsv(collection, model)).toBe(true);

    const tempDir = mkdtempSync(join(tmpdir(), 'hvymetl-shape-dynamo-'));
    try {
      writeFileSync(
        join(tempDir, 'ecommerce-catalog-production.csv'),
        [
          'PK,SK,GSI1PK,GSI1SK,GSI2PK,GSI2SK,GSI3PK,GSI3SK,ExpireAt',
          'pk-1,sk-1,gsi1-pk,gsi1-sk,gsi2-pk,gsi2-sk,gsi3-pk,gsi3-sk,123',
        ].join('\n'),
        'utf8',
      );

      const shapedPath = join(tempDir, 'ecommerceCatalogTable.csv');
      shapeCollectionCsv(collection, model, tempDir, shapedPath);

      const rows = parseCsv(readFileSync(shapedPath, 'utf8'));
      expect(rows[0]).toEqual(
        expect.arrayContaining([
          '_id',
          'partitionKey',
          'sortKey',
          'gSI1CategoryPriceIndex',
          'gSI1CategoryPriceIndexSortKey',
          'gSI2SKUBrandIndex',
          'gSI3SellerStatusIndex',
          'expireAt',
          'schemaVersion',
        ]),
      );
      expect(rows[0]).not.toContain('GSI1PK');
      expect(rows[0]).not.toContain('PK');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
