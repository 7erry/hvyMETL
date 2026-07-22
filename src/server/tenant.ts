import { createHash } from 'node:crypto';
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

/** Default logical import database name shown in the UI. */
export const DEFAULT_LOGICAL_TARGET_DB = 'csv_to_atlas';

/** Separator between user prefix and logical database name in Atlas. */
export const TENANT_DB_SEPARATOR = '__';

/**
 * Max Atlas database name length (shared-tier clusters enforce 38 bytes).
 * Override with HVYMETL_ATLAS_DB_NAME_MAX_LENGTH when your tier allows longer names.
 */
export function atlasDbNameMaxLength(): number {
  const configured = Number(process.env.HVYMETL_ATLAS_DB_NAME_MAX_LENGTH ?? 38);
  if (!Number.isFinite(configured) || configured < 1) return 38;
  return Math.min(Math.floor(configured), 63);
}

/** Max length of the user prefix segment before the separator. */
const TENANT_DB_PREFIX_MAX_LENGTH = 24;

export type ResolvedTargetDb = {
  /** Name the user sees and enters (e.g. csv_to_atlas). */
  logical: string;
  /** Physical Atlas database name (e.g. terry_walters__csv_to_atlas). */
  physical: string;
};

/** Default logical import database name for a hosted tenant. */
export function tenantDefaultTargetDb(_tenantId?: string): string {
  return DEFAULT_LOGICAL_TARGET_DB;
}

/** Normalize a user-supplied logical database name. */
export function sanitizeLogicalTargetDb(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Database name is required.');
  }
  if (!/^[a-z0-9_]+$/.test(trimmed)) {
    throw new Error('Database name may only contain letters, numbers, and underscores.');
  }
  return trimmed;
}

/** Derive a short stable prefix from Auth0 `sub` when profile name fields are absent. */
export function tenantDbPrefixFromSub(sub: string): string {
  const trimmed = sub.trim();
  if (!trimmed) return LOCAL_DEV_TENANT_ID;
  const digest = createHash('sha256').update(trimmed).digest('hex').slice(0, 8);
  return `u_${digest}`;
}

/** Derive a stable MongoDB namespace prefix from the Auth0 profile (e.g. Terry Walters → terry_walters). */
export function tenantDbPrefixFromPayload(payload: Record<string, unknown> | undefined): string {
  const fromName = typeof payload?.name === 'string' ? payload.name : '';
  const fromNickname = typeof payload?.nickname === 'string' ? payload.nickname : '';
  const fromEmail =
    typeof payload?.email === 'string' && payload.email.includes('@')
      ? payload.email.split('@')[0] ?? ''
      : '';
  const raw = fromName.trim() || fromNickname.trim() || fromEmail.trim();
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (slug) {
    return slug.slice(0, TENANT_DB_PREFIX_MAX_LENGTH);
  }
  const sub = typeof payload?.sub === 'string' ? payload.sub : '';
  return sub ? tenantDbPrefixFromSub(sub) : LOCAL_DEV_TENANT_ID;
}

/** Parse user input into a logical database name (strip own prefix if pasted accidentally). */
export function parseLogicalTargetDb(input: string | undefined, userPrefix: string): string {
  if (!input?.trim()) {
    return DEFAULT_LOGICAL_TARGET_DB;
  }
  const trimmed = input.trim();
  const ownPrefix = `${userPrefix}${TENANT_DB_SEPARATOR}`;
  let candidate = trimmed;
  if (candidate.toLowerCase().startsWith(ownPrefix)) {
    candidate = candidate.slice(ownPrefix.length);
  } else if (candidate.includes(TENANT_DB_SEPARATOR)) {
    throw new Error('Invalid database name.');
  }
  return sanitizeLogicalTargetDb(candidate || DEFAULT_LOGICAL_TARGET_DB);
}

/** Build the physical Atlas database name for an authenticated tenant. */
export function resolvePhysicalTargetDb(userPrefix: string, logicalDb: string): string {
  const logical = sanitizeLogicalTargetDb(logicalDb);
  const maxTotal = atlasDbNameMaxLength();
  const separatorLength = TENANT_DB_SEPARATOR.length;
  const maxPrefixLength = Math.max(
    1,
    Math.min(TENANT_DB_PREFIX_MAX_LENGTH, maxTotal - separatorLength - logical.length),
  );
  let prefix = userPrefix.slice(0, maxPrefixLength);
  let effectiveLogical = logical;
  let physical = `${prefix}${TENANT_DB_SEPARATOR}${effectiveLogical}`;
  if (physical.length > maxTotal) {
    const maxLogicalLength = Math.max(1, maxTotal - prefix.length - separatorLength);
    effectiveLogical = logical.slice(0, maxLogicalLength);
    physical = `${prefix}${TENANT_DB_SEPARATOR}${effectiveLogical}`;
  }
  return physical.slice(0, maxTotal);
}

/** Strip a tenant prefix for API responses and UI display. */
export function toLogicalTargetDb(physicalOrLogical: string, _userPrefix?: string): string {
  const separatorIndex = physicalOrLogical.indexOf(TENANT_DB_SEPARATOR);
  if (separatorIndex > 0) {
    return physicalOrLogical.slice(separatorIndex + TENANT_DB_SEPARATOR.length) || DEFAULT_LOGICAL_TARGET_DB;
  }
  return physicalOrLogical;
}

/** Map user input to logical + physical target database names for one request. */
export function resolveTargetDbForRequest(req: RequestWithAuth, logicalInput?: string): ResolvedTargetDb {
  if (!isAuthConfigured()) {
    const logical = parseLogicalTargetDb(logicalInput, LOCAL_DEV_TENANT_ID);
    return { logical, physical: logical };
  }
  const prefix = tenantDbPrefixFromPayload(req.auth?.payload);
  const logical = parseLogicalTargetDb(logicalInput, prefix);
  const physical = resolvePhysicalTargetDb(prefix, logical);
  return { logical, physical };
}

/** Return a pipeline execution record with a logical targetDb for the client. */
export function sanitizeExecutionTargetDbForClient<T extends { targetDb: string }>(
  execution: T,
  req: RequestWithAuth,
): T {
  if (!isAuthConfigured()) {
    return execution;
  }
  const prefix = tenantDbPrefixFromPayload(req.auth?.payload);
  return { ...execution, targetDb: toLogicalTargetDb(execution.targetDb, prefix) };
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

const PIPELINE_RUN_ID_PATTERN = /^run-\d+$/;

/** Timestamped pipeline output directory for one run (under ui-pipeline/). */
export function tenantPipelineRunDir(
  rootDir: string,
  tenantId: string,
): { runId: string; dir: string } {
  const runId = `run-${Date.now()}`;
  const dir = join(tenantOutRoot(rootDir, tenantId), 'ui-pipeline', runId);
  mkdirSync(dir, { recursive: true });
  return { runId, dir };
}

/** Resolve a prior pipeline run directory after validating the run id. */
export function resolveTenantPipelineRunDir(rootDir: string, tenantId: string, runId: string): string {
  const normalized = runId.trim();
  if (!PIPELINE_RUN_ID_PATTERN.test(normalized)) {
    throw new Error('Invalid pipeline run id.');
  }
  const dir = join(tenantOutRoot(rootDir, tenantId), 'ui-pipeline', normalized);
  assertPathWithinRoot(join(tenantOutRoot(rootDir, tenantId), 'ui-pipeline'), dir);
  return dir;
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
