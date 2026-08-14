import type { MigrationPlan, SqlStructuralModel } from '../types.js';
import { mongoFieldNameForColumn } from './mongoFieldNaming.js';
import { toCamelCase } from './naming.js';

const LEGACY_DYNAMO_FIELD = /^(pK|sK|gSI\d+PK|gSI\d+SK)$/i;

/** True when a DynamoDB source model expects semantic MongoDB fields but the plan still has GSI1PK-style names. */
export function isDynamoMigrationPlanStale(model: SqlStructuralModel, plan: MigrationPlan | null): boolean {
  const dynamoTable = model.tables.find((table) => table.dynamoDb);
  if (!dynamoTable || !plan) return false;

  const collection =
    plan.collections.find((entry) => entry.sourceTable === dynamoTable.name)
    ?? plan.collections.find((entry) => entry.name === toCamelCase(dynamoTable.name));
  if (!collection) return false;

  const properties = (collection.jsonSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const actualFields = Object.keys(properties).filter((name) => name !== '_id' && name !== 'schemaVersion');
  const expectedFields = dynamoTable.columns
    .filter((column) => !(column.isPrimaryKey && dynamoTable.primaryKey.length === 1))
    .map((column) => mongoFieldNameForColumn(column));

  const hasLegacyNames = actualFields.some((field) => LEGACY_DYNAMO_FIELD.test(field));
  const missingExpected = expectedFields.some((field) => !actualFields.includes(field));
  return hasLegacyNames || missingExpected;
}
