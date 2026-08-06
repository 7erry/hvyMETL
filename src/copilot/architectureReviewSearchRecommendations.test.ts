import { describe, expect, it } from 'vitest';
import {
  classifyFieldForSearch,
  recommendSearchForCollectionFields,
} from './architectureReviewSearchRecommendations.js';

describe('architectureReviewSearchRecommendations', () => {
  it('suggests autocomplete for product name fields', () => {
    const rec = classifyFieldForSearch('product_name');
    expect(rec?.kind).toBe('atlas-search-autocomplete');
  });

  it('suggests vector search for description fields', () => {
    const rec = classifyFieldForSearch('description');
    expect(rec?.kind).toBe('atlas-vector-search');
  });

  it('recommends per collection', () => {
    const recs = recommendSearchForCollectionFields('products', ['sku', 'description', 'category']);
    expect(recs.map((r) => r.kind).sort()).toEqual([
      'atlas-search-autocomplete',
      'atlas-search-faceted',
      'atlas-vector-search',
    ]);
  });
});
