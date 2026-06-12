import { describe, expect, it } from 'vitest';
import { generateFromPlan } from './generate.js';
import { REPOGEN_LANGUAGES } from './languages/index.js';
import type { MigrationPlan } from '../types.js';

const samplePlan: MigrationPlan = {
  source: 'test',
  profileId: 'catalog',
  generatedAt: new Date().toISOString(),
  telemetry: { readPercent: 80, writePercent: 20, peakRpm: 50000, growthRate: '1GB/month' },
  pool: { maxPoolSize: 50, minPoolSize: 5, socketTimeoutMS: 30000, maxIdleTimeMS: 60000 },
  writeConcern: { w: 1, journal: false },
  collections: [
    {
      name: 'products',
      sourceTable: 'products',
      mergedTables: [],
      idDerivation: { strategy: 'direct', columns: ['id'] },
      patterns: [],
      jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'name'],
        properties: {
          _id: { bsonType: 'string' },
          name: { bsonType: 'string' },
          totalReviews: { bsonType: 'int' },
          recentReviews: { bsonType: 'array' },
          brandId: { bsonType: 'string' },
        },
      },
      indexes: [{ keys: { name: 1 }, options: { name: 'name_1' }, reason: 'lookup by name' }],
      embeddedArrays: [
        {
          field: 'recentReviews',
          sourceTable: 'reviews',
          joinColumn: 'product_id',
          subsetLimit: 10,
          overflowCollection: 'reviews',
        },
      ],
      extendedReferences: [
        {
          field: 'brand',
          sourceTable: 'brands',
          viaColumn: 'brand_id',
          lookupColumns: ['name'],
        },
      ],
      computedFields: [{ field: 'totalReviews', description: 'review count', initialExpression: 'COUNT(*)' }],
      bucket: undefined,
    },
    {
      name: 'sensor_readings',
      sourceTable: 'sensor_readings',
      mergedTables: [],
      idDerivation: { strategy: 'bucket', columns: ['device_id', 'measured_at'] },
      patterns: [],
      jsonSchema: {
        bsonType: 'object',
        properties: {
          _id: { bsonType: 'string' },
          deviceId: { bsonType: 'string' },
          count: { bsonType: 'int' },
          measurements: { bsonType: 'array' },
        },
      },
      indexes: [],
      embeddedArrays: [],
      extendedReferences: [],
      computedFields: [],
      bucket: {
        groupByColumn: 'device_id',
        windowMinutes: 60,
        measurementsField: 'measurements',
      },
    },
  ],
};

describe('repogen multi-language', () => {
  it('exposes 13 MongoDB client languages', () => {
    expect(REPOGEN_LANGUAGES).toHaveLength(13);
    expect(REPOGEN_LANGUAGES.map((l) => l.id).sort()).toEqual(
      ['c', 'cpp', 'csharp', 'go', 'java', 'kotlin', 'node', 'php', 'python', 'ruby', 'rust', 'scala', 'swift'].sort(),
    );
  });

  for (const language of REPOGEN_LANGUAGES) {
    it(`generates client, indexes, and repositories for ${language.id}`, () => {
      const result = generateFromPlan({ plan: samplePlan, language: language.id });
      expect(result.language).toBe(language.id);
      expect(result.files.length).toBeGreaterThanOrEqual(4);
      const paths = result.files.map((f) => f.relativePath);
      expect(paths.some((p) => /client|mongo/i.test(p))).toBe(true);
      expect(paths.some((p) => /index/i.test(p))).toBe(true);
      expect(paths.some((p) => /product/i.test(p))).toBe(true);
      for (const file of result.files) {
        expect(file.content.length).toBeGreaterThan(50);
        expect(file.content.toLowerCase()).not.toContain('todo');
      }
    });
  }
});
