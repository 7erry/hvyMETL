/**
 * Types for persisted web UI pipeline run artifacts.
 */

import type { MigrationPlan } from '../types.js';

/** Per-collection csvToAtlas import outcome for one pipeline run. */
export type CollectionImportSummary = {
  collection: string;
  files: string[];
  ok: boolean;
  insertedCount?: number;
  error?: string;
};

/** Contents of csv-import-manifest.json stored on each execution record. */
export type CsvImportManifestSnapshot = {
  csvSource: string;
  schemaDialect: string;
  collections: { name: string; files: string[] }[];
};

/** ML feedback loop summary attached to each pipeline execution. */
export type PipelineFeedbackSummary = {
  memoryDb: string;
  migrationLogIds: string[];
  reflectionScheduled: boolean;
  collectionsLogged: number;
};

/** Document persisted in `hvymetl_pipeline_executions`. */
export type PipelineExecutionDocument = {
  /** Unique id for this pipeline run. */
  executionId: string;
  startedAt: string;
  completedAt: string;
  ok: boolean;
  profileId: string;
  dialect?: string;
  schemaDialect: string;
  source: string;
  targetDb: string;
  memoryDb: string;
  csvSourcePath: string;
  outDir: string;
  retrievalStrategy: string;
  /** migration-plan.json */
  migrationPlan: MigrationPlan;
  /** design-report.md */
  designReport: string;
  /** csv-import-manifest.json */
  csvImportManifest: CsvImportManifestSnapshot;
  imports: CollectionImportSummary[];
  errors: string[];
  migrationLogIds: string[];
  reflectionScheduled: boolean;
};

export const PIPELINE_EXECUTIONS_COLLECTION = 'hvymetl_pipeline_executions';
