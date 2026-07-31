/**
 * OpenAI tool definition for Atlas MongoDB Search (lexical) index creation.
 */

export const MONGO_ATLAS_SEARCH_INDEX_TOOL_NAME = 'createMongoAtlasSearchIndex' as const;

export type MongoAtlasSearchIndexToolName = typeof MONGO_ATLAS_SEARCH_INDEX_TOOL_NAME;

export const COPILOT_MONGO_ATLAS_SEARCH_INDEX_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: MONGO_ATLAS_SEARCH_INDEX_TOOL_NAME,
      description:
        'Create an Atlas MongoDB Search (lexical) index for $search / $searchMeta — keyword full-text, autocomplete, or faceted search. Not vector search (use createMongoAutoEmbedVectorIndex for autoEmbed). Call describeMongoCollectionSchema when field paths are unknown. Patterns: keyword (textPaths as string fields), autocomplete (path with edgeGram), faceted (textPath + stringFacetPaths + optional numberFacets with boundaries).',
      parameters: {
        type: 'object',
        required: ['collection', 'pattern'],
        properties: {
          database: {
            type: 'string',
            description: 'Logical database name; omit when the collection is unique across the tenant',
          },
          collection: { type: 'string', description: 'Collection name' },
          pattern: {
            type: 'string',
            enum: ['keyword', 'autocomplete', 'faceted'],
            description: 'Index pattern: keyword search bar, autocomplete typeahead, or faceted e-commerce filters',
          },
          name: { type: 'string', description: 'Optional Atlas search index name' },
          textPaths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keyword pattern: string field paths to index (e.g. title, description)',
          },
          path: {
            type: 'string',
            description: 'Autocomplete pattern: single field path (type autocomplete)',
          },
          maxGrams: { type: 'number', description: 'Autocomplete maxGrams (default 15)' },
          minGrams: { type: 'number', description: 'Autocomplete minGrams (default 2)' },
          tokenization: {
            type: 'string',
            enum: ['edgeGram', 'nGram'],
            description: 'Autocomplete tokenization (default edgeGram)',
          },
          textPath: {
            type: 'string',
            description: 'Faceted pattern: string field used in the text operator (e.g. title)',
          },
          stringFacetPaths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Faceted pattern: fields indexed as stringFacet (e.g. category)',
          },
          numberFacets: {
            type: 'array',
            description: 'Faceted pattern: numberFacet fields with price-style boundaries',
            items: {
              type: 'object',
              required: ['path', 'boundaries'],
              properties: {
                path: { type: 'string' },
                boundaries: { type: 'array', items: { type: 'number' } },
              },
            },
          },
        },
      },
    },
  },
] as const;

export function isMongoAtlasSearchIndexToolName(value: string): value is MongoAtlasSearchIndexToolName {
  return value === MONGO_ATLAS_SEARCH_INDEX_TOOL_NAME;
}
