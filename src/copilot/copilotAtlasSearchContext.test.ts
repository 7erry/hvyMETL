import { describe, expect, it } from 'vitest';
import {
  appendAtlasSearchSectionToDesignReport,
  copilotAtlasSearchIndexFromCreateResult,
  formatAtlasSearchIndexesForSystemPrompt,
} from './copilotAtlasSearchContext.js';
import { parseMongoAtlasSearchIndexInput } from './mongoAtlasSearchIndex.js';

describe('copilotAtlasSearchContext', () => {
  const input = parseMongoAtlasSearchIndexInput({
    database: 'csv_to_atlas',
    collection: 'products',
    pattern: 'keyword',
    textPaths: ['title', 'description'],
  });

  it('formats lexical indexes with $search sample', () => {
    const record = copilotAtlasSearchIndexFromCreateResult(input, {
      database: 'csv_to_atlas',
      indexName: 'search_keyword_title_description',
    })!;

    const text = formatAtlasSearchIndexesForSystemPrompt([record]);
    expect(text).toContain('$search');
    expect(text).toContain('search_keyword_title_description');
    expect(text).toContain('"type": "string"');
  });

  it('appends design report section once', () => {
    const record = copilotAtlasSearchIndexFromCreateResult(input, {
      database: 'csv_to_atlas',
      indexName: 'search_keyword_title_description',
    })!;
    const markdown = appendAtlasSearchSectionToDesignReport('# Report\n', [record]);
    expect(markdown).toContain('## MongoDB Search indexes (Atlas lexical)');
    expect(appendAtlasSearchSectionToDesignReport(markdown, [record])).toBe(markdown);
  });
});
