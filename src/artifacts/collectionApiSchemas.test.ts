import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import {
  bsonSchemaToJsonSchema,
  buildCollectionOpenApiDocument,
  buildCollectionValidatorDocument,
  writeCollectionApiArtifacts,
} from './collectionApiSchemas.js';
import type { MigrationPlan } from '../types.js';

const samplePlan: MigrationPlan = {
  source: 'test',
  profileId: 'catalog',
  generatedAt: '2026-06-11T00:00:00.000Z',
  telemetry: { readPercent: 80, writePercent: 20, peakRpm: 50000, growthRate: '1GB/month' },
  pool: { maxPoolSize: 50, minPoolSize: 5, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
  writeConcern: { w: 1, journal: false },
  readPreference: 'primary',
  compression: 'snappy',
  collections: [
    {
      name: 'products',
      sourceTable: 'products',
      mergedTables: ['products'],
      idDerivation: { strategy: 'direct', sourceColumns: ['id'] },
      patterns: [],
      jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'name'],
        properties: {
          _id: { bsonType: 'string' },
          name: { bsonType: 'string' },
          totalReviews: { bsonType: 'long' },
          recentReviews: {
            bsonType: 'array',
            items: {
              bsonType: 'object',
              properties: { rating: { bsonType: 'int' }, comment: { bsonType: ['string', 'null'] } },
            },
          },
          brandId: { bsonType: 'string' },
        },
      },
      indexes: [{ keys: { name: 1 }, options: { name: 'name_1' }, reason: 'lookup by name' }],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
    },
  ],
};

function assertOpenApiShape(doc: Record<string, unknown>): void {
  expect(doc.openapi).toBe('3.0.3');
  expect(doc.info).toBeTruthy();
  expect(doc.paths).toBeTruthy();
  expect(doc.components).toBeTruthy();
  const paths = doc.paths as Record<string, unknown>;
  expect(Object.keys(paths).length).toBeGreaterThan(0);
}

describe('collectionApiSchemas', () => {
  it('converts BSON types to JSON Schema', () => {
    const converted = bsonSchemaToJsonSchema(samplePlan.collections[0].jsonSchema);
    expect(converted.type).toBe('object');
    const properties = converted.properties as Record<string, Record<string, unknown>>;
    expect(properties._id.type).toBe('string');
    expect(properties.totalReviews.type).toBe('integer');
    expect(properties.recentReviews.type).toBe('array');
    const comment = (properties.recentReviews.items as { properties: Record<string, unknown> }).properties
      .comment as Record<string, unknown>;
    expect(comment.nullable).toBe(true);
  });

  it('builds MongoDB validator wrapper with $jsonSchema', () => {
    const validator = buildCollectionValidatorDocument(samplePlan.collections[0], samplePlan);
    expect(validator.collection).toBe('products');
    expect((validator.validator as { $jsonSchema: unknown }).$jsonSchema).toEqual(samplePlan.collections[0].jsonSchema);
    expect(validator.validationLevel).toBe('moderate');
  });

  it('builds per-collection OpenAPI with CRUD paths', () => {
    const openApi = buildCollectionOpenApiDocument(samplePlan.collections[0], samplePlan);
    assertOpenApiShape(openApi);
    const paths = openApi.paths as Record<string, Record<string, unknown>>;
    expect(paths['/products'].get).toBeTruthy();
    expect(paths['/products'].post).toBeTruthy();
    expect(paths['/products/{id}'].delete).toBeTruthy();
  });

  it('writes schema and openapi files for each collection', () => {
    const outDir = join(process.cwd(), 'out', 'collection-artifacts-test');
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const result = writeCollectionApiArtifacts(outDir, samplePlan);
    expect(result.perCollection).toHaveLength(1);
    expect(readFileSync(result.perCollection[0].schemaPath, 'utf8')).toContain('$jsonSchema');
    const openApi = JSON.parse(readFileSync(result.perCollection[0].openApiPath, 'utf8')) as Record<string, unknown>;
    assertOpenApiShape(openApi);
    const combined = JSON.parse(readFileSync(result.combinedOpenApiPath, 'utf8')) as Record<string, unknown>;
    assertOpenApiShape(combined);

    rmSync(outDir, { recursive: true, force: true });
  });
});
