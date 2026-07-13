import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { maskMongoUri } from '../utilities/mongoConnectivity.js';
import { ensureTenantDirs, tenantOutRoot } from './tenant.js';

/** Per-tenant secrets stored server-side (never returned in full to the client). */
export type TenantSecretsDocument = {
  version: 1;
  updatedAt: string;
  mongoUri?: string;
  mongodbModelKey?: string;
};

/** Masked secrets summary for the UI. */
export type TenantSecretsStatus = {
  hasMongoUri: boolean;
  hasMongodbModelKey: boolean;
  mongoUriMasked?: string;
  mongodbModelKeyMasked?: string;
  updatedAt?: string;
};

export function tenantSecretsPath(rootDir: string, tenantId: string): string {
  return join(tenantOutRoot(rootDir, tenantId), 'tenant-secrets.json');
}

export function readTenantSecrets(rootDir: string, tenantId: string): TenantSecretsDocument | null {
  const path = tenantSecretsPath(rootDir, tenantId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as TenantSecretsDocument;
}

export function maskSecretKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function tenantSecretsStatus(secrets: TenantSecretsDocument | null): TenantSecretsStatus {
  const mongoUri = secrets?.mongoUri?.trim();
  const modelKey = secrets?.mongodbModelKey?.trim();
  return {
    hasMongoUri: Boolean(mongoUri),
    hasMongodbModelKey: Boolean(modelKey),
    mongoUriMasked: mongoUri ? maskMongoUri(mongoUri) : undefined,
    mongodbModelKeyMasked: modelKey ? maskSecretKey(modelKey) : undefined,
    updatedAt: secrets?.updatedAt,
  };
}

export function writeTenantSecrets(
  rootDir: string,
  tenantId: string,
  patch: Partial<Pick<TenantSecretsDocument, 'mongoUri' | 'mongodbModelKey'>>,
): TenantSecretsDocument {
  ensureTenantDirs(rootDir, tenantId);
  const existing = readTenantSecrets(rootDir, tenantId);
  const next: TenantSecretsDocument = {
    version: 1,
    updatedAt: new Date().toISOString(),
    mongoUri: existing?.mongoUri,
    mongodbModelKey: existing?.mongodbModelKey,
  };

  if ('mongoUri' in patch) {
    const value = patch.mongoUri?.trim();
    if (value) next.mongoUri = value;
    else delete next.mongoUri;
  }
  if ('mongodbModelKey' in patch) {
    const value = patch.mongodbModelKey?.trim();
    if (value) next.mongodbModelKey = value;
    else delete next.mongodbModelKey;
  }

  writeFileSync(tenantSecretsPath(rootDir, tenantId), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
