import { describe, expect, it } from 'vitest';
import { patchMigrationPlanJsonWithProfile } from './migrationPlanDisplay';

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
