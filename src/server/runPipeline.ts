/**
 * Full pipeline: ML design → csvToAtlas import from user CSV exports (web UI).
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeDesignArtifacts, type DesignFromModelResult } from '../design/designFromModel.js';
import { designFromModelWithMlEngine } from '../ml_engine/pipelinePatch.js';
import { triggerPostMigrationReflection } from '../ml_engine/feedbackHooks.js';
import {
  configureMigrationStore,
  getMigrationStore,
  resolveMemoryDbName,
  setMigrationStore,
  type MigrationStore,
} from '../ml_engine/migrationStore.js';
import { getProfile } from '../profiles/profiles.js';
import type { SqlStructuralModel } from '../types.js';
import { listCsvFiles, matchCsvFilesForCollection, resolveCsvSourcePath } from '../utilities/csvSource.js';
import { enrichModelFromCsv } from '../utilities/csvModelEnrichment.js';
import { collectionNeedsShapedCsv, shapeCollectionCsv } from '../utilities/csvShaper.js';
import { runImportCli } from '../utilities/runImportCli.js';
import {
  buildPipelineImportEnv,
  getPipelineConfigStatus,
  resolvePipelineSchemaDialect,
} from './pipelineConfig.js';
import { persistPipelineExecution } from './persistPipelineExecution.js';
import type { CollectionImportSummary, PipelineFeedbackSummary } from './pipelineExecutionTypes.js';
import { PIPELINE_EXECUTIONS_COLLECTION } from './pipelineExecutionTypes.js';

export type PipelineRunRequest = {
  profileId: string;
  model: SqlStructuralModel;
  ddl: string;
  dialect?: string;
  csvSourcePath?: string;
  targetDb?: string;
  outDir?: string;
  drop?: boolean;
  mongoUri?: string;
  csvToAtlasPath?: string;
  knowledgeDir: string;
  rootDir: string;
  /** Test hook: inject an in-memory store instead of configuring Atlas persistence. */
  migrationStore?: MigrationStore;
};

export type { CollectionImportSummary, PipelineFeedbackSummary } from './pipelineExecutionTypes.js';

export type PipelineRunResult = {
  ok: boolean;
  design: DesignFromModelResult;
  feedback: PipelineFeedbackSummary;
  execution: {
    executionId: string;
    memoryDb: string;
    collection: string;
  };
  paths: {
    outDir: string;
    planPath: string;
    reportPath: string;
    manifestPath: string;
    feedbackPath: string;
  };
  csvSource: {
    path: string;
    collections: { name: string; files: string[] }[];
  };
  imports: CollectionImportSummary[];
  errors: string[];
};

/** Validate inputs, run design, then import CSV exports via csvToAtlas. */
export async function runFullPipeline(request: PipelineRunRequest): Promise<PipelineRunResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const importEnv = buildPipelineImportEnv({
    mongoUri: request.mongoUri,
    mongoDb: request.targetDb,
    csvToAtlasPath: request.csvToAtlasPath,
  });

  const schemaDialect = resolvePipelineSchemaDialect(request.dialect, request.model);
  const config = getPipelineConfigStatus(importEnv, {
    schemaDialect,
    csvSourcePath: request.csvSourcePath,
  });
  if (!importEnv.MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI is required for Atlas import.');
  }
  if (!config.hasCsvToAtlas) {
    throw new Error(config.csvToAtlasValidation.errors.join(' ') || 'CSV_TO_ATLAS_PATH is not configured.');
  }

  const csvRoot = resolveCsvSourcePath(request.csvSourcePath, importEnv);
  const outDir = request.outDir ?? join(request.rootDir, 'out', 'ui-pipeline');
  mkdirSync(outDir, { recursive: true });

  const modelForDesign: SqlStructuralModel = request.dialect?.trim()
    ? { ...request.model, source: `ddl:${request.dialect.trim()}` }
    : request.model;

  const enrichedModel = enrichModelFromCsv(modelForDesign, csvRoot);

  const memoryDb = resolveMemoryDbName(importEnv);
  if (request.migrationStore) {
    setMigrationStore(request.migrationStore);
  } else {
    configureMigrationStore({ mongoUri: importEnv.MONGODB_URI, dbName: memoryDb });
  }

  const profile = getProfile(request.profileId);
  const clusterId = importEnv.HVYMETL_ATLAS_CLUSTER_ID?.trim();
  const mlDesign = await designFromModelWithMlEngine(enrichedModel, profile, request.knowledgeDir, {
    schedulePostMigrationReflection: false,
    clusterId,
  });
  const design: DesignFromModelResult = {
    plan: mlDesign.plan,
    designReport: mlDesign.designReport,
    retrievalStrategy: mlDesign.retrievalStrategy,
  };
  const paths = writeDesignArtifacts(outDir, design);

  const migrationLogIds = mlDesign.ml.migrationLogIds;
  const feedbackPath = join(outDir, 'feedback-manifest.json');

  const allCsvFiles = listCsvFiles(csvRoot);
  const shapedDir = join(outDir, 'csv-shaped');
  mkdirSync(shapedDir, { recursive: true });

  const csvCollections = design.plan.collections.map((collection) => {
    if (collectionNeedsShapedCsv(collection)) {
      const shapedPath = join(shapedDir, `${collection.name}.csv`);
      const written = shapeCollectionCsv(collection, enrichedModel, csvRoot, shapedPath);
      if (written) {
        return { name: collection.name, files: [written] };
      }
    }
    const files = matchCsvFilesForCollection(allCsvFiles, collection);
    return { name: collection.name, files };
  });

  const manifestPath = join(outDir, 'csv-import-manifest.json');
  const csvImportManifest = { csvSource: csvRoot, schemaDialect, collections: csvCollections };
  writeFileSync(manifestPath, `${JSON.stringify(csvImportManifest, null, 2)}\n`);

  const targetDb = request.targetDb ?? importEnv.MONGODB_DB ?? 'csv_to_atlas';
  importEnv.MONGODB_DB = targetDb;
  const imports: CollectionImportSummary[] = [];
  for (const coll of csvCollections) {
    const actualFiles = coll.files.filter((file) => existsSync(file));
    if (actualFiles.length === 0) {
      imports.push({
        collection: coll.name,
        files: coll.files,
        ok: false,
        error: 'No matching CSV files found for this collection',
      });
      errors.push(`${coll.name}: no CSV files (export ${coll.name}.csv or matching source table name)`);
      continue;
    }

    const flags = request.drop === false ? [] : ['--drop'];
    const result = runImportCli(actualFiles, coll.name, flags, importEnv);
    imports.push({
      collection: coll.name,
      files: actualFiles,
      ok: result.ok,
      insertedCount: typeof result.parsed?.insertedCount === 'number' ? result.parsed.insertedCount : undefined,
      error: result.ok ? undefined : result.stderr || result.stdout || `exit ${result.status}`,
    });
    if (!result.ok) {
      errors.push(`${coll.name}: import failed`);
    }
  }

  const reflectionScheduled = migrationLogIds.length > 0;
  if (reflectionScheduled) {
    triggerPostMigrationReflection(migrationLogIds, { clusterId });
  }

  const feedback: PipelineFeedbackSummary = {
    memoryDb,
    migrationLogIds,
    reflectionScheduled,
    collectionsLogged: migrationLogIds.length,
  };

  const store = request.migrationStore ?? getMigrationStore();
  const execution = await persistPipelineExecution({
    startedAt,
    ok: errors.length === 0,
    profileId: request.profileId,
    dialect: request.dialect,
    schemaDialect,
    targetDb,
    memoryDb,
    csvSourcePath: csvRoot,
    outDir,
    design,
    csvImportManifest,
    imports,
    errors,
    feedback,
    store,
  });

  writeFileSync(
    feedbackPath,
    `${JSON.stringify(
      {
        executionId: execution.executionId,
        memoryDb,
        collections: `hvymetl_migration_logs, hvymetl_lessons_learned, ${PIPELINE_EXECUTIONS_COLLECTION}`,
        migrationLogIds,
        reflectionScheduled,
      },
      null,
      2,
    )}\n`,
  );

  return {
    ok: errors.length === 0,
    design,
    feedback,
    execution,
    paths: { outDir, planPath: paths.planPath, reportPath: paths.reportPath, manifestPath, feedbackPath },
    csvSource: { path: csvRoot, collections: csvCollections },
    imports,
    errors,
  };
}
