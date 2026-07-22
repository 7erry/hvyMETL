/**
 * Tenant-scoped MongoDB inspect helpers for Agent Copilot.
 * Maps logical database names (shown to users/LLM) to physical Atlas names.
 */

import type { Request } from 'express';
import { isAuthConfigured } from '../server/auth.js';
import {
  DEFAULT_LOGICAL_TARGET_DB,
  TENANT_DB_SEPARATOR,
  parseLogicalTargetDb,
  resolvePhysicalTargetDb,
  tenantDbPrefixFromRequest,
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
  userPrefix: string;
  defaultLogicalDatabase: string;
  resolvePhysicalDatabase: (logicalInput?: string) => string;
  resolveLogicalDatabase: (logicalInput?: string) => string;
  ownsPhysicalDatabase: (physicalDatabase: string) => boolean;
  toLogicalDatabase: (physicalDatabase: string) => string;
};

/** Build inspect scope for the authenticated request (or local-dev when auth is off). */
export async function resolveTenantMongoInspectScope(req: RequestWithAuth): Promise<TenantMongoInspectScope> {
  if (!isAuthConfigured()) {
    return {
      authEnabled: false,
      userPrefix: 'local-dev',
      defaultLogicalDatabase: DEFAULT_LOGICAL_TARGET_DB,
      resolvePhysicalDatabase: (logicalInput) => parseLogicalTargetDb(logicalInput, 'local-dev'),
      resolveLogicalDatabase: (logicalInput) => parseLogicalTargetDb(logicalInput, 'local-dev'),
      ownsPhysicalDatabase: () => true,
      toLogicalDatabase: (physicalDatabase) => toLogicalTargetDb(physicalDatabase),
    };
  }

  const userPrefix = await tenantDbPrefixFromRequest(req);
  return {
    authEnabled: true,
    userPrefix,
    defaultLogicalDatabase: DEFAULT_LOGICAL_TARGET_DB,
    resolvePhysicalDatabase(logicalInput) {
      const logical = parseLogicalTargetDb(logicalInput, userPrefix);
      return resolvePhysicalTargetDb(userPrefix, logical);
    },
    resolveLogicalDatabase(logicalInput) {
      return parseLogicalTargetDb(logicalInput, userPrefix);
    },
    ownsPhysicalDatabase(physicalDatabase) {
      return physicalDatabase.startsWith(`${userPrefix}${TENANT_DB_SEPARATOR}`);
    },
    toLogicalDatabase(physicalDatabase) {
      return toLogicalTargetDb(physicalDatabase);
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
  return owned.map((entry) => ({
    name: scope.toLogicalDatabase(entry.name),
    size: entry.size,
  }));
}

/** Reject inspect requests targeting another tenant's physical database name. */
export function assertDatabaseAccess(scope: TenantMongoInspectScope, physicalDatabase: string): void {
  if (!scope.authEnabled) return;
  if (!scope.ownsPhysicalDatabase(physicalDatabase)) {
    throw new Error('Access denied: database is outside your workspace.');
  }
}
