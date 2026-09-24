import { describe, expect, it } from 'vitest';
import type { CollectionPlan, MigrationPlan } from '../migrationPlanTypes';
import {
  flattenSchemaFields,
  jsonSchemaPropertyToDisplayType,
  schemaFieldsFromCollection,
} from './schemaFields';

function minimalCollection(overrides: Partial<CollectionPlan> & Pick<CollectionPlan, 'name'>): CollectionPlan {
  return {
    sourceTable: overrides.name,
    mergedTables: [overrides.name],
    idDerivation: { sourceColumns: ['id'], strategy: 'direct' },
    patterns: [],
    jsonSchema: { bsonType: 'object', properties: {} },
    indexes: [],
    embeddedArrays: [],
    extendedReferences: [],
    computedFields: [],
    ...overrides,
  };
}

describe('jsonSchemaPropertyToDisplayType', () => {
  it('formats array of objects', () => {
    expect(
      jsonSchemaPropertyToDisplayType({
        bsonType: 'array',
        items: { bsonType: 'object', properties: { sku: { bsonType: 'string' } } },
      }),
    ).toBe('array<object>');
  });

  it('formats nullable unions', () => {
    expect(jsonSchemaPropertyToDisplayType({ bsonType: ['string', 'null'] })).toBe('string | null');
  });
});

describe('schemaFieldsFromCollection', () => {
  it('builds nested object children', () => {
    const collection = minimalCollection({
      name: 'cars',
      jsonSchema: {
        bsonType: 'object',
        properties: {
          paint: {
            bsonType: 'object',
            properties: {
              colorName: { bsonType: 'string' },
              paintCode: { bsonType: ['string', 'null'] },
            },
          },
        },
      },
    });

    const fields = schemaFieldsFromCollection(collection);
    const paint = fields.find((f) => f.name === 'paint');
    expect(paint?.children).toHaveLength(2);
    expect(paint?.children?.map((c) => c.name)).toEqual(['colorName', 'paintCode']);
  });

  it('hydrates stub embed array items from sibling collection in plan', () => {
    const ordersCollection = minimalCollection({
      name: 'orders',
      jsonSchema: {
        bsonType: 'object',
        properties: {
          _id: { bsonType: 'objectId' },
          customerId: { bsonType: 'int' },
          total: { bsonType: 'double' },
        },
      },
    });

    const customers = minimalCollection({
      name: 'customers',
      embeddedArrays: [{ field: 'orders', sourceTable: 'orders', joinColumn: 'customer_id' }],
      jsonSchema: {
        bsonType: 'object',
        properties: {
          orders: {
            bsonType: 'array',
            items: { bsonType: 'object' },
          },
        },
      },
    });

    const plan: MigrationPlan = {
      source: 'test',
      profileId: 'catalog',
      generatedAt: '',
      collections: [customers, ordersCollection],
    };

    const fields = schemaFieldsFromCollection(customers, plan);
    const ordersField = fields.find((f) => f.name === 'orders');
    expect(ordersField?.tags).toContain('embed');
    expect(ordersField?.embedSourceTable).toBe('orders');
    expect(ordersField?.children?.map((c) => c.name).sort()).toEqual(['total']);
  });
});

describe('flattenSchemaFields', () => {
  it('preserves dot paths for nested fields', () => {
    const collection = minimalCollection({
      name: 'cars',
      jsonSchema: {
        bsonType: 'object',
        properties: {
          paint: {
            bsonType: 'object',
            properties: {
              colorName: { bsonType: 'string' },
            },
          },
        },
      },
    });

    const flat = flattenSchemaFields(schemaFieldsFromCollection(collection));
    expect(flat.some((r) => r.path === 'paint.colorName' && r.type === 'string')).toBe(true);
  });
});
