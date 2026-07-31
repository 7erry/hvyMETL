import type { MongoSchemaFieldRow } from '../../../src/copilot/mongoSchemaFormat.ts';
import type { MigrationPlan } from '../migrationPlanTypes';
import { fieldsForCollection } from '../migrationPlanDisplay';

/** Merge migration-plan field types into MCP-inferred schema rows for one collection. */
export function enrichSchemaFieldRowsFromPlan(
  inferred: MongoSchemaFieldRow[],
  plan: MigrationPlan | null | undefined,
  collectionName: string,
): MongoSchemaFieldRow[] {
  const collectionPlan = plan?.collections.find(
    (entry) => entry.name === collectionName || entry.sourceTable === collectionName,
  );
  if (!collectionPlan) return inferred;

  const planRows = fieldsForCollection(collectionPlan);
  const planTypeByField = new Map(planRows.map((row) => [row.name, row.bsonType]));
  const seenPaths = new Set<string>();

  const merged = inferred.map((field) => {
    seenPaths.add(field.path);
    const planType = planTypeByField.get(field.path);
    if (planType && planType !== 'unknown' && field.types.trim().toLowerCase() === 'unknown') {
      return { path: field.path, types: planType };
    }
    return field;
  });

  for (const row of planRows) {
    if (seenPaths.has(row.name)) continue;
    merged.push({ path: row.name, types: row.bsonType });
  }

  return merged.sort((left, right) => left.path.localeCompare(right.path));
}
