import type { CollectionPlan, MigrationPlan } from './migrationPlanTypes';

/** Ensure optional migration-plan arrays exist so UI code does not throw on partial plans. */
export function normalizeCollectionPlan(collection: CollectionPlan): CollectionPlan {
  return {
    ...collection,
    mergedTables: collection.mergedTables ?? [collection.sourceTable],
    patterns: collection.patterns ?? [],
    indexes: collection.indexes ?? [],
    embeddedArrays: collection.embeddedArrays ?? [],
    extendedReferences: collection.extendedReferences ?? [],
    computedFields: collection.computedFields ?? [],
    idDerivation: collection.idDerivation ?? { strategy: 'direct', sourceColumns: ['_id'] },
    jsonSchema: collection.jsonSchema ?? { bsonType: 'object', properties: {} },
  };
}

/** Normalize every collection on a parsed migration plan. */
export function normalizeMigrationPlan(plan: MigrationPlan): MigrationPlan {
  return {
    ...plan,
    collections: plan.collections.map(normalizeCollectionPlan),
  };
}
