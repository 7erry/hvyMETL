/**
 * Pipeline environment configuration for design → ETL → Atlas import.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getDialectLabel,
  inferSchemaDialect,
  isLiveSourceDialect,
} from '../dialects.js';
import {
  readCsvToAtlasPathFromEnv,
  validateCsvToAtlasInstallation,
  type CsvToAtlasValidation,
} from '../utilities/csvToAtlas.js';

/** Non-secret pipeline settings readable by the UI. */
export type PipelineConfigStatus = {
  hasMongoUri: boolean;
  hasCsvToAtlas: boolean;
  csvToAtlasLabel?: string;
  sourceDbPath?: string;
  hasSourceDb: boolean;
  defaultTargetDb: string;
  schemaDialect?: string;
  schemaDialectLabel?: string;
  isLiveSchemaSource?: boolean;
  csvToAtlasValidation: Pick<CsvToAtlasValidation, 'ok' | 'errors' | 'warnings'>;
  missing: string[];
};

/** Read optional default SQLite source from the environment. */
export function readSourceDbFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.HVYMETL_SOURCE_DB?.trim();
  return raw || undefined;
}

/** Build a UI-safe summary of what is configured vs missing. */
export function getPipelineConfigStatus(
  env: NodeJS.ProcessEnv = process.env,
  options?: { schemaDialect?: string; importedSourcePath?: string },
): PipelineConfigStatus {
  const hasMongoUri = Boolean(env.MONGODB_URI?.trim());
  const csvToAtlasPath = readCsvToAtlasPathFromEnv(env);
  const csvToAtlasValidation = validateCsvToAtlasInstallation(csvToAtlasPath);
  const envSourceDbPath = readSourceDbFromEnv(env);
  const importedPath = options?.importedSourcePath?.trim();
  const resolvedImported = importedPath ? resolve(importedPath) : undefined;
  const hasImportedSource = Boolean(resolvedImported && existsSync(resolvedImported));
  const hasEnvSource = Boolean(envSourceDbPath && existsSync(resolve(envSourceDbPath)));
  const sourceDbPath = hasImportedSource
    ? resolvedImported
    : hasEnvSource
      ? resolve(envSourceDbPath!)
      : envSourceDbPath;
  const hasSourceDb = hasImportedSource || hasEnvSource;
  const schemaDialect = options?.schemaDialect;
  const schemaDialectLabel = schemaDialect ? getDialectLabel(schemaDialect) : undefined;

  const missing: string[] = [];
  if (!hasMongoUri) missing.push('MONGODB_URI');
  if (!csvToAtlasValidation.ok) missing.push('CSV_TO_ATLAS_PATH');
  if (!hasSourceDb) {
    missing.push(
      schemaDialect && isLiveSourceDialect(schemaDialect)
        ? 'SQLite database from schema import or HVYMETL_SOURCE_DB'
        : 'SQLite .db file for ETL row extraction',
    );
  }

  return {
    hasMongoUri,
    hasCsvToAtlas: csvToAtlasValidation.ok,
    csvToAtlasLabel: csvToAtlasValidation.source?.label,
    sourceDbPath: hasSourceDb ? sourceDbPath : undefined,
    hasSourceDb,
    defaultTargetDb: env.MONGODB_DB?.trim() || 'csv_to_atlas',
    schemaDialect,
    schemaDialectLabel,
    isLiveSchemaSource: schemaDialect ? isLiveSourceDialect(schemaDialect) : undefined,
    csvToAtlasValidation: {
      ok: csvToAtlasValidation.ok,
      errors: csvToAtlasValidation.errors,
      warnings: csvToAtlasValidation.warnings,
    },
    missing,
  };
}

/** Resolve schema dialect from the request, model source label, or default. */
export function resolvePipelineSchemaDialect(
  requestedDialect: string | undefined,
  model: { source: string } | undefined,
): string {
  return inferSchemaDialect(model, requestedDialect ?? '');
}

/** Resolve and validate a SQLite source path (env default or UI override). */
export function resolvePipelineSourceDb(
  requestedPath: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  schemaDialect?: string,
): string {
  const candidate = (requestedPath ?? readSourceDbFromEnv(env))?.trim();
  if (!candidate) {
    const label = schemaDialect ? getDialectLabel(schemaDialect) : 'SQLite';
    throw new Error(
      isLiveSourceDialect(schemaDialect ?? 'sqlite')
        ? 'SQLite source database is required. Upload a .db during schema import, set HVYMETL_SOURCE_DB in .env, or upload below.'
        : `Schema was imported as ${label}. ETL row extraction requires a SQLite .db file with matching tables — upload one or set HVYMETL_SOURCE_DB.`,
    );
  }
  const resolved = resolve(candidate);
  if (!existsSync(resolved)) {
    throw new Error(`SQLite source not found: ${resolved}`);
  }
  return resolved;
}

/** Merge request overrides into a process env for one import invocation. */
export function buildPipelineImportEnv(
  overrides: { mongoUri?: string; mongoDb?: string; csvToAtlasPath?: string },
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  if (overrides.mongoUri?.trim()) env.MONGODB_URI = overrides.mongoUri.trim();
  if (overrides.mongoDb?.trim()) env.MONGODB_DB = overrides.mongoDb.trim();
  if (overrides.csvToAtlasPath?.trim()) env.CSV_TO_ATLAS_PATH = overrides.csvToAtlasPath.trim();
  return env;
}
