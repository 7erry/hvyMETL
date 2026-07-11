import type { PipelineConfigStatus } from './api';

/** Fields in the pipeline settings form that can be hydrated from server config once. */
export type PipelineSettingsFields = {
  mongoUri: string;
  csvToAtlasPath: string;
  targetDb: string;
  csvSourcePath: string;
};

const ENV_MONGO_PLACEHOLDER = '(configured in .env)';

export function isEnvMongoPlaceholder(value: string): boolean {
  return value.trim() === ENV_MONGO_PLACEHOLDER;
}

/** Mongo URI sent to the pipeline config API (omit placeholder / empty). */
export function mongoUriOverrideForFetch(mongoUri: string): string | undefined {
  const trimmed = mongoUri.trim();
  if (!trimmed || isEnvMongoPlaceholder(trimmed)) return undefined;
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
    'defaultTargetDb' | 'csvSourcePath' | 'hasMongoUri' | 'csvToAtlasResolvedPath' | 'csvToAtlasLabel'
  >,
  savedCsvPath: string,
): PipelineSettingsFields {
  const hasUserMongo =
    prev.mongoUri.trim().length > 0 && !isEnvMongoPlaceholder(prev.mongoUri);
  const hasUserCsvToAtlas = prev.csvToAtlasPath.trim().length > 0;

  return {
    targetDb: prev.targetDb.trim() || status.defaultTargetDb,
    csvSourcePath: prev.csvSourcePath.trim() || savedCsvPath || status.csvSourcePath || '',
    mongoUri: hasUserMongo
      ? prev.mongoUri
      : status.hasMongoUri
        ? ENV_MONGO_PLACEHOLDER
        : prev.mongoUri,
    csvToAtlasPath: hasUserCsvToAtlas
      ? prev.csvToAtlasPath
      : status.csvToAtlasResolvedPath || status.csvToAtlasLabel || '',
  };
}

/** Value bound to the Mongo URI input (hide env placeholder in the text field). */
export function mongoUriInputValue(mongoUri: string): string {
  return isEnvMongoPlaceholder(mongoUri) ? '' : mongoUri;
}
