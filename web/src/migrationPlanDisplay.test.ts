import { describe, expect, it } from 'vitest';
import type { MigrationPlan } from './migrationPlanTypes';
import { patchMigrationPlanJsonWithProfile, resolveCollectionNameForSqlTable } from './migrationPlanDisplay';

const samplePlan: MigrationPlan = {
  source: 'test',
  profileId: 'catalog',
  telemetry: { readPercent: 95, writePercent: 5, peakRpm: 1000, growthRate: '1GB/month' },
  writeConcern: { w: 1, journal: false },
  readPreference: 'primaryPreferred',
  compression: 'snappy',
  pool: { maxPoolSize: 100, minPoolSize: 10, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
  generatedAt: '2026-01-01T00:00:00.000Z',
  collections: [
    {
      name: 'customers',
      sourceTable: 'customers',
      mergedTables: ['customers', 'customer_addresses'],
      idDerivation: { strategy: 'direct', sourceColumns: ['customer_id'] },
      patterns: [],
      jsonSchema: { properties: {} },
      indexes: [],
      embeddedArrays: [
        {
          field: 'recentAddresses',
          sourceTable: 'customer_addresses',
          joinColumn: 'customer_id',
          subsetLimit: 5,
          overflowCollection: 'customerAddresses',
        },
      ],
      extendedReferences: [],
      computedFields: [],
    },
    {
      name: 'orders',
      sourceTable: 'orders',
      mergedTables: ['orders'],
      idDerivation: { strategy: 'direct', sourceColumns: ['order_id'] },
      patterns: [],
      jsonSchema: { properties: {} },
      indexes: [],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    },
    {
      name: 'customerAddresses',
      sourceTable: 'customer_addresses',
      mergedTables: ['customer_addresses'],
      idDerivation: { strategy: 'direct', sourceColumns: ['address_id'] },
      patterns: [],
      jsonSchema: { properties: {} },
      indexes: [],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    },
  ],
};

describe('resolveCollectionNameForSqlTable', () => {
  it('maps embedded child tables to the parent collection', () => {
    expect(resolveCollectionNameForSqlTable('customer_addresses', samplePlan)).toBe('customers');
  });

  it('maps a primary source table to its collection', () => {
    expect(resolveCollectionNameForSqlTable('orders', samplePlan)).toBe('orders');
  });
});

describe('patchMigrationPlanJsonWithProfile', () => {
  it('updates read preference and compression on an existing plan', () => {
    const planJson = JSON.stringify(
      {
        source: 'ddl:oracle',
        profileId: 'catalog',
        telemetry: { readPercent: 95, writePercent: 5, peakRpm: 60000, growthRate: '5GB/month' },
        writeConcern: { w: 1, journal: false },
        readPreference: 'primaryPreferred',
        compression: 'snappy',
        pool: { maxPoolSize: 150, minPoolSize: 15, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
        generatedAt: '2026-01-01T00:00:00.000Z',
        collections: [{ name: 'orders', sourceTable: 'orders', jsonSchema: {}, indexes: [], mergedTables: [], embeddedArrays: [], extendedReferences: [], computedFields: [] }],
      },
      null,
      2,
    );

    const patched = patchMigrationPlanJsonWithProfile(planJson, {
      profileId: 'custom',
      telemetry: { readPercent: 80, writePercent: 20, peakRpm: 10000, growthRate: '10GB/month' },
      writeConcern: { w: 'majority', journal: false },
      readPreference: 'secondary',
      compression: 'zstd',
      pool: { maxPoolSize: 150, minPoolSize: 15, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
    });

    const plan = JSON.parse(patched);
    expect(plan.readPreference).toBe('secondary');
    expect(plan.compression).toBe('zstd');
    expect(plan.profileId).toBe('custom');
    expect(plan.collections).toHaveLength(1);
  });
});
