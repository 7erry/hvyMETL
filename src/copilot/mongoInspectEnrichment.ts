/**
 * Enriches MongoDB inspect listings with per-collection stats from MCP metadata tools.
 */

import { callMongoMcpTool } from './mongoMcpClient.js';

const MCP_CONNECTION_ID = 'preconfigured';
const MAX_COLLECTIONS_TO_ENRICH = 40;

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

/** Attach document counts, storage size, and index counts for each collection name. */
export async function enrichCollectionSummaries(
  physicalDatabase: string,
  collections: Array<{ name: string }>,
): Promise<MongoInspectCollectionSummary[]> {
  const targets = collections.slice(0, MAX_COLLECTIONS_TO_ENRICH);

  return Promise.all(
    targets.map(async (entry): Promise<MongoInspectCollectionSummary> => {
      const summary: MongoInspectCollectionSummary = { name: entry.name };
      const baseArgs = {
        connectionId: MCP_CONNECTION_ID,
        database: physicalDatabase,
        collection: entry.name,
      };

      const [countResult, sizeResult, indexesResult] = await Promise.allSettled([
        callMongoMcpTool('count', baseArgs),
        callMongoMcpTool('collection-storage-size', baseArgs),
        callMongoMcpTool('collection-indexes', baseArgs),
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
    }),
  );
}
