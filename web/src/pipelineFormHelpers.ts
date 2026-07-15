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

type CsvToAtlasConfigSlice = Pick<
  PipelineConfigStatus,
  'serverManagedCsvToAtlas' | 'csvToAtlasFromEnv' | 'hasCsvToAtlas' | 'csvToAtlasResolvedPath'
>;

/** True when the API server already provides csvToAtlas (hide the settings field unless the user is overriding). */
export function isCsvToAtlasServerConfigured(
  status: CsvToAtlasConfigSlice | null | undefined,
  userOverridePath = '',
): boolean {
  if (!status || userOverridePath.trim()) return false;
  if (status.serverManagedCsvToAtlas) return true;
  if (status.csvToAtlasFromEnv) return true;
  return Boolean(status.hasCsvToAtlas && status.csvToAtlasResolvedPath);
}

/** User-typed csvToAtlas path that differs from the server-resolved installation. */
export function csvToAtlasUserOverridePath(
  formPath: string,
  status: Pick<PipelineConfigStatus, 'csvToAtlasResolvedPath' | 'csvToAtlasLabel'> | null | undefined,
): string {
  const trimmed = formPath.trim();
  if (!trimmed) return '';
  const serverPath = (status?.csvToAtlasResolvedPath ?? status?.csvToAtlasLabel ?? '').trim();
  if (serverPath && trimmed === serverPath) return '';
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
    | 'csvToAtlasFromEnv'
    | 'tenantSecrets'
  >,
  savedCsvPath: string,
): PipelineSettingsFields {
  const hasUserMongo =
    prev.mongoUri.trim().length > 0 && !isEnvMongoPlaceholder(prev.mongoUri);
  const hasUserModelKey =
    prev.mongodbModelKey.trim().length > 0 && !isEnvModelKeyPlaceholder(prev.mongodbModelKey);
  const userCsvToAtlasOverride = csvToAtlasUserOverridePath(prev.csvToAtlasPath, status);
  const csvToAtlasLocked = isCsvToAtlasServerConfigured(status, userCsvToAtlasOverride);
  const hasUserCsvToAtlas = Boolean(userCsvToAtlasOverride);

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
    csvToAtlasPath: csvToAtlasLocked
      ? ''
      : hasUserCsvToAtlas
        ? userCsvToAtlasOverride
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
