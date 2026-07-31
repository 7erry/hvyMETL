import { describe, expect, it } from 'vitest';
import {
  appendVectorSearchSectionToDesignReport,
  buildSampleAutoEmbedVectorSearchPipeline,
  copilotVectorSearchIndexFromCreateResult,
  formatVectorSearchIndexesForSystemPrompt,
} from './copilotVectorSearchContext.js';

describe('copilotVectorSearchContext', () => {
  const record = {
    database: 'csv_to_atlas',
    collection: 'products',
    path: 'description',
    indexName: 'autoEmbed_description_voyage-4-lite',
    model: 'voyage-4-lite',
    quantization: 'scalar',
    numDimensions: 1024,
    similarity: 'cosine',
  };

  it('builds autoEmbed vectorSearch sample with numCandidates scaling', () => {
    const pipeline = buildSampleAutoEmbedVectorSearchPipeline(record, { limit: 10 });
    expect(pipeline).toContain('index: "autoEmbed_description_voyage-4-lite"');
    expect(pipeline).toContain('query:');
    expect(pipeline).toContain('numCandidates: 150');
    expect(pipeline).toContain('limit: 10');
  });

  it('formats indexes for the copilot system prompt', () => {
    const text = formatVectorSearchIndexesForSystemPrompt([record]);
    expect(text).toContain('csv_to_atlas.products');
    expect(text).toContain('$vectorSearch');
  });

  it('maps create-index API results to studio records', () => {
    expect(
      copilotVectorSearchIndexFromCreateResult(
        {
          database: 'csv_to_atlas',
          collection: 'products',
          path: 'description',
          model: 'voyage-4-lite',
          quantization: 'scalar',
          numDimensions: 1024,
          similarity: 'cosine',
        },
        { database: 'csv_to_atlas', indexName: 'autoEmbed_description_voyage-4-lite' },
      ),
    ).toEqual(record);
  });

  it('appends vector search section to design reports', () => {
    const markdown = appendVectorSearchSectionToDesignReport('# Report\n', [record]);
    expect(markdown).toContain('## Vector search indexes (Atlas)');
    expect(markdown).toContain('numCandidates');
  });
});
