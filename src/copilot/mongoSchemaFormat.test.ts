import { describe, expect, it } from 'vitest';
import {
  flattenAnalyzerSchemaFields,
  flattenInferredSchemaFields,
  mergeInferredSchemaWithPlan,
  normalizeCollectionSchemaPayload,
} from './mongoSchemaFormat.js';

describe('mongoSchemaFormat', () => {
  it('flattens top-level schema properties', () => {
    expect(
      flattenInferredSchemaFields({
        properties: {
          status: { bsonType: 'string' },
          count: { bsonType: 'int' },
        },
      }),
    ).toEqual([
      { path: 'count', types: 'int' },
      { path: 'status', types: 'string' },
    ]);
  });

  it('flattens nested objects and array item types', () => {
    expect(
      flattenInferredSchemaFields({
        properties: {
          meta: {
            bsonType: 'object',
            properties: {
              source: { bsonType: 'string' },
            },
          },
          tags: {
            bsonType: 'array',
            items: { bsonType: 'string' },
          },
        },
      }),
    ).toEqual([
      { path: 'meta', types: 'object' },
      { path: 'meta.source', types: 'string' },
      { path: 'tags', types: 'array<string>' },
    ]);
  });

  it('flattens nullable string fields from anyOf branches', () => {
    expect(
      flattenInferredSchemaFields({
        properties: {
          description: {
            anyOf: [{ bsonType: 'string' }, { bsonType: 'null' }],
          },
        },
      }),
    ).toEqual([{ path: 'description', types: 'string | null' }]);
  });

  it('normalizes MCP collection-schema payloads', () => {
    expect(
      normalizeCollectionSchemaPayload('csv_to_atlas', 'sensors', {
        schema: { properties: { status: { bsonType: 'string' } } },
        fieldsCount: 1,
      }),
    ).toEqual({
      database: 'csv_to_atlas',
      collection: 'sensors',
      fieldsCount: 1,
      fields: [{ path: 'status', types: 'string' }],
    });
  });

  it('merges migration-plan types when MCP inference returns unknown', () => {
    const planSchema = {
      bsonType: 'object',
      properties: {
        vin: { bsonType: 'string' },
        paint: {
          bsonType: 'object',
          properties: {
            colorName: { bsonType: 'string' },
          },
        },
      },
    };
    expect(
      normalizeCollectionSchemaPayload(
        'cars',
        'cars',
        {
          schema: {
            properties: {
              vin: {},
              paint: {},
            },
          },
        },
        planSchema,
      ).fields,
    ).toEqual([
      { path: 'paint', types: 'object' },
      { path: 'paint.colorName', types: 'string' },
      { path: 'vin', types: 'string' },
    ]);
  });

  it('flattens analyzer fields payloads', () => {
    expect(
      flattenAnalyzerSchemaFields([
        { path: ['paint', 'colorName'], types: [{ bsonType: 'String' }] },
        { path: ['vin'], types: [{ bsonType: 'String' }] },
      ]),
    ).toEqual([
      { path: 'paint.colorName', types: 'string' },
      { path: 'vin', types: 'string' },
    ]);
  });

  it('mergeInferredSchemaWithPlan prefers plan types for unknown paths', () => {
    expect(
      mergeInferredSchemaWithPlan(
        [{ path: 'name', types: 'unknown' }],
        [{ path: 'name', types: 'string' }],
      ),
    ).toEqual([{ path: 'name', types: 'string' }]);
  });
});
