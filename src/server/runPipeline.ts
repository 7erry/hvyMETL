/**
 * Full pipeline: design → ETL → csvToAtlas import (used by the web UI).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designFromModel, writeDesignArtifacts, type DesignFromModelResult } from '../design/designFromModel.js';
import { runEtl } from '../etl/runEtl.js';
import type { MigrationPlan, SqlStructuralModel } from '../types.js';
import { runImportCli } from '../utilities/runImportCli.js';
import {
  buildPipelineImportEnv,
  getPipelineConfigStatus,
  resolvePipelineSchemaDialect,
  resolvePipelineSourceDb,
} from './pipelineConfig.js';

export type PipelineRunRequest = {
  profileId: string;
  model: SqlStructuralModel;
  ddl: string;
  dialect?: string;
  sourceDbPath?: string;
  targetDb?: string;
  outDir?: string;
  dryRun?: boolean;
  workers?: number;
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
  etl: {
    elapsedSeconds?: number;
    collections: { name: string; rowCount: number; files: string[] }[];
  };
  imports: CollectionImportSummary[];
  errors: string[];
};

type EtlManifest = {
  collections: { name: string; rowCount: number; files: string[] }[];
  elapsedSeconds?: number;
};

/** Validate inputs then run design, ETL extraction, and Atlas import. */
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
    importedSourcePath: request.sourceDbPath,
  });
  if (!importEnv.MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI is required for Atlas import.');
  }
  if (!config.hasCsvToAtlas) {
    throw new Error(config.csvToAtlasValidation.errors.join(' ') || 'CSV_TO_ATLAS_PATH is not configured.');
  }

  const sourceDbPath = resolvePipelineSourceDb(request.sourceDbPath, importEnv, schemaDialect);
  const outDir = request.outDir ?? join(request.rootDir, 'out', 'ui-pipeline');
  mkdirSync(outDir, { recursive: true });

  const design = await designFromModel(request.model, request.profileId, request.knowledgeDir);
  const paths = writeDesignArtifacts(outDir, design);

  const plan: MigrationPlan = { ...design.plan, source: sourceDbPath };
  writeFileSync(paths.planPath, `${JSON.stringify(plan, null, 2)}\n`);

  await runEtl({
    planPath: paths.planPath,
    outDir,
    dryRun: request.dryRun ?? false,
    workers: request.workers ?? 8,
  });

  const manifestPath = join(outDir, 'etl-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as EtlManifest;

  const targetDb = request.targetDb ?? importEnv.MONGODB_DB ?? 'csv_to_atlas';
  const imports: CollectionImportSummary[] = [];
  for (const coll of manifest.collections) {
    const actualFiles = coll.files.filter((file) => existsSync(file));
    if (actualFiles.length === 0) {
      imports.push({
        collection: coll.name,
        files: coll.files,
        ok: false,
        error: 'No CSV files found after ETL',
      });
      errors.push(`${coll.name}: no CSV files`);
      continue;
    }

    const flags = request.drop === false ? ['--db', targetDb] : ['--drop', '--db', targetDb];
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
    etl: {
      elapsedSeconds: manifest.elapsedSeconds,
      collections: manifest.collections.map((c) => ({
        name: c.name,
        rowCount: c.rowCount,
        files: c.files,
      })),
    },
    imports,
    errors,
  };
}
