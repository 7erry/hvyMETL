import { describe, expect, it } from 'vitest';
import {
  mergeCollectionNameOptions,
  normalizeVectorIndexCollectionHint,
  normalizeVectorIndexDatabaseHint,
  pickInitialCatalogName,
} from './mongoVectorAutoEmbedCatalog';

describe('mongoVectorAutoEmbedCatalog', () => {
  it('strips inspect placeholder hints', () => {
    expect(normalizeVectorIndexDatabaseHint('database')).toBe('');
    expect(normalizeVectorIndexCollectionHint('collection')).toBe('');
    expect(normalizeVectorIndexDatabaseHint('csv_to_atlas')).toBe('csv_to_atlas');
  });

  it('picks preferred catalog entries when present', () => {
    expect(pickInitialCatalogName(['a', 'b'], ['missing', 'b'])).toBe('b');
    expect(pickInitialCatalogName(['a'], [])).toBe('a');
  });

  it('merges plan and API collection names', () => {
    expect(mergeCollectionNameOptions(['products'], ['customers', 'products'])).toEqual([
      'customers',
      'products',
    ]);
  });
});
