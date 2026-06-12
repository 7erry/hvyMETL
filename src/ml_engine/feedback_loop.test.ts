import { describe, expect, it, beforeEach } from 'vitest';
import {
  analyzeAndReflect,
  fetchAtlasPerformanceMetrics,
  logMigrationDecision,
  setAtlasMetricsConnector,
  StubAtlasMetricsConnector,
} from './feedbackCollector.js';
import {
  REFLECTION_CACHE_MISS_THRESHOLD,
  type MigrationLogDocument,
} from './feedbackTypes.js';
import { formatLessonLearnedText, renderHistoricalLessonsSection, retrieveLessonsLearned } from './memoryEngine.js';
import { InMemoryMigrationStore, setMigrationStore } from './migrationStore.js';
import type { TelemetryData } from './types.js';

const telemetry: TelemetryData = {
  readWriteRatio: 19,
  peakRpm: 60_000,
  dataGrowthMbPerMonth: 5120,
  cardinality: 2_000_000,
  growthRateLabel: '5GB/month',
  readPercent: 95,
  writePercent: 5,
};

describe('feedbackCollector', () => {
  let store: InMemoryMigrationStore;

  beforeEach(() => {
    store = new InMemoryMigrationStore();
    setMigrationStore(store);
    setAtlasMetricsConnector(new StubAtlasMetricsConnector());
    process.env.HVYMETL_ATLAS_STUB_MODE = 'degraded';
  });

  it('logs migration decisions to hvymetl_migration_logs', async () => {
    const { migrationId } = await logMigrationDecision('orders', telemetry, {
      collectionName: 'orders',
      nestingDepth: 3,
      hasArrays: true,
      indexCount: 4,
      isSharded: false,
      sourceRowCount: 100_000,
    }, {
      predictedMetrics: {
        predictedCacheMissRate: 0.08,
        predictedIopsUtilization: 0.55,
        storageFootprintMultiplier: 1.4,
      },
      store,
    });

    const log = await store.findLogByMigrationId(migrationId);
    expect(log?.tableId).toBe('orders');
    expect(log?.status).toBe('pending_reflection');
  });

  it('analyzeAndReflect creates a lesson when Atlas metrics breach thresholds', async () => {
    const { migrationId } = await logMigrationDecision('order_items', telemetry, {
      name: 'order_items',
      sourceTable: 'order_items',
      mergedTables: ['order_items'],
      patterns: [{ pattern: 'embed', target: 'order_items', reason: 'test', knowledgeSource: 'embed.md' }],
      idDerivation: { sourceColumns: ['id'], strategy: 'direct' },
      jsonSchema: { type: 'object' },
      indexes: [],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    }, {
      predictedMetrics: {
        predictedCacheMissRate: 0.06,
        predictedIopsUtilization: 0.5,
        storageFootprintMultiplier: 1.2,
      },
      store,
    });

    const result = await analyzeAndReflect(migrationId, { store });
    expect(result.lessonPersisted).toBe(true);
    expect(result.status).toBe('reflected');
    expect(result.analysis.breachReasons.length).toBeGreaterThan(0);

    const lessons = await store.listLessons('lessons_learned');
    expect(lessons).toHaveLength(1);
    expect(lessons[0].text).toContain('CRITICAL FAILURE');
  });

  it('fetchAtlasPerformanceMetrics returns stub metrics', async () => {
    const { migrationId } = await logMigrationDecision('products', telemetry, {
      collectionName: 'products',
      nestingDepth: 2,
      hasArrays: false,
      indexCount: 2,
      isSharded: false,
      sourceRowCount: 50_000,
    }, {
      predictedMetrics: {
        predictedCacheMissRate: 0.05,
        predictedIopsUtilization: 0.4,
        storageFootprintMultiplier: 1.1,
      },
      store,
    });

    const metrics = await fetchAtlasPerformanceMetrics('cluster-1', migrationId, { store });
    expect(metrics.actualCacheMissRate).toBeGreaterThan(REFLECTION_CACHE_MISS_THRESHOLD);
    expect(metrics.slowQueryCount).toBeGreaterThan(100);
  });
});

describe('memoryEngine', () => {
  let store: InMemoryMigrationStore;

  beforeEach(() => {
    store = new InMemoryMigrationStore();
    setMigrationStore(store);
  });

  it('formats lesson text with failure semantics', () => {
    const log: MigrationLogDocument = {
      migrationId: 'm-1',
      tableId: 'order_items',
      clusterId: 'c-1',
      loggedAt: new Date().toISOString(),
      sourceTelemetry: telemetry,
      chosenSchema: {
        collectionName: 'order_items',
        nestingDepth: 4,
        hasArrays: true,
        indexCount: 6,
        isSharded: false,
        sourceRowCount: 2_000_000,
      },
      predictedMetrics: {
        predictedCacheMissRate: 0.07,
        predictedIopsUtilization: 0.6,
        storageFootprintMultiplier: 1.5,
      },
      patternsApplied: ['embed'],
      status: 'pending_reflection',
    };

    const text = formatLessonLearnedText(
      log,
      {
        actualCacheMissRate: 0.22,
        actualIopsUtilization: 0.9,
        slowQueryCount: 180,
        sampledAt: new Date().toISOString(),
        source: 'test',
      },
      ['slow queries elevated'],
    );

    expect(text).toContain("Table 'order_items'");
    expect(text).toContain('22.0% cache miss rate');
  });

  it('retrieveLessonsLearned returns lexical matches from memory store', async () => {
    await store.upsertLesson({
      lessonId: 'lesson-1',
      migrationId: 'm-1',
      tableId: 'order_items',
      namespace: 'lessons_learned',
      severity: 'critical',
      text: 'CRITICAL FAILURE: Table order_items migrated using Embed Pattern resulted in high cache miss under write telemetry',
      patternsInvolved: ['embed'],
      telemetrySnapshot: telemetry,
      predictedMetrics: {
        predictedCacheMissRate: 0.07,
        predictedIopsUtilization: 0.6,
        storageFootprintMultiplier: 1.5,
      },
      actualMetrics: {
        actualCacheMissRate: 0.22,
        actualIopsUtilization: 0.9,
        slowQueryCount: 180,
        sampledAt: new Date().toISOString(),
        source: 'test',
      },
      createdAt: new Date().toISOString(),
    });

    const lessons = await retrieveLessonsLearned('order_items embed write-heavy cache miss', 3, { store });
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0].namespace).toBe('lessons_learned');

    const markdown = renderHistoricalLessonsSection(lessons);
    expect(markdown).toContain('HISTORICAL LESSONS LEARNED FROM PAST MIGRATIONS');
    expect(markdown).toContain('order_items');
  });
});
