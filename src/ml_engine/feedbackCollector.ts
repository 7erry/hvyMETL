/**
 * Telemetry feedback loop: log migration decisions, fetch Atlas runtime metrics,
 * and reflect on prediction vs actual performance to produce lessons learned.
 *
 * Designed for async invocation from cron jobs or serverless triggers via
 * `scheduleReflection()`.
 */

import { randomUUID } from 'node:crypto';
import type { CollectionPlan, PatternId } from '../types.js';
import {
  REFLECTION_CACHE_MISS_THRESHOLD,
  REFLECTION_IOPS_THRESHOLD,
  REFLECTION_SLOW_QUERY_THRESHOLD,
  type AtlasActualPerformance,
  type ChosenSchemaSnapshot,
  type MigrationLogDocument,
  type ReflectionAnalysis,
  type ReflectionResult,
} from './feedbackTypes.js';
import { upsertLessonLearned } from './memoryEngine.js';
import { getMigrationStore, type MigrationStore } from './migrationStore.js';
import type { PerformancePrediction, SchemaCandidate, TelemetryData } from './types.js';

export type AtlasMetricsConnector = {
  fetch(clusterId: string, migrationId: string, log: MigrationLogDocument): Promise<AtlasActualPerformance>;
};

/** Deterministic stub simulating Atlas performance API responses. */
export class StubAtlasMetricsConnector implements AtlasMetricsConnector {
  async fetch(clusterId: string, migrationId: string, log: MigrationLogDocument): Promise<AtlasActualPerformance> {
    const mode = process.env.HVYMETL_ATLAS_STUB_MODE?.trim().toLowerCase();
    if (mode === 'healthy') {
      return {
        actualCacheMissRate: 0.04,
        actualIopsUtilization: 0.35,
        slowQueryCount: 12,
        sampledAt: new Date().toISOString(),
        source: 'atlas-stub-healthy',
      };
    }

    if (mode === 'degraded') {
      return {
        actualCacheMissRate: 0.22,
        actualIopsUtilization: 0.91,
        slowQueryCount: 240,
        sampledAt: new Date().toISOString(),
        source: 'atlas-stub-degraded',
      };
    }

    const writeHeavy = log.sourceTelemetry.writePercent >= 60;
    const hasEmbedPattern = log.patternsApplied.some((pattern) =>
      ['embed', 'extended-reference', 'subset'].includes(pattern),
    );
    const stressFactor = writeHeavy && hasEmbedPattern ? 1.4 : 1;

    const predicted = log.predictedMetrics;
    return {
      actualCacheMissRate: Math.min(0.99, predicted.predictedCacheMissRate * stressFactor + 0.03),
      actualIopsUtilization: Math.min(0.99, predicted.predictedIopsUtilization * stressFactor + 0.05),
      slowQueryCount: Math.round(
        (predicted.predictedIopsUtilization > 0.7 ? 80 : 20) * stressFactor +
          (migrationId.charCodeAt(0) % 15),
      ),
      sampledAt: new Date().toISOString(),
      source: `atlas-stub:${clusterId}`,
    };
  }
}

let atlasConnector: AtlasMetricsConnector = new StubAtlasMetricsConnector();

/** Swap the Atlas metrics connector (production API client). */
export function setAtlasMetricsConnector(connector: AtlasMetricsConnector): void {
  atlasConnector = connector;
}

function extractPatterns(schema: ChosenSchemaSnapshot): PatternId[] {
  if ('patterns' in schema && Array.isArray(schema.patterns)) {
    return schema.patterns.map((decision) => decision.pattern);
  }
  if ('plan' in schema && schema.plan?.patterns) {
    return schema.plan.patterns.map((decision) => decision.pattern);
  }
  return [];
}

function tableLabel(schema: ChosenSchemaSnapshot, tableId: string): string {
  if ('collectionName' in schema) return schema.collectionName;
  if ('name' in schema) return schema.name;
  return tableId;
}

function patternLabel(patterns: PatternId[]): string {
  if (patterns.length === 0) return 'unknown pattern';
  return patterns.join(', ');
}

/**
 * Log a migration decision before ETL handoff.
 * Persists to `hvymetl_migration_logs` for later reflection.
 */
export async function logMigrationDecision(
  tableId: string,
  sourceTelemetry: TelemetryData,
  chosenSchema: ChosenSchemaSnapshot,
  options: {
    migrationId?: string;
    clusterId?: string;
    predictedMetrics: PerformancePrediction;
    store?: MigrationStore;
  },
): Promise<{ migrationId: string }> {
  const store = options.store ?? getMigrationStore();
  const migrationId = options.migrationId ?? `${tableId}-${randomUUID()}`;
  const clusterId = options.clusterId ?? process.env.HVYMETL_ATLAS_CLUSTER_ID?.trim() ?? 'local-dev';
  const patternsApplied = extractPatterns(chosenSchema);

  const document: MigrationLogDocument = {
    migrationId,
    tableId,
    clusterId,
    loggedAt: new Date().toISOString(),
    sourceTelemetry,
    chosenSchema,
    predictedMetrics: options.predictedMetrics,
    patternsApplied,
    status: 'pending_reflection',
  };

  await store.insertLog(document);
  console.info(
    `[ml_engine/feedbackCollector] Logged migration decision migrationId=${migrationId} table=${tableLabel(chosenSchema, tableId)} patterns=${patternLabel(patternsApplied)}`,
  );

  return { migrationId };
}

/**
 * Fetch post-migration Atlas performance metrics (stub by default).
 */
export async function fetchAtlasPerformanceMetrics(
  clusterId: string,
  migrationId: string,
  options: { store?: MigrationStore; connector?: AtlasMetricsConnector } = {},
): Promise<AtlasActualPerformance> {
  const store = options.store ?? getMigrationStore();
  const connector = options.connector ?? atlasConnector;
  const log = await store.findLogByMigrationId(migrationId);
  if (!log) {
    throw new Error(`Cannot fetch Atlas metrics: migration log not found (${migrationId})`);
  }
  const metrics = await connector.fetch(clusterId, migrationId, log);
  console.info(
    `[ml_engine/feedbackCollector] Atlas metrics migrationId=${migrationId} cacheMiss=${(metrics.actualCacheMissRate * 100).toFixed(1)}% iops=${(metrics.actualIopsUtilization * 100).toFixed(1)}% slowQueries=${metrics.slowQueryCount} source=${metrics.source}`,
  );
  return metrics;
}

function analyzeMetrics(
  log: MigrationLogDocument,
  actual: AtlasActualPerformance,
): ReflectionAnalysis {
  const breachReasons: string[] = [];

  if (actual.slowQueryCount > REFLECTION_SLOW_QUERY_THRESHOLD) {
    breachReasons.push(
      `slowQueryCount ${actual.slowQueryCount} exceeds threshold ${REFLECTION_SLOW_QUERY_THRESHOLD}`,
    );
  }
  if (actual.actualCacheMissRate > REFLECTION_CACHE_MISS_THRESHOLD) {
    breachReasons.push(
      `actualCacheMissRate ${(actual.actualCacheMissRate * 100).toFixed(1)}% exceeds ${(REFLECTION_CACHE_MISS_THRESHOLD * 100).toFixed(0)}%`,
    );
  }
  if (actual.actualIopsUtilization > REFLECTION_IOPS_THRESHOLD) {
    breachReasons.push(
      `actualIopsUtilization ${(actual.actualIopsUtilization * 100).toFixed(1)}% exceeds ${(REFLECTION_IOPS_THRESHOLD * 100).toFixed(0)}%`,
    );
  }

  const predictedCacheMiss = log.predictedMetrics.predictedCacheMissRate;
  const cacheMissDelta = actual.actualCacheMissRate - predictedCacheMiss;
  if (cacheMissDelta > 0.08) {
    breachReasons.push(
      `cache-miss prediction error +${(cacheMissDelta * 100).toFixed(1)}% (predicted ${(predictedCacheMiss * 100).toFixed(1)}%, actual ${(actual.actualCacheMissRate * 100).toFixed(1)}%)`,
    );
  }

  return {
    migrationId: log.migrationId,
    breached: breachReasons.length > 0,
    breachReasons,
  };
}

/**
 * Compare critic predictions with Atlas actuals and upsert a lesson when breached.
 * Safe to run from an offline cron or serverless worker.
 */
export async function analyzeAndReflect(
  migrationId: string,
  options: {
    clusterId?: string;
    store?: MigrationStore;
    connector?: AtlasMetricsConnector;
  } = {},
): Promise<ReflectionResult> {
  const store = options.store ?? getMigrationStore();
  const log = await store.findLogByMigrationId(migrationId);
  if (!log) {
    throw new Error(`Migration log not found: ${migrationId}`);
  }

  const clusterId = options.clusterId ?? log.clusterId;
  const actualMetrics = await fetchAtlasPerformanceMetrics(clusterId, migrationId, {
    store,
    connector: options.connector,
  });

  const analysis = analyzeMetrics(log, actualMetrics);
  let lessonPersisted = false;
  let lessonId: string | undefined;

  if (analysis.breached) {
    const lesson = await upsertLessonLearned({
      migrationLog: log,
      actualMetrics,
      breachReasons: analysis.breachReasons,
      store,
    });
    analysis.lesson = lesson;
    lessonId = lesson.lessonId;
    lessonPersisted = true;
    console.warn(
      `[ml_engine/feedbackCollector] Migration underperformed migrationId=${migrationId} — lesson ${lessonId} persisted to lessons_learned vector space.`,
    );
  } else {
    console.info(
      `[ml_engine/feedbackCollector] Migration healthy migrationId=${migrationId} — no lesson required.`,
    );
  }

  const status = analysis.breached ? 'reflected' : 'healthy';
  await store.updateLog(migrationId, {
    status,
    reflectedAt: new Date().toISOString(),
    actualMetrics,
    lessonLearnedId: lessonId,
    reflectionNotes: analysis.breachReasons.join('; ') || 'within safety thresholds',
  });

  return {
    migrationId,
    status,
    analysis,
    lessonPersisted,
  };
}

/**
 * Fire-and-forget reflection hook for post-ETL pipelines.
 * Errors are logged but never thrown to the caller.
 */
export function scheduleReflection(
  migrationId: string,
  options: { clusterId?: string; store?: MigrationStore } = {},
): void {
  void analyzeAndReflect(migrationId, options)
    .then((result) => {
      console.info(
        `[ml_engine/feedbackCollector] Reflection complete migrationId=${result.migrationId} status=${result.status} lessonPersisted=${result.lessonPersisted}`,
      );
    })
    .catch((error) => {
      console.error(
        `[ml_engine/feedbackCollector] Reflection failed migrationId=${migrationId}: ${String(error)}`,
      );
    });
}

/** Log all collections from an approved migration and return migration IDs. */
export async function logMigrationPlanDecisions(
  tablePrefix: string,
  telemetry: TelemetryData,
  collections: Array<{ schema: SchemaCandidate | CollectionPlan; prediction: PerformancePrediction }>,
  options: { clusterId?: string; store?: MigrationStore } = {},
): Promise<string[]> {
  const migrationIds: string[] = [];
  for (const entry of collections) {
    const tableId = 'collectionName' in entry.schema ? entry.schema.collectionName : entry.schema.name;
    const { migrationId } = await logMigrationDecision(`${tablePrefix}:${tableId}`, telemetry, entry.schema, {
      clusterId: options.clusterId,
      predictedMetrics: entry.prediction,
      store: options.store,
    });
    migrationIds.push(migrationId);
  }
  return migrationIds;
}
