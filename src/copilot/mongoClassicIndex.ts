/**
 * Classic MongoDB B-tree index input parsing and shell-command helpers for Agent Copilot.
 */

export type MongoClassicIndexKeyDirection = 1 | -1;

export type MongoClassicIndexKeys = Record<string, MongoClassicIndexKeyDirection | string | number>;

export type MongoClassicIndexOptions = {
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
};

/** Request body for creating a classic index via the studio API. */
export type MongoClassicIndexInput = {
  database?: string;
  collection: string;
  keys: MongoClassicIndexKeys;
  options?: MongoClassicIndexOptions;
};

export type ParsedClassicIndexCommand = {
  database?: string;
  collection: string;
  keys: MongoClassicIndexKeys;
  options?: MongoClassicIndexOptions;
};

const COLLECTION_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const DB_CREATE_INDEX_SHELL =
  /db\.([a-zA-Z_][a-zA-Z0-9_]*)\.createIndex\s*\(\s*(\{[\s\S]*?\})\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/i;

const USE_DB_PREFIX = /^\s*use\s+([^\s;]+)\s*;?\s*/i;

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

/** Converts `{ status: 1, createdAt: -1 }` shell syntax into a plain object. */
export function parseMongoShellIndexKeys(raw: string): MongoClassicIndexKeys {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error('Index keys must be a MongoDB document, e.g. { status: 1 }.');
  }

  const jsonLike = trimmed
    .replace(/([{,]\s*)([a-zA-Z_][\w.]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'/g, '"');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    throw new Error(`Could not parse index keys: ${raw}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Index keys must be an object.');
  }

  const keys: MongoClassicIndexKeys = {};
  for (const [field, direction] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof direction === 'number' && (direction === 1 || direction === -1)) {
      keys[field] = direction;
      continue;
    }
    if (typeof direction === 'string' && direction.trim()) {
      keys[field] = direction.trim();
      continue;
    }
    throw new Error(`Unsupported index direction for "${field}": ${String(direction)}`);
  }

  if (Object.keys(keys).length === 0) {
    throw new Error('Index keys must include at least one field.');
  }

  return keys;
}

/** Parses optional createIndex options such as `{ name: "status_1", unique: true }`. */
export function parseMongoShellIndexOptions(raw: string | undefined): MongoClassicIndexOptions | undefined {
  if (!raw?.trim()) return undefined;

  const trimmed = raw.trim();
  const jsonLike = trimmed
    .replace(/([{,]\s*)([a-zA-Z_][\w.]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'/g, '"');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    throw new Error(`Could not parse index options: ${raw}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Index options must be an object.');
  }

  const record = parsed as Record<string, unknown>;
  const options: MongoClassicIndexOptions = {};

  if (typeof record.name === 'string' && record.name.trim()) {
    options.name = record.name.trim();
  }
  if (typeof record.unique === 'boolean') {
    options.unique = record.unique;
  }
  if (typeof record.sparse === 'boolean') {
    options.sparse = record.sparse;
  }
  if (typeof record.background === 'boolean') {
    options.background = record.background;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

/** Builds the default MongoDB index name from key directions. */
export function defaultClassicIndexName(keys: MongoClassicIndexKeys): string {
  return Object.entries(keys)
    .map(([field, direction]) => `${field}_${direction}`)
    .join('_');
}

/** Validates API/tool input for classic index creation. */
export function parseMongoClassicIndexInput(raw: unknown): MongoClassicIndexInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Request body must be an object.');
  }

  const record = raw as Record<string, unknown>;
  const collection = readNonEmptyString(record.collection, 'collection');
  if (!COLLECTION_NAME_PATTERN.test(collection)) {
    throw new Error(`Invalid collection name "${collection}".`);
  }

  let keys: MongoClassicIndexKeys;
  if (record.keys && typeof record.keys === 'object' && !Array.isArray(record.keys)) {
    keys = parseMongoShellIndexKeys(JSON.stringify(record.keys));
  } else if (typeof record.keys === 'string') {
    keys = parseMongoShellIndexKeys(record.keys);
  } else {
    throw new Error('keys is required (object or shell document string).');
  }

  const database =
    typeof record.database === 'string' && record.database.trim() ? record.database.trim() : undefined;

  let options: MongoClassicIndexOptions | undefined;
  if (record.options && typeof record.options === 'object' && !Array.isArray(record.options)) {
    options = parseMongoShellIndexOptions(JSON.stringify(record.options));
  } else if (typeof record.options === 'string') {
    options = parseMongoShellIndexOptions(record.options);
  }

  return { database, collection, keys, options };
}

/**
 * Parses direct user commands such as:
 * - db.journalEntries.createIndex({ status: 1 })
 * - create index on journalEntries { status: 1 }
 * - create index on csv_to_atlas.journalEntries { status: 1 }
 */
export function parseDirectClassicIndexCommand(input: string): ParsedClassicIndexCommand | null {
  let text = input.trim();
  if (!text) return null;

  let database: string | undefined;
  const useMatch = text.match(USE_DB_PREFIX);
  if (useMatch?.[1]) {
    database = useMatch[1].trim().replace(/^['"`]+|['"`]+$/g, '');
    text = text.slice(useMatch[0].length).trim();
  }

  const shellMatch = text.match(DB_CREATE_INDEX_SHELL);
  if (shellMatch) {
    return {
      database,
      collection: shellMatch[1]!,
      keys: parseMongoShellIndexKeys(shellMatch[2]!),
      options: parseMongoShellIndexOptions(shellMatch[3]),
    };
  }

  const prefixedShell = text.match(
    /(?:create\s+(?:this\s+)?index\s*:?\s*)?db\.([a-zA-Z_][a-zA-Z0-9_]*)\.createIndex\s*\(\s*(\{[\s\S]*?\})/i,
  );
  if (prefixedShell) {
    return {
      database,
      collection: prefixedShell[1]!,
      keys: parseMongoShellIndexKeys(prefixedShell[2]!),
    };
  }

  const naturalMatch = text.match(
    /^create\s+(?:a\s+)?(?:classic\s+)?(?:b-?tree\s+)?index\s+on\s+([^\s{]+)\s+(\{[\s\S]*\})\s*$/i,
  );
  if (naturalMatch) {
    const target = naturalMatch[1]!.trim();
    const keys = parseMongoShellIndexKeys(naturalMatch[2]!);
    const dotParts = target.split('.');
    if (dotParts.length === 2) {
      return {
        database: dotParts[0],
        collection: dotParts[1]!,
        keys,
      };
    }
    return {
      database,
      collection: target.replace(/^['"`]+|['"`]+$/g, ''),
      keys,
    };
  }

  return null;
}
