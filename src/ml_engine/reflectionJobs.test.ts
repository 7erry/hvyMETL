import { describe, expect, it, beforeEach } from 'vitest';
import {
  computeNextRunAt,
  parseReflectionSchedulePreset,
  REFLECTION_SCHEDULE_INTERVAL_MS,
} from './reflectionJobTypes.js';
import { reflectPendingMigrationLogs } from './reflectPending.js';
import {
  executeReflectionJobTick,
  recordReflectionJobRun,
} from './reflectionJobScheduler.js';
import {
  logMigrationDecision,
  setAtlasMetricsConnector,
  StubAtlasMetricsConnector,
} from './feedbackCollector.js';
import { InMemoryMigrationStore, setMigrationStore } from './migrationStore.js';
import { InMemoryReflectionJobStore } from './reflectionJobStore.js';
import { ReflectionJobScheduler } from './reflectionJobScheduler.js';

describe('reflectionJobTypes', () => {
  it('parses schedule presets', () => {
    expect(parseReflectionSchedulePreset('hourly')).toBe('hourly');
    expect(parseReflectionSchedulePreset('weekly')).toBe('weekly');
    expect(parseReflectionSchedulePreset('monthly')).toBeNull();
  });

  it('computes next run from preset interval', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    const next = Date.parse(computeNextRunAt('hourly', now));
    expect(next - now).toBe(REFLECTION_SCHEDULE_INTERVAL_MS.hourly);
  });
});

describe('reflectPendingMigrationLogs', () => {
  let store: InMemoryMigrationStore;

  beforeEach(() => {
    store = new InMemoryMigrationStore();
    setMigrationStore(store);
    setAtlasMetricsConnector(new StubAtlasMetricsConnector());
    process.env.HVYMETL_ATLAS_STUB_MODE = 'degraded';
  });

  it('reflects only pending logs older than minAgeMs', async () => {
    const { migrationId } = await logMigrationDecision(
      'a',
      {
        readWriteRatio: 1,
        peakRpm: 1000,
        dataGrowthMbPerMonth: 100,
        cardinality: 1000,
        growthRateLabel: '1GB/month',
        readPercent: 50,
        writePercent: 50,
      },
      {
        collectionName: 'a',
        nestingDepth: 1,
        hasArrays: false,
        indexCount: 1,
        isSharded: false,
        sourceRowCount: 100,
      },
      {
        predictedMetrics: {
          predictedCacheMissRate: 0.05,
          predictedIopsUtilization: 0.4,
          storageFootprintMultiplier: 1.1,
        },
        store,
      },
    );

    await store.updateLog(migrationId, {
      loggedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const result = await reflectPendingMigrationLogs({ store, minAgeMs: 30_000 });
    expect(result.processed).toBe(1);
    expect(result.lessonsPersisted).toBe(1);
  });
});

describe('ReflectionJobScheduler', () => {
  it('executeReflectionJobTick returns error when tenant store cannot be prepared', async () => {
    const jobStore = new InMemoryReflectionJobStore();
    const job = await jobStore.createJob({
      tenantId: 't1',
      name: 'Test',
      schedule: 'hourly',
      minAgeMs: 0,
    });
    const summary = await executeReflectionJobTick(job, {
      prepareTenantStore: async () => ({ ok: false, error: 'no uri' }),
    });
    expect(summary.errors).toContain('no uri');
  });

  it('recordReflectionJobRun updates last run metadata', async () => {
    const jobStore = new InMemoryReflectionJobStore();
    const job = await jobStore.createJob({
      tenantId: 't1',
      name: 'Test',
      schedule: 'hourly',
      minAgeMs: 0,
    });
    const updated = await recordReflectionJobRun(jobStore, job, {
      processed: 2,
      lessonsPersisted: 1,
      errors: [],
      finishedAt: new Date().toISOString(),
    });
    expect(updated.lastRunSummary?.processed).toBe(2);
    expect(updated.nextRunAt).toBeTruthy();
  });

  it('stop clears an armed interval without deleting the job', async () => {
    const jobStore = new InMemoryReflectionJobStore();
    const job = await jobStore.createJob({
      tenantId: 't1',
      name: 'Test',
      schedule: 'hourly',
      minAgeMs: 0,
    });
    const running = await jobStore.updateJob('t1', job.jobId, { status: 'running' });
    const scheduler = new ReflectionJobScheduler(jobStore, {
      prepareTenantStore: async () => ({ ok: false, error: 'skip' }),
    });
    scheduler.start(running);
    scheduler.stop(job.jobId);
    const stillThere = await jobStore.findJob('t1', job.jobId);
    expect(stillThere?.status).toBe('running');
  });
});
