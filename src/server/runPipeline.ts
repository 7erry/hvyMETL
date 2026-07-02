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
import { resolveWorkloadProfile } from '../profiles/resolveProfile.js';
import type { SqlStructuralModel, WorkloadProfile } from '../types.js';
import { listCsvFiles, matchCsvFilesForCollection, resolveCsvSourcePath } from '../utilities/csvSource.js';
import { enrichModelFromCsv } from '../utilities/csvModelEnrichment.js';
import { collectionNeedsShapedCsv, shapeCollectionCsv } from '../utilities/csvShaper.js';
import { generateMockCsvFromDdl, type MockCsvOptions } from '../utilities/mockCsvFromDdl.js';
import { registerApiArtifacts, serializeApiArtifactBundle } from './apiArtifactStore.js';
import { runImportCli } from '../utilities/runImportCli.js';
import {
  formatMongoConnectivityFailure,
  verifyMongoUri,
} from '../utilities/mongoConnectivity.js';
import {
  buildPipelineImportEnv,
  getPipelineConfigStatus,
  resolvePipelineSchemaDialect,
} from './pipelineConfig.js';
import { persistPipelineExecution } from './persistPipelineExecution.js';
import type { CollectionImportSummary, PipelineFeedbackSummary } from './pipelineExecutionTypes.js';
import { PIPELINE_EXECUTIONS_COLLECTION } from './pipelineExecutionTypes.js';
import type { PipelineProgressEvent } from './pipelineProgress.js';

export type { PipelineProgressEvent, PipelineProgressStage } from './pipelineProgress.js';
export { PIPELINE_PROGRESS_STAGES } from './pipelineProgress.js';

export type PipelineRunRequest = {
  profileId: string;
  /** Resolved custom profile (when profileId is custom). */
  profile?: WorkloadProfile;
  model: SqlStructuralModel;
  ddl: string;
  dialect?: string;
  csvSourcePath?: string;
  cardinalityOverrides?: Record<string, number>;
  targetDb?: string;
  outDir?: string;
  drop?: boolean;
  mongoUri?: string;
  csvToAtlasPath?: string;
  knowledgeDir: string;
  rootDir: string;
  /** When true (or no CSV path), generate one CSV per CREATE TABLE from `ddl`. */
  generateMockCsv?: boolean;
  mockCsvOptions?: MockCsvOptions;
  /** Test hook: inject an in-memory store instead of configuring Atlas persistence. */
  migrationStore?: MigrationStore;
  /** Optional progress callback (web UI SSE stream). */
  onProgress?: (event: PipelineProgressEvent) => void;
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
    combinedOpenApiPath?: string;
  };
  csvSource: {
    path: string;
    collections: { name: string; files: string[] }[];
  };
  imports: CollectionImportSummary[];
  errors: string[];
  apiArtifacts?: ReturnType<typeof serializeApiArtifactBundle>;
};

function reportProgress(request: PipelineRunRequest, event: PipelineProgressEvent): void {
  request.onProgress?.(event);
}

function relationshipOverrideKey(relationship: SqlStructuralModel['relationships'][number]): string {
  return `${relationship.parentTable}::${relationship.childTable}::${relationship.fkColumn}`;
}

function applyCardinalityOverrides(
  model: SqlStructuralModel,
  overrides?: Record<string, number>,
): SqlStructuralModel {
  if (!overrides || Object.keys(overrides).length === 0) return model;
  return {
    ...model,
    relationships: model.relationships.map((relationship) => {
      const maxChildrenPerParent = overrides[relationshipOverrideKey(relationship)];
      if (!Number.isFinite(maxChildrenPerParent) || maxChildrenPerParent <= 0) return relationship;
      return {
        ...relationship,
        avgChildrenPerParent: Math.max(1, Math.ceil(maxChildrenPerParent / 2)),
        maxChildrenPerParent,
        isBounded: maxChildrenPerParent <= 5000,
        cardinalitySource: 'developer' as const,
      };
    }),
  };
}

/** Use uploaded/env CSV when present; otherwise generate mock CSV from DDL when allowed. */
function resolvePipelineCsvRoot(
  request: PipelineRunRequest,
  importEnv: NodeJS.ProcessEnv,
  outDir: string,
): string {
  if (!request.generateMockCsv) {
    return resolveCsvSourcePath(request.csvSourcePath, importEnv);
  }

  if (!request.ddl?.trim()) {
    throw new Error('DDL is required to generate mock CSV data when no CSV export directory is provided.');
  }

  const mockDir = join(outDir, 'mock-csv');
  reportProgress(request, {
    stage: 'generating',
    message: 'Generating mock CSV files from DDL (one file per table)…',
  });
  const generated = generateMockCsvFromDdl(request.ddl, mockDir, request.rootDir, request.mockCsvOptions);
  reportProgress(request, {
    stage: 'generating',
    message: `Generated ${generated.tables.length} CSV file(s) in ${generated.outputDir}`,
  });
  return generated.outputDir;
}

/** Validate inputs, run design, then import CSV exports via csvToAtlas. */
export async function runFullPipeline(request: PipelineRunRequest): Promise<PipelineRunResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  reportProgress(request, { stage: 'validating', message: 'Validating MongoDB URI and csvToAtlas configuration…' });
  const importEnv = buildPipelineImportEnv({
    mongoUri: request.mongoUri,
    mongoDb: request.targetDb,
    csvToAtlasPath: request.csvToAtlasPath,
  });

  const schemaDialect = resolvePipelineSchemaDialect(request.dialect, request.model);
  const config = getPipelineConfigStatus(importEnv, {
    schemaDialect,
    csvSourcePath: request.csvSourcePath,
    generateMockCsv: request.generateMockCsv,
  });
  if (!importEnv.MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI is required for Atlas import.');
  }

  const mongoCheck = await verifyMongoUri(importEnv.MONGODB_URI, { timeoutMs: 12_000 });
  if (!mongoCheck.ok) {
    throw new Error(formatMongoConnectivityFailure(mongoCheck));
  }

  if (!config.hasCsvToAtlas) {
    throw new Error(config.csvToAtlasValidation.errors.join(' ') || 'CSV_TO_ATLAS_PATH is not configured.');
  }

  const outDir = request.outDir ?? join(request.rootDir, 'out', 'ui-pipeline');
  mkdirSync(outDir, { recursive: true });

  const csvRoot = resolvePipelineCsvRoot(request, importEnv, outDir);

  reportProgress(request, { stage: 'enriching', message: 'Measuring CSV row counts and relationship cardinality…' });

  const modelForDesign: SqlStructuralModel = request.dialect?.trim()
    ? { ...request.model, source: `ddl:${request.dialect.trim()}` }
    : request.model;

  const enrichedModel = applyCardinalityOverrides(
    enrichModelFromCsv(modelForDesign, csvRoot),
    request.cardinalityOverrides,
  );

  const memoryDb = resolveMemoryDbName(importEnv);
  if (request.migrationStore) {
    setMigrationStore(request.migrationStore);
  } else {
    configureMigrationStore({ mongoUri: importEnv.MONGODB_URI, dbName: memoryDb });
  }

  const profile = request.profile ?? resolveWorkloadProfile({ profileId: request.profileId });
  const clusterId = importEnv.HVYMETL_ATLAS_CLUSTER_ID?.trim();
  reportProgress(request, {
    stage: 'designing',
    message: `Running ML-enhanced design (${profile.label})…`,
  });
  const mlDesign = await designFromModelWithMlEngine(enrichedModel, profile, request.knowledgeDir, {
    schedulePostMigrationReflection: false,
    clusterId,
  });
  const design: DesignFromModelResult = {
    plan: mlDesign.plan,
    designReport: mlDesign.designReport,
    retrievalStrategy: mlDesign.retrievalStrategy,
    modelTokenUsage: mlDesign.modelTokenUsage,
  };
  reportProgress(request, {
    stage: 'artifacts',
    message: `Writing migration plan, schemas, and OpenAPI docs (${design.plan.collections.length} collections)…`,
  });
  const paths = writeDesignArtifacts(outDir, design);
  const registeredArtifacts = registerApiArtifacts(outDir, 'pipeline');
  const apiArtifacts = registeredArtifacts ? serializeApiArtifactBundle(registeredArtifacts) : undefined;

  const migrationLogIds = mlDesign.ml.migrationLogIds;
  const feedbackPath = join(outDir, 'feedback-manifest.json');

  const allCsvFiles = listCsvFiles(csvRoot);
  const shapedDir = join(outDir, 'csv-shaped');
  mkdirSync(shapedDir, { recursive: true });

  reportProgress(request, { stage: 'shaping', message: 'Shaping CSV files with embedded arrays and references…' });

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
  const importTotal = csvCollections.length;
  let importIndex = 0;
  for (const coll of csvCollections) {
    importIndex += 1;
    reportProgress(request, {
      stage: 'importing',
      message: `Importing ${coll.name}…`,
      collection: coll.name,
      current: importIndex,
      total: importTotal,
    });
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
  const memoryStore = request.migrationStore ?? getMigrationStore();
  if (reflectionScheduled) {
    reportProgress(request, { stage: 'reflection', message: 'Scheduling post-import ML feedback reflection…' });
    triggerPostMigrationReflection(migrationLogIds, { clusterId, store: memoryStore });
  }

  const feedback: PipelineFeedbackSummary = {
    memoryDb,
    migrationLogIds,
    reflectionScheduled,
    collectionsLogged: migrationLogIds.length,
  };

  const store = request.migrationStore ?? getMigrationStore();
  reportProgress(request, { stage: 'persisting', message: 'Saving pipeline execution record to MongoDB…' });
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

  reportProgress(request, { stage: 'done', message: errors.length === 0 ? 'Pipeline completed successfully.' : 'Pipeline finished with errors.' });

  return {
    ok: errors.length === 0,
    design,
    feedback,
    execution,
    paths: {
      outDir,
      planPath: paths.planPath,
      reportPath: paths.reportPath,
      manifestPath,
      feedbackPath,
      combinedOpenApiPath: paths.combinedOpenApiPath,
    },
    csvSource: { path: csvRoot, collections: csvCollections },
    imports,
    errors,
    apiArtifacts,
  };
}
