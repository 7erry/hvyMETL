import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { assertRequestMongoUri, queryMongoUriOverride, resolvePipelineCredentials } from './pipelineCredentials.js';
import { writeTenantSecrets } from './tenantSecrets.js';
import { LOCAL_DEV_TENANT_ID } from './tenant.js';

describe('resolvePipelineCredentials', () => {
  let rootDir: string;

  afterEach(() => {
    if (rootDir) rmSync(rootDir, { recursive: true, force: true });
  });

  it('uses tenant secrets on hosted studio and ignores client csvToAtlas path', () => {
    rootDir = mkdtempSync(join(tmpdir(), 'hvymetl-creds-'));
    writeTenantSecrets(rootDir, LOCAL_DEV_TENANT_ID, {
      mongoUri: 'mongodb+srv://tenant@cluster.example.net/db',
      mongodbModelKey: 'al-tenant-key',
    });

    const creds = resolvePipelineCredentials(rootDir, LOCAL_DEV_TENANT_ID, {
      hosted: true,
      authEnabled: true,
      overrides: {
        mongoUri: 'mongodb+srv://body@cluster.example.net/db',
        csvToAtlasPath: '/client/should-be-ignored',
      },
    });

    expect(creds.mongoUri).toBe('mongodb+srv://body@cluster.example.net/db');
    expect(creds.mongodbModelKey).toBe('al-tenant-key');
    expect(creds.csvToAtlasPath).toBeUndefined();
  });

  it('ignores a hosted query mongoUri and rejects loopback', () => {
    expect(queryMongoUriOverride(true, 'mongodb://127.0.0.1:27017')).toBeUndefined();
    expect(queryMongoUriOverride(false, 'mongodb+srv://user@cluster.example.net/db')).toBe(
      'mongodb+srv://user@cluster.example.net/db',
    );
    expect(() => assertRequestMongoUri('mongodb://127.0.0.1:27017')).toThrow(/not allowed/);
    expect(() => assertRequestMongoUri('mongodb://169.254.1.1:27017')).toThrow(/not allowed/);
    expect(() => assertRequestMongoUri('mongodb://[::1]:27017')).toThrow(/not allowed/);
  });
});
