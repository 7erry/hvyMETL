/**
 * Tests for the rule-based pattern selector: the decision table that maps
 * (structure x telemetry) to MongoDB design patterns. Uses a synthetic
 * structural model so the tests run without any database.
 */

import { describe, expect, it } from 'vitest';
import type { RelationshipModel, SqlStructuralModel, TableModel } from '../types.js';
import { WORKLOAD_PROFILES } from '../profiles/profiles.js';
import { buildMigrationPlan } from './patternSelector.js';

/** Build a minimal TableModel with sensible defaults. */
function table(partial: Partial<TableModel> & { name: string }): TableModel {
  return {
    columns: [
      { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
      { name: 'name', sqlType: 'VARCHAR(100)', bsonType: 'string', nullable: false, isPrimaryKey: false },
    ],
    primaryKey: ['id'],
    foreignKeys: [],
    rowCount: 100,
    ...partial,
  };
}

/** Build a RelationshipModel with sensible defaults. */
function relationship(partial: Partial<RelationshipModel> & { parentTable: string; childTable: string }): RelationshipModel {
  return { fkColumn: `${partial.parentTable}_id`, avgChildrenPerParent: 5, maxChildrenPerParent: 10, isBounded: true, ...partial };
}

describe('buildMigrationPlan', () => {
  it('applies the Bucket pattern to timestamped firehose tables on write-heavy workloads', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'devices' }),
        table({
          name: 'readings',
          rowCount: 500000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'device_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'recorded_at', sqlType: 'DATETIME', bsonType: 'date', nullable: false, isPrimaryKey: false },
            { name: 'value', sqlType: 'REAL', bsonType: 'double', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'device_id', referencesTable: 'devices', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({ parentTable: 'devices', childTable: 'readings', fkColumn: 'device_id', avgChildrenPerParent: 8000, maxChildrenPerParent: 9000, isBounded: false }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.iot);
    const readings = plan.collections.find((collection) => collection.sourceTable === 'readings');

    expect(readings?.bucket).toBeDefined();
    expect(readings?.bucket?.groupByColumn).toBe('device_id');
    expect(readings?.bucket?.timeColumn).toBe('recorded_at');
    expect(readings?.idDerivation.strategy).toBe('bucket');
    expect(readings?.patterns.some((decision) => decision.pattern === 'bucket')).toBe(true);

    // The parent keeps a Computed counter instead of embedding the firehose.
    const devices = plan.collections.find((collection) => collection.sourceTable === 'devices');
    expect(devices?.computedFields.some((field) => field.field === 'totalReadings')).toBe(true);
  });

  it('applies Subset + Outlier to skewed unbounded children on read-heavy workloads', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'products' }),
        table({
          name: 'reviews',
          rowCount: 5000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'product_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'stars', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'created_at', sqlType: 'DATETIME', bsonType: 'date', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'product_id', referencesTable: 'products', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        // Heavy skew: average 5 but one product has 1500 reviews.
        relationship({ parentTable: 'products', childTable: 'reviews', fkColumn: 'product_id', avgChildrenPerParent: 5, maxChildrenPerParent: 1500, isBounded: false }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const products = plan.collections.find((collection) => collection.sourceTable === 'products');

    const subsetArray = products?.embeddedArrays.find((array) => array.field === 'recentReviews');
    expect(subsetArray?.subsetLimit).toBe(10);
    expect(subsetArray?.overflowCollection).toBe('reviews');
    expect(products?.patterns.some((decision) => decision.pattern === 'subset')).toBe(true);
    expect(products?.patterns.some((decision) => decision.pattern === 'outlier')).toBe(true);

    // The overflow collection holding the full history must still exist.
    expect(plan.collections.some((collection) => collection.name === 'reviews')).toBe(true);
  });

  it('folds EAV tables into the Attribute pattern and drops their standalone collection', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'products' }),
        table({
          name: 'product_attributes',
          rowCount: 2000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'product_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'attr_key', sqlType: 'VARCHAR(60)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'attr_value', sqlType: 'VARCHAR(255)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'product_id', referencesTable: 'products', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({ parentTable: 'products', childTable: 'product_attributes', fkColumn: 'product_id', avgChildrenPerParent: 4, maxChildrenPerParent: 8 }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const products = plan.collections.find((collection) => collection.sourceTable === 'products');

    expect(products?.embeddedArrays.some((array) => array.field === 'attributes')).toBe(true);
    expect(products?.patterns.some((decision) => decision.pattern === 'attribute')).toBe(true);
    expect(products?.indexes.some((index) => index.options.name.includes('attributes_kv'))).toBe(true);
    // The EAV table disappears into its parent.
    expect(plan.collections.some((collection) => collection.sourceTable === 'product_attributes')).toBe(false);
  });

  it('duplicates lookup fields via Extended Reference on read-heavy workloads', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'brands', rowCount: 20 }),
        table({
          name: 'products',
          rowCount: 5000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'brand_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'title', sqlType: 'VARCHAR(200)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'brand_id', referencesTable: 'brands', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({ parentTable: 'brands', childTable: 'products', fkColumn: 'brand_id', avgChildrenPerParent: 250, maxChildrenPerParent: 400, isBounded: false }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const products = plan.collections.find((collection) => collection.sourceTable === 'products');

    const reference = products?.extendedReferences.find((candidate) => candidate.field === 'brand');
    expect(reference).toBeDefined();
    expect(reference?.lookupColumns).toContain('name');
    expect(products?.patterns.some((decision) => decision.pattern === 'extended-reference')).toBe(true);
  });

  it('keeps references (no embedded arrays) for unbounded children on write-heavy workloads', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'accounts' }),
        table({
          name: 'transactions',
          rowCount: 9000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'account_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'amount', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'account_id', referencesTable: 'accounts', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({ parentTable: 'accounts', childTable: 'transactions', fkColumn: 'account_id', avgChildrenPerParent: 200, maxChildrenPerParent: 800, isBounded: false }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.ledger);
    const accounts = plan.collections.find((collection) => collection.sourceTable === 'accounts');

    expect(accounts?.embeddedArrays).toHaveLength(0);
    expect(accounts?.patterns.some((decision) => decision.pattern === 'reference')).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'transactions')).toBe(true);
    // Ledger durability tuning flows into the plan.
    expect(plan.writeConcern).toEqual({ w: 'majority', journal: true });
  });

  it('detects self-referencing tables as the Tree pattern', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({
          name: 'categories',
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'parent_id', sqlType: 'INTEGER', bsonType: 'long', nullable: true, isPrimaryKey: false },
            { name: 'name', sqlType: 'VARCHAR(100)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'parent_id', referencesTable: 'categories', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({ parentTable: 'categories', childTable: 'categories', fkColumn: 'parent_id' }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.cms);
    const categories = plan.collections.find((collection) => collection.sourceTable === 'categories');
    expect(categories?.patterns.some((decision) => decision.pattern === 'tree')).toBe(true);
  });

  it('stamps every collection with the Schema Versioning pattern', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [table({ name: 'things' })],
      relationships: [],
    };
    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    for (const collection of plan.collections) {
      expect(collection.patterns.some((decision) => decision.pattern === 'schema-versioning')).toBe(true);
    }
  });
});
