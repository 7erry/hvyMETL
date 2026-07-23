import type { MongoInspectInvokeResponse, MongoInspectToolName } from './types';

function readNamedEntries(value: unknown, key: 'databases' | 'collections'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const entries = record[key];
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (entry): entry is { name: string } =>
        Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string'),
    )
    .map((entry) => entry.name);
}

/** Human-readable delta lines for MongoDB inspect tool cards. */
export function buildMongoInspectDelta(
  tool: MongoInspectToolName,
  response: MongoInspectInvokeResponse,
): string[] {
  if (!response.ok) return [];

  if (tool === 'listMongoDatabases') {
    return readNamedEntries(response.data, 'databases').map((name) => `database: ${name}`);
  }

  if (tool === 'listMongoCollections') {
    const database =
      response.data && typeof response.data === 'object' && typeof (response.data as { database?: unknown }).database === 'string'
        ? (response.data as { database: string }).database
        : 'database';
    return readNamedEntries(response.data, 'collections').map((name) => `${database}.${name}`);
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
