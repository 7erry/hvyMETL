import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getActiveApiArtifacts,
  registerApiArtifacts,
  resetApiArtifactStore,
  resolveLatestApiArtifactDir,
} from './apiArtifactStore.js';
import { tenantArtifactDir } from './tenant.js';

describe('apiArtifactStore', () => {
  const rootDir = join(tmpdir(), `hvymetl-artifacts-${Date.now()}`);
  const tenantId = 'tenant_test';

  afterEach(() => {
    resetApiArtifactStore();
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('picks the newest tenant artifact folder by openapi.json mtime', () => {
    const exportDir = tenantArtifactDir(rootDir, tenantId, 'ui-export');
    const designDir = tenantArtifactDir(rootDir, tenantId, 'ui-design');
    mkdirSync(join(exportDir, 'schemas'), { recursive: true });
    mkdirSync(join(designDir, 'schemas'), { recursive: true });

    writeFileSync(join(exportDir, 'openapi.json'), '{"openapi":"3.0.3","paths":{}}\n');
    writeFileSync(join(exportDir, 'schemas', 'legacy.schema.json'), '{}\n');
    writeFileSync(join(designDir, 'openapi.json'), '{"openapi":"3.0.3","paths":{}}\n');
    writeFileSync(join(designDir, 'schemas', 'clusters.schema.json'), '{}\n');

    const exportOpenApi = join(exportDir, 'openapi.json');
    const designOpenApi = join(designDir, 'openapi.json');
    const oldTime = new Date('2026-01-01T00:00:00Z');
    const newTime = new Date('2026-06-01T00:00:00Z');
    utimesSync(exportOpenApi, oldTime, oldTime);
    utimesSync(designOpenApi, newTime, newTime);

    expect(resolveLatestApiArtifactDir(rootDir, tenantId)).toBe(designDir);

    const bundle = getActiveApiArtifacts(designDir, tenantId);
    expect(bundle?.collections.map((collection) => collection.name)).toEqual(['clusters']);
  });

  it('re-reads collections from disk when a cached bundle dir is reused', () => {
    const designDir = tenantArtifactDir(rootDir, tenantId, 'ui-design');
    mkdirSync(join(designDir, 'schemas'), { recursive: true });
    writeFileSync(join(designDir, 'openapi.json'), '{"openapi":"3.0.3","paths":{}}\n');
    writeFileSync(join(designDir, 'schemas', 'legacy.schema.json'), '{}\n');
    registerApiArtifacts(designDir, 'ui-design', tenantId);

    writeFileSync(join(designDir, 'schemas', 'clusters.schema.json'), '{}\n');
    rmSync(join(designDir, 'schemas', 'legacy.schema.json'));

    const bundle = getActiveApiArtifacts(designDir, tenantId);
    expect(bundle?.collections.map((collection) => collection.name)).toEqual(['clusters']);
  });
});
