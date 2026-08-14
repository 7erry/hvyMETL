import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMigrationPlan } from '../design/patternSelector.js';
import { isDynamoMigrationPlanStale } from './dynamoPlanStale.js';
import { parseDynamoDbCloudFormationToModel } from './dynamodbCloudFormationParser.js';
import { WORKLOAD_PROFILES } from '../profiles/profiles.js';

const ECOMMERCE_CATALOG_TEMPLATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../examples/dynamodb/ecommerce-catalog-table.yaml'),
  'utf8',
);

describe('isDynamoMigrationPlanStale', () => {
  it('detects legacy GSI1PK field names in an older migration plan', () => {
    const model = parseDynamoDbCloudFormationToModel(ECOMMERCE_CATALOG_TEMPLATE);
    const stalePlan = buildMigrationPlan(
      {
        ...model,
        tables: [
          {
            ...model.tables[0]!,
            columns: model.tables[0]!.columns.map((column) => ({
              ...column,
              dynamoKeyRole: undefined,
              dynamoGsiName: undefined,
            })),
            dynamoDb: undefined,
          },
        ],
      },
      WORKLOAD_PROFILES.catalog,
    );

    expect(isDynamoMigrationPlanStale(model, stalePlan)).toBe(true);
  });

  it('returns false when the plan uses semantic DynamoDB field names', () => {
    const model = parseDynamoDbCloudFormationToModel(ECOMMERCE_CATALOG_TEMPLATE);
    const plan = buildMigrationPlan(model, WORKLOAD_PROFILES.catalog);
    expect(isDynamoMigrationPlanStale(model, plan)).toBe(false);
  });
});
