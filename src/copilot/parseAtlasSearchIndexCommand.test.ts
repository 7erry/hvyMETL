import { describe, expect, it } from 'vitest';
import {
  detectAtlasSearchPatternFromPhrase,
  parseDirectAtlasSearchIndexCommand,
} from './parseAtlasSearchIndexCommand.js';

describe('parseAtlasSearchIndexCommand', () => {
  it('parses full text search on collection', () => {
    expect(parseDirectAtlasSearchIndexCommand('create full text search index on products')).toEqual({
      collection: 'products',
      pattern: 'keyword',
    });
    expect(parseDirectAtlasSearchIndexCommand('create full-text search on products')).toEqual({
      collection: 'products',
      pattern: 'keyword',
    });
  });

  it('parses collection.field and db.collection', () => {
    expect(parseDirectAtlasSearchIndexCommand('create search index on products.description')).toEqual({
      collection: 'products',
      path: 'description',
      pattern: 'keyword',
    });
    expect(parseDirectAtlasSearchIndexCommand('create full text search index on Vectors.products')).toEqual({
      database: 'Vectors',
      collection: 'products',
      pattern: 'keyword',
    });
  });

  it('detects autocomplete and faceted patterns', () => {
    expect(detectAtlasSearchPatternFromPhrase('create autocomplete search index on products')).toBe('autocomplete');
    expect(parseDirectAtlasSearchIndexCommand('create faceted search index on products')?.pattern).toBe('faceted');
  });
});
