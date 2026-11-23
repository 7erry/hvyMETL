import { isIP } from 'node:net';
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

const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.google.com',
  'metadata.aws',
]);

function ipv4Private(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isDisallowedMongoHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (METADATA_HOSTS.has(host)) return true;
  if (isIP(host) === 4 && ipv4Private(host)) return true;
  if (isIP(host) === 6) {
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  }
  return false;
}

/** Reject request-supplied URIs that point at the studio machine, a private network, or a cloud metadata host. */
export function assertRequestMongoUri(uri: string): string {
  const trimmed = uri.trim();
  let hostname = '';
  try {
    hostname = new URL(trimmed).hostname;
  } catch {
    throw new Error('MongoDB URI host is not allowed.');
  }
  if (isDisallowedMongoHost(hostname)) {
    throw new Error('MongoDB URI host is not allowed.');
  }
  return trimmed;
}

/** Hosted studio ignores `?mongoUri=`. Other requests may pass a public URI. */
export function queryMongoUriOverride(hosted: boolean, queryUri: string | undefined): string | undefined {
  if (hosted) return undefined;
  const trimmed = queryUri?.trim();
  if (!trimmed) return undefined;
  return assertRequestMongoUri(trimmed);
}

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
  const requestedUri = options.overrides.mongoUri?.trim();
  if (requestedUri) assertRequestMongoUri(requestedUri);

  const mongoUri =
    requestedUri ||
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
  if (overrides.mongoUri?.trim()) patch.mongoUri = assertRequestMongoUri(overrides.mongoUri);
  if (overrides.mongodbModelKey?.trim()) patch.mongodbModelKey = overrides.mongodbModelKey.trim();
  if (Object.keys(patch).length === 0) return;
  writeTenantSecrets(rootDir, tenantId, patch);
}
