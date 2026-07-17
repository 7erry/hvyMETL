/**
 * Track the latest generated OpenAPI + MongoDB schema artifact bundle on disk.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tenantArtifactDir, type TenantArtifactKind } from './tenant.js';

export type ApiArtifactCollection = {
  name: string;
  schemaPath: string;
  openApiPath: string;
};

export type ApiArtifactBundle = {
  outDir: string;
  label: string;
  registeredAt: string;
  combinedOpenApiPath: string;
  schemasDir: string;
  openapiDir: string;
  collections: ApiArtifactCollection[];
};

let activeBundle: ApiArtifactBundle | null = null;
const activeBundlesByTenant = new Map<string, ApiArtifactBundle>();

function listCollectionArtifacts(outDir: string): ApiArtifactCollection[] {
  const schemasDir = join(outDir, 'schemas');
  const openapiDir = join(outDir, 'openapi');
  if (!existsSync(schemasDir)) return [];

  const collections: ApiArtifactCollection[] = [];
  for (const fileName of readdirSync(schemasDir)) {
    if (!fileName.endsWith('.schema.json')) continue;
    const name = fileName.replace(/\.schema\.json$/i, '');
    collections.push({
      name,
      schemaPath: join(schemasDir, fileName),
      openApiPath: join(openapiDir, `${name}.openapi.json`),
    });
  }
  return collections.sort((a, b) => a.name.localeCompare(b.name));
}

/** Re-read collection artifact files from disk (drops removed collections). */
function hydrateBundleFromDisk(bundle: ApiArtifactBundle): ApiArtifactBundle {
  return {
    ...bundle,
    collections: listCollectionArtifacts(bundle.outDir),
  };
}

const ARTIFACT_KINDS: TenantArtifactKind[] = ['ui-pipeline', 'ui-design', 'ui-export'];

/** Newest tenant artifact folder that contains a combined OpenAPI spec. */
export function resolveLatestApiArtifactDir(rootDir: string, tenantId: string): string | undefined {
  let latest: { dir: string; mtime: number } | undefined;
  for (const kind of ARTIFACT_KINDS) {
    const dir = tenantArtifactDir(rootDir, tenantId, kind);
    const combinedOpenApiPath = join(dir, 'openapi.json');
    if (!existsSync(combinedOpenApiPath)) continue;
    const mtime = statSync(combinedOpenApiPath).mtimeMs;
    if (!latest || mtime > latest.mtime) {
      latest = { dir, mtime };
    }
  }
  return latest?.dir;
}

/** Register an output directory that contains openapi.json and schemas/. */
export function registerApiArtifacts(
  outDir: string,
  label = 'artifacts',
  tenantId?: string,
): ApiArtifactBundle | null {
  const combinedOpenApiPath = join(outDir, 'openapi.json');
  if (!existsSync(combinedOpenApiPath)) return null;

  const bundle: ApiArtifactBundle = {
    outDir,
    label,
    registeredAt: new Date().toISOString(),
    combinedOpenApiPath,
    schemasDir: join(outDir, 'schemas'),
    openapiDir: join(outDir, 'openapi'),
    collections: listCollectionArtifacts(outDir),
  };

  if (tenantId) {
    activeBundlesByTenant.set(tenantId, bundle);
  } else {
    activeBundle = bundle;
  }
  return bundle;
}

/** Active bundle, or the newest tenant artifact folder when present. */
export function getActiveApiArtifacts(defaultOutDir?: string, tenantId?: string): ApiArtifactBundle | null {
  if (tenantId) {
    if (defaultOutDir) {
      const cached = activeBundlesByTenant.get(tenantId);
      if (cached?.outDir === defaultOutDir && existsSync(cached.combinedOpenApiPath)) {
        return hydrateBundleFromDisk(cached);
      }
      return registerApiArtifacts(defaultOutDir, 'default', tenantId);
    }
    const cached = activeBundlesByTenant.get(tenantId);
    if (cached && existsSync(cached.combinedOpenApiPath)) {
      return hydrateBundleFromDisk(cached);
    }
    return null;
  }

  if (activeBundle && existsSync(activeBundle.combinedOpenApiPath)) {
    return hydrateBundleFromDisk(activeBundle);
  }
  if (defaultOutDir) {
    return registerApiArtifacts(defaultOutDir, 'default');
  }
  return null;
}

export function readJsonArtifact(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Read a JSON artifact that must be an object (OpenAPI specs, validator schemas). */
export function readJsonObjectArtifact(path: string): Record<string, unknown> {
  const parsed = readJsonArtifact(path);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in artifact: ${path}`);
  }
  return parsed as Record<string, unknown>;
}

/** Public API shape for the web UI. */
export function serializeApiArtifactBundle(bundle: ApiArtifactBundle): {
  outDir: string;
  label: string;
  registeredAt: string;
  swaggerUiUrl: string;
  combinedOpenApiUrl: string;
  collections: {
    name: string;
    schemaUrl: string;
    openApiUrl: string;
  }[];
} {
  return {
    outDir: bundle.outDir,
    label: bundle.label,
    registeredAt: bundle.registeredAt,
    swaggerUiUrl: '/api/docs',
    combinedOpenApiUrl: '/api/artifacts/openapi.json',
    collections: bundle.collections.map((collection) => ({
      name: collection.name,
      schemaUrl: `/api/artifacts/schemas/${encodeURIComponent(collection.name)}`,
      openApiUrl: `/api/artifacts/openapi/${encodeURIComponent(collection.name)}`,
    })),
  };
}

/** Clear tenant-scoped artifact cache (tests). */
export function resetApiArtifactStore(): void {
  activeBundle = null;
  activeBundlesByTenant.clear();
}
