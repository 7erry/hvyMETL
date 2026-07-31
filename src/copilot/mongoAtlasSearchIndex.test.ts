import { describe, expect, it } from 'vitest';
import {
  buildAtlasSearchIndexDefinition,
  buildSampleAutocompleteSearchPipeline,
  buildSampleFacetedSearchMetaPipeline,
  buildSampleKeywordSearchPipeline,
  defaultAtlasSearchIndexName,
  parseMongoAtlasSearchIndexInput,
} from './mongoAtlasSearchIndex.js';

describe('mongoAtlasSearchIndex', () => {
  it('builds keyword index definition matching Atlas Search docs', () => {
    const input = parseMongoAtlasSearchIndexInput({
      collection: 'products',
      pattern: 'keyword',
      textPaths: ['title', 'description'],
    });

    expect(buildAtlasSearchIndexDefinition(input)).toEqual({
      mappings: {
        dynamic: false,
        fields: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    });
  });

  it('builds keyword search aggregation sample', () => {
    const pipeline = buildSampleKeywordSearchPipeline('default', ['title', 'description']);
    expect(pipeline).toEqual([
      {
        $search: {
          index: 'default',
          text: {
            query: 'ceramic coffee mug',
            path: ['title', 'description'],
          },
        },
      },
      { $limit: 10 },
    ]);
  });

  it('builds autocomplete index definition and query sample', () => {
    const input = parseMongoAtlasSearchIndexInput({
      collection: 'products',
      pattern: 'autocomplete',
      path: 'title',
    });

    expect(buildAtlasSearchIndexDefinition(input)).toEqual({
      mappings: {
        dynamic: false,
        fields: {
          title: {
            type: 'autocomplete',
            maxGrams: 15,
            minGrams: 2,
            tokenization: 'edgeGram',
          },
        },
      },
    });

    const pipeline = buildSampleAutocompleteSearchPipeline('default', 'title');
    expect(pipeline[0]).toMatchObject({
      $search: {
        index: 'default',
        autocomplete: {
          query: 'cofe',
          path: 'title',
          fuzzy: { maxEdits: 1 },
        },
      },
    });
  });

  it('builds faceted index definition and $searchMeta sample', () => {
    const input = parseMongoAtlasSearchIndexInput({
      collection: 'products',
      pattern: 'faceted',
      textPath: 'title',
      stringFacetPaths: ['category'],
      numberFacets: [{ path: 'price', boundaries: [0, 25, 50, 100] }],
    });

    expect(buildAtlasSearchIndexDefinition(input)).toEqual({
      mappings: {
        dynamic: false,
        fields: {
          title: { type: 'string' },
          category: { type: 'stringFacet' },
          price: { type: 'numberFacet' },
        },
      },
    });

    const pipeline = buildSampleFacetedSearchMetaPipeline('default', input.faceted!);
    expect(pipeline[0]).toMatchObject({
      $searchMeta: {
        index: 'default',
        facet: {
          operator: {
            text: { query: 'coffee', path: 'title' },
          },
          facets: {
            categoryFacet: { type: 'string', path: 'category' },
            priceRanges: { type: 'number', path: 'price', boundaries: [0, 25, 50, 100] },
          },
        },
      },
    });
  });

  it('defaults index names by pattern', () => {
    expect(
      defaultAtlasSearchIndexName(
        parseMongoAtlasSearchIndexInput({
          collection: 'products',
          pattern: 'keyword',
          textPaths: ['title', 'description'],
        }),
      ),
    ).toBe('search_keyword_title_description');

    expect(
      defaultAtlasSearchIndexName(
        parseMongoAtlasSearchIndexInput({
          collection: 'products',
          pattern: 'autocomplete',
          path: 'title',
        }),
      ),
    ).toBe('search_autocomplete_title');
  });

  it('rejects faceted pattern without facet fields', () => {
    expect(() =>
      parseMongoAtlasSearchIndexInput({
        collection: 'products',
        pattern: 'faceted',
        textPath: 'title',
      }),
    ).toThrow(/stringFacetPaths|at least one/);
  });
});
