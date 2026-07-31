import { describe, expect, it } from 'vitest';
import { parseDirectVectorSearchIndexCommand } from './vectorIndexCommandRouting';

describe('vectorIndexCommandRouting', () => {
  it('opens dialog targets from chat phrasing', () => {
    expect(parseDirectVectorSearchIndexCommand('create vector search on products')).toEqual({
      collection: 'products',
    });
    expect(parseDirectVectorSearchIndexCommand('create vector search on products.description')).toEqual({
      collection: 'products',
      path: 'description',
    });
  });
});
