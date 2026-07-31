/**
 * Atlas MongoDB Search (lexical) index metadata for Agent Copilot architecture context.
 */

import type { AtlasSearchPattern, MongoAtlasSearchIndexInput } from './mongoAtlasSearchIndex.js';
import {
  buildSampleAtlasSearchPipelineForInput,
  buildAtlasSearchIndexDefinition,
} from './mongoAtlasSearchIndex.js';

export type CopilotAtlasSearchIndexRecord = {
  database: string;
  collection: string;
  indexName: string;
  pattern: AtlasSearchPattern;
  /** Serialized index definition (mappings) for design reports. */
  definition: ReturnType<typeof buildAtlasSearchIndexDefinition>;
  /** Pattern-specific config used to regenerate sample queries. */
  input: Pick<MongoAtlasSearchIndexInput, 'keyword' | 'autocomplete' | 'faceted'>;
};

/** Guidance for lexical Atlas Search in architecture reviews. */
export const COPILOT_ATLAS_SEARCH_OPERATIONAL_GUIDANCE = `
### MongoDB Search (lexical) reference

Atlas **MongoDB Search** indexes power \`$search\` and \`$searchMeta\` aggregation stages (full-text and faceted search — not vector similarity).

**Index definition**
- Use \`mappings.dynamic: false\` and declare each indexed path under \`mappings.fields\`.
- **Keyword** search: field \`type: "string"\` on text paths; query with \`$search.text\`.
- **Autocomplete**: field \`type: "autocomplete"\` with \`edgeGram\` tokenization; query with \`$search.autocomplete\` (optional \`fuzzy\`).
- **Facets**: facet fields as \`stringFacet\`, \`numberFacet\`, or \`dateFacet\`; bucket counts via \`$searchMeta\` with a \`facet\` operator.

**Operations**
- The \`mongot\` process starts when the first Search index is created on the cluster ([troubleshooting](https://www.mongodb.com/docs/search/index/index-definitions/#troubleshoot-indexes)).
- Run read-only \`aggregateMongoCollection\` with a \`$search\` stage to validate queries against imported data.
- Combine lexical \`$search\` with \`$vectorSearch\` and RRF when both index types exist.

See [Index reference](https://www.mongodb.com/docs/search/index/index-definitions/) for analyzers, stored source, and synonyms.
`.trim();

function formatPipelineJson(pipeline: unknown[]): string {
  return JSON.stringify(pipeline, null, 2);
}

/** Sample aggregation for a recorded lexical search index. */
export function buildSampleAtlasSearchPipelineDisplay(record: CopilotAtlasSearchIndexRecord): string {
  const pipeline = buildSampleAtlasSearchPipelineForInput(
    {
      collection: record.collection,
      pattern: record.pattern,
      ...record.input,
    },
    record.indexName,
  );
  return `db.${record.collection}.aggregate(${formatPipelineJson(pipeline)});`;
}

/** Markdown list of lexical search indexes for the system prompt. */
export function formatAtlasSearchIndexesForSystemPrompt(
  indexes: CopilotAtlasSearchIndexRecord[] | undefined,
): string {
  if (!indexes?.length) {
    return '(none recorded in this studio session — use createMongoAtlasSearchIndex or listMongoCollectionIndexes)';
  }

  return indexes
    .map((entry) => {
      const sample = buildSampleAtlasSearchPipelineDisplay(entry);
      return [
        `- **${entry.database}.${entry.collection}** — index \`${entry.indexName}\` (**${entry.pattern}** lexical search)`,
        '',
        '  Index definition (JSON):',
        '',
        '  ```json',
        JSON.stringify(entry.definition, null, 2)
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
        '  ```',
        '',
        '  Sample aggregation:',
        '',
        '  ```js',
        ...sample.split('\n').map((line) => `  ${line}`),
        '  ```',
      ].join('\n');
    })
    .join('\n\n');
}

/** Append lexical search inventory to design-report.md. */
export function appendAtlasSearchSectionToDesignReport(
  markdown: string,
  indexes: CopilotAtlasSearchIndexRecord[] | undefined,
): string {
  if (!indexes?.length) return markdown;
  if (markdown.includes('## MongoDB Search indexes (Atlas lexical)')) return markdown;

  return [
    markdown.trimEnd(),
    '',
    '## MongoDB Search indexes (Atlas lexical)',
    '',
    formatAtlasSearchIndexesForSystemPrompt(indexes),
    '',
    COPILOT_ATLAS_SEARCH_OPERATIONAL_GUIDANCE,
    '',
  ].join('\n');
}

/** Build a session record after a successful create-index API call. */
export function copilotAtlasSearchIndexFromCreateResult(
  input: MongoAtlasSearchIndexInput,
  result: { database?: string; indexName?: string; definition?: ReturnType<typeof buildAtlasSearchIndexDefinition> },
): CopilotAtlasSearchIndexRecord | null {
  const indexName = result.indexName?.trim();
  const database = (result.database ?? input.database)?.trim();
  if (!indexName || !database) return null;

  const definition = result.definition ?? buildAtlasSearchIndexDefinition(input);

  return {
    database,
    collection: input.collection,
    indexName,
    pattern: input.pattern,
    definition,
    input: {
      ...(input.keyword ? { keyword: input.keyword } : {}),
      ...(input.autocomplete ? { autocomplete: input.autocomplete } : {}),
      ...(input.faceted ? { faceted: input.faceted } : {}),
    },
  };
}
