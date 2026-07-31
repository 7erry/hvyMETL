import { describe, expect, it } from 'vitest';
import {
  AUTO_EMBED_DIMENSIONS,
  AUTO_EMBED_QUANTIZATION_TYPES,
  AUTO_EMBED_SIMILARITY_FUNCTIONS,
  AUTO_EMBED_VOYAGE_MODELS,
  buildAutoEmbedVectorSearchIndexDefinition,
  defaultAutoEmbedVectorIndexName,
  parseMongoAutoEmbedVectorIndexInput,
} from './mongoVectorAutoEmbedIndex.js';

describe('mongoVectorAutoEmbedIndex', () => {
  it('builds autoEmbed vectorSearch definition with modality text', () => {
    const input = parseMongoAutoEmbedVectorIndexInput({
      database: 'csv_to_atlas',
      collection: 'products',
      path: 'description',
      model: 'voyage-4',
      quantization: 'binaryNoRescore',
      numDimensions: 512,
      similarity: 'euclidean',
    });

    expect(buildAutoEmbedVectorSearchIndexDefinition(input)).toEqual({
      fields: [
        {
          type: 'autoEmbed',
          path: 'description',
          model: 'voyage-4',
          modality: 'text',
          numDimensions: 512,
          similarity: 'euclidean',
          quantization: 'binaryNoRescore',
        },
      ],
    });
  });

  it('defaults index name from path and model', () => {
    expect(
      defaultAutoEmbedVectorIndexName({ path: 'details.summary', model: 'voyage-4-lite' }),
    ).toBe('autoEmbed_details_summary_voyage-4-lite');
  });

  it('validates enums and dimensions', () => {
    expect(() =>
      parseMongoAutoEmbedVectorIndexInput({
        database: 'db',
        collection: 'c',
        path: 'text',
        model: 'invalid',
        quantization: AUTO_EMBED_QUANTIZATION_TYPES[0],
        numDimensions: AUTO_EMBED_DIMENSIONS[0],
        similarity: AUTO_EMBED_SIMILARITY_FUNCTIONS[0],
      }),
    ).toThrow(/model must be one of/);

    expect(() =>
      parseMongoAutoEmbedVectorIndexInput({
        database: 'db',
        collection: 'c',
        path: 'text',
        model: AUTO_EMBED_VOYAGE_MODELS[0],
        quantization: AUTO_EMBED_QUANTIZATION_TYPES[0],
        numDimensions: 999,
        similarity: AUTO_EMBED_SIMILARITY_FUNCTIONS[0],
      }),
    ).toThrow(/numDimensions must be one of/);
  });

  it('accepts optional custom index name', () => {
    const input = parseMongoAutoEmbedVectorIndexInput({
      database: 'db',
      collection: 'c',
      path: 'body',
      model: AUTO_EMBED_VOYAGE_MODELS[0],
      quantization: 'float',
      numDimensions: 2048,
      similarity: 'dotProduct',
      name: 'my_custom_index',
    });
    expect(input.name).toBe('my_custom_index');
  });
});
