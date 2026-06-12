/**
 * Strict types for migration telemetry feedback, Atlas runtime metrics,
 * and lessons-learned vector memory.
 */

import type { CollectionPlan, PatternId } from '../types.js';
import type { PerformancePrediction, SchemaCandidate, TelemetryData } from './types.js';

/** Snapshot of the schema chosen at migration time (per table/collection). */
export type ChosenSchemaSnapshot = SchemaCandidate | CollectionPlan;

/** Reflection lifecycle for a logged migration decision. */
export type MigrationLogStatus = 'pending_reflection' | 'reflected' | 'healthy';

/** Document persisted in `hvymetl_migration_logs`. */
export type MigrationLogDocument = {
  migrationId: string;
  tableId: string;
  clusterId: string;
  loggedAt: string;
  sourceTelemetry: TelemetryData;
  chosenSchema: ChosenSchemaSnapshot;
  predictedMetrics: PerformancePrediction;
  patternsApplied: PatternId[];
  status: MigrationLogStatus;
  reflectedAt?: string;
  actualMetrics?: AtlasActualPerformance;
  lessonLearnedId?: string;
  reflectionNotes?: string;
};

/** Post-migration runtime metrics from MongoDB Atlas (or stub connector). */
export type AtlasActualPerformance = {
  actualCacheMissRate: number;
  actualIopsUtilization: number;
  slowQueryCount: number;
  sampledAt: string;
  /** Connector label, e.g. "atlas-stub" or "atlas-api". */
  source: string;
};

/** Severity for a stored lesson. */
export type LessonSeverity = 'critical' | 'warning' | 'success';

/** Vector-store document under the `lessons_learned` namespace. */
export type LessonLearnedDocument = {
  lessonId: string;
  migrationId: string;
  tableId: string;
  namespace: 'lessons_learned';
  severity: LessonSeverity;
  /** Dense semantic text embedded for vector retrieval. */
  text: string;
  embedding?: number[];
  patternsInvolved: PatternId[];
  telemetrySnapshot: TelemetryData;
  predictedMetrics: PerformancePrediction;
  actualMetrics: AtlasActualPerformance;
  createdAt: string;
};

/** Outcome of comparing critic predictions to Atlas actuals. */
export type ReflectionAnalysis = {
  migrationId: string;
  breached: boolean;
  breachReasons: string[];
  lesson?: LessonLearnedDocument;
};

/** Result returned from analyzeAndReflect for cron/job observability. */
export type ReflectionResult = {
  migrationId: string;
  status: MigrationLogStatus;
  analysis: ReflectionAnalysis;
  lessonPersisted: boolean;
};

/** Scored lesson chunk for RAG injection (mirrors ScoredChunk shape). */
export type ScoredLesson = {
  lessonId: string;
  migrationId: string;
  tableId: string;
  severity: LessonSeverity;
  text: string;
  score: number;
  namespace: 'lessons_learned';
};

export const MIGRATION_LOGS_COLLECTION = 'hvymetl_migration_logs';
export const LESSONS_LEARNED_COLLECTION = 'hvymetl_lessons_learned';
export const LESSONS_LEARNED_NAMESPACE = 'lessons_learned' as const;

/** Safety thresholds for post-migration reflection. */
export const REFLECTION_SLOW_QUERY_THRESHOLD = 100;
export const REFLECTION_CACHE_MISS_THRESHOLD = 0.15;
export const REFLECTION_IOPS_THRESHOLD = 0.85;
