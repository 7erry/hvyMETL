/**
 * Tests for the rule-based pattern selector: the decision table that maps
 * (structure x telemetry) to MongoDB design patterns. Uses a synthetic
 * structural model so the tests run without any database.
 */

import { describe, expect, it } from 'vitest';
import type { RelationshipModel, SqlStructuralModel, TableModel } from '../types.js';
import { WORKLOAD_PROFILES, buildCustomProfile } from '../profiles/profiles.js';
import { buildDirectEmbedPlansByTable, buildMigrationPlan, isJunctionTable, isLineItemsChild, isMetaTable, isReverseEmbedHostTable, shouldDefaultEmbedLineItems } from './patternSelector.js';

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
  it('embeds a developer-bounded DDL relationship at max cardinality 100', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'locations', rowCount: 0 }),
        table({
          name: 'company_assets',
          rowCount: 0,
          columns: [
            { name: 'asset_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'asset_name', sqlType: 'VARCHAR(100)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'location_id', sqlType: 'INT', bsonType: 'int', nullable: true, isPrimaryKey: false },
          ],
          primaryKey: ['asset_id'],
          foreignKeys: [{ column: 'location_id', referencesTable: 'locations', referencesColumn: 'location_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'locations',
          childTable: 'company_assets',
          fkColumn: 'location_id',
          avgChildrenPerParent: 50,
          maxChildrenPerParent: 100,
          isBounded: true,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const locations = plan.collections.find((collection) => collection.sourceTable === 'locations');

    expect(locations?.embeddedArrays).toContainEqual(
      expect.objectContaining({ sourceTable: 'company_assets', joinColumn: 'location_id' }),
    );
    expect(locations?.patterns.some((decision) => decision.pattern === 'embed')).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'company_assets')).toBe(false);
  });

  it('uses developer bounded cardinality to embed even on non-read-heavy profiles', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'locations', rowCount: 0 }),
        table({
          name: 'company_assets',
          rowCount: 0,
          primaryKey: ['asset_id'],
          foreignKeys: [{ column: 'location_id', referencesTable: 'locations', referencesColumn: 'location_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'locations',
          childTable: 'company_assets',
          fkColumn: 'location_id',
          avgChildrenPerParent: 10,
          maxChildrenPerParent: 20,
          isBounded: true,
          cardinalitySource: 'developer',
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.ledger);
    const locations = plan.collections.find((collection) => collection.sourceTable === 'locations');

    expect(locations?.embeddedArrays).toContainEqual(
      expect.objectContaining({ sourceTable: 'company_assets', joinColumn: 'location_id' }),
    );
    expect(locations?.patterns.find((decision) => decision.pattern === 'embed')?.reason).toContain(
      'Developer supplied max 20',
    );
  });

  it('uses developer max cardinality 5 to force embedding', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'locations', rowCount: 0 }),
        table({
          name: 'company_assets',
          rowCount: 0,
          primaryKey: ['asset_id'],
          foreignKeys: [{ column: 'location_id', referencesTable: 'locations', referencesColumn: 'location_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'locations',
          childTable: 'company_assets',
          fkColumn: 'location_id',
          avgChildrenPerParent: 3,
          maxChildrenPerParent: 5,
          isBounded: true,
          cardinalitySource: 'developer',
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.ledger);
    const locations = plan.collections.find((collection) => collection.sourceTable === 'locations');

    expect(locations?.embeddedArrays).toContainEqual(
      expect.objectContaining({ sourceTable: 'company_assets', joinColumn: 'location_id' }),
    );
  });

  it('uses explicit force-embed override to fold linked tables without max cardinality', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'locations', rowCount: 0 }),
        table({
          name: 'company_assets',
          rowCount: 0,
          primaryKey: ['asset_id'],
          foreignKeys: [{ column: 'location_id', referencesTable: 'locations', referencesColumn: 'location_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'locations',
          childTable: 'company_assets',
          fkColumn: 'location_id',
          avgChildrenPerParent: 0,
          maxChildrenPerParent: 0,
          isBounded: false,
          forceEmbed: true,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.ledger);
    const locations = plan.collections.find((collection) => collection.sourceTable === 'locations');

    expect(locations?.embeddedArrays).toContainEqual(
      expect.objectContaining({ sourceTable: 'company_assets', joinColumn: 'location_id' }),
    );
    expect(locations?.patterns.find((decision) => decision.pattern === 'embed')?.reason).toContain(
      'Developer forced company_assets',
    );
    expect(plan.collections.some((collection) => collection.sourceTable === 'company_assets')).toBe(false);
  });

  it('embeds the parent into the child collection when embed direction is reversed', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'cars', rowCount: 0, primaryKey: ['car_id'] }),
        table({
          name: 'paints',
          rowCount: 0,
          primaryKey: ['paint_id'],
          foreignKeys: [{ column: 'car_id', referencesTable: 'cars', referencesColumn: 'car_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'cars',
          childTable: 'paints',
          fkColumn: 'car_id',
          avgChildrenPerParent: 2,
          maxChildrenPerParent: 4,
          isBounded: true,
          forceEmbed: true,
          embedDirectionReversed: true,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const paints = plan.collections.find((collection) => collection.sourceTable === 'paints');

    expect(paints?.embeddedArrays).toContainEqual(
      expect.objectContaining({
        field: 'car',
        sourceTable: 'cars',
        joinColumn: 'car_id',
        reverseJoin: true,
        embedAsDocument: true,
      }),
    );
    expect(plan.collections.some((collection) => collection.sourceTable === 'paints')).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'cars')).toBe(false);
  });

  it('fully reverse-embeds a lookup parent referenced by the child FK (cars.paint_id -> paints)', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({
          name: 'paints',
          rowCount: 20,
          primaryKey: ['paint_id'],
          columns: [
            { name: 'paint_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'color_name', sqlType: 'VARCHAR(50)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'paint_code', sqlType: 'VARCHAR(20)', bsonType: 'string', nullable: true, isPrimaryKey: false },
          ],
        }),
        table({
          name: 'cars',
          rowCount: 100,
          primaryKey: ['car_id'],
          columns: [
            { name: 'car_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'vin', sqlType: 'VARCHAR(17)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'paint_id', sqlType: 'INT', bsonType: 'int', nullable: true, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'paint_id', referencesTable: 'paints', referencesColumn: 'paint_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'paints',
          childTable: 'cars',
          fkColumn: 'paint_id',
          avgChildrenPerParent: 5,
          maxChildrenPerParent: 10,
          isBounded: true,
          forceEmbed: true,
          embedDirectionReversed: true,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const cars = plan.collections.find((collection) => collection.sourceTable === 'cars');
    if (!cars) throw new Error('cars collection missing from plan');

    expect(cars.embeddedArrays).toContainEqual(
      expect.objectContaining({
        field: 'paint',
        sourceTable: 'paints',
        joinColumn: 'paint_id',
        reverseJoin: true,
        embedAsDocument: true,
      }),
    );
    expect(cars.extendedReferences.some((reference) => reference.sourceTable === 'paints')).toBe(false);
    expect(cars.jsonSchema.properties).toHaveProperty('paint');
    expect(cars.jsonSchema.properties).not.toHaveProperty('paintId');
    const paintSchema = (cars.jsonSchema.properties as Record<string, { properties?: Record<string, unknown> }>).paint;
    expect(paintSchema?.properties).toMatchObject({
      paintId: expect.objectContaining({ bsonType: 'int' }),
      colorName: expect.objectContaining({ bsonType: 'string' }),
      paintCode: expect.objectContaining({ bsonType: ['string', 'null'] }),
    });
    expect(cars.indexes.some((index) => 'paintId' in index.keys)).toBe(false);
    expect(plan.collections.some((collection) => collection.sourceTable === 'paints')).toBe(false);
  });

  it('absorbs multiple reverse-embedded lookup parents into the host collection only', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({
          name: 'paints',
          rowCount: 20,
          primaryKey: ['paint_id'],
          columns: [
            { name: 'paint_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'color_name', sqlType: 'VARCHAR(50)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
        }),
        table({
          name: 'wheels',
          rowCount: 15,
          primaryKey: ['wheel_id'],
          columns: [
            { name: 'wheel_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'style_name', sqlType: 'VARCHAR(100)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
        }),
        table({
          name: 'lights',
          rowCount: 10,
          primaryKey: ['light_id'],
          columns: [
            { name: 'light_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'light_type', sqlType: 'VARCHAR(50)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
        }),
        table({
          name: 'cars',
          rowCount: 100,
          primaryKey: ['car_id'],
          columns: [
            { name: 'car_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'vin', sqlType: 'VARCHAR(17)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'paint_id', sqlType: 'INT', bsonType: 'int', nullable: true, isPrimaryKey: false },
            { name: 'wheel_id', sqlType: 'INT', bsonType: 'int', nullable: true, isPrimaryKey: false },
            { name: 'light_id', sqlType: 'INT', bsonType: 'int', nullable: true, isPrimaryKey: false },
          ],
          foreignKeys: [
            { column: 'paint_id', referencesTable: 'paints', referencesColumn: 'paint_id' },
            { column: 'wheel_id', referencesTable: 'wheels', referencesColumn: 'wheel_id' },
            { column: 'light_id', referencesTable: 'lights', referencesColumn: 'light_id' },
          ],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'paints',
          childTable: 'cars',
          fkColumn: 'paint_id',
          forceEmbed: true,
          embedDirectionReversed: true,
        }),
        relationship({
          parentTable: 'wheels',
          childTable: 'cars',
          fkColumn: 'wheel_id',
          forceEmbed: true,
          embedDirectionReversed: true,
        }),
        relationship({
          parentTable: 'lights',
          childTable: 'cars',
          fkColumn: 'light_id',
          forceEmbed: true,
          embedDirectionReversed: true,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const cars = plan.collections.find((collection) => collection.sourceTable === 'cars');
    if (!cars) throw new Error('cars collection missing from plan');

    expect(cars.embeddedArrays.map((array) => array.field).sort()).toEqual(['light', 'paint', 'wheel']);
    expect(plan.collections.map((collection) => collection.sourceTable).sort()).toEqual(['cars']);
  });

  it('keeps cars as its own collection when it hosts reverse embeds even if models would fold cars', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({
          name: 'manufacturers',
          rowCount: 50,
          primaryKey: ['manufacturer_id'],
          columns: [
            { name: 'manufacturer_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'name', sqlType: 'VARCHAR(100)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
        }),
        table({
          name: 'models',
          rowCount: 200,
          primaryKey: ['model_id'],
          columns: [
            { name: 'model_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'manufacturer_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: false },
            { name: 'name', sqlType: 'VARCHAR(100)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'manufacturer_id', referencesTable: 'manufacturers', referencesColumn: 'manufacturer_id' }],
        }),
        table({
          name: 'paints',
          rowCount: 20,
          primaryKey: ['paint_id'],
          columns: [
            { name: 'paint_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'color_name', sqlType: 'VARCHAR(50)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
        }),
        table({
          name: 'cars',
          rowCount: 1000,
          primaryKey: ['car_id'],
          columns: [
            { name: 'car_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'model_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: false },
            { name: 'paint_id', sqlType: 'INT', bsonType: 'int', nullable: true, isPrimaryKey: false },
          ],
          foreignKeys: [
            { column: 'model_id', referencesTable: 'models', referencesColumn: 'model_id' },
            { column: 'paint_id', referencesTable: 'paints', referencesColumn: 'paint_id' },
          ],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'manufacturers',
          childTable: 'models',
          fkColumn: 'manufacturer_id',
          forceEmbed: true,
        }),
        relationship({
          parentTable: 'models',
          childTable: 'cars',
          fkColumn: 'model_id',
          avgChildrenPerParent: 5,
          maxChildrenPerParent: 10,
          isBounded: true,
          forceEmbed: true,
        }),
        relationship({
          parentTable: 'paints',
          childTable: 'cars',
          fkColumn: 'paint_id',
          forceEmbed: true,
          embedDirectionReversed: true,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    expect(isReverseEmbedHostTable('cars', model)).toBe(true);
    const embedPlans = buildDirectEmbedPlansByTable(model, WORKLOAD_PROFILES.catalog);
    expect(embedPlans.get('paints')?.some((array) => array.sourceTable === 'cars')).toBeFalsy();
    expect(embedPlans.get('models')?.some((array) => array.sourceTable === 'cars')).toBeFalsy();
    const sourceTables = plan.collections.map((collection) => collection.sourceTable).sort();

    expect(sourceTables).toContain('cars');
    expect(sourceTables).toContain('manufacturers');
    expect(plan.collections.find((collection) => collection.sourceTable === 'manufacturers')?.embeddedArrays.some(
      (array) => array.sourceTable === 'cars',
    )).toBe(false);
  });

  it('keeps a child as a separate collection when force-embed is explicitly disabled', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'customers', rowCount: 0 }),
        table({
          name: 'customer_addresses',
          rowCount: 0,
          columns: [
            { name: 'address_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
            { name: 'street', sqlType: 'VARCHAR(200)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'customer_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: false },
          ],
          primaryKey: ['address_id'],
          foreignKeys: [{ column: 'customer_id', referencesTable: 'customers', referencesColumn: 'customer_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'customers',
          childTable: 'customer_addresses',
          fkColumn: 'customer_id',
          avgChildrenPerParent: 0,
          maxChildrenPerParent: 0,
          isBounded: false,
          forceEmbed: false,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const customers = plan.collections.find((collection) => collection.sourceTable === 'customers');
    const addresses = plan.collections.find((collection) => collection.sourceTable === 'customer_addresses');

    expect(customers?.embeddedArrays ?? []).not.toContainEqual(
      expect.objectContaining({ sourceTable: 'customer_addresses' }),
    );
    expect(addresses).toBeDefined();
    expect(customers?.patterns.some((decision) => decision.pattern === 'reference' && decision.reason.includes('disabled force-embed'))).toBe(true);
  });

  it('uses developer max cardinality 5000 as the bounded embed limit', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'locations', rowCount: 0 }),
        table({
          name: 'company_assets',
          rowCount: 0,
          primaryKey: ['asset_id'],
          foreignKeys: [{ column: 'location_id', referencesTable: 'locations', referencesColumn: 'location_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'locations',
          childTable: 'company_assets',
          fkColumn: 'location_id',
          avgChildrenPerParent: 2500,
          maxChildrenPerParent: 5000,
          isBounded: true,
          cardinalitySource: 'developer',
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.ledger);
    const locations = plan.collections.find((collection) => collection.sourceTable === 'locations');

    expect(locations?.embeddedArrays).toContainEqual(
      expect.objectContaining({ sourceTable: 'company_assets', joinColumn: 'location_id' }),
    );
  });

  it('does not force full embed above the developer override max limit', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'locations', rowCount: 0 }),
        table({
          name: 'company_assets',
          rowCount: 0,
          primaryKey: ['asset_id'],
          foreignKeys: [{ column: 'location_id', referencesTable: 'locations', referencesColumn: 'location_id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'locations',
          childTable: 'company_assets',
          fkColumn: 'location_id',
          avgChildrenPerParent: 2501,
          maxChildrenPerParent: 5001,
          isBounded: false,
          cardinalitySource: 'developer',
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.ledger);
    const locations = plan.collections.find((collection) => collection.sourceTable === 'locations');

    const partialEmbed = locations?.embeddedArrays.find((array) => array.sourceTable === 'company_assets');
    expect(partialEmbed?.subsetLimit).toBe(25);
    expect(plan.collections.some((collection) => collection.sourceTable === 'company_assets')).toBe(true);
  });

  it('uses developer bounded cardinality to embed a selected multi-parent relationship', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'employees', rowCount: 0 }),
        table({ name: 'security_roles', rowCount: 0 }),
        table({
          name: 'user_accounts',
          rowCount: 0,
          primaryKey: ['user_id'],
          foreignKeys: [
            { column: 'employee_id', referencesTable: 'employees', referencesColumn: 'employee_id' },
            { column: 'role_id', referencesTable: 'security_roles', referencesColumn: 'role_id' },
          ],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'security_roles',
          childTable: 'user_accounts',
          fkColumn: 'role_id',
          avgChildrenPerParent: 10,
          maxChildrenPerParent: 20,
          isBounded: true,
          cardinalitySource: 'developer',
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.ledger);
    const roles = plan.collections.find((collection) => collection.sourceTable === 'security_roles');

    expect(roles?.embeddedArrays).toContainEqual(
      expect.objectContaining({ sourceTable: 'user_accounts', joinColumn: 'role_id' }),
    );
  });

  it('applies native Time Series to timestamped firehose tables on IoT workloads', () => {
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

    expect(readings?.timeSeries).toBeDefined();
    expect(readings?.timeSeries?.timeField).toBe('recordedAt');
    expect(readings?.timeSeries?.metaField).toBe('deviceId');
    expect(readings?.timeSeries?.granularity).toBe('seconds');
    expect(readings?.bucket).toBeUndefined();
    expect(readings?.idDerivation.strategy).toBe('direct');
    expect(readings?.patterns.some((decision) => decision.pattern === 'time-series')).toBe(true);

    // The parent keeps a Computed counter instead of embedding the firehose.
    const devices = plan.collections.find((collection) => collection.sourceTable === 'devices');
    expect(devices?.computedFields.some((field) => field.field === 'totalReadings')).toBe(true);
  });

  it('applies the Bucket pattern to firehose tables when the profile prefers bucket without time-series', () => {
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

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.mobile);
    const readings = plan.collections.find((collection) => collection.sourceTable === 'readings');

    expect(readings?.bucket).toBeDefined();
    expect(readings?.timeSeries).toBeUndefined();
    expect(readings?.idDerivation.strategy).toBe('bucket');
    expect(readings?.patterns.some((decision) => decision.pattern === 'bucket')).toBe(true);
  });

  it('applies developer time series overrides on non-IoT workloads', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({
          name: 'stocks',
          rowCount: 1200,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'ticker', sqlType: 'TEXT', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'date', sqlType: 'TIMESTAMP', bsonType: 'date', nullable: false, isPrimaryKey: false },
            { name: 'price', sqlType: 'REAL', bsonType: 'double', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [],
        }),
      ],
      relationships: [],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog, {
      timeSeriesOverrides: {
        stocks: { timeField: 'date', metaField: 'ticker', granularity: 'seconds' },
      },
    });
    const stocks = plan.collections.find((collection) => collection.sourceTable === 'stocks');

    expect(stocks?.timeSeries).toEqual({
      timeField: 'date',
      metaField: 'ticker',
      granularity: 'seconds',
    });
    expect(stocks?.patterns.some((decision) => decision.pattern === 'time-series')).toBe(true);
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
    expect(subsetArray?.subsetLimit).toBe(25);
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

    const plan = buildMigrationPlan(
      model,
      buildCustomProfile(
        { readPercent: 20, writePercent: 80, peakRpm: 20000, growthRate: '15GB/month' },
        true,
      ),
    );
    const accounts = plan.collections.find((collection) => collection.sourceTable === 'accounts');

    expect(accounts?.embeddedArrays).toHaveLength(0);
    expect(accounts?.patterns.some((decision) => decision.pattern === 'reference')).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'transactions')).toBe(true);
    expect(plan.writeConcern).toEqual({ w: 'majority', journal: true });
  });

  it('uses subset embeds for unbounded children on balanced workloads', () => {
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

    expect(accounts?.embeddedArrays.some((array) => array.sourceTable === 'transactions')).toBe(true);
    expect(accounts?.patterns.some((decision) => decision.pattern === 'subset')).toBe(true);
  });

  it('embeds bounded children even on balanced write/read workloads', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'accounts' }),
        table({
          name: 'account_notes',
          rowCount: 500,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'account_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'body', sqlType: 'TEXT', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'account_id', referencesTable: 'accounts', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'accounts',
          childTable: 'account_notes',
          fkColumn: 'account_id',
          avgChildrenPerParent: 8,
          maxChildrenPerParent: 20,
          isBounded: true,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.ledger);
    const accounts = plan.collections.find((collection) => collection.sourceTable === 'accounts');

    expect(accounts?.embeddedArrays.some((array) => array.sourceTable === 'account_notes')).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'account_notes')).toBe(false);
  });

  it('embeds unknown-cardinality DDL children when the workload is not write-heavy', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:oracle',
      tables: [
        table({ name: 'departments', rowCount: 0 }),
        table({
          name: 'department_contacts',
          rowCount: 0,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'department_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'email', sqlType: 'VARCHAR(120)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'department_id', referencesTable: 'departments', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'departments',
          childTable: 'department_contacts',
          fkColumn: 'department_id',
          avgChildrenPerParent: 0,
          maxChildrenPerParent: 0,
          isBounded: false,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const departments = plan.collections.find((collection) => collection.sourceTable === 'departments');

    expect(departments?.embeddedArrays.some((array) => array.sourceTable === 'department_contacts')).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'department_contacts')).toBe(false);
  });

  it('does not default-embed multi-parent time-series children without force embed', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:postgresql',
      tables: [
        table({ name: 'trains', rowCount: 0 }),
        table({ name: 'trips', rowCount: 0 }),
        table({
          name: 'train_telemetry',
          rowCount: 0,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'train_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'trip_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'recorded_at', sqlType: 'TIMESTAMP', bsonType: 'date', nullable: false, isPrimaryKey: false },
            { name: 'speed_kmh', sqlType: 'REAL', bsonType: 'double', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [
            { column: 'train_id', referencesTable: 'trains', referencesColumn: 'id' },
            { column: 'trip_id', referencesTable: 'trips', referencesColumn: 'id' },
          ],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'trains',
          childTable: 'train_telemetry',
          fkColumn: 'train_id',
          avgChildrenPerParent: 0,
          maxChildrenPerParent: 0,
          isBounded: false,
        }),
        relationship({
          parentTable: 'trips',
          childTable: 'train_telemetry',
          fkColumn: 'trip_id',
          avgChildrenPerParent: 0,
          maxChildrenPerParent: 0,
          isBounded: false,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const trains = plan.collections.find((collection) => collection.sourceTable === 'trains');

    expect(trains?.embeddedArrays.some((array) => array.sourceTable === 'train_telemetry')).toBe(false);
    expect(plan.collections.some((collection) => collection.sourceTable === 'train_telemetry')).toBe(true);
    expect(trains?.patterns.some((decision) => decision.pattern === 'reference' && decision.target.includes('train_telemetry'))).toBe(
      true,
    );
  });

  it('still embeds multi-parent time-series children when developer force embed is set', () => {
    const model: SqlStructuralModel = {
      source: 'ddl:postgresql',
      tables: [
        table({ name: 'trains', rowCount: 0 }),
        table({ name: 'trips', rowCount: 0 }),
        table({
          name: 'train_telemetry',
          rowCount: 0,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'train_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'trip_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'recorded_at', sqlType: 'TIMESTAMP', bsonType: 'date', nullable: false, isPrimaryKey: false },
            { name: 'speed_kmh', sqlType: 'REAL', bsonType: 'double', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [
            { column: 'train_id', referencesTable: 'trains', referencesColumn: 'id' },
            { column: 'trip_id', referencesTable: 'trips', referencesColumn: 'id' },
          ],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'trains',
          childTable: 'train_telemetry',
          fkColumn: 'train_id',
          avgChildrenPerParent: 0,
          maxChildrenPerParent: 0,
          isBounded: false,
          forceEmbed: true,
        }),
        relationship({
          parentTable: 'trips',
          childTable: 'train_telemetry',
          fkColumn: 'trip_id',
          avgChildrenPerParent: 0,
          maxChildrenPerParent: 0,
          isBounded: false,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const trains = plan.collections.find((collection) => collection.sourceTable === 'trains');

    expect(trains?.embeddedArrays.some((array) => array.sourceTable === 'train_telemetry')).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'train_telemetry')).toBe(false);
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

  it('applies the Archive pattern to dated read-heavy tables and plans a mirror collection', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({
          name: 'orders',
          rowCount: 12000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'customer_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'total', sqlType: 'REAL', bsonType: 'double', nullable: false, isPrimaryKey: false },
            { name: 'placed_at', sqlType: 'DATETIME', bsonType: 'date', nullable: false, isPrimaryKey: false },
          ],
        }),
      ],
      relationships: [],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const orders = plan.collections.find((collection) => collection.name === 'orders');
    const archive = plan.collections.find((collection) => collection.name === 'orders_archive');

    expect(orders?.archive?.archiveCollection).toBe('orders_archive');
    expect(orders?.patterns.some((decision) => decision.pattern === 'archive')).toBe(true);
    expect(archive?.patterns.some((decision) => decision.pattern === 'archive')).toBe(true);
  });

  it('merges junction-linked entities into a Single Collection hub on high-RPM workloads', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'students', rowCount: 500 }),
        table({ name: 'classes', rowCount: 80 }),
        table({
          name: 'enrollments',
          rowCount: 2000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'student_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'class_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'enrolled_at', sqlType: 'DATETIME', bsonType: 'date', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [
            { column: 'student_id', referencesTable: 'students', referencesColumn: 'id' },
            { column: 'class_id', referencesTable: 'classes', referencesColumn: 'id' },
          ],
        }),
      ],
      relationships: [
        relationship({ parentTable: 'students', childTable: 'enrollments', fkColumn: 'student_id' }),
        relationship({ parentTable: 'classes', childTable: 'enrollments', fkColumn: 'class_id' }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.mobile);
    const hub = plan.collections.find((collection) => collection.name === 'classes_students');

    expect(hub?.singleCollection?.entityTables).toEqual(['classes', 'students']);
    expect(hub?.patterns.some((decision) => decision.pattern === 'single-collection')).toBe(true);
    expect(
      plan.collections.filter(
        (collection) =>
          collection.name !== hub?.name && (collection.sourceTable === 'students' || collection.sourceTable === 'classes'),
      ),
    ).toHaveLength(0);
  });

  it('collapses usermeta-style tables into the parent per migration-principles checklist', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'users', rowCount: 1000 }),
        table({
          name: 'usermeta',
          rowCount: 3000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'user_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'setting_key', sqlType: 'VARCHAR(60)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'setting_value', sqlType: 'VARCHAR(255)', bsonType: 'string', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'user_id', referencesTable: 'users', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({ parentTable: 'users', childTable: 'usermeta', fkColumn: 'user_id' }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const users = plan.collections.find((collection) => collection.sourceTable === 'users');

    expect(users?.embeddedArrays.some((array) => array.sourceTable === 'usermeta')).toBe(true);
    expect(users?.patterns.some((decision) => decision.knowledgeSource === 'migration-principles.md')).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'usermeta')).toBe(false);
  });

  it('embeds order_items line-item children by default on read-heavy workloads', () => {
    const model: SqlStructuralModel = {
      source: 'synthetic.db',
      tables: [
        table({ name: 'orders', rowCount: 50000 }),
        table({
          name: 'order_items',
          rowCount: 200000,
          columns: [
            { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
            { name: 'order_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
            { name: 'sku', sqlType: 'VARCHAR(40)', bsonType: 'string', nullable: false, isPrimaryKey: false },
            { name: 'qty', sqlType: 'INTEGER', bsonType: 'int', nullable: false, isPrimaryKey: false },
          ],
          foreignKeys: [{ column: 'order_id', referencesTable: 'orders', referencesColumn: 'id' }],
        }),
      ],
      relationships: [
        relationship({
          parentTable: 'orders',
          childTable: 'order_items',
          fkColumn: 'order_id',
          avgChildrenPerParent: 0,
          maxChildrenPerParent: 0,
          isBounded: false,
        }),
      ],
    };

    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    const orders = plan.collections.find((collection) => collection.sourceTable === 'orders');

    expect(orders?.embeddedArrays.some((array) => array.sourceTable === 'order_items')).toBe(true);
    expect(
      orders?.patterns.some(
        (decision) => decision.pattern === 'embed' && decision.knowledgeSource === 'migration-principles.md',
      ),
    ).toBe(true);
    expect(plan.collections.some((collection) => collection.sourceTable === 'order_items')).toBe(false);
  });
});

describe('migration-principles helpers', () => {
  it('detects junction vs entity tables with two foreign keys', () => {
    const pageTags = table({
      name: 'page_tags',
      columns: [
        { name: 'id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: true },
        { name: 'page_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
        { name: 'tag_id', sqlType: 'INTEGER', bsonType: 'long', nullable: false, isPrimaryKey: false },
      ],
      foreignKeys: [
        { column: 'page_id', referencesTable: 'pages', referencesColumn: 'id' },
        { column: 'tag_id', referencesTable: 'tags', referencesColumn: 'id' },
      ],
    });
    const cars = table({
      name: 'cars',
      columns: [
        { name: 'car_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: true },
        { name: 'model_id', sqlType: 'INT', bsonType: 'int', nullable: false, isPrimaryKey: false },
        { name: 'paint_id', sqlType: 'INT', bsonType: 'int', nullable: true, isPrimaryKey: false },
      ],
      foreignKeys: [
        { column: 'model_id', referencesTable: 'models', referencesColumn: 'model_id' },
        { column: 'paint_id', referencesTable: 'paints', referencesColumn: 'paint_id' },
      ],
    });

    expect(isJunctionTable(pageTags)).toBe(true);
    expect(isJunctionTable(cars)).toBe(false);
  });

  it('detects meta and line-item table names', () => {
    const userMeta = table({
      name: 'usermeta',
      foreignKeys: [{ column: 'user_id', referencesTable: 'users', referencesColumn: 'id' }],
    });
    expect(isMetaTable(userMeta)).toBe(true);
    expect(isMetaTable(table({ name: 'postmeta', foreignKeys: [{ column: 'post_id', referencesTable: 'posts', referencesColumn: 'id' }] }))).toBe(true);
    expect(isMetaTable(table({ name: 'users' }))).toBe(false);

    const orderItems = table({
      name: 'order_items',
      foreignKeys: [{ column: 'order_id', referencesTable: 'orders', referencesColumn: 'id' }],
    });
    expect(isLineItemsChild('orders', orderItems)).toBe(true);
    expect(
      shouldDefaultEmbedLineItems(
        relationship({
          parentTable: 'orders',
          childTable: 'order_items',
          fkColumn: 'order_id',
          maxChildrenPerParent: 0,
          isBounded: false,
        }),
        orderItems,
        'orders',
      ),
    ).toBe(true);
  });
});
