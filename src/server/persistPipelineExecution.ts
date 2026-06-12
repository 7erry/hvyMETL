/**
 * Persist completed pipeline runs (design artifacts + import manifest) to MongoDB.
 */

import { randomUUID } from 'node:crypto';
import { getMigrationStore, type MigrationStore } from '../ml_engine/migrationStore.js';
import type { DesignFromModelResult } from '../design/designFromModel.js';
import type {
  CollectionImportSummary,
  CsvImportManifestSnapshot,
  PipelineExecutionDocument,
  PipelineFeedbackSummary,
} from './pipelineExecutionTypes.js';
import { PIPELINE_EXECUTIONS_COLLECTION } from './pipelineExecutionTypes.js';

export type PersistPipelineExecutionInput = {
  startedAt: string;
  ok: boolean;
  profileId: string;
  dialect?: string;
  schemaDialect: string;
  targetDb: string;
  memoryDb: string;
  csvSourcePath: string;
  outDir: string;
  design: DesignFromModelResult;
  csvImportManifest: CsvImportManifestSnapshot;
  imports: CollectionImportSummary[];
  errors: string[];
  feedback: PipelineFeedbackSummary;
  store?: MigrationStore;
};

/** Build and insert one pipeline execution document with the three core artifacts. */
export async function persistPipelineExecution(
  input: PersistPipelineExecutionInput,
): Promise<{ executionId: string; collection: string; memoryDb: string }> {
  const store = input.store ?? getMigrationStore();
  const executionId = randomUUID();
  const document: PipelineExecutionDocument = {
    executionId,
    startedAt: input.startedAt,
    completedAt: new Date().toISOString(),
    ok: input.ok,
    profileId: input.profileId,
    dialect: input.dialect,
    schemaDialect: input.schemaDialect,
    source: input.design.plan.source,
    targetDb: input.targetDb,
    memoryDb: input.memoryDb,
    csvSourcePath: input.csvSourcePath,
    outDir: input.outDir,
    retrievalStrategy: input.design.retrievalStrategy,
    migrationPlan: input.design.plan,
    designReport: input.design.designReport,
    csvImportManifest: input.csvImportManifest,
    imports: input.imports,
    errors: input.errors,
    migrationLogIds: input.feedback.migrationLogIds,
    reflectionScheduled: input.feedback.reflectionScheduled,
  };

  await store.insertPipelineExecution(document);
  console.info(
    `[server/pipelineExecution] Stored execution executionId=${executionId} collection=${PIPELINE_EXECUTIONS_COLLECTION} db=${input.memoryDb}`,
  );

  return { executionId, collection: PIPELINE_EXECUTIONS_COLLECTION, memoryDb: input.memoryDb };
}
