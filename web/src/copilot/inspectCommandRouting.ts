import type { ParsedCopilotToolCall, ServerMongoInspectToolCall } from './llmTools';
import { isServerMongoInspectToolCall } from './llmTools';

const LIST_COLLECTIONS_NAMED_DB =
  /(?:^|\b)(?:list|show)\s+collections?\s+(?:from|in)\s+([^\s,.;!?]+)/i;
const COLLECTIONS_IN_DB = /(?:^|\b)collections?\s+in\s+([^\s,.;!?]+)/i;
const WHAT_COLLECTIONS_IN_DB =
  /(?:^|\b)what\s+collections?\s+(?:are\s+)?(?:in|from)\s+([^\s,.;!?]+)/i;

/** Strips trailing punctuation from a captured database name token. */
function normalizeDatabaseToken(raw: string): string {
  return raw.trim().replace(/^['"`]+|['"`]+$/g, '');
}

/** Extracts a logical database name when the user asks to list collections in a specific database. */
export function extractNamedDatabaseForListCollectionsRequest(userMessage: string): string | null {
  const trimmed = userMessage.trim();
  for (const pattern of [LIST_COLLECTIONS_NAMED_DB, COLLECTIONS_IN_DB, WHAT_COLLECTIONS_IN_DB]) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const database = normalizeDatabaseToken(match[1]);
      if (database) return database;
    }
  }
  return null;
}

/** True when listMongoDatabases would duplicate a list-collections response the user already asked for. */
export function shouldSuppressListMongoDatabasesDisplay(
  userMessage: string,
  batchCalls: ParsedCopilotToolCall[],
): boolean {
  if (extractNamedDatabaseForListCollectionsRequest(userMessage)) {
    return true;
  }
  return batchCalls.some(
    (call) => isServerMongoInspectToolCall(call) && call.tool === 'listMongoCollections',
  );
}

/** Maps natural-language inspect requests to a single server-side tool call (bypasses LLM). */
export function parseDirectMongoInspectCommand(input: string): ServerMongoInspectToolCall | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const listCollectionsDatabase = extractNamedDatabaseForListCollectionsRequest(trimmed);
  if (listCollectionsDatabase) {
    return {
      kind: 'mongoInspect',
      tool: 'listMongoCollections',
      args: { database: listCollectionsDatabase },
    };
  }

  if (/^(?:list|show)\s+databases?$/i.test(trimmed)) {
    return { kind: 'mongoInspect', tool: 'listMongoDatabases', args: {} };
  }

  return null;
}
