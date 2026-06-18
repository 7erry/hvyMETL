/**
 * Track the latest generated OpenAPI + MongoDB schema artifact bundle on disk.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** Register an output directory that contains openapi.json and schemas/. */
export function registerApiArtifacts(outDir: string, label = 'artifacts'): ApiArtifactBundle | null {
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

  activeBundle = bundle;
  return bundle;
}

/** Active bundle, or the default ui-export folder when present. */
export function getActiveApiArtifacts(defaultOutDir?: string): ApiArtifactBundle | null {
  if (activeBundle && existsSync(activeBundle.combinedOpenApiPath)) {
    return activeBundle;
  }
  if (defaultOutDir) {
    return registerApiArtifacts(defaultOutDir, 'default') ?? null;
  }
  return null;
}

export function readJsonArtifact(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
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
