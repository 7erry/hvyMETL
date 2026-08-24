import type { ParsedCopilotToolCall, ServerMongoInspectToolCall } from './llmTools';
import { isServerMongoInspectToolCall } from './llmTools';
import { parseNaturalLanguageFindQuery } from '../../../src/copilot/naturalLanguageFind.ts';

const LIST_COLLECTIONS_NAMED_DB =
  /(?:^|\b)(?:list|show)\s+collections?\s+(?:from|in)\s+(?:the\s+)?(?:logical\s+)?([^\s,.;!?]+)/i;
const COLLECTIONS_IN_DB = /(?:^|\b)collections?\s+in\s+(?:the\s+)?(?:logical\s+)?([^\s,.;!?]+)/i;
const WHAT_COLLECTIONS_IN_DB =
  /(?:^|\b)what\s+collections?\s+(?:are\s+)?(?:in|from)\s+(?:the\s+)?(?:logical\s+)?([^\s,.;!?]+)/i;
const VERIFY_COLLECTIONS_IN_DB = /\bverify\s+collections?\s+in\s+([^\s,.;!?]+)/i;
const VERIFY_IMPORTED_COLLECTIONS = /^verify\s+(?:imported\s+)?collections?\.?$/i;

/** English tokens that are not Atlas logical database names. */
const DATABASE_NAME_STOPWORDS = new Set([
  'a',
  'an',
  'at',
  'atlas',
  'database',
  'databases',
  'db',
  'for',
  'from',
  'i',
  'imported',
  'in',
  'just',
  'logical',
  'mongo',
  'mongodb',
  'my',
  'on',
  'pipeline',
  'target',
  'the',
  'to',
  'with',
]);
const LIST_DATABASES =
  /^(?:show\s+me\s+(?:the\s+)?|list\s+(?:the\s+)?|what\s+are\s+(?:the\s+)?|what\s+(?:mongo(?:db)?\s+)?)?databases?\??$/i;
const SHOW_COLLECTIONS_IN_DB =
  /^(?:show\s+me\s+(?:the\s+)?|list\s+(?:the\s+)?)?collections?\s+(?:in|from)\s+\S+/i;
const DESCRIBE_DB_COLLECTION =
  /^describe\s+(?:the\s+)?(?:schema\s+(?:for|of)\s+)?([^\s.?,!]+)\.([^\s.?,!]+)\??$/i;
const DESCRIBE_COLLECTION_IN_DB =
  /^describe\s+(?:the\s+)?(?:schema\s+(?:for|of)\s+)?([^\s.?,!]+)\s+in\s+([^\s.?,!]+)\??$/i;
const SHOW_SCHEMA_DB_COLLECTION =
  /^(?:show|get)\s+(?:me\s+)?(?:the\s+)?schema\s+(?:for|of)\s+([^\s.?,!]+)\.([^\s.?,!]+)\??$/i;

/** Strips quotes and rejects stopwords so "collections in the logical database" does not resolve to "the". */
function normalizeDatabaseToken(raw: string): string | null {
  const token = raw.trim().replace(/^['"`]+|['"`]+$/g, '');
  if (!token) return null;
  if (DATABASE_NAME_STOPWORDS.has(token.toLowerCase())) return null;
  return token;
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

/**
 * Routes "Verify imported collections" (pipeline target db) or "Verify collections in {db}".
 * Returns null when the message is unrelated.
 */
export function parseVerifyCollectionsCommand(
  userMessage: string,
  fallbackDatabase: string,
): ServerMongoInspectToolCall | null {
  const trimmed = userMessage.trim();
  if (!trimmed) return null;

  const explicit = trimmed.match(VERIFY_COLLECTIONS_IN_DB);
  if (explicit?.[1]) {
    const database = normalizeDatabaseToken(explicit[1]);
    if (database) {
      return {
        kind: 'mongoInspect',
        tool: 'listMongoCollections',
        args: { database },
      };
    }
  }

  if (!VERIFY_IMPORTED_COLLECTIONS.test(trimmed)) {
    return null;
  }

  const database = normalizeDatabaseToken(fallbackDatabase) ?? fallbackDatabase.trim();
  if (!database) return null;

  return {
    kind: 'mongoInspect',
    tool: 'listMongoCollections',
    args: { database },
  };
}

/** True when listMongoDatabases would duplicate a list-collections response the user already asked for. */
export function shouldSuppressListMongoDatabasesDisplay(
  userMessage: string,
  batchCalls: ParsedCopilotToolCall[],
): boolean {
  if (extractNamedDatabaseForListCollectionsRequest(userMessage)) {
    return true;
  }
  if (VERIFY_COLLECTIONS_IN_DB.test(userMessage.trim())) {
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
  if (VERIFY_IMPORTED_COLLECTIONS.test(trimmed)) return true;
  if (LIST_DATABASES.test(trimmed)) return true;
  if (extractNamedDatabaseForListCollectionsRequest(trimmed)) return true;
  if (SHOW_COLLECTIONS_IN_DB.test(trimmed)) return true;
  return false;
}

/** True when assistant prose repeats structured inspect output already shown in a tool card. */
export function looksLikeInspectListingEcho(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (/^#\s+.+\s+[-–—]\s+Architecture Review/im.test(trimmed)) return false;
  if (/^\s*#+\s*(available|listed|mongodb|atlas|collections?|databases?)\b/i.test(trimmed)) return true;
  if (/\|\s*database\s*\|/i.test(trimmed) || /\|\s*collection\s*\|/i.test(trimmed)) return true;
  if (/\|\s*size\s*\|/i.test(trimmed) && /\|\s*database\s*\|/i.test(trimmed)) return true;
  if (/displayed in the tool result above/i.test(trimmed)) return true;
  if (/^\s*the inferred schema for .+ (?:is )?(?:displayed|shown)/i.test(trimmed)) return true;
  if (
    /^\s*inferred schema for .+ in .+\.?$/i.test(trimmed) &&
    trimmed.length < 240 &&
    !trimmed.includes('|')
  ) {
    return true;
  }
  if (/\|\s*field\s*\|/i.test(trimmed) && /\|\s*bson\s*type/i.test(trimmed)) return true;
  return false;
}

/** Maps natural-language inspect requests to a single server-side tool call (bypasses LLM). */
export function parseDirectMongoInspectCommand(input: string): ServerMongoInspectToolCall | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const verifyCollections = parseVerifyCollectionsCommand(trimmed, '');
  if (verifyCollections) {
    return verifyCollections;
  }

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

  const naturalLanguageFind = parseNaturalLanguageFindQuery(trimmed);
  if (naturalLanguageFind) {
    return naturalLanguageFind;
  }

  const describeDbCollection = trimmed.match(DESCRIBE_DB_COLLECTION);
  if (describeDbCollection?.[1] && describeDbCollection[2]) {
    const database = normalizeDatabaseToken(describeDbCollection[1]);
    const collection = normalizeDatabaseToken(describeDbCollection[2]);
    if (database && collection) {
      return {
        kind: 'mongoInspect',
        tool: 'describeMongoCollectionSchema',
        args: { database, collection },
      };
    }
  }

  const showSchemaDbCollection = trimmed.match(SHOW_SCHEMA_DB_COLLECTION);
  if (showSchemaDbCollection?.[1] && showSchemaDbCollection[2]) {
    const database = normalizeDatabaseToken(showSchemaDbCollection[1]);
    const collection = normalizeDatabaseToken(showSchemaDbCollection[2]);
    if (database && collection) {
      return {
        kind: 'mongoInspect',
        tool: 'describeMongoCollectionSchema',
        args: { database, collection },
      };
    }
  }

  const describeCollectionInDb = trimmed.match(DESCRIBE_COLLECTION_IN_DB);
  if (describeCollectionInDb?.[1] && describeCollectionInDb[2]) {
    const database = normalizeDatabaseToken(describeCollectionInDb[2]);
    const collection = normalizeDatabaseToken(describeCollectionInDb[1]);
    if (database && collection) {
      return {
        kind: 'mongoInspect',
        tool: 'describeMongoCollectionSchema',
        args: { database, collection },
      };
    }
  }

  return null;
}
