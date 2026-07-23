/**
 * Executes read-only MongoDB inspect tools for Agent Copilot via the MCP server.
 */

import type { Request } from 'express';
import { getMigrationStore } from '../ml_engine/migrationStore.js';
import { isAuthConfigured } from '../server/auth.js';
import { isHostedStudioRequest } from '../server/hosted.js';
import { toLogicalTargetDb } from '../server/tenant.js';
import {
  ensureMongoInspectMcpConnection,
  releaseMongoInspectMcpConnection,
  resolveMongoInspectMongoUri,
} from './mongoInspectConnection.js';
import {
  MCP_INSPECT_UNAVAILABLE_MESSAGE,
  isMongoMcpEnabled,
  withMongoMcpSession,
  type MongoMcpToolCaller,
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
import { compareCollectionToPlan } from './mongoAnalyzeComparison.js';
import { summarizeExplainPayload } from './mongoAnalyzeExplain.js';
import { normalizeAggregationPipeline } from './mongoAnalyzePipeline.js';
import { findPlanCollection, type MongoPlanContext } from './mongoPlanContext.js';
import { enrichCollectionSummaries } from './mongoInspectEnrichment.js';
import {
  MONGO_INSPECT_MCP_TOOL_MAP,
  isMongoInspectToolName,
  type MongoInspectToolName,
} from './mongoInspectToolSchemas.js';

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

function hasInspectDatabaseArg(args: Record<string, unknown>): boolean {
  return typeof args.database === 'string' && args.database.trim().length > 0;
}

/** Resolve the logical database when a collection name appears in exactly one tenant database. */
async function resolveLogicalDatabaseForCollection(
  scope: TenantMongoInspectScope,
  collectionName: string,
  clusterNames: string[],
  knownLogicalDatabases: string[],
  callTool: MongoMcpToolCaller,
  connectionId: string,
): Promise<string> {
  const resolved = resolveInspectScopeForCluster(scope, clusterNames, knownLogicalDatabases);
  const physicalDatabases = discoverTenantPhysicalDatabases(
    resolved.scope,
    clusterNames,
    knownLogicalDatabases,
  );
  const logicalMatches = new Set<string>();

  for (const physicalDatabase of physicalDatabases) {
    const raw = await callTool('list-collections', { connectionId, database: physicalDatabase });
    const payload = normalizeListCollectionsPayload(raw);
    const hasCollection = (payload.collections ?? []).some((entry) => entry.name === collectionName);
    if (hasCollection) {
      logicalMatches.add(resolved.scope.toLogicalDatabase(physicalDatabase));
    }
  }

  const matches = [...logicalMatches];
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length === 0) {
    throw new Error(
      `Collection "${collectionName}" was not found in any of your databases. Run listMongoDatabases first.`,
    );
  }
  throw new Error(
    `Collection "${collectionName}" exists in multiple databases (${matches.join(', ')}). Specify the database argument.`,
  );
}

async function resolveInspectLogicalDatabaseForTool(
  scope: TenantMongoInspectScope,
  tool: MongoInspectToolName,
  args: Record<string, unknown>,
  clusterNames: string[],
  knownLogicalDatabases: string[],
  databaseSizes: Map<string, number | undefined>,
  callTool: MongoMcpToolCaller,
  connectionId: string,
): Promise<string> {
  if (tool === 'listMongoCollections' || hasInspectDatabaseArg(args)) {
    return resolveInspectLogicalDatabase(scope, args, clusterNames, knownLogicalDatabases, databaseSizes);
  }

  const collection = typeof args.collection === 'string' ? args.collection.trim() : '';
  if (!collection) {
    throw new Error('Collection name is required.');
  }

  return resolveLogicalDatabaseForCollection(
    scope,
    collection,
    clusterNames,
    knownLogicalDatabases,
    callTool,
    connectionId,
  );
}

/** Execute one inspect/analyze tool for Agent Copilot via the MCP server. */
export async function invokeMongoInspectTool(
  req: Request,
  tool: MongoInspectToolName,
  args: Record<string, unknown>,
  options: { planContext?: MongoPlanContext } = {},
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
    scope = await resolveTenantMongoInspectScope(req);
    knownLogicalDatabases = await loadTenantLogicalTargetDatabases(scope.tenantId);
  } catch (error) {
    return {
      ok: false,
      tool,
      summary: String(error),
      error: String(error),
    };
  }

  try {
    const hosted = isHostedStudioRequest(req);
    const authEnabled = isAuthConfigured();
    const mongoUri = resolveMongoInspectMongoUri(req);

    return await withMongoMcpSession(async (callTool) => {
      const mcpConnection = await ensureMongoInspectMcpConnection(callTool, mongoUri, {
        hosted,
        authEnabled,
      });
      const { connectionId } = mcpConnection;

      try {
        clusterNames = await fetchClusterDatabaseNames(callTool, connectionId);
        const resolved = resolveInspectScopeForCluster(scope, clusterNames, knownLogicalDatabases);
        scope = resolved.scope;
        databaseSizes = buildDatabaseSizeMap(clusterNames.map((name) => ({ name })));

        const { mcpArgs, logicalDatabase, physicalDatabase } = await buildMcpArguments(
          scope,
          tool,
          args,
          clusterNames,
          knownLogicalDatabases,
          databaseSizes,
          connectionId,
          callTool,
        );
        if (physicalDatabase) {
          assertPhysicalDatabaseOnCluster(scope, logicalDatabase, physicalDatabase, clusterNames);
        }

        if (tool === 'compareMongoCollectionToPlan') {
          const collection = String(args.collection ?? '').trim();
          const data = await runCompareCollectionToPlan({
            callTool,
            connectionId,
            logicalDatabase,
            physicalDatabase: physicalDatabase!,
            collection,
            planContext: options.planContext,
          });
          return {
            ok: true,
            tool,
            summary: summarizeInspectResult(tool, data),
            data,
          };
        }

        const mcpName = MONGO_INSPECT_MCP_TOOL_MAP[tool];
        const raw = await callTool(mcpName, mcpArgs);
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
          const collections = await enrichCollectionSummaries(
            physicalDatabase,
            payload.collections ?? [],
            callTool,
            connectionId,
          );
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
      } finally {
        await releaseMongoInspectMcpConnection(callTool, mcpConnection);
      }
    });
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
  connectionId: string,
  callTool: MongoMcpToolCaller,
): Promise<BuildMcpArgumentsResult> {
  if (tool === 'listMongoDatabases') {
    return { mcpArgs: { connectionId }, logicalDatabase: scope.defaultLogicalDatabase };
  }

  const logicalDatabase = await resolveInspectLogicalDatabaseForTool(
    scope,
    tool,
    args,
    clusterNames,
    knownLogicalDatabases,
    databaseSizes,
    callTool,
    connectionId,
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

  if (tool === 'aggregateMongoCollection') {
    const pipeline = normalizeAggregationPipeline(args.pipeline);
    return {
      mcpArgs: {
        connectionId,
        database: physicalDatabase,
        collection,
        pipeline,
        responseBytesLimit: 512_000,
      },
      logicalDatabase,
      physicalDatabase,
    };
  }

  if (tool === 'explainMongoOperation') {
    const method = String(args.method ?? 'find').trim();
    const verbosity =
      typeof args.verbosity === 'string' &&
      ['queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution'].includes(args.verbosity)
        ? args.verbosity
        : 'queryPlanner';

    if (method === 'aggregate') {
      const pipeline = normalizeAggregationPipeline(args.pipeline);
      return {
        mcpArgs: {
          connectionId,
          database: physicalDatabase,
          collection,
          method: [{ name: 'aggregate', arguments: { pipeline } }],
          verbosity,
        },
        logicalDatabase,
        physicalDatabase,
      };
    }

    if (method === 'count') {
      const countArgs: Record<string, unknown> = {};
      if (args.filter && typeof args.filter === 'object') countArgs.query = args.filter;
      return {
        mcpArgs: {
          connectionId,
          database: physicalDatabase,
          collection,
          method: [{ name: 'count', arguments: countArgs }],
          verbosity,
        },
        logicalDatabase,
        physicalDatabase,
      };
    }

    const findArgs: Record<string, unknown> = {};
    if (args.filter && typeof args.filter === 'object') findArgs.filter = args.filter;
    if (args.projection && typeof args.projection === 'object') findArgs.projection = args.projection;
    if (args.sort && typeof args.sort === 'object') findArgs.sort = args.sort;
    findArgs.limit = clampNumber(args.limit, 10, 1, MAX_FIND_LIMIT);

    return {
      mcpArgs: {
        connectionId,
        database: physicalDatabase,
        collection,
        method: [{ name: 'find', arguments: findArgs }],
        verbosity,
      },
      logicalDatabase,
      physicalDatabase,
    };
  }

  if (tool === 'compareMongoCollectionToPlan') {
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

  if (tool === 'aggregateMongoCollection') {
    const payload = raw as { documents?: unknown[]; count?: number | 'indeterminate' };
    const documents = Array.isArray(payload.documents) ? payload.documents : [];
    const count =
      typeof payload.count === 'number'
        ? payload.count
        : typeof payload.count === 'string' && payload.count === 'indeterminate'
          ? documents.length
          : documents.length;
    return {
      database: logicalDatabase,
      collection: typeof args.collection === 'string' ? args.collection : '',
      documents,
      count,
      pipeline: args.pipeline,
    };
  }

  if (tool === 'explainMongoOperation') {
    const summary = summarizeExplainPayload(raw);
    return {
      database: logicalDatabase,
      collection: typeof args.collection === 'string' ? args.collection : '',
      method: summary.method,
      verbosity: summary.verbosity,
      winningStage: summary.winningStage,
      indexName: summary.indexName,
      docsExamined: summary.docsExamined,
      docsReturned: summary.docsReturned,
      executionTimeMillis: summary.executionTimeMillis,
      explainResult: summary.explainResult,
    };
  }

  if (tool === 'listMongoCollectionIndexes') {
    return normalizeCollectionIndexesPayload(logicalDatabase, args, raw);
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
    const count = typeof record.totalCount === 'number' ? record.totalCount : 0;
    const collection = typeof record.collection === 'string' ? record.collection : 'collection';
    const db = typeof record.database === 'string' ? record.database : 'database';
    return count === 1
      ? `Listed 1 index for ${collection} in ${db}.`
      : `Listed ${count} indexes for ${collection} in ${db}.`;
  }
  if (tool === 'findMongoDocuments') {
    const result = record.result as { queryResultsCount?: number } | undefined;
    const count = result?.queryResultsCount ?? 0;
    return `Returned ${count} document(s) from ${record.collection} in ${record.database}.`;
  }
  if (tool === 'aggregateMongoCollection') {
    const count = typeof record.count === 'number' ? record.count : 0;
    return `Aggregation returned ${count} document(s) from ${record.collection} in ${record.database}.`;
  }
  if (tool === 'explainMongoOperation') {
    const stage = typeof record.winningStage === 'string' ? record.winningStage : 'plan';
    const index = typeof record.indexName === 'string' ? ` using ${record.indexName}` : '';
    return `Explained ${record.method} on ${record.collection} in ${record.database} (${stage}${index}).`;
  }
  if (tool === 'compareMongoCollectionToPlan') {
    const summary = record.summary as { matches?: number; missing?: number; extra?: number } | undefined;
    const matches = summary?.matches ?? 0;
    const missing = summary?.missing ?? 0;
    const extra = summary?.extra ?? 0;
    return `Compared ${record.collection} in ${record.database}: ${matches} match(es), ${missing} missing, ${extra} extra.`;
  }
  return `${tool} completed.`;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

type CollectionIndexesPayload = {
  database: string;
  collection: string;
  classicIndexes: Array<{ name: string; key: Record<string, unknown> }>;
  searchIndexes: Array<{ name: string; type: string; status: string; queryable: boolean }>;
  totalCount: number;
};

/** Normalize MCP collection-indexes output for the copilot UI. */
function normalizeCollectionIndexesPayload(
  logicalDatabase: string,
  args: Record<string, unknown>,
  raw: unknown,
): CollectionIndexesPayload {
  const collection = typeof args.collection === 'string' ? args.collection : '';
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const classicIndexes = Array.isArray(record.classicIndexes)
    ? record.classicIndexes
        .filter(
          (entry): entry is { name: string; key: Record<string, unknown> } =>
            Boolean(
              entry &&
                typeof entry === 'object' &&
                typeof (entry as { name?: unknown }).name === 'string' &&
                (entry as { key?: unknown }).key &&
                typeof (entry as { key?: unknown }).key === 'object',
            ),
        )
        .map((entry) => ({ name: entry.name, key: entry.key }))
    : [];

  const searchIndexes = Array.isArray(record.searchIndexes)
    ? record.searchIndexes
        .filter(
          (entry): entry is { name: string; type: string; status: string; queryable: boolean } =>
            Boolean(
              entry &&
                typeof entry === 'object' &&
                typeof (entry as { name?: unknown }).name === 'string' &&
                typeof (entry as { type?: unknown }).type === 'string' &&
                typeof (entry as { status?: unknown }).status === 'string' &&
                typeof (entry as { queryable?: unknown }).queryable === 'boolean',
            ),
        )
        .map((entry) => ({
          name: entry.name,
          type: entry.type,
          status: entry.status,
          queryable: entry.queryable,
        }))
    : [];

  const totalCount =
    typeof record.classicIndexesCount === 'number' && typeof record.searchIndexesCount === 'number'
      ? record.classicIndexesCount + record.searchIndexesCount
      : classicIndexes.length + searchIndexes.length;

  return {
    database: logicalDatabase,
    collection,
    classicIndexes,
    searchIndexes,
    totalCount,
  };
}

async function fetchClusterDatabaseNames(
  callTool: MongoMcpToolCaller,
  connectionId: string,
): Promise<string[]> {
  const raw = await callTool('list-databases', { connectionId });
  const payload = normalizeListDatabasesPayload(raw);
  return (payload.databases ?? []).map((entry) => entry.name);
}

function assertPhysicalDatabaseOnCluster(
  scope: TenantMongoInspectScope,
  logicalDatabase: string,
  physicalDatabase: string,
  clusterNames: string[],
): void {
  if (clusterNames.includes(physicalDatabase)) return;
  throw new Error(
    `Database "${logicalDatabase}" was not found on the cluster. Run listMongoDatabases and use one of the returned names.`,
  );
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

async function runCompareCollectionToPlan(input: {
  callTool: MongoMcpToolCaller;
  connectionId: string;
  logicalDatabase: string;
  physicalDatabase: string;
  collection: string;
  planContext?: MongoPlanContext;
}): Promise<unknown> {
  const baseArgs = {
    connectionId: input.connectionId,
    database: input.physicalDatabase,
    collection: input.collection,
  };

  const [schemaPayload, indexesPayload, countPayload] = await Promise.all([
    input.callTool('collection-schema', { ...baseArgs, sampleSize: 50, responseBytesLimit: 512_000 }),
    input.callTool('collection-indexes', baseArgs),
    input.callTool('count', baseArgs),
  ]);

  const documentCount =
    countPayload && typeof countPayload === 'object' && typeof (countPayload as { count?: unknown }).count === 'number'
      ? (countPayload as { count: number }).count
      : undefined;

  return compareCollectionToPlan({
    database: input.logicalDatabase,
    collection: input.collection,
    plan: findPlanCollection(input.planContext, input.collection),
    schemaPayload,
    indexesPayload,
    documentCount,
  });
}
