import { describe, expect, it } from 'vitest';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';
import { DEFAULT_MANAGER_COST_INPUTS } from '../managerCostEstimate';
import { buildSchemaContextPayload } from './schemaContext';

const model: SqlStructuralModel = {
  source: 'test',
  tables: [
    {
      name: 'orders',
      columns: [
        { name: 'id', sqlType: 'BIGINT', bsonType: 'long', nullable: false, isPrimaryKey: true },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      rowCount: 0,
    },
  ],
  relationships: [],
};

const plan: MigrationPlan = {
  source: 'test',
  profileId: 'catalog',
  generatedAt: '2026-01-01',
  collections: [
    {
      name: 'orders',
      sourceTable: 'orders',
      mergedTables: ['orders'],
      idDerivation: { sourceColumns: ['id'], strategy: 'direct' },
      patterns: [],
      jsonSchema: { properties: {} },
      indexes: [],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    },
  ],
};

describe('buildSchemaContextPayload', () => {
  it('includes manager dataset scale override when slider is set', () => {
    const payload = buildSchemaContextPayload({
      model,
      plan,
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
      guardrailIssues: [],
      managerCostInputs: {
        ...DEFAULT_MANAGER_COST_INPUTS,
        estimatedDataGb: 512,
      },
    });

    expect(payload.datasetScale?.rawDataSource).toBe('manager-override');
    expect(payload.datasetScale?.managerRawDataGb).toBe(512);
    expect(payload.datasetScale?.rawDataGb).toBeCloseTo(512, 0);
    expect(payload.datasetScale?.recommendedTierLabel).toBeTruthy();
  });

  it('uses schema estimate when manager override is unset', () => {
    const payload = buildSchemaContextPayload({
      model: {
        ...model,
        tables: [{ ...model.tables[0]!, rowCount: 5_000_000 }],
      },
      plan,
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
      guardrailIssues: [],
      managerCostInputs: DEFAULT_MANAGER_COST_INPUTS,
    });

    expect(payload.datasetScale?.rawDataSource).toBe('schema-estimate');
    expect(payload.datasetScale?.managerRawDataGb).toBeNull();
    expect(payload.datasetScale?.rawDataGb).toBeGreaterThan(0);
  });
});
