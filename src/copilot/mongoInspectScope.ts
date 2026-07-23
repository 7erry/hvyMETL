/**
 * Tenant-scoped MongoDB inspect helpers for Agent Copilot.
 * Maps logical database names (shown to users/LLM) to physical Atlas names.
 */

import type { Request } from 'express';
import { isAuthConfigured, readBearerToken, resolveAuthDisplayName } from '../server/auth.js';
import {
  DEFAULT_LOGICAL_TARGET_DB,
  TENANT_DB_SEPARATOR,
  legacyTenantImportDatabaseName,
  parseLogicalTargetDb,
  resolvePhysicalTargetDb,
  tenantDbPrefixCandidates,
  tenantDbPrefixFromRequest,
  tenantIdFromPayload,
  toLogicalTargetDb,
} from '../server/tenant.js';

type RequestWithAuth = Request & {
  auth?: {
    payload?: Record<string, unknown>;
  };
};

/** Resolved tenant namespace for MongoDB inspect tools. */
export type TenantMongoInspectScope = {
  authEnabled: boolean;
  tenantId: string | null;
  /** Primary prefix used for new imports (display name when available). */
  primaryPrefix: string;
  /** All prefixes that may own databases for this Auth0 user. */
  prefixCandidates: string[];
  defaultLogicalDatabase: string;
  resolvePhysicalDatabase: (logicalInput?: string) => string;
  resolveLogicalDatabase: (logicalInput?: string) => string;
  resolvePhysicalDatabaseCandidates: (logicalInput?: string) => string[];
  ownsPhysicalDatabase: (physicalDatabase: string) => boolean;
  toLogicalDatabase: (physicalDatabase: string) => string;
  findPhysicalDatabaseForLogical: (logicalInput: string | undefined, clusterDatabaseNames: string[]) => string | null;
};

/** Build inspect scope for the authenticated request (or local-dev when auth is off). */
export async function resolveTenantMongoInspectScope(req: RequestWithAuth): Promise<TenantMongoInspectScope> {
  if (!isAuthConfigured()) {
    return buildScope({
      authEnabled: false,
      tenantId: null,
      primaryPrefix: 'local-dev',
      prefixCandidates: ['local-dev'],
    });
  }

  const payload = req.auth?.payload;
  const displayName = await resolveAuthDisplayName(payload, readBearerToken(req));
  const tenantId = tenantIdFromPayload(payload);
  const prefixCandidates = tenantDbPrefixCandidates(payload, displayName);
  const primaryPrefix = (await tenantDbPrefixFromRequest(req)) || prefixCandidates[0] || 'local-dev';

  return buildScope({
    authEnabled: true,
    tenantId,
    primaryPrefix,
    prefixCandidates: prefixCandidates.length ? prefixCandidates : [primaryPrefix],
  });
}

function buildScope(input: {
  authEnabled: boolean;
  tenantId: string | null;
  primaryPrefix: string;
  prefixCandidates: string[];
}): TenantMongoInspectScope {
  const { authEnabled, tenantId, primaryPrefix, prefixCandidates } = input;

  return {
    authEnabled,
    tenantId,
    primaryPrefix,
    prefixCandidates,
    defaultLogicalDatabase: DEFAULT_LOGICAL_TARGET_DB,
    resolvePhysicalDatabase(logicalInput) {
      const logical = parseLogicalTargetDb(logicalInput, primaryPrefix);
      if (!authEnabled) return logical;
      return resolvePhysicalTargetDb(primaryPrefix, logical);
    },
    resolveLogicalDatabase(logicalInput) {
      return parseLogicalTargetDb(logicalInput, primaryPrefix);
    },
    resolvePhysicalDatabaseCandidates(logicalInput) {
      const logical = parseLogicalTargetDb(logicalInput, primaryPrefix);
      if (!authEnabled) return [logical];
      const names = prefixCandidates.map((prefix) => resolvePhysicalTargetDb(prefix, logical));
      if (tenantId) {
        names.push(legacyTenantImportDatabaseName(tenantId));
      }
      return [...new Set(names)];
    },
    ownsPhysicalDatabase(physicalDatabase) {
      if (!authEnabled) return true;
      if (tenantId && physicalDatabase === legacyTenantImportDatabaseName(tenantId)) {
        return true;
      }
      return prefixCandidates.some((prefix) =>
        physicalDatabase.startsWith(`${prefix}${TENANT_DB_SEPARATOR}`),
      );
    },
    toLogicalDatabase(physicalDatabase) {
      if (tenantId && physicalDatabase === legacyTenantImportDatabaseName(tenantId)) {
        return DEFAULT_LOGICAL_TARGET_DB;
      }
      return toLogicalTargetDb(physicalDatabase);
    },
    findPhysicalDatabaseForLogical(logicalInput, clusterDatabaseNames) {
      const logical = parseLogicalTargetDb(logicalInput, primaryPrefix);
      for (const physical of clusterDatabaseNames) {
        if (!this.ownsPhysicalDatabase(physical)) continue;
        if (this.toLogicalDatabase(physical) === logical) {
          return physical;
        }
      }
      return null;
    },
  };
}

/** Filter Atlas database listings and strip tenant prefixes for the copilot. */
export function sanitizeDatabaseListForClient(
  scope: TenantMongoInspectScope,
  databases: Array<{ name: string; size?: number }>,
): Array<{ name: string; size?: number }> {
  const owned = scope.authEnabled
    ? databases.filter((entry) => scope.ownsPhysicalDatabase(entry.name))
    : databases;

  const byLogical = new Map<string, { name: string; size?: number }>();
  for (const entry of owned) {
    const logical = scope.toLogicalDatabase(entry.name);
    const existing = byLogical.get(logical);
    if (!existing || (entry.size ?? 0) > (existing.size ?? 0)) {
      byLogical.set(logical, { name: logical, size: entry.size });
    }
  }
  return [...byLogical.values()];
}

/** Reject inspect requests targeting another tenant's physical database name. */
export function assertDatabaseAccess(scope: TenantMongoInspectScope, physicalDatabase: string): void {
  if (!scope.authEnabled) return;
  if (!scope.ownsPhysicalDatabase(physicalDatabase)) {
    throw new Error('Access denied: database is outside your workspace.');
  }
}

/** Merge sanitized MCP database listings with logical names inferred from owned physical names. */
export function mergeDiscoveredLogicalDatabases(
  scope: TenantMongoInspectScope,
  clusterDatabaseNames: string[],
  sanitized: Array<{ name: string; size?: number }>,
): Array<{ name: string; size?: number }> {
  const byLogical = new Map(sanitized.map((entry) => [entry.name, entry]));

  for (const physical of clusterDatabaseNames) {
    if (!scope.ownsPhysicalDatabase(physical)) continue;
    const logical = scope.toLogicalDatabase(physical);
    if (!byLogical.has(logical)) {
      byLogical.set(logical, { name: logical });
    }
  }

  return [...byLogical.values()];
}
