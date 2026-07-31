import { describe, expect, it } from 'vitest';
import {
  parseDirectVectorSearchIndexCommand,
  parseVectorSearchIndexTarget,
} from './parseVectorSearchIndexCommand.js';

describe('parseVectorSearchIndexCommand', () => {
  it('parses collection-only targets', () => {
    expect(parseDirectVectorSearchIndexCommand('create vector search on products')).toEqual({
      collection: 'products',
    });
    expect(parseDirectVectorSearchIndexCommand('create vector search index on customers')).toEqual({
      collection: 'customers',
    });
  });

  it('parses collection.field targets', () => {
    expect(parseDirectVectorSearchIndexCommand('create vector search on products.description')).toEqual({
      collection: 'products',
      path: 'description',
    });
  });

  it('parses database.collection.field targets', () => {
    expect(parseDirectVectorSearchIndexCommand('create vector search on csv_to_atlas.products.description')).toEqual({
      database: 'csv_to_atlas',
      collection: 'products',
      path: 'description',
    });
  });

  it('parses dotted field paths', () => {
    expect(parseVectorSearchIndexTarget('items.details.summary')).toEqual({
      collection: 'items',
      path: 'details.summary',
    });
  });

  it('parses commands embedded in a longer user message', () => {
    expect(parseDirectVectorSearchIndexCommand('mcp is available: create vector search on products')).toEqual({
      collection: 'products',
    });
  });
});
