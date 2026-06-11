/**
 * Tests for the pattern formatting layer: the shaped SQL must produce CSV
 * columns that follow the csvToAtlas modeling rules (dotted headers for
 * Extended Reference, "[]" headers for embedded JSON arrays, initialized
 * Computed counters) and must be range-filterable for parallel extraction.
 */

import { describe, expect, it } from 'vitest';
import type { SqlStructuralModel, TableModel } from '../types.js';
import { WORKLOAD_PROFILES } from '../profiles/profiles.js';
import { buildMigrationPlan } from '../design/patternSelector.js';
import { buildShapedQuery } from './shaper.js';

/** A small catalog-like model: products with a brand lookup and reviews. */
function buildCatalogModel(): SqlStructuralModel {
  const brands: TableModel = {
    name: 'brands',
    columns: [
      { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
      { name: 'name', sqlType: 'VARCHAR(100)', bsonType: 'string', nullable: false, isPrimaryKey: false },
      { name: 'country', sqlType: 'VARCHAR(2)', bsonType: 'string', nullable: false, isPrimaryKey: false },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    rowCount: 10,
  };
  const products: TableModel = {
    name: 'products',
    columns: [
      { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
      { name: 'brand_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
      { name: 'product_name', sqlType: 'VARCHAR(200)', bsonType: 'string', nullable: false, isPrimaryKey: false },
    ],
    primaryKey: ['id'],
    foreignKeys: [{ column: 'brand_id', referencesTable: 'brands', referencesColumn: 'id' }],
    rowCount: 1000,
  };
  const reviews: TableModel = {
    name: 'reviews',
    columns: [
      { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
      { name: 'product_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
      { name: 'stars', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
      { name: 'created_at', sqlType: 'DATETIME', bsonType: 'date', nullable: false, isPrimaryKey: false },
    ],
    primaryKey: ['id'],
    foreignKeys: [{ column: 'product_id', referencesTable: 'products', referencesColumn: 'id' }],
    rowCount: 8000,
  };
  return {
    source: 'synthetic.db',
    tables: [brands, products, reviews],
    relationships: [
      { parentTable: 'brands', childTable: 'products', fkColumn: 'brand_id', avgChildrenPerParent: 100, maxChildrenPerParent: 200, isBounded: false },
      { parentTable: 'products', childTable: 'reviews', fkColumn: 'product_id', avgChildrenPerParent: 8, maxChildrenPerParent: 1200, isBounded: false },
    ],
  };
}

/** An IoT-like model: devices with a timestamped readings firehose. */
function buildIotModel(): SqlStructuralModel {
  const devices: TableModel = {
    name: 'devices',
    columns: [
      { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
      { name: 'serial', sqlType: 'VARCHAR(64)', bsonType: 'string', nullable: false, isPrimaryKey: false },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    rowCount: 50,
  };
  const readings: TableModel = {
    name: 'readings',
    columns: [
      { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
      { name: 'device_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
      { name: 'recorded_at', sqlType: 'DATETIME', bsonType: 'date', nullable: false, isPrimaryKey: false },
      { name: 'value', sqlType: 'REAL', bsonType: 'double', nullable: false, isPrimaryKey: false },
    ],
    primaryKey: ['id'],
    foreignKeys: [{ column: 'device_id', referencesTable: 'devices', referencesColumn: 'id' }],
    rowCount: 200000,
  };
  return {
    source: 'synthetic.db',
    tables: [devices, readings],
    relationships: [
      { parentTable: 'devices', childTable: 'readings', fkColumn: 'device_id', avgChildrenPerParent: 4000, maxChildrenPerParent: 5000, isBounded: false },
    ],
  };
}

describe('buildShapedQuery (document collections)', () => {
  const model = buildCatalogModel();
  const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
  const products = plan.collections.find((collection) => collection.sourceTable === 'products');
  if (!products) throw new Error('products collection missing from plan');
  const shaped = buildShapedQuery(products, model);

  it('emits dotted headers for Extended Reference lookup columns', () => {
    expect(shaped.columns).toContain('brand.name');
    expect(shaped.sql).toContain('LEFT JOIN "brands"');
  });

  it('emits a "[]" JSON-array header for the Subset pattern, capped in SQL', () => {
    expect(shaped.columns).toContain('recentReviews[]');
    expect(shaped.sql).toContain('LIMIT 10');
    expect(shaped.sql).toContain('json_group_array');
  });

  it('initializes Computed counters from a correlated COUNT', () => {
    expect(shaped.columns).toContain('totalReviews');
    expect(shaped.sql).toMatch(/SELECT COUNT\(\*\) FROM "reviews"/);
  });

  it('stamps schemaVersion and filters on a half-open primary-key range', () => {
    expect(shaped.columns).toContain('schemaVersion');
    expect(shaped.sql).toContain('WHERE base."id" >= ? AND base."id" < ?');
    expect(shaped.splitsOnTime).toBe(false);
  });

  it('derives _id from hidden primary-key aliases not exposed as CSV columns', () => {
    expect(shaped.idFields).toEqual(['__idPart0']);
    expect(shaped.columns).not.toContain('__idPart0');
  });
});

describe('buildShapedQuery (bucket collections)', () => {
  const model = buildIotModel();
  const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.iot);
  const readings = plan.collections.find((collection) => collection.sourceTable === 'readings');
  if (!readings) throw new Error('readings collection missing from plan');
  const shaped = buildShapedQuery(readings, model);

  it('groups measurements per source per window', () => {
    expect(shaped.sql).toContain('GROUP BY 1, 2');
    expect(shaped.columns).toContain('measurements[]');
    expect(shaped.columns).toContain('windowStart');
    expect(shaped.columns).toContain('count');
  });

  it('builds the bucket _id from the group key and window start', () => {
    expect(shaped.idFields).toEqual(['deviceId', 'windowStart']);
  });

  it('splits on epoch time so chunks align to whole windows', () => {
    expect(shaped.splitsOnTime).toBe(true);
    expect(shaped.sql).toContain("strftime('%s'");
  });
});
