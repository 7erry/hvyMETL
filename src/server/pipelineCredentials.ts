import { readTenantSecrets, writeTenantSecrets } from './tenantSecrets.js';

export type PipelineCredentialOverrides = {
  mongoUri?: string;
  mongodbModelKey?: string;
  csvToAtlasPath?: string;
};

export type ResolvedPipelineCredentials = {
  mongoUri?: string;
  mongodbModelKey?: string;
  csvToAtlasPath?: string;
};

/**
 * Resolve MongoDB URI, model key, and csvToAtlas path for one pipeline/design request.
 * On hosted studio with auth, credentials come from the tenant store (not shared server .env).
 */
export function resolvePipelineCredentials(
  rootDir: string,
  tenantId: string,
  options: {
    hosted: boolean;
    authEnabled: boolean;
    overrides: PipelineCredentialOverrides;
  },
): ResolvedPipelineCredentials {
  const secrets = options.authEnabled ? readTenantSecrets(rootDir, tenantId) : null;
  const useTenantIsolation = options.hosted && options.authEnabled;

  const mongoUri =
    options.overrides.mongoUri?.trim() ||
    secrets?.mongoUri?.trim() ||
    (useTenantIsolation ? undefined : process.env.MONGODB_URI?.trim());

  const mongodbModelKey =
    options.overrides.mongodbModelKey?.trim() ||
    secrets?.mongodbModelKey?.trim() ||
    (useTenantIsolation ? undefined : process.env.MONGODB_MODEL_KEY?.trim() || process.env.VOYAGE_API_KEY?.trim());

  const csvToAtlasPath = useTenantIsolation ? undefined : options.overrides.csvToAtlasPath?.trim();

  return { mongoUri, mongodbModelKey, csvToAtlasPath };
}

/** Persist credentials supplied in a pipeline run body for the authenticated tenant. */
export function persistPipelineCredentialOverrides(
  rootDir: string,
  tenantId: string,
  hosted: boolean,
  authEnabled: boolean,
  overrides: PipelineCredentialOverrides,
): void {
  if (!hosted || !authEnabled) return;
  const patch: Partial<{ mongoUri: string; mongodbModelKey: string }> = {};
  if (overrides.mongoUri?.trim()) patch.mongoUri = overrides.mongoUri.trim();
  if (overrides.mongodbModelKey?.trim()) patch.mongodbModelKey = overrides.mongodbModelKey.trim();
  if (Object.keys(patch).length === 0) return;
  writeTenantSecrets(rootDir, tenantId, patch);
}
