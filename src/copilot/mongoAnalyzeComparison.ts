/**
 * Compare live Atlas collection shape against the hvyMETL migration plan.
 */

import type { MongoPlanContext, MongoPlanContextCollection } from './mongoPlanContext.js';

export type MongoCompareRowStatus = 'match' | 'missing' | 'extra' | 'warn';

export type MongoCompareRow = {
  aspect: string;
  status: MongoCompareRowStatus;
  planned: string;
  live: string;
  note?: string;
};

export type MongoCollectionComparison = {
  database: string;
  collection: string;
  planCollectionName?: string;
  planSourceTable?: string;
  documentCount?: number;
  rows: MongoCompareRow[];
  summary: {
    matches: number;
    missing: number;
    extra: number;
    warnings: number;
  };
};

const IGNORED_LIVE_FIELDS = new Set(['_id', 'schemaVersion', '__v']);

function indexKeySignature(key: Record<string, unknown> | undefined): string {
  if (!key || typeof key !== 'object') return '';
  return Object.entries(key)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, direction]) => `${field}:${direction}`)
    .join(',');
}

function readClassicIndexKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as { classicIndexes?: unknown };
  if (!Array.isArray(record.classicIndexes)) return [];
  return record.classicIndexes
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      return indexKeySignature((entry as { key?: Record<string, unknown> }).key);
    })
    .filter(Boolean)
    .sort();
}

function readLiveTopLevelFields(schemaPayload: unknown): string[] {
  if (!schemaPayload || typeof schemaPayload !== 'object') return [];
  const record = schemaPayload as { schema?: unknown };
  const schema = record.schema;
  if (!schema || typeof schema !== 'object') return [];

  const root = schema as Record<string, unknown>;
  if (root.properties && typeof root.properties === 'object') {
    return Object.keys(root.properties as Record<string, unknown>).sort();
  }

  return Object.keys(root)
    .filter((key) => !key.startsWith('_'))
    .sort();
}

function compareFieldSets(
  rows: MongoCompareRow[],
  aspectPrefix: string,
  planned: string[],
  live: string[],
  ignoredLive: Set<string> = new Set(),
): void {
  const plannedSet = new Set(planned);
  const liveFiltered = live.filter((field) => !ignoredLive.has(field));
  const liveSet = new Set(liveFiltered);

  for (const field of planned) {
    rows.push({
      aspect: `${aspectPrefix}: ${field}`,
      status: liveSet.has(field) ? 'match' : 'missing',
      planned: field,
      live: liveSet.has(field) ? field : '—',
      note: liveSet.has(field) ? undefined : 'Expected from migration plan but not inferred in Atlas sample',
    });
  }

  for (const field of liveFiltered) {
    if (plannedSet.has(field)) continue;
    rows.push({
      aspect: `${aspectPrefix}: ${field}`,
      status: 'extra',
      planned: '—',
      live: field,
      note: 'Present in Atlas sample but not listed in migration plan top-level fields',
    });
  }
}

function compareIndexes(rows: MongoCompareRow[], plannedKeys: string[], liveKeys: string[]): void {
  const plannedSet = new Set(plannedKeys);
  const liveSet = new Set(liveKeys);

  for (const key of plannedKeys) {
    rows.push({
      aspect: `index: ${key}`,
      status: liveSet.has(key) ? 'match' : 'missing',
      planned: key,
      live: liveSet.has(key) ? key : '—',
      note: liveSet.has(key) ? undefined : 'Planned index keys not found on Atlas collection',
    });
  }

  for (const key of liveKeys) {
    if (plannedSet.has(key)) continue;
    rows.push({
      aspect: `index: ${key}`,
      status: 'extra',
      planned: '—',
      live: key,
      note: 'Atlas index not declared in migration plan',
    });
  }
}

function summarizeRows(rows: MongoCompareRow[]): MongoCollectionComparison['summary'] {
  return rows.reduce(
    (acc, row) => {
      if (row.status === 'match') acc.matches += 1;
      if (row.status === 'missing') acc.missing += 1;
      if (row.status === 'extra') acc.extra += 1;
      if (row.status === 'warn') acc.warnings += 1;
      return acc;
    },
    { matches: 0, missing: 0, extra: 0, warnings: 0 },
  );
}

/** Build structured plan-vs-Atlas comparison rows for one collection. */
export function compareCollectionToPlan(input: {
  database: string;
  collection: string;
  plan?: MongoPlanContextCollection;
  schemaPayload: unknown;
  indexesPayload: unknown;
  documentCount?: number;
}): MongoCollectionComparison {
  const liveFields = readLiveTopLevelFields(input.schemaPayload);
  const liveIndexKeys = readClassicIndexKeys(input.indexesPayload);
  const rows: MongoCompareRow[] = [];

  if (!input.plan) {
    rows.push({
      aspect: 'migration plan',
      status: 'warn',
      planned: '—',
      live: input.collection,
      note: 'No migration plan loaded — run Refresh design before comparing to planned fields and indexes',
    });
  } else {
    compareFieldSets(rows, 'field', input.plan.topLevelFields, liveFields, IGNORED_LIVE_FIELDS);
    compareFieldSets(rows, 'embed', input.plan.embeddedFields, liveFields, IGNORED_LIVE_FIELDS);
    compareIndexes(rows, input.plan.indexKeys, liveIndexKeys);

    if (input.documentCount === 0) {
      rows.push({
        aspect: 'documents',
        status: 'warn',
        planned: 'imported rows',
        live: '0',
        note: 'Collection exists but has no documents yet',
      });
    }
  }

  const summary = summarizeRows(rows);
  return {
    database: input.database,
    collection: input.collection,
    planCollectionName: input.plan?.name,
    planSourceTable: input.plan?.sourceTable,
    documentCount: input.documentCount,
    rows,
    summary,
  };
}
