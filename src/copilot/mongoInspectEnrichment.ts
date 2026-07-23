/**
 * Enriches MongoDB inspect listings with per-collection stats from MCP metadata tools.
 */

import { callMongoMcpTool, type MongoMcpToolCaller } from './mongoMcpClient.js';
import { MCP_PRECONFIGURED_CONNECTION_ID } from './mongoInspectConnection.js';

const MAX_COLLECTIONS_TO_ENRICH = 40;
/** Limit parallel collection enrichment to avoid overloading the MCP server. */
const ENRICH_CONCURRENCY = 3;

export type MongoInspectCollectionSummary = {
  name: string;
  documentCount?: number;
  storageSize?: number;
  storageSizeUnits?: string;
  indexCount?: number;
};

function readCountPayload(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const count = (raw as { count?: unknown }).count;
  return typeof count === 'number' && Number.isFinite(count) ? count : undefined;
}

function readStorageSizePayload(raw: unknown): { storageSize?: number; storageSizeUnits?: string } {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as { size?: unknown; units?: unknown };
  const storageSize = typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : undefined;
  const storageSizeUnits = typeof record.units === 'string' ? record.units : undefined;
  return { storageSize, storageSizeUnits };
}

function readIndexCountPayload(raw: unknown): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as { classicIndexesCount?: unknown; searchIndexesCount?: unknown };
  const classic =
    typeof record.classicIndexesCount === 'number' && Number.isFinite(record.classicIndexesCount)
      ? record.classicIndexesCount
      : 0;
  const search =
    typeof record.searchIndexesCount === 'number' && Number.isFinite(record.searchIndexesCount)
      ? record.searchIndexesCount
      : 0;
  return classic + search;
}

async function enrichOneCollection(
  callTool: MongoMcpToolCaller,
  physicalDatabase: string,
  entry: { name: string },
  connectionId: string,
): Promise<MongoInspectCollectionSummary> {
  const summary: MongoInspectCollectionSummary = { name: entry.name };
  const baseArgs = {
    connectionId,
    database: physicalDatabase,
    collection: entry.name,
  };

  const [countResult, sizeResult, indexesResult] = await Promise.allSettled([
    callTool('count', baseArgs),
    callTool('collection-storage-size', baseArgs),
    callTool('collection-indexes', baseArgs),
  ]);

  if (countResult.status === 'fulfilled') {
    summary.documentCount = readCountPayload(countResult.value);
  }
  if (sizeResult.status === 'fulfilled') {
    Object.assign(summary, readStorageSizePayload(sizeResult.value));
  }
  if (indexesResult.status === 'fulfilled') {
    summary.indexCount = readIndexCountPayload(indexesResult.value);
  }

  return summary;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/** Attach document counts, storage size, and index counts for each collection name. */
export async function enrichCollectionSummaries(
  physicalDatabase: string,
  collections: Array<{ name: string }>,
  callTool: MongoMcpToolCaller = callMongoMcpTool,
  connectionId: string = MCP_PRECONFIGURED_CONNECTION_ID,
): Promise<MongoInspectCollectionSummary[]> {
  const targets = collections.slice(0, MAX_COLLECTIONS_TO_ENRICH);
  return mapWithConcurrency(targets, ENRICH_CONCURRENCY, (entry) =>
    enrichOneCollection(callTool, physicalDatabase, entry, connectionId),
  );
}
