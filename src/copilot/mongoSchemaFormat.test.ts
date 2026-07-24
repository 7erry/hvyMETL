import { describe, expect, it } from 'vitest';
import { flattenInferredSchemaFields, normalizeCollectionSchemaPayload } from './mongoSchemaFormat.js';

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
});
