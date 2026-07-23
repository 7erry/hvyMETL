import { describe, expect, it } from 'vitest';
import { compareCollectionToPlan } from './mongoAnalyzeComparison.js';
import type { MongoPlanContextCollection } from './mongoPlanContext.js';

const plan: MongoPlanContextCollection = {
  name: 'orders',
  sourceTable: 'orders',
  topLevelFields: ['customerId', 'orderDate', 'status'],
  embeddedFields: ['orderItems'],
  indexKeys: ['customerId:1', 'status:1,orderDate:-1'],
};

describe('compareCollectionToPlan', () => {
  it('flags missing planned fields and indexes against live Atlas shape', () => {
    const comparison = compareCollectionToPlan({
      database: 'myshop',
      collection: 'orders',
      plan,
      schemaPayload: {
        schema: {
          properties: {
            customerId: { bsonType: 'string' },
            status: { bsonType: 'string' },
          },
        },
      },
      indexesPayload: {
        classicIndexes: [{ name: 'customerId_1', key: { customerId: 1 } }],
      },
      documentCount: 12,
    });

    expect(comparison.summary.missing).toBeGreaterThan(0);
    expect(comparison.rows.some((row) => row.status === 'missing' && row.planned === 'orderDate')).toBe(true);
    expect(comparison.rows.some((row) => row.aspect.startsWith('embed:') && row.planned === 'orderItems')).toBe(true);
  });

  it('warns when no migration plan is loaded', () => {
    const comparison = compareCollectionToPlan({
      database: 'myshop',
      collection: 'orders',
      schemaPayload: { schema: { properties: { status: { bsonType: 'string' } } } },
      indexesPayload: { classicIndexes: [] },
    });

    expect(comparison.rows[0]?.status).toBe('warn');
  });
});
