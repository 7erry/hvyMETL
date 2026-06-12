import { describe, expect, it } from 'vitest';
import { persistPipelineExecution } from './persistPipelineExecution.js';
import { InMemoryMigrationStore } from '../ml_engine/migrationStore.js';
import type { MigrationPlan } from '../types.js';

const samplePlan: MigrationPlan = {
  source: 'ddl:oracle',
  profileId: 'catalog',
  telemetry: { readPercent: 95, writePercent: 5, peakRpm: 60_000, growthRate: '5GB/month' },
  writeConcern: { w: 1, journal: false },
  readPreference: 'primary' as const,
  compression: 'snappy' as const,
  pool: { maxPoolSize: 200, minPoolSize: 20, socketTimeoutMS: 30_000, maxIdleTimeMS: 60_000 },
  generatedAt: new Date().toISOString(),
  collections: [],
};

describe('persistPipelineExecution', () => {
  it('stores migration plan, design report, and csv manifest on the execution record', async () => {
    const store = new InMemoryMigrationStore();
    const designReport = '# Migration Design Report\n\n## Collections\n';

    const { executionId } = await persistPipelineExecution({
      startedAt: new Date().toISOString(),
      ok: true,
      profileId: 'catalog',
      schemaDialect: 'oracle',
      targetDb: 'oracle_test',
      memoryDb: 'hvymetl_memory',
      csvSourcePath: '/data/oracle',
      outDir: '/out/ui-pipeline',
      design: {
        plan: samplePlan,
        designReport,
        retrievalStrategy: 'bm25',
      },
      csvImportManifest: {
        csvSource: '/data/oracle',
        schemaDialect: 'oracle',
        collections: [{ name: 'orders', files: ['/data/oracle/orders.csv'] }],
      },
      imports: [{ collection: 'orders', files: ['/data/oracle/orders.csv'], ok: true, insertedCount: 100 }],
      errors: [],
      feedback: {
        memoryDb: 'hvymetl_memory',
        migrationLogIds: ['log-1'],
        reflectionScheduled: true,
        collectionsLogged: 1,
      },
      store,
    });

    const stored = await store.findPipelineExecution(executionId);
    expect(stored?.migrationPlan.source).toBe('ddl:oracle');
    expect(stored?.designReport).toBe(designReport);
    expect(stored?.csvImportManifest.collections[0]?.name).toBe('orders');
  });
});
