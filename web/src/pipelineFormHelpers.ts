import type { PipelineConfigStatus } from './api';

/** Fields in the pipeline settings form that can be hydrated from server config once. */
export type PipelineSettingsFields = {
  mongoUri: string;
  mongodbModelKey: string;
  csvToAtlasPath: string;
  targetDb: string;
  csvSourcePath: string;
};

const ENV_MONGO_PLACEHOLDER = '(configured in .env)';
const ENV_MODEL_KEY_PLACEHOLDER = '(configured in .env)';

export function isEnvMongoPlaceholder(value: string): boolean {
  return value.trim() === ENV_MONGO_PLACEHOLDER;
}

export function isEnvModelKeyPlaceholder(value: string): boolean {
  return value.trim() === ENV_MODEL_KEY_PLACEHOLDER;
}

/** Mongo URI sent to the pipeline config API (omit placeholder / empty). */
export function mongoUriOverrideForFetch(mongoUri: string): string | undefined {
  const trimmed = mongoUri.trim();
  if (!trimmed || isEnvMongoPlaceholder(trimmed)) return undefined;
  return trimmed;
}

/** Model key sent to the pipeline config API (omit placeholder / empty). */
export function modelKeyOverrideForFetch(modelKey: string): string | undefined {
  const trimmed = modelKey.trim();
  if (!trimmed || isEnvModelKeyPlaceholder(trimmed)) return undefined;
  return trimmed;
}

/**
 * Fill empty pipeline settings from server config when the panel opens.
 * Never overwrites values the user is already editing.
 */
export function hydratePipelineSettingsFromConfig(
  prev: PipelineSettingsFields,
  status: Pick<
    PipelineConfigStatus,
    | 'defaultTargetDb'
    | 'csvSourcePath'
    | 'hasMongoUri'
    | 'hasModelKey'
    | 'csvToAtlasResolvedPath'
    | 'csvToAtlasLabel'
    | 'mongoUriMasked'
    | 'mongodbModelKeyMasked'
    | 'serverManagedCsvToAtlas'
    | 'tenantSecrets'
  >,
  savedCsvPath: string,
): PipelineSettingsFields {
  const hasUserMongo =
    prev.mongoUri.trim().length > 0 && !isEnvMongoPlaceholder(prev.mongoUri);
  const hasUserModelKey =
    prev.mongodbModelKey.trim().length > 0 && !isEnvModelKeyPlaceholder(prev.mongodbModelKey);
  const hasUserCsvToAtlas = prev.csvToAtlasPath.trim().length > 0 && !status.serverManagedCsvToAtlas;

  const storedMongo = status.tenantSecrets?.hasMongoUri;
  const storedModelKey = status.tenantSecrets?.hasMongodbModelKey;

  return {
    targetDb: prev.targetDb.trim() || status.defaultTargetDb,
    csvSourcePath: prev.csvSourcePath.trim() || savedCsvPath || status.csvSourcePath || '',
    mongoUri: hasUserMongo
      ? prev.mongoUri
      : storedMongo
        ? ENV_MONGO_PLACEHOLDER
        : status.hasMongoUri
          ? ENV_MONGO_PLACEHOLDER
          : prev.mongoUri,
    mongodbModelKey: hasUserModelKey
      ? prev.mongodbModelKey
      : storedModelKey
        ? ENV_MODEL_KEY_PLACEHOLDER
        : status.hasModelKey
          ? ENV_MODEL_KEY_PLACEHOLDER
          : prev.mongodbModelKey,
    csvToAtlasPath: status.serverManagedCsvToAtlas
      ? status.csvToAtlasResolvedPath || status.csvToAtlasLabel || 'Configured on server'
      : hasUserCsvToAtlas
        ? prev.csvToAtlasPath
        : status.csvToAtlasResolvedPath || status.csvToAtlasLabel || '',
  };
}

/** Value bound to the Mongo URI input (hide env placeholder in the text field). */
export function mongoUriInputValue(mongoUri: string): string {
  return isEnvMongoPlaceholder(mongoUri) ? '' : mongoUri;
}

/** Value bound to the model key input (hide env placeholder in the text field). */
export function modelKeyInputValue(modelKey: string): string {
  return isEnvModelKeyPlaceholder(modelKey) ? '' : modelKey;
}

/** True when a saved CSV path clearly refers to the user's machine, not the API server. */
export function isLikelyLocalFilesystemPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  return /^([A-Za-z]:\\|\\\\)/.test(trimmed) || /^\/Users\//.test(trimmed) || /^\/home\//.test(trimmed);
}

/** Ignore local-only paths when running against hosted studio. */
export function resolveHostedCsvSourcePath(path: string | null | undefined, requiresCsvUpload: boolean): string {
  const trimmed = path?.trim() ?? '';
  if (!trimmed) return '';
  if (requiresCsvUpload && isLikelyLocalFilesystemPath(trimmed)) return '';
  return trimmed;
}
