/**
 * Pipeline environment configuration for design → ETL → Atlas import.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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
  csvToAtlasValidation: Pick<CsvToAtlasValidation, 'ok' | 'errors' | 'warnings'>;
  missing: string[];
};

/** Read optional default SQLite source from the environment. */
export function readSourceDbFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.HVYMETL_SOURCE_DB?.trim();
  return raw || undefined;
}

/** Build a UI-safe summary of what is configured vs missing. */
export function getPipelineConfigStatus(env: NodeJS.ProcessEnv = process.env): PipelineConfigStatus {
  const hasMongoUri = Boolean(env.MONGODB_URI?.trim());
  const csvToAtlasPath = readCsvToAtlasPathFromEnv(env);
  const csvToAtlasValidation = validateCsvToAtlasInstallation(csvToAtlasPath);
  const sourceDbPath = readSourceDbFromEnv(env);
  const hasSourceDb = Boolean(sourceDbPath && existsSync(resolve(sourceDbPath)));

  const missing: string[] = [];
  if (!hasMongoUri) missing.push('MONGODB_URI');
  if (!csvToAtlasValidation.ok) missing.push('CSV_TO_ATLAS_PATH');
  if (!hasSourceDb) missing.push('HVYMETL_SOURCE_DB or SQLite upload');

  return {
    hasMongoUri,
    hasCsvToAtlas: csvToAtlasValidation.ok,
    csvToAtlasLabel: csvToAtlasValidation.source?.label,
    sourceDbPath: hasSourceDb ? resolve(sourceDbPath!) : sourceDbPath,
    hasSourceDb,
    defaultTargetDb: env.MONGODB_DB?.trim() || 'csv_to_atlas',
    csvToAtlasValidation: {
      ok: csvToAtlasValidation.ok,
      errors: csvToAtlasValidation.errors,
      warnings: csvToAtlasValidation.warnings,
    },
    missing,
  };
}

/** Resolve and validate a SQLite source path (env default or UI override). */
export function resolvePipelineSourceDb(requestedPath: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const candidate = (requestedPath ?? readSourceDbFromEnv(env))?.trim();
  if (!candidate) {
    throw new Error('SQLite source database is required. Set HVYMETL_SOURCE_DB in .env or upload a .db file.');
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
