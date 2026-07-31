/**
 * OpenAI tool definition for Atlas Vector Search autoEmbed index creation (Phase 3).
 */

import {
  AUTO_EMBED_DIMENSIONS,
  AUTO_EMBED_QUANTIZATION_TYPES,
  AUTO_EMBED_SIMILARITY_FUNCTIONS,
  AUTO_EMBED_VOYAGE_MODELS,
} from './mongoVectorAutoEmbedIndex.js';

export const MONGO_VECTOR_INDEX_TOOL_NAME = 'createMongoAutoEmbedVectorIndex' as const;

export type MongoVectorIndexToolName = typeof MONGO_VECTOR_INDEX_TOOL_NAME;

const LOGICAL_DB_PROPERTY = {
  type: 'string',
  description:
    'Logical database name (e.g. csv_to_atlas). Omit when the collection name exists in only one of your databases—the server resolves it automatically.',
};

/** OpenAI function for creating autoEmbed vector search indexes via the studio API. */
export const COPILOT_MONGO_VECTOR_INDEX_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: MONGO_VECTOR_INDEX_TOOL_NAME,
      description:
        'Create an Atlas Vector Search index with Automated Embeddings (autoEmbed) on a text field in a collection. Use when the user asks to create a vector search index, autoEmbed index, or semantic/vector search on imported Atlas data. Embeddings are generated from text by Voyage AI—not for pre-computed numeric embedding arrays. If the text field path is unknown, call describeMongoCollectionSchema first in the same or prior turn, then pick a string field.',
      parameters: {
        type: 'object',
        required: ['collection', 'path'],
        properties: {
          database: LOGICAL_DB_PROPERTY,
          collection: { type: 'string', description: 'Collection name (e.g. customers)' },
          path: {
            type: 'string',
            description: 'Dot-path to the text field to index with autoEmbed (e.g. description, body)',
          },
          model: {
            type: 'string',
            enum: [...AUTO_EMBED_VOYAGE_MODELS],
            description: 'Voyage embedding model (default voyage-4-lite)',
          },
          quantization: {
            type: 'string',
            enum: [...AUTO_EMBED_QUANTIZATION_TYPES],
            description: 'Storage quantization: float, scalar, binary, or binaryNoRescore (default scalar)',
          },
          numDimensions: {
            type: 'number',
            enum: [...AUTO_EMBED_DIMENSIONS],
            description: 'Embedding dimensions: 256, 512, 1024, or 2048 (default 1024)',
          },
          similarity: {
            type: 'string',
            enum: [...AUTO_EMBED_SIMILARITY_FUNCTIONS],
            description: 'Vector similarity: cosine, dotProduct, or euclidean (default cosine)',
          },
          name: {
            type: 'string',
            description: 'Optional Atlas search index name; defaults to autoEmbed_{field}_{model}',
          },
        },
      },
    },
  },
];

export function isMongoVectorIndexToolName(value: string): value is MongoVectorIndexToolName {
  return value === MONGO_VECTOR_INDEX_TOOL_NAME;
}
