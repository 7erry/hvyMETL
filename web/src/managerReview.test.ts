import { describe, expect, it } from 'vitest';
import type { MigrationPlan } from './migrationPlanTypes';
import {
  acceptAllCollectionReviews,
  acceptCollectionReview,
  buildCollectionReviewItems,
  buildRecommendationsForCollection,
  collectionHasReviewFlags,
  collectionRequiresReview,
} from './managerReview';

const planGeneratedAt = '2026-06-11T12:00:00.000Z';

const embedCollection = {
  name: 'users',
  sourceTable: 'users',
  mergedTables: ['users', 'usermeta'],
  idDerivation: { sourceColumns: ['id'], strategy: 'direct' as const },
  patterns: [
    {
      pattern: 'embed' as const,
      target: 'users',
      reason: 'Low-cardinality child table fits in parent document.',
      knowledgeSource: 'test',
    },
  ],
  jsonSchema: { properties: {} },
  indexes: [],
  embeddedArrays: [{ field: 'meta', sourceTable: 'usermeta', joinColumn: 'user_id' }],
  extendedReferences: [],
  computedFields: [],
};

const simplePlan: MigrationPlan = {
  source: 'test',
  profileId: 'catalog',
  generatedAt: planGeneratedAt,
  collections: [
    embedCollection,
    {
      name: 'posts',
      sourceTable: 'posts',
      mergedTables: ['posts'],
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

describe('managerReview', () => {
  it('flags collections with embeds and complex patterns', () => {
    expect(collectionHasReviewFlags(embedCollection)).toBe(true);
    expect(collectionHasReviewFlags(simplePlan.collections[1])).toBe(false);
  });

  it('builds human-readable recommendations', () => {
    const recs = buildRecommendationsForCollection(embedCollection);
    expect(recs.some((r) => r.title === 'Embedded document')).toBe(true);
    expect(recs.some((r) => r.title === 'Table folding')).toBe(true);
    expect(recs.some((r) => r.title === 'Embed usermeta')).toBe(true);
  });

  it('lists review items and tracks acceptances per plan version', () => {
    const items = buildCollectionReviewItems(simplePlan);
    expect(items.length).toBe(1);
    expect(items[0].collectionName).toBe('users');

    const accepted = acceptCollectionReview(null, planGeneratedAt, 'users');
    expect(collectionRequiresReview(embedCollection, undefined, accepted, planGeneratedAt)).toBe(false);

    const afterAccept = buildCollectionReviewItems(simplePlan, undefined, accepted);
    expect(afterAccept[0].accepted).toBe(true);
  });

  it('accepts all pending collections', () => {
    const all = acceptAllCollectionReviews(null, planGeneratedAt, ['users', 'posts']);
    expect(all.acceptedCollectionNames).toEqual(['posts', 'users']);
  });

  it('ignores acceptances from a different plan version', () => {
    const stale = acceptCollectionReview(null, 'old-plan', 'users');
    expect(collectionRequiresReview(embedCollection, undefined, stale, planGeneratedAt)).toBe(true);
  });
});
