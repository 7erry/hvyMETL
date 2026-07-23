/**
 * Executes read-only MongoDB inspect tools for Agent Copilot via the MCP server.
 */

import type { Request } from 'express';
import { getMigrationStore } from '../ml_engine/migrationStore.js';
import { toLogicalTargetDb } from '../server/tenant.js';
import {
  MCP_INSPECT_UNAVAILABLE_MESSAGE,
  callMongoMcpTool,
  isMongoMcpEnabled,
} from './mongoMcpClient.js';
import {
  assertDatabaseAccess,
  discoverTenantPhysicalDatabases,
  listLogicalDatabasesFromPhysical,
  resolveInspectScopeForCluster,
  resolveTenantMongoInspectScope,
  sanitizeDatabaseListForClient,
  type TenantMongoInspectScope,
} from './mongoInspectScope.js';
import { enrichCollectionSummaries } from './mongoInspectEnrichment.js';
import {
  MONGO_INSPECT_MCP_TOOL_MAP,
  isMongoInspectToolName,
  type MongoInspectToolName,
} from './mongoInspectToolSchemas.js';

const MCP_CONNECTION_ID = 'preconfigured';
const MAX_FIND_LIMIT = 25;
const MAX_SCHEMA_SAMPLE = 100;

export type MongoInspectInvokeResult = {
  ok: boolean;
  tool: MongoInspectToolName;
  summary: string;
  data?: unknown;
  error?: string;
  serviceUnavailable?: boolean;
};

type ListDatabasesPayload = {
  databases?: Array<{ name: string; size?: number }>;
  totalCount?: number;
};

function normalizeListDatabasesPayload(raw: unknown): ListDatabasesPayload {
  if (Array.isArray(raw)) {
    const databases = raw
      .filter((entry): entry is { name: string; size?: number } => {
        return Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string');
      })
      .map((entry) => ({ name: entry.name, size: entry.size }));
    return { databases, totalCount: databases.length };
  }

  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.databases)) return {};
  const databases = record.databases
    .filter((entry): entry is { name: string; size?: number } => {
      return Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string');
    })
    .map((entry) => ({ name: entry.name, size: entry.size }));
  return {
    databases,
    totalCount: typeof record.totalCount === 'number' ? record.totalCount : databases.length,
  };
}

type ListCollectionsPayload = {
  collections?: Array<{ name: string }>;
  totalCount?: number;
};

function normalizeListCollectionsPayload(raw: unknown): ListCollectionsPayload {
  if (Array.isArray(raw)) {
    const collections = raw
      .filter((entry): entry is { name: string } => {
        return Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string');
      })
      .map((entry) => ({ name: entry.name }));
    return { collections, totalCount: collections.length };
  }

  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.collections)) {
    const collections = record.collections
      .filter((entry): entry is { name: string } => {
        return Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string');
      })
      .map((entry) => ({ name: entry.name }));
    return {
      collections,
      totalCount: typeof record.totalCount === 'number' ? record.totalCount : collections.length,
    };
  }

  return {};
}

type BuildMcpArgumentsResult = {
  mcpArgs: Record<string, unknown>;
  logicalDatabase: string;
  physicalDatabase?: string;
};

async function loadTenantLogicalTargetDatabases(tenantId: string | null): Promise<string[]> {
  if (!tenantId) return [];
  try {
    const store = getMigrationStore();
    const executions = await store.listPipelineExecutions(100, tenantId);
    return [...new Set(executions.map((execution) => toLogicalTargetDb(execution.targetDb)))];
  } catch {
    return [];
  }
}

function buildDatabaseSizeMap(databases: Array<{ name: string; size?: number }>): Map<string, number | undefined> {
  return new Map(databases.map((entry) => [entry.name, entry.size]));
}

function listAccessibleLogicalDatabases(
  scope: TenantMongoInspectScope,
  clusterNames: string[],
  knownLogicalDatabases: string[],
  sizesByPhysicalName: Map<string, number | undefined> = new Map(),
): Array<{ name: string; size?: number }> {
  const resolved = resolveInspectScopeForCluster(scope, clusterNames, knownLogicalDatabases);
  const physicalDatabaseNames = discoverTenantPhysicalDatabases(
    resolved.scope,
    clusterNames,
    knownLogicalDatabases,
  );
  return listLogicalDatabasesFromPhysical(resolved.scope, physicalDatabaseNames, sizesByPhysicalName);
}

function resolveInspectLogicalDatabase(
  scope: TenantMongoInspectScope,
  args: Record<string, unknown>,
  clusterNames: string[],
  knownLogicalDatabases: string[],
  sizesByPhysicalName: Map<string, number | undefined> = new Map(),
): string {
  if (typeof args.database === 'string' && args.database.trim()) {
    return scope.resolveLogicalDatabase(args.database.trim());
  }

  const discovered = listAccessibleLogicalDatabases(scope, clusterNames, knownLogicalDatabases, sizesByPhysicalName);

  if (discovered.length === 1) {
    return discovered[0]!.name;
  }

  if (discovered.length > 1) {
    const nonDefault = discovered.find((entry) => entry.name !== scope.defaultLogicalDatabase);
    return nonDefault?.name ?? discovered[0]!.name;
  }

  for (const logical of knownLogicalDatabases) {
    if (scope.findPhysicalDatabaseForLogical(logical, clusterNames)) {
      return logical;
    }
  }

  return scope.defaultLogicalDatabase;
}

/** Build MCP arguments and sanitize the response for one inspect tool. */
export async function invokeMongoInspectTool(
  req: Request,
  tool: MongoInspectToolName,
  args: Record<string, unknown>,
): Promise<MongoInspectInvokeResult> {
  if (!isMongoMcpEnabled()) {
    return unavailableResult(tool);
  }

  if (!isMongoInspectToolName(tool)) {
    return {
      ok: false,
      tool,
      summary: `Unknown inspect tool "${tool}".`,
      error: `Unknown inspect tool "${tool}".`,
    };
  }

  let scope: TenantMongoInspectScope;
  let clusterNames: string[] = [];
  let knownLogicalDatabases: string[] = [];
  let databaseSizes = new Map<string, number | undefined>();
  try {
    clusterNames = await fetchClusterDatabaseNames();
    scope = await resolveTenantMongoInspectScope(req, { clusterDatabaseNames: clusterNames });
    knownLogicalDatabases = await loadTenantLogicalTargetDatabases(scope.tenantId);
    const resolved = resolveInspectScopeForCluster(scope, clusterNames, knownLogicalDatabases);
    scope = resolved.scope;
    databaseSizes = buildDatabaseSizeMap(clusterNames.map((name) => ({ name })));
  } catch (error) {
    return {
      ok: false,
      tool,
      summary: String(error),
      error: String(error),
    };
  }

  try {
    const { mcpArgs, logicalDatabase, physicalDatabase } = await buildMcpArguments(
      scope,
      tool,
      args,
      clusterNames,
      knownLogicalDatabases,
      databaseSizes,
    );
    const mcpName = MONGO_INSPECT_MCP_TOOL_MAP[tool];
    const raw = await callMongoMcpTool(mcpName, mcpArgs);
    if (tool === 'listMongoDatabases') {
      const payload = normalizeListDatabasesPayload(raw);
      for (const entry of payload.databases ?? []) {
        databaseSizes.set(entry.name, entry.size);
      }
    }
    let data = sanitizeInspectPayload(
      scope,
      tool,
      logicalDatabase,
      args,
      raw,
      clusterNames,
      knownLogicalDatabases,
      databaseSizes,
    );
    if (tool === 'listMongoCollections' && physicalDatabase) {
      const payload = data as { database: string; collections: Array<{ name: string }>; totalCount: number };
      const collections = await enrichCollectionSummaries(physicalDatabase, payload.collections ?? []);
      data = {
        database: payload.database,
        collections,
        totalCount: collections.length,
      };
    }
    return {
      ok: true,
      tool,
      summary: summarizeInspectResult(tool, data),
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const serviceUnavailable = isServiceUnavailableError(message);
    return {
      ok: false,
      tool,
      summary: serviceUnavailable ? MCP_INSPECT_UNAVAILABLE_MESSAGE : message,
      error: message,
      serviceUnavailable,
    };
  }
}

function unavailableResult(tool: MongoInspectToolName): MongoInspectInvokeResult {
  return {
    ok: false,
    tool,
    summary: MCP_INSPECT_UNAVAILABLE_MESSAGE,
    error: MCP_INSPECT_UNAVAILABLE_MESSAGE,
    serviceUnavailable: true,
  };
}

function isServiceUnavailableError(message: string): boolean {
  return (
    /not currently available|ECONNREFUSED|fetch failed|timed out|ENOTFOUND|503|502|504/i.test(message) ||
    message === MCP_INSPECT_UNAVAILABLE_MESSAGE
  );
}

async function buildMcpArguments(
  scope: TenantMongoInspectScope,
  tool: MongoInspectToolName,
  args: Record<string, unknown>,
  clusterNames: string[],
  knownLogicalDatabases: string[],
  databaseSizes: Map<string, number | undefined>,
): Promise<BuildMcpArgumentsResult> {
  const connectionId = MCP_CONNECTION_ID;

  if (tool === 'listMongoDatabases') {
    return { mcpArgs: { connectionId }, logicalDatabase: scope.defaultLogicalDatabase };
  }

  const logicalDatabase = resolveInspectLogicalDatabase(
    scope,
    args,
    clusterNames,
    knownLogicalDatabases,
    databaseSizes,
  );
  const physicalDatabase = await resolveAccessiblePhysicalDatabase(
    scope,
    logicalDatabase,
    clusterNames,
    knownLogicalDatabases,
    databaseSizes,
  );
  assertDatabaseAccess(scope, physicalDatabase);

  if (tool === 'listMongoCollections') {
    return {
      mcpArgs: { connectionId, database: physicalDatabase },
      logicalDatabase,
      physicalDatabase,
    };
  }

  const collection = String(args.collection ?? '').trim();
  if (!collection) {
    throw new Error('Collection name is required.');
  }

  if (tool === 'describeMongoCollectionSchema') {
    const sampleSize = clampNumber(args.sampleSize, 50, 1, MAX_SCHEMA_SAMPLE);
    return {
      mcpArgs: {
        connectionId,
        database: physicalDatabase,
        collection,
        sampleSize,
        responseBytesLimit: 512_000,
      },
      logicalDatabase,
      physicalDatabase,
    };
  }

  if (tool === 'listMongoCollectionIndexes') {
    return {
      mcpArgs: { connectionId, database: physicalDatabase, collection },
      logicalDatabase,
      physicalDatabase,
    };
  }

  const limit = clampNumber(args.limit, 10, 1, MAX_FIND_LIMIT);
  const mcpArgs: Record<string, unknown> = {
    connectionId,
    database: physicalDatabase,
    collection,
    limit,
    responseBytesLimit: 512_000,
  };
  if (args.filter && typeof args.filter === 'object') mcpArgs.filter = args.filter;
  if (args.projection && typeof args.projection === 'object') mcpArgs.projection = args.projection;
  if (args.sort && typeof args.sort === 'object') mcpArgs.sort = args.sort;
  return { mcpArgs, logicalDatabase, physicalDatabase };
}

function sanitizeInspectPayload(
  scope: TenantMongoInspectScope,
  tool: MongoInspectToolName,
  logicalDatabase: string,
  args: Record<string, unknown>,
  raw: unknown,
  clusterNames: string[],
  knownLogicalDatabases: string[],
  databaseSizes: Map<string, number | undefined>,
): unknown {
  if (tool === 'listMongoDatabases') {
    const payload = normalizeListDatabasesPayload(raw);
    const clusterNamesFromPayload = (payload.databases ?? []).map((entry) => entry.name);
    const mergedClusterNames = [...new Set([...clusterNames, ...clusterNamesFromPayload])];
    const sizesByPhysicalName = buildDatabaseSizeMap(payload.databases ?? []);
    for (const [name, size] of databaseSizes.entries()) {
      if (!sizesByPhysicalName.has(name)) sizesByPhysicalName.set(name, size);
    }
    const databases = listAccessibleLogicalDatabases(
      scope,
      mergedClusterNames,
      knownLogicalDatabases,
      sizesByPhysicalName,
    );
    return {
      databases,
      totalCount: databases.length,
    };
  }

  if (tool === 'listMongoCollections') {
    const payload = normalizeListCollectionsPayload(raw);
    return {
      database: logicalDatabase,
      collections: payload.collections ?? [],
      totalCount: payload.totalCount ?? payload.collections?.length ?? 0,
    };
  }

  return {
    database: logicalDatabase,
    collection: typeof args.collection === 'string' ? args.collection : '',
    result: raw,
  };
}

function summarizeInspectResult(tool: MongoInspectToolName, data: unknown): string {
  if (!data || typeof data !== 'object') return `${tool} completed.`;
  const record = data as Record<string, unknown>;

  if (tool === 'listMongoDatabases') {
    const count = typeof record.totalCount === 'number' ? record.totalCount : 0;
    const databases = Array.isArray(record.databases)
      ? record.databases.filter(
          (entry): entry is { name: string } =>
            Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string'),
        )
      : [];
    const names = databases.map((entry) => entry.name);
    if (count === 1 && names[0]) return `Found 1 database: ${names[0]}.`;
    if (names.length > 0) return `Found ${count} databases: ${names.join(', ')}.`;
    return count === 1 ? 'Found 1 database.' : `Found ${count} databases.`;
  }
  if (tool === 'listMongoCollections') {
    const count = typeof record.totalCount === 'number' ? record.totalCount : 0;
    const db = typeof record.database === 'string' ? record.database : 'database';
    return `Listed ${count} collection(s) in ${db}.`;
  }
  if (tool === 'describeMongoCollectionSchema') {
    return `Inferred schema for ${record.collection} in ${record.database}.`;
  }
  if (tool === 'listMongoCollectionIndexes') {
    return `Listed indexes for ${record.collection} in ${record.database}.`;
  }
  if (tool === 'findMongoDocuments') {
    const result = record.result as { queryResultsCount?: number } | undefined;
    const count = result?.queryResultsCount ?? 0;
    return `Returned ${count} document(s) from ${record.collection} in ${record.database}.`;
  }
  return `${tool} completed.`;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

async function fetchClusterDatabaseNames(): Promise<string[]> {
  const raw = await callMongoMcpTool('list-databases', { connectionId: MCP_CONNECTION_ID });
  const payload = normalizeListDatabasesPayload(raw);
  return (payload.databases ?? []).map((entry) => entry.name);
}

/** Pick the physical database that exists on the cluster for a logical import name. */
async function resolveAccessiblePhysicalDatabase(
  scope: TenantMongoInspectScope,
  logicalDatabase: string,
  clusterNames: string[],
  knownLogicalDatabases: string[] = [],
  databaseSizes: Map<string, number | undefined> = new Map(),
): Promise<string> {
  const resolved = resolveInspectScopeForCluster(scope, clusterNames, knownLogicalDatabases);
  const tenantPhysical = discoverTenantPhysicalDatabases(
    resolved.scope,
    clusterNames,
    knownLogicalDatabases,
  );
  const matches = tenantPhysical.filter(
    (physical) => resolved.scope.toLogicalDatabase(physical) === logicalDatabase,
  );

  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length > 1) {
    return (
      [...matches].sort(
        (left, right) => (databaseSizes.get(right) ?? 0) - (databaseSizes.get(left) ?? 0),
      )[0] ?? matches[0]!
    );
  }

  const discovered = resolved.scope.findPhysicalDatabaseForLogical(logicalDatabase, clusterNames);
  if (discovered) return discovered;

  for (const candidate of resolved.scope.resolvePhysicalDatabaseCandidates(logicalDatabase)) {
    if (clusterNames.includes(candidate)) {
      return candidate;
    }
  }

  return resolved.scope.resolvePhysicalDatabase(logicalDatabase);
}
