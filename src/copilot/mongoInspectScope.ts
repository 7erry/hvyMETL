/**
 * Tenant-scoped MongoDB inspect helpers for Agent Copilot.
 * Maps logical database names (shown to users/LLM) to physical Atlas names.
 */

import type { Request } from 'express';
import { isAuthConfigured, readBearerToken, resolveAuthDisplayName } from '../server/auth.js';
import {
  DEFAULT_LOGICAL_TARGET_DB,
  TENANT_DB_SEPARATOR,
  authIdentitySlugCandidates,
  legacyTenantImportDatabaseName,
  parseLogicalTargetDb,
  readClientDbPrefix,
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
export async function resolveTenantMongoInspectScope(
  req: RequestWithAuth,
  options?: { clusterDatabaseNames?: string[] },
): Promise<TenantMongoInspectScope> {
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
  const clientPrefix = readClientDbPrefix(req);
  const extraPrefixes = clientPrefix ? [clientPrefix] : [];
  const tenantId = tenantIdFromPayload(payload);
  const identitySlugs = authIdentitySlugCandidates(payload, displayName, extraPrefixes);
  const prefixCandidates = tenantDbPrefixCandidates(payload, displayName, extraPrefixes);
  const primaryPrefix = (await tenantDbPrefixFromRequest(req)) || prefixCandidates[0] || 'local-dev';

  let scope = buildScope({
    authEnabled: true,
    tenantId,
    primaryPrefix,
    prefixCandidates: prefixCandidates.length ? prefixCandidates : [primaryPrefix],
  });

  if (options?.clusterDatabaseNames?.length) {
    scope = augmentTenantMongoInspectScope(scope, options.clusterDatabaseNames, identitySlugs);
  }

  return scope;
}

/** Add cluster prefixes that match the signed-in user's identity slugs. */
export function discoverPrefixCandidatesFromCluster(
  clusterDatabaseNames: string[],
  identitySlugs: string[],
): string[] {
  const discovered = new Set(identitySlugs);
  for (const physical of clusterDatabaseNames) {
    const separatorIndex = physical.indexOf(TENANT_DB_SEPARATOR);
    if (separatorIndex <= 0) continue;
    const prefix = physical.slice(0, separatorIndex);
    if (identitySlugs.includes(prefix)) {
      discovered.add(prefix);
    }
  }
  return [...discovered];
}

/** Expand inspect scope when Atlas already contains prefixed databases for this user. */
export function augmentTenantMongoInspectScope(
  scope: TenantMongoInspectScope,
  clusterDatabaseNames: string[],
  identitySlugs: string[],
): TenantMongoInspectScope {
  const merged = [
    ...new Set([...scope.prefixCandidates, ...discoverPrefixCandidatesFromCluster(clusterDatabaseNames, identitySlugs)]),
  ];
  return augmentScopeWithPrefixes(scope, merged);
}

/** Add explicit prefix segments discovered from owned or inferred Atlas database names. */
export function augmentScopeWithPrefixes(
  scope: TenantMongoInspectScope,
  prefixCandidates: string[],
): TenantMongoInspectScope {
  const merged = [...new Set([...scope.prefixCandidates, ...prefixCandidates])];
  if (merged.length === scope.prefixCandidates.length) return scope;
  return buildScope({
    authEnabled: scope.authEnabled,
    tenantId: scope.tenantId,
    primaryPrefix: scope.primaryPrefix,
    prefixCandidates: merged,
  });
}

/** Extract `{prefix}` segments from physical `{prefix}__{logical}` database names. */
export function prefixesFromPhysicalDatabaseNames(physicalDatabaseNames: string[]): string[] {
  const prefixes = new Set<string>();
  for (const physical of physicalDatabaseNames) {
    const separatorIndex = physical.indexOf(TENANT_DB_SEPARATOR);
    if (separatorIndex <= 0) continue;
    prefixes.add(physical.slice(0, separatorIndex));
  }
  return [...prefixes];
}

/**
 * Resolve physical Atlas databases for a tenant, including uniquely matched `{prefix}__{logical}`
 * names when the JWT lacks the import prefix (e.g. data in terry_walters__mytrains but token only has u_{hash}).
 */
export function discoverTenantPhysicalDatabases(
  scope: TenantMongoInspectScope,
  clusterDatabaseNames: string[],
  knownLogicalDatabases: string[] = [],
): string[] {
  const physical = new Set<string>();

  for (const name of clusterDatabaseNames) {
    if (scope.ownsPhysicalDatabase(name)) physical.add(name);
  }

  const logicalsToProbe = new Set<string>(knownLogicalDatabases);
  for (const name of clusterDatabaseNames) {
    if (scope.ownsPhysicalDatabase(name)) {
      logicalsToProbe.add(scope.toLogicalDatabase(name));
    }
  }

  for (const logical of logicalsToProbe) {
    const suffix = `${TENANT_DB_SEPARATOR}${logical}`;
    const matches = clusterDatabaseNames.filter((name) => name === logical || name.endsWith(suffix));
    if (matches.length !== 1) continue;

    const physicalName = matches[0]!;
    const separatorIndex = physicalName.indexOf(TENANT_DB_SEPARATOR);
    const prefix = separatorIndex > 0 ? physicalName.slice(0, separatorIndex) : '';
    const allowed =
      knownLogicalDatabases.includes(logical) ||
      scope.ownsPhysicalDatabase(physicalName) ||
      (prefix.length > 0 && scope.prefixCandidates.includes(prefix));
    if (allowed) physical.add(physicalName);
  }

  return [...physical];
}

/** Build logical database listings (with optional size) from discovered physical database names. */
export function listLogicalDatabasesFromPhysical(
  scope: TenantMongoInspectScope,
  physicalDatabaseNames: string[],
  sizesByPhysicalName: Map<string, number | undefined> = new Map(),
): Array<{ name: string; size?: number }> {
  const byLogical = new Map<string, { name: string; size?: number }>();

  for (const physical of physicalDatabaseNames) {
    const logical = scope.toLogicalDatabase(physical);
    const size = sizesByPhysicalName.get(physical);
    const existing = byLogical.get(logical);
    if (!existing || (size ?? 0) > (existing.size ?? 0)) {
      byLogical.set(logical, { name: logical, size });
    }
  }

  return [...byLogical.values()].sort((left, right) => (right.size ?? 0) - (left.size ?? 0));
}

/** Resolve inspect scope using cluster contents and known import logical names. */
export function resolveInspectScopeForCluster(
  scope: TenantMongoInspectScope,
  clusterDatabaseNames: string[],
  knownLogicalDatabases: string[] = [],
): { scope: TenantMongoInspectScope; physicalDatabaseNames: string[] } {
  let nextScope = scope;
  let physicalDatabaseNames = discoverTenantPhysicalDatabases(nextScope, clusterDatabaseNames, knownLogicalDatabases);
  const discoveredPrefixes = prefixesFromPhysicalDatabaseNames(physicalDatabaseNames);
  nextScope = augmentScopeWithPrefixes(nextScope, discoveredPrefixes);
  physicalDatabaseNames = discoverTenantPhysicalDatabases(nextScope, clusterDatabaseNames, knownLogicalDatabases);
  return { scope: nextScope, physicalDatabaseNames };
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
