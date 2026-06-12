/**
 * Full pipeline: design → csvToAtlas import from user CSV exports (web UI).
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designFromModel, writeDesignArtifacts, type DesignFromModelResult } from '../design/designFromModel.js';
import type { SqlStructuralModel } from '../types.js';
import { buildCollectionCsvMap, resolveCsvSourcePath } from '../utilities/csvSource.js';
import { runImportCli } from '../utilities/runImportCli.js';
import {
  buildPipelineImportEnv,
  getPipelineConfigStatus,
  resolvePipelineSchemaDialect,
} from './pipelineConfig.js';

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
};

export type CollectionImportSummary = {
  collection: string;
  files: string[];
  ok: boolean;
  insertedCount?: number;
  error?: string;
};

export type PipelineRunResult = {
  ok: boolean;
  design: DesignFromModelResult;
  paths: {
    outDir: string;
    planPath: string;
    reportPath: string;
    manifestPath: string;
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

  const design = await designFromModel(request.model, request.profileId, request.knowledgeDir);
  const paths = writeDesignArtifacts(outDir, design);

  const csvMap = buildCollectionCsvMap(csvRoot, design.plan.collections);
  const csvCollections = design.plan.collections.map((collection) => ({
    name: collection.name,
    files: csvMap.get(collection.name) ?? [],
  }));

  const manifestPath = join(outDir, 'csv-import-manifest.json');
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ csvSource: csvRoot, schemaDialect, collections: csvCollections }, null, 2)}\n`,
  );

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

  return {
    ok: errors.length === 0,
    design,
    paths: { outDir, planPath: paths.planPath, reportPath: paths.reportPath, manifestPath },
    csvSource: { path: csvRoot, collections: csvCollections },
    imports,
    errors,
  };
}
