/**
 * Pipeline environment configuration for design → csvToAtlas import.
 */

import { resolve } from 'node:path';
import { getDialectLabel, inferSchemaDialect } from '../dialects.js';
import { hasCsvSourceAtPath, readCsvSourceFromEnv } from '../utilities/csvSource.js';
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
  csvSourcePath?: string;
  hasCsvSource: boolean;
  defaultTargetDb: string;
  schemaDialect?: string;
  schemaDialectLabel?: string;
  csvToAtlasValidation: Pick<CsvToAtlasValidation, 'ok' | 'errors' | 'warnings'>;
  missing: string[];
};

/** Build a UI-safe summary of what is configured vs missing. */
export function getPipelineConfigStatus(
  env: NodeJS.ProcessEnv = process.env,
  options?: { schemaDialect?: string; csvSourcePath?: string },
): PipelineConfigStatus {
  const hasMongoUri = Boolean(env.MONGODB_URI?.trim());
  const csvToAtlasPath = readCsvToAtlasPathFromEnv(env);
  const csvToAtlasValidation = validateCsvToAtlasInstallation(csvToAtlasPath);
  const envCsvPath = readCsvSourceFromEnv(env);
  const requestedCsv = options?.csvSourcePath?.trim();
  const resolvedCsv = hasCsvSourceAtPath(requestedCsv)
    ? resolve(requestedCsv!)
    : hasCsvSourceAtPath(envCsvPath)
      ? resolve(envCsvPath!)
      : undefined;
  const hasCsvSource = Boolean(resolvedCsv);
  const schemaDialect = options?.schemaDialect;
  const schemaDialectLabel = schemaDialect ? getDialectLabel(schemaDialect) : undefined;

  const missing: string[] = [];
  if (!hasMongoUri) missing.push('MONGODB_URI');
  if (!csvToAtlasValidation.ok) missing.push('CSV_TO_ATLAS_PATH');
  if (!hasCsvSource) missing.push('HVYMETL_CSV_SOURCE or CSV export directory');

  return {
    hasMongoUri,
    hasCsvToAtlas: csvToAtlasValidation.ok,
    csvToAtlasLabel: csvToAtlasValidation.source?.label,
    csvSourcePath: resolvedCsv,
    hasCsvSource,
    defaultTargetDb: env.MONGODB_DB?.trim() || 'csv_to_atlas',
    schemaDialect,
    schemaDialectLabel,
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
