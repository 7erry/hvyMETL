/** mongosh scripts for Aggregation Builder live runs (Shell runner). */

export const AGGREGATE_RESULT_LIMIT = 200;

/**
 * Live aggregate against a picked DB/collection.
 * Uses getSiblingDB so URI path / mongosh default DB cannot override the pick
 * (same quirk as Shell list-collections; dbName is also passed to the runner).
 */
export function buildAggregateScript(
  database: string,
  collection: string,
  pipeline: Record<string, unknown>[],
  limit: number = AGGREGATE_RESULT_LIMIT,
): string {
  const dbName = database.trim();
  const coll = collection.trim();
  if (!dbName) throw new Error('Database name is required.');
  if (!coll) throw new Error('Collection name is required.');
  const cappedLimit = Math.max(1, Math.floor(limit));
  // shortcut: UI caps rows for preview; raise AGGREGATE_RESULT_LIMIT if users need more
  const capped = [...pipeline, { $limit: cappedLimit }];
  return `print(EJSON.stringify(db.getSiblingDB(${JSON.stringify(dbName)}).getCollection(${JSON.stringify(coll)}).aggregate(${JSON.stringify(capped)}).toArray()));`;
}

/** Stages up to and including `throughStageId` (or all when null). */
export function stagesThrough<T extends { id: string }>(
  stages: T[],
  throughStageId: string | null,
): T[] {
  if (!throughStageId) return stages;
  const idx = stages.findIndex((s) => s.id === throughStageId);
  if (idx < 0) return stages;
  return stages.slice(0, idx + 1);
}

/** Stages strictly before `throughStageId` (empty when null / first). */
export function stagesBefore<T extends { id: string }>(
  stages: T[],
  throughStageId: string | null,
): T[] {
  if (!throughStageId) return [];
  const idx = stages.findIndex((s) => s.id === throughStageId);
  if (idx < 0) return stages;
  return stages.slice(0, idx);
}
