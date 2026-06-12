/**
 * Map migration-plan collections into critic-ready schema candidates.
 */

import type { CollectionPlan, SqlStructuralModel } from '../types.js';
import type { SchemaCandidate } from './types.js';

/** Walk a JSON Schema object and return maximum nesting depth. */
export function measureJsonSchemaDepth(schema: unknown, depth = 0): number {
  if (schema === null || typeof schema !== 'object') return depth;

  if (Array.isArray(schema)) {
    return schema.reduce((max, item) => Math.max(max, measureJsonSchemaDepth(item, depth + 1)), depth);
  }

  const record = schema as Record<string, unknown>;
  let maxDepth = depth;

  for (const [key, value] of Object.entries(record)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        maxDepth = Math.max(maxDepth, measureJsonSchemaDepth(nested, depth + 1));
      }
      continue;
    }
    if (key === 'items' || key === 'additionalProperties') {
      maxDepth = Math.max(maxDepth, measureJsonSchemaDepth(value, depth + 1));
      continue;
    }
    maxDepth = Math.max(maxDepth, measureJsonSchemaDepth(value, depth));
  }

  return maxDepth;
}

/** True when the collection plan embeds arrays (subset, bucket measurements, etc.). */
export function collectionHasArrays(plan: CollectionPlan): boolean {
  return (
    plan.embeddedArrays.length > 0 ||
    Boolean(plan.bucket?.measurementsField) ||
    Boolean(plan.singleCollection?.linksField)
  );
}

/** Heuristic: very large cardinality + high RPM plans often target sharded topologies. */
export function inferIsSharded(plan: CollectionPlan, sourceRowCount: number, peakRpm: number): boolean {
  return sourceRowCount >= 5_000_000 || peakRpm >= 300_000 || Boolean(plan.bucket);
}

/** Build one SchemaCandidate per collection in a migration plan. */
export function toSchemaCandidates(
  collections: CollectionPlan[],
  model: SqlStructuralModel,
  peakRpm: number,
): SchemaCandidate[] {
  const rowCountByTable = new Map(model.tables.map((table) => [table.name, table.rowCount]));

  return collections.map((plan) => {
    const sourceRowCount = rowCountByTable.get(plan.sourceTable) ?? 0;
    return {
      collectionName: plan.name,
      nestingDepth: measureJsonSchemaDepth(plan.jsonSchema),
      hasArrays: collectionHasArrays(plan),
      indexCount: plan.indexes.length,
      isSharded: inferIsSharded(plan, sourceRowCount, peakRpm),
      sourceRowCount,
      plan,
    };
  });
}
