import type { ParsedCopilotToolCall, ServerMongoInspectToolCall } from './llmTools';
import { isServerMongoInspectToolCall } from './llmTools';

const LIST_COLLECTIONS_NAMED_DB =
  /(?:^|\b)(?:list|show)\s+collections?\s+(?:from|in)\s+([^\s,.;!?]+)/i;
const COLLECTIONS_IN_DB = /(?:^|\b)collections?\s+in\s+([^\s,.;!?]+)/i;
const WHAT_COLLECTIONS_IN_DB =
  /(?:^|\b)what\s+collections?\s+(?:are\s+)?(?:in|from)\s+([^\s,.;!?]+)/i;
const LIST_DATABASES =
  /^(?:show\s+me\s+(?:the\s+)?|list\s+(?:the\s+)?|what\s+are\s+(?:the\s+)?|what\s+(?:mongo(?:db)?\s+)?)?databases?\??$/i;
const SHOW_COLLECTIONS_IN_DB =
  /^(?:show\s+me\s+(?:the\s+)?|list\s+(?:the\s+)?)?collections?\s+(?:in|from)\s+\S+/i;

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

/** True when the user only asked to list databases or collections (no analysis follow-up). */
export function isInspectOnlyUserMessage(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) return false;
  if (parseDirectMongoInspectCommand(trimmed)) return true;
  if (LIST_DATABASES.test(trimmed)) return true;
  if (extractNamedDatabaseForListCollectionsRequest(trimmed)) return true;
  if (SHOW_COLLECTIONS_IN_DB.test(trimmed)) return true;
  return false;
}

/** True when assistant prose repeats structured inspect output already shown in a tool card. */
export function looksLikeInspectListingEcho(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (/^\s*#+\s*(available|listed|mongodb|atlas|collections?|databases?)\b/i.test(trimmed)) return true;
  if (/\|\s*database\s*\|/i.test(trimmed) || /\|\s*collection\s*\|/i.test(trimmed)) return true;
  if (/\|\s*size\s*\|/i.test(trimmed) && /\|\s*database\s*\|/i.test(trimmed)) return true;
  return false;
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

  if (LIST_DATABASES.test(trimmed)) {
    return { kind: 'mongoInspect', tool: 'listMongoDatabases', args: {} };
  }

  return null;
}
