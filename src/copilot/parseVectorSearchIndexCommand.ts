/**
 * Parses natural-language "create vector search …" copilot commands into collection / field targets.
 */

export type ParsedVectorSearchIndexCommand = {
  collection: string;
  path?: string;
  database?: string;
};

const CREATE_VECTOR_SEARCH_PREFIX =
  /^create\s+(?:an?\s+)?(?:(?:auto\s?-?\s?embed\s+)?vector\s+(?:search\s+)?(?:index\s+)?on|vector\s+search\s+(?:index\s+)?on)\s+(.+?)\s*$/i;

function stripQuotes(token: string): string {
  return token.trim().replace(/^['"`]+|['"`]+$/g, '');
}

/** True when the first segment is likely a logical database (e.g. csv_to_atlas), not a collection name. */
function looksLikeLogicalDatabase(segment: string): boolean {
  return segment.includes('_') || segment.includes('-');
}

/** Split `db.collection`, `collection.field`, or `db.collection.field` into logical parts. */
export function parseVectorSearchIndexTarget(rawTarget: string): ParsedVectorSearchIndexCommand | null {
  const target = stripQuotes(rawTarget);
  if (!target) return null;

  const segments = target.split('.').map((part) => stripQuotes(part)).filter(Boolean);
  if (segments.length === 0) return null;

  if (segments.length >= 4) {
    const database = segments[0]!;
    const collection = segments[1]!;
    const path = segments.slice(2).join('.');
    if (!collection || !path) return null;
    return { database, collection, path };
  }

  if (segments.length === 3) {
    const [first, second, third] = segments as [string, string, string];
    if (looksLikeLogicalDatabase(first)) {
      return { database: first, collection: second, path: third };
    }
    return { collection: first, path: `${second}.${third}` };
  }

  if (segments.length === 2) {
    const collection = segments[0]!;
    const path = segments[1]!;
    if (!collection || !path) return null;
    return { collection, path };
  }

  const collection = segments[0]!;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(collection)) return null;
  return { collection };
}

/** Map chat input like "create vector search on products.description" to collection + optional field. */
export function parseDirectVectorSearchIndexCommand(input: string): ParsedVectorSearchIndexCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(CREATE_VECTOR_SEARCH_PREFIX);
  if (!match?.[1]) return null;

  return parseVectorSearchIndexTarget(match[1]);
}
