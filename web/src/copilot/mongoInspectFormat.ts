import {
  flattenInferredSchemaFields,
  type MongoCollectionSchemaSummary,
} from '../../../src/copilot/mongoSchemaFormat.ts';

export function formatInspectBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatInspectCount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString();
}

export function formatInspectStorageSize(size: number | undefined, units: string | undefined): string {
  if (size === undefined || !Number.isFinite(size)) return '—';
  const normalizedUnits = units?.trim() || 'bytes';
  const digits = size >= 100 ? 0 : 1;
  return `${size.toFixed(digits)} ${normalizedUnits}`;
}

export type MongoInspectDatabaseRow = {
  name: string;
  size?: number;
};

export type MongoInspectCollectionRow = {
  name: string;
  documentCount?: number;
  storageSize?: number;
  storageSizeUnits?: string;
  indexCount?: number;
};

export type MongoInspectClassicIndexRow = {
  name: string;
  key: Record<string, unknown>;
};

export type MongoInspectSearchIndexRow = {
  name: string;
  type: string;
  status: string;
  queryable: boolean;
};

export type MongoInspectIndexSummary = {
  database: string;
  collection: string;
  classicIndexes: MongoInspectClassicIndexRow[];
  searchIndexes: MongoInspectSearchIndexRow[];
  totalCount: number;
};

/** Format a classic index key object for display, e.g. `{ status: 1, createdAt: -1 }`. */
export function formatInspectIndexKey(key: Record<string, unknown> | undefined): string {
  if (!key || typeof key !== 'object') return '—';
  const entries = Object.entries(key).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return '—';
  return entries.map(([field, direction]) => `${field}: ${String(direction)}`).join(', ');
}

export function readMongoInspectIndexRows(data: unknown): MongoInspectIndexSummary {
  const empty: MongoInspectIndexSummary = {
    database: 'database',
    collection: 'collection',
    classicIndexes: [],
    searchIndexes: [],
    totalCount: 0,
  };
  if (!data || typeof data !== 'object') return empty;

  const record = data as {
    database?: unknown;
    collection?: unknown;
    classicIndexes?: unknown;
    searchIndexes?: unknown;
    totalCount?: unknown;
  };
  const database = typeof record.database === 'string' ? record.database : empty.database;
  const collection = typeof record.collection === 'string' ? record.collection : empty.collection;

  const classicIndexes = Array.isArray(record.classicIndexes)
    ? record.classicIndexes.filter(
        (entry): entry is MongoInspectClassicIndexRow =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              typeof (entry as { name?: unknown }).name === 'string' &&
              (entry as { key?: unknown }).key &&
              typeof (entry as { key?: unknown }).key === 'object',
          ),
      )
    : [];

  const searchIndexes = Array.isArray(record.searchIndexes)
    ? record.searchIndexes.filter(
        (entry): entry is MongoInspectSearchIndexRow =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              typeof (entry as { name?: unknown }).name === 'string' &&
              typeof (entry as { type?: unknown }).type === 'string' &&
              typeof (entry as { status?: unknown }).status === 'string' &&
              typeof (entry as { queryable?: unknown }).queryable === 'boolean',
          ),
      )
    : [];

  const totalCount =
    typeof record.totalCount === 'number' && Number.isFinite(record.totalCount)
      ? record.totalCount
      : classicIndexes.length + searchIndexes.length;

  return { database, collection, classicIndexes, searchIndexes, totalCount };
}

export function readMongoInspectDatabaseRows(data: unknown): MongoInspectDatabaseRow[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as { databases?: unknown };
  if (!Array.isArray(record.databases)) return [];
  return record.databases.filter(
    (entry): entry is MongoInspectDatabaseRow =>
      Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string'),
  );
}

export type MongoInspectSchemaFieldRow = MongoCollectionSchemaSummary['fields'][number];

export type MongoInspectSchemaSummary = MongoCollectionSchemaSummary;

/** Read normalized collection schema rows from an inspect tool payload. */
export function readMongoInspectSchemaSummary(data: unknown): MongoInspectSchemaSummary {
  const empty: MongoInspectSchemaSummary = {
    database: 'database',
    collection: 'collection',
    fieldsCount: 0,
    fields: [],
  };
  if (!data || typeof data !== 'object') return empty;

  const record = data as {
    database?: unknown;
    collection?: unknown;
    fieldsCount?: unknown;
    fields?: unknown;
    result?: unknown;
  };

  if (Array.isArray(record.fields)) {
    const fields = record.fields.filter(
      (entry): entry is MongoInspectSchemaFieldRow =>
        Boolean(
          entry &&
            typeof entry === 'object' &&
            typeof (entry as { path?: unknown }).path === 'string' &&
            typeof (entry as { types?: unknown }).types === 'string',
        ),
    );
    return {
      database: typeof record.database === 'string' ? record.database : empty.database,
      collection: typeof record.collection === 'string' ? record.collection : empty.collection,
      fieldsCount:
        typeof record.fieldsCount === 'number' && Number.isFinite(record.fieldsCount)
          ? record.fieldsCount
          : fields.length,
      fields,
    };
  }

  if (record.result && typeof record.result === 'object') {
    const legacy = record.result as { schema?: unknown; fieldsCount?: unknown };
    const fields = flattenInferredSchemaFields(legacy.schema);
    return {
      database: typeof record.database === 'string' ? record.database : empty.database,
      collection: typeof record.collection === 'string' ? record.collection : empty.collection,
      fieldsCount:
        typeof legacy.fieldsCount === 'number' && Number.isFinite(legacy.fieldsCount)
          ? legacy.fieldsCount
          : fields.length,
      fields,
    };
  }

  return empty;
}

export function readMongoInspectCollectionRows(data: unknown): { database: string; collections: MongoInspectCollectionRow[] } {
  if (!data || typeof data !== 'object') return { database: 'database', collections: [] };
  const record = data as { database?: unknown; collections?: unknown };
  const database = typeof record.database === 'string' ? record.database : 'database';
  if (!Array.isArray(record.collections)) return { database, collections: [] };
  const collections = record.collections.filter(
    (entry): entry is MongoInspectCollectionRow =>
      Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string'),
  );
  return { database, collections };
}
