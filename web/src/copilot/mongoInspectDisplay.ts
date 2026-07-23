import type { MongoInspectInvokeResponse, MongoInspectToolName } from './types';
import { readMongoInspectCollectionRows, readMongoInspectDatabaseRows } from './mongoInspectFormat';

/** Human-readable delta lines for MongoDB inspect tool cards. */
export function buildMongoInspectDelta(
  tool: MongoInspectToolName,
  response: MongoInspectInvokeResponse,
): string[] {
  if (!response.ok) return [];

  if (tool === 'listMongoDatabases') {
    return readMongoInspectDatabaseRows(response.data).map((entry) => `database: ${entry.name}`);
  }

  if (tool === 'listMongoCollections') {
    const { database, collections } = readMongoInspectCollectionRows(response.data);
    return collections.map((entry) => `${database}.${entry.name}`);
  }

  if (tool === 'compareMongoCollectionToPlan' && response.data && typeof response.data === 'object') {
    const summary = (response.data as { summary?: { matches?: number; missing?: number } }).summary;
    if (summary) return [`matches: ${summary.matches ?? 0}`, `missing: ${summary.missing ?? 0}`];
  }

  return [`Inspect tool ${tool} completed.`];
}

/** JSON payload sent back to the LLM after a server-side inspect tool run. */
export function serializeMongoInspectToolResult(result: {
  ok: boolean;
  tool: MongoInspectToolName;
  summary: string;
  data?: unknown;
}): string {
  return JSON.stringify({
    ok: result.ok,
    tool: result.tool,
    summary: result.summary,
    data: result.data ?? null,
  });
}
