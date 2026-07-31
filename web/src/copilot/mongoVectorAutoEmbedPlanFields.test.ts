import { describe, expect, it } from 'vitest';
import type { MigrationPlan } from '../migrationPlanTypes';
import { enrichSchemaFieldRowsFromPlan } from './mongoVectorAutoEmbedPlanFields';

const productsPlan: MigrationPlan = {
  source: 'test',
  profileId: 'catalog',
  generatedAt: '2026-01-01T00:00:00.000Z',
  collections: [
    {
      name: 'products',
      sourceTable: 'products',
      mergedTables: ['products'],
      idDerivation: { sourceColumns: ['product_id'], strategy: 'direct' },
      patterns: [],
      jsonSchema: {
        properties: {
          description: { bsonType: ['string', 'null'] },
          productName: { bsonType: 'string' },
        },
      },
      indexes: [],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    },
  ],
};

describe('enrichSchemaFieldRowsFromPlan', () => {
  it('replaces unknown inferred types with migration-plan types', () => {
    const rows = enrichSchemaFieldRowsFromPlan(
      [{ path: 'description', types: 'unknown' }],
      productsPlan,
      'products',
    );
    expect(rows.find((field) => field.path === 'description')).toEqual({
      path: 'description',
      types: 'string | null',
    });
  });

  it('adds plan fields missing from MCP inference', () => {
    expect(
      enrichSchemaFieldRowsFromPlan([], productsPlan, 'products').some(
        (field) => field.path === 'description' && field.types === 'string | null',
      ),
    ).toBe(true);
  });
});
