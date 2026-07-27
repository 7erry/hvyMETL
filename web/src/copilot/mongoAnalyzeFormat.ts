import {
  isAggregatePreviewTruncated,
  normalizeAggregateInspectPayload,
} from '../../../src/copilot/mongoAggregateFormat.ts';

export type MongoCompareRow = {
  aspect: string;
  status: 'match' | 'missing' | 'extra' | 'warn';
  planned: string;
  live: string;
  note?: string;
};

export type MongoAggregateRow = Record<string, string>;

export type MongoExplainView = {
  method: string;
  verbosity: string;
  winningStage?: string;
  indexName?: string;
  docsExamined?: number;
  docsReturned?: number;
  executionTimeMillis?: number;
};

export function readMongoCompareRows(data: unknown): {
  database: string;
  collection: string;
  rows: MongoCompareRow[];
  summary?: { matches: number; missing: number; extra: number; warnings: number };
} {
  if (!data || typeof data !== 'object') {
    return { database: '', collection: '', rows: [] };
  }
  const record = data as {
    database?: unknown;
    collection?: unknown;
    rows?: unknown;
    summary?: { matches?: number; missing?: number; extra?: number; warnings?: number };
  };
  const rows = Array.isArray(record.rows)
    ? record.rows.filter(
        (entry): entry is MongoCompareRow =>
          Boolean(entry && typeof entry === 'object' && typeof (entry as { aspect?: unknown }).aspect === 'string'),
      )
    : [];
  return {
    database: typeof record.database === 'string' ? record.database : '',
    collection: typeof record.collection === 'string' ? record.collection : '',
    rows,
    summary: record.summary,
  };
}

export function readMongoExplainView(data: unknown): MongoExplainView | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  return {
    method: typeof record.method === 'string' ? record.method : 'unknown',
    verbosity: typeof record.verbosity === 'string' ? record.verbosity : 'queryPlanner',
    winningStage: typeof record.winningStage === 'string' ? record.winningStage : undefined,
    indexName: typeof record.indexName === 'string' ? record.indexName : undefined,
    docsExamined: typeof record.docsExamined === 'number' ? record.docsExamined : undefined,
    docsReturned: typeof record.docsReturned === 'number' ? record.docsReturned : undefined,
    executionTimeMillis:
      typeof record.executionTimeMillis === 'number' ? record.executionTimeMillis : undefined,
  };
}

function flattenDocument(value: unknown, prefix = ''): Record<string, string> {
  if (value === null || value === undefined) return { [prefix || 'value']: String(value) };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { [prefix || 'value']: JSON.stringify(value) };
  }

  const entries: Record<string, string> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(entries, flattenDocument(nested, path));
    } else {
      entries[path] = Array.isArray(nested) || typeof nested === 'object' ? JSON.stringify(nested) : String(nested);
    }
  }
  return entries;
}

export function readMongoAggregateRows(data: unknown): {
  totalCount: number;
  returnedCount: number;
  rows: MongoAggregateRow[];
  columns: string[];
  appliedLimits: string[];
  previewTruncated: boolean;
  hasMoreThanReturned: boolean;
} {
  if (!data || typeof data !== 'object') {
    return {
      totalCount: 0,
      returnedCount: 0,
      rows: [],
      columns: [],
      appliedLimits: [],
      previewTruncated: false,
      hasMoreThanReturned: false,
    };
  }

  const record = data as Record<string, unknown>;
  const normalized = normalizeAggregateInspectPayload({
    count: record.count,
    documents: record.documents,
    appliedLimits: record.appliedLimits,
    results: record.results,
    result: record.result,
  });

  const rows = normalized.documents.map((document) => flattenDocument(document));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12);
  const returnedCount = normalized.documents.length;
  const totalCount = normalized.count;

  return {
    totalCount,
    returnedCount,
    rows,
    columns,
    appliedLimits: normalized.appliedLimits,
    previewTruncated: isAggregatePreviewTruncated(normalized),
    hasMoreThanReturned: totalCount > returnedCount,
  };
}

/** Read find query document rows from an inspect tool payload. */
export function readMongoFindRows(data: unknown): {
  database: string;
  collection: string;
  totalCount: number;
  returnedCount: number;
  rows: MongoAggregateRow[];
  columns: string[];
  previewTruncated: boolean;
  hasMoreThanReturned: boolean;
} {
  const empty = {
    database: '',
    collection: '',
    totalCount: 0,
    returnedCount: 0,
    rows: [] as MongoAggregateRow[],
    columns: [] as string[],
    previewTruncated: false,
    hasMoreThanReturned: false,
  };
  if (!data || typeof data !== 'object') return empty;

  const record = data as Record<string, unknown>;
  const database = typeof record.database === 'string' ? record.database : '';
  const collection = typeof record.collection === 'string' ? record.collection : '';
  const totalMatchedCount =
    typeof record.totalMatchedCount === 'number' && Number.isFinite(record.totalMatchedCount)
      ? record.totalMatchedCount
      : undefined;

  const normalized = normalizeAggregateInspectPayload(record.result ?? record);
  const resultMeta =
    record.result && typeof record.result === 'object'
      ? (record.result as { queryResultsCount?: number })
      : {};
  const returnedCount =
    typeof resultMeta.queryResultsCount === 'number' && Number.isFinite(resultMeta.queryResultsCount)
      ? resultMeta.queryResultsCount
      : normalized.documents.length;
  const totalCount = totalMatchedCount ?? normalized.count ?? returnedCount;

  const rows = normalized.documents.map((document) => flattenDocument(document));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12);

  return {
    database,
    collection,
    totalCount,
    returnedCount,
    rows,
    columns,
    previewTruncated: isAggregatePreviewTruncated(normalized),
    hasMoreThanReturned: totalCount > returnedCount,
  };
}
