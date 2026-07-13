import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  maskSecretKey,
  readTenantSecrets,
  tenantSecretsStatus,
  writeTenantSecrets,
} from './tenantSecrets.js';
import { LOCAL_DEV_TENANT_ID } from './tenant.js';

describe('tenantSecrets', () => {
  it('masks model keys for display', () => {
    expect(maskSecretKey('al-abcdefghijklmnop')).toBe('al-a…mnop');
    expect(maskSecretKey('short')).toBe('••••••••');
  });

  it('writes and reads per-tenant secrets without echoing full values in status', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'hvymetl-secrets-'));
    try {
      writeTenantSecrets(rootDir, LOCAL_DEV_TENANT_ID, {
        mongoUri: 'mongodb+srv://user:secret@cluster.example.net/app',
        mongodbModelKey: 'al-test-model-key-1234',
      });
      const stored = readTenantSecrets(rootDir, LOCAL_DEV_TENANT_ID);
      expect(stored?.mongoUri).toContain('cluster.example.net');
      const status = tenantSecretsStatus(stored);
      expect(status.hasMongoUri).toBe(true);
      expect(status.hasMongodbModelKey).toBe(true);
      expect(status.mongoUriMasked).not.toContain('secret');
      expect(status.mongodbModelKeyMasked).not.toContain('test-model-key');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
