/**
 * Executes read-only MongoDB inspect tools for Agent Copilot via the MCP server.
 */

import type { Request } from 'express';
import {
  MCP_INSPECT_UNAVAILABLE_MESSAGE,
  callMongoMcpTool,
  isMongoMcpEnabled,
} from './mongoMcpClient.js';
import {
  assertDatabaseAccess,
  mergeDiscoveredLogicalDatabases,
  resolveTenantMongoInspectScope,
  sanitizeDatabaseListForClient,
  type TenantMongoInspectScope,
} from './mongoInspectScope.js';
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

type ListCollectionsPayload = {
  collections?: Array<{ name: string }>;
  totalCount?: number;
};

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
  try {
    scope = await resolveTenantMongoInspectScope(req);
  } catch (error) {
    return {
      ok: false,
      tool,
      summary: String(error),
      error: String(error),
    };
  }

  try {
    const mcpArgs = await buildMcpArguments(scope, tool, args);
    const mcpName = MONGO_INSPECT_MCP_TOOL_MAP[tool];
    const raw = await callMongoMcpTool(mcpName, mcpArgs);
    const data = await sanitizeInspectPayload(scope, tool, args, raw);
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
): Promise<Record<string, unknown>> {
  const connectionId = MCP_CONNECTION_ID;

  if (tool === 'listMongoDatabases') {
    return { connectionId };
  }

  const logicalDatabase =
    typeof args.database === 'string' && args.database.trim()
      ? args.database.trim()
      : scope.defaultLogicalDatabase;
  const physicalDatabase = await resolveAccessiblePhysicalDatabase(scope, logicalDatabase);
  assertDatabaseAccess(scope, physicalDatabase);

  if (tool === 'listMongoCollections') {
    return { connectionId, database: physicalDatabase };
  }

  const collection = String(args.collection ?? '').trim();
  if (!collection) {
    throw new Error('Collection name is required.');
  }

  if (tool === 'describeMongoCollectionSchema') {
    const sampleSize = clampNumber(args.sampleSize, 50, 1, MAX_SCHEMA_SAMPLE);
    return {
      connectionId,
      database: physicalDatabase,
      collection,
      sampleSize,
      responseBytesLimit: 512_000,
    };
  }

  if (tool === 'listMongoCollectionIndexes') {
    return { connectionId, database: physicalDatabase, collection };
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
  return mcpArgs;
}

async function sanitizeInspectPayload(
  scope: TenantMongoInspectScope,
  tool: MongoInspectToolName,
  args: Record<string, unknown>,
  raw: unknown,
): Promise<unknown> {
  const logicalDatabase = scope.resolveLogicalDatabase(
    typeof args.database === 'string' ? args.database : undefined,
  );

  if (tool === 'listMongoDatabases') {
    const payload = (raw ?? {}) as ListDatabasesPayload;
    const clusterNames = (payload.databases ?? []).map((entry) => entry.name);
    const sanitized = sanitizeDatabaseListForClient(scope, payload.databases ?? []);
    const databases = mergeDiscoveredLogicalDatabases(scope, clusterNames, sanitized);
    return {
      databases,
      totalCount: databases.length,
    };
  }

  if (tool === 'listMongoCollections') {
    const payload = (raw ?? {}) as ListCollectionsPayload;
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
  const payload = (raw ?? {}) as ListDatabasesPayload;
  return (payload.databases ?? []).map((entry) => entry.name);
}

/** Pick the physical database that exists on the cluster for a logical import name. */
async function resolveAccessiblePhysicalDatabase(
  scope: TenantMongoInspectScope,
  logicalDatabase: string,
): Promise<string> {
  const clusterNames = await fetchClusterDatabaseNames();
  const discovered = scope.findPhysicalDatabaseForLogical(logicalDatabase, clusterNames);
  if (discovered) return discovered;

  for (const candidate of scope.resolvePhysicalDatabaseCandidates(logicalDatabase)) {
    if (clusterNames.includes(candidate)) {
      return candidate;
    }
  }

  return scope.resolvePhysicalDatabase(logicalDatabase);
}
