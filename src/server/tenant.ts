import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { Request } from 'express';
import { isAuthConfigured } from './auth.js';

/** Shared tenant id when Auth0 is disabled (local single-developer mode). */
export const LOCAL_DEV_TENANT_ID = 'local-dev';

type RequestWithAuth = Request & {
  auth?: {
    payload?: Record<string, unknown>;
  };
};

export type TenantArtifactKind = 'ui-design' | 'ui-export' | 'ui-pipeline';

/** Normalize Auth0 `sub` (or any id) into a safe directory name segment. */
export function sanitizeTenantId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return LOCAL_DEV_TENANT_ID;
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
}

/** Read tenant id from a validated JWT payload (`sub` claim). */
export function tenantIdFromPayload(payload: Record<string, unknown> | undefined): string | null {
  const sub = payload?.sub;
  if (typeof sub !== 'string' || !sub.trim()) return null;
  return sanitizeTenantId(sub);
}

/** Resolve the authenticated tenant for an API request. */
export function getRequestTenantId(req: RequestWithAuth): string {
  if (!isAuthConfigured()) return LOCAL_DEV_TENANT_ID;
  const tenantId = tenantIdFromPayload(req.auth?.payload);
  if (!tenantId) {
    throw new Error('Authenticated user id (JWT sub) is required');
  }
  return tenantId;
}

/** Uploaded SQLite/CSV files for one tenant. */
export function tenantUploadRoot(rootDir: string, tenantId: string): string {
  return join(rootDir, 'web-uploads', 'tenants', tenantId);
}

/** Design/pipeline/export artifacts for one tenant. */
export function tenantOutRoot(rootDir: string, tenantId: string): string {
  return join(rootDir, 'out', 'tenants', tenantId);
}

/** One artifact output folder (ui-design, ui-export, ui-pipeline). */
export function tenantArtifactDir(rootDir: string, tenantId: string, kind: TenantArtifactKind): string {
  const dir = join(tenantOutRoot(rootDir, tenantId), kind);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create upload and output folders for a tenant workspace. */
export function ensureTenantDirs(rootDir: string, tenantId: string): void {
  mkdirSync(join(tenantUploadRoot(rootDir, tenantId), 'uploads'), { recursive: true });
  mkdirSync(join(tenantUploadRoot(rootDir, tenantId), 'csv'), { recursive: true });
  for (const kind of ['ui-design', 'ui-export', 'ui-pipeline'] as TenantArtifactKind[]) {
    mkdirSync(join(tenantOutRoot(rootDir, tenantId), kind), { recursive: true });
  }
}

/** Throw when `candidatePath` is not inside `rootPath`. */
export function assertPathWithinRoot(rootPath: string, candidatePath: string): void {
  const root = resolve(rootPath);
  const candidate = resolve(candidatePath);
  const rel = relative(root, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Access denied: path is outside your workspace.');
  }
}

/** Allow reads/writes only under this tenant's upload or output trees. */
export function assertPathWithinTenantStorage(rootDir: string, tenantId: string, candidatePath: string): void {
  const uploadRoot = tenantUploadRoot(rootDir, tenantId);
  const outRoot = tenantOutRoot(rootDir, tenantId);
  try {
    assertPathWithinRoot(uploadRoot, candidatePath);
    return;
  } catch {
    assertPathWithinRoot(outRoot, candidatePath);
  }
}

/** Default Atlas import database name for a hosted tenant. */
export function tenantDefaultTargetDb(tenantId: string): string {
  return `hvymetl_${tenantId}`.slice(0, 63);
}

/** Per-tenant persisted UI settings (manager inputs, overrides, etc.). */
export function tenantWorkspacePath(rootDir: string, tenantId: string): string {
  return join(tenantOutRoot(rootDir, tenantId), 'workspace.json');
}

export type TenantWorkspaceDocument = {
  version: 1;
  updatedAt: string;
  profileId?: string;
  dialect?: string;
  ddl?: string;
  csvSourcePath?: string | null;
  managerCostInputs?: unknown;
  customProfile?: unknown;
  customTelemetryInput?: unknown;
  cardinalityOverrides?: unknown;
  forceEmbedOverrides?: unknown;
  uiRole?: string;
};

export function readTenantWorkspace(rootDir: string, tenantId: string): TenantWorkspaceDocument | null {
  const path = tenantWorkspacePath(rootDir, tenantId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as TenantWorkspaceDocument;
}

export function writeTenantWorkspace(
  rootDir: string,
  tenantId: string,
  patch: Partial<Omit<TenantWorkspaceDocument, 'version' | 'updatedAt'>>,
): TenantWorkspaceDocument {
  ensureTenantDirs(rootDir, tenantId);
  const existing = readTenantWorkspace(rootDir, tenantId);
  const next: TenantWorkspaceDocument = {
    version: 1,
    updatedAt: new Date().toISOString(),
    ...existing,
    ...patch,
  };
  writeFileSync(tenantWorkspacePath(rootDir, tenantId), JSON.stringify(next, null, 2));
  return next;
}

/** Timestamped CSV batch directory inside the tenant upload tree. */
export function tenantCsvBatchDir(rootDir: string, tenantId: string, label: string): string {
  const dir = join(tenantUploadRoot(rootDir, tenantId), 'csv', `${label}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** SQLite upload directory for one tenant. */
export function tenantSqliteUploadDir(rootDir: string, tenantId: string): string {
  const dir = join(tenantUploadRoot(rootDir, tenantId), 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}
