import { describe, expect, it } from 'vitest';
import { parseDirectAtlasSearchIndexCommand } from './atlasSearchCommandRouting';

describe('atlasSearchCommandRouting', () => {
  it('routes full text search phrases to collection targets', () => {
    expect(parseDirectAtlasSearchIndexCommand('create full text search index on products')).toEqual({
      collection: 'products',
      pattern: 'keyword',
    });
  });
});
