/**
 * Parses natural-language find/count requests into MongoDB inspect tool calls.
 */

import type { MongoInspectToolName } from './mongoInspectToolSchemas.js';

export type NaturalLanguageFindToolCall = {
  kind: 'mongoInspect';
  tool: MongoInspectToolName;
  args: Record<string, unknown>;
};

const FIND_DB_COLLECTION_WHERE =
  /^find\s+(?:documents?\s+)?(?:in\s+)?([^\s.]+)\.([^\s,;!?]+)\s+where\s+(.+)$/i;
const FIND_IN_DB_COLLECTION_WHERE =
  /^find\s+(?:documents?\s+)?in\s+([^\s.]+)\.([^\s,;!?]+)\s+where\s+(.+)$/i;
const FIND_COLLECTION_IN_DB_WHERE =
  /^find\s+(?:documents?\s+)?(?:in\s+)?([^\s.]+)\s+in\s+([^\s.]+)\s+where\s+(.+)$/i;
const COUNT_DB_COLLECTION_WHERE =
  /^count\s+(?:documents?\s+)?(?:in\s+)?([^\s.]+)\.([^\s,;!?]+)(?:\s+where\s+(.+))?$/i;
const COUNT_IN_DB_COLLECTION_WHERE =
  /^count\s+(?:documents?\s+)?in\s+([^\s.]+)\.([^\s,;!?]+)(?:\s+where\s+(.+))?$/i;

/** Strips surrounding quotes from database/collection tokens. */
function normalizeNameToken(raw: string): string {
  return raw.trim().replace(/^['"`]+|['"`]+$/g, '');
}

function sqlComparisonToMongo(operator: string): '$gt' | '$gte' | '$lt' | '$lte' | '$ne' | '$eq' {
  switch (operator) {
    case '>':
      return '$gt';
    case '>=':
      return '$gte';
    case '<':
      return '$lt';
    case '<=':
      return '$lte';
    case '!=':
    case '<>':
      return '$ne';
    default:
      return '$eq';
  }
}

function parseLiteral(raw: string): string | number | boolean | null {
  const trimmed = raw.replace(/[;,]\s*$/g, '').trim();
  if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^".*"$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^null$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  const numeric = Number(trimmed);
  if (trimmed.length > 0 && !Number.isNaN(numeric)) return numeric;
  return trimmed;
}

function splitWhereOnLogicalOperator(clause: string, operator: 'and' | 'or'): string[] {
  const pattern = operator === 'and' ? /\s+and\s+/i : /\s+or\s+/i;
  return clause
    .split(pattern)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Parses a SQL-like WHERE clause into a MongoDB filter (field names preserved for schema remap). */
export function parseNaturalLanguageWhere(where: string): Record<string, unknown> {
  const trimmed = where.trim().replace(/[;\s]+$/g, '');

  if (/\sand\s/i.test(trimmed)) {
    const parts = splitWhereOnLogicalOperator(trimmed, 'and');
    if (parts.length > 1) {
      return { $and: parts.map(parseNaturalLanguageWhere) };
    }
  }

  if (/\sor\s/i.test(trimmed)) {
    const parts = splitWhereOnLogicalOperator(trimmed, 'or');
    if (parts.length > 1) {
      return { $or: parts.map(parseNaturalLanguageWhere) };
    }
  }

  const comparison = trimmed.match(/^(.+?)\s*(>=|<=|<>|!=|>|<|=)\s*(.+)$/i);
  if (comparison) {
    const field = comparison[1]!.trim();
    const operator = sqlComparisonToMongo(comparison[2]!);
    const value = parseLiteral(comparison[3]!);
    if (operator === '$eq') {
      return { [field]: value };
    }
    return { [field]: { [operator]: value } };
  }

  const isNull = trimmed.match(/^(.+?)\s+is\s+null$/i);
  if (isNull) {
    return { [isNull[1]!.trim()]: null };
  }

  const isNotNull = trimmed.match(/^(.+?)\s+is\s+not\s+null$/i);
  if (isNotNull) {
    return { [isNotNull[1]!.trim()]: { $ne: null } };
  }

  throw new Error(`Could not parse filter condition: ${where}`);
}

function buildFindCall(
  database: string,
  collection: string,
  whereClause: string | undefined,
): NaturalLanguageFindToolCall {
  const args: Record<string, unknown> = {
    database: normalizeNameToken(database),
    collection: normalizeNameToken(collection),
    limit: 25,
  };
  if (whereClause?.trim()) {
    args.filter = parseNaturalLanguageWhere(whereClause);
  }
  return { kind: 'mongoInspect', tool: 'findMongoDocuments', args };
}

function buildCountCall(
  database: string,
  collection: string,
  whereClause: string | undefined,
): NaturalLanguageFindToolCall {
  const pipeline: Record<string, unknown>[] = [];
  if (whereClause?.trim()) {
    pipeline.push({ $match: parseNaturalLanguageWhere(whereClause) });
  }
  pipeline.push({ $count: 'total' });
  return {
    kind: 'mongoInspect',
    tool: 'aggregateMongoCollection',
    args: {
      database: normalizeNameToken(database),
      collection: normalizeNameToken(collection),
      pipeline,
    },
  };
}

/** Maps find/count natural language to a direct MongoDB inspect tool call. */
export function parseNaturalLanguageFindQuery(input: string): NaturalLanguageFindToolCall | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  for (const pattern of [FIND_IN_DB_COLLECTION_WHERE, FIND_DB_COLLECTION_WHERE]) {
    const match = trimmed.match(pattern);
    if (match?.[1] && match[2] && match[3]) {
      return buildFindCall(match[1], match[2], match[3]);
    }
  }

  const collectionInDb = trimmed.match(FIND_COLLECTION_IN_DB_WHERE);
  if (collectionInDb?.[1] && collectionInDb[2] && collectionInDb[3]) {
    return buildFindCall(collectionInDb[2], collectionInDb[1], collectionInDb[3]);
  }

  for (const pattern of [COUNT_IN_DB_COLLECTION_WHERE, COUNT_DB_COLLECTION_WHERE]) {
    const match = trimmed.match(pattern);
    if (match?.[1] && match[2]) {
      return buildCountCall(match[1], match[2], match[3]);
    }
  }

  return null;
}
