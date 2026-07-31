/**
 * Vector search index metadata and architecture-review guidance for Agent Copilot.
 */

export type CopilotVectorSearchIndexRecord = {
  database: string;
  collection: string;
  path: string;
  indexName: string;
  model: string;
  quantization: string;
  numDimensions: number;
  similarity: string;
};

/** Operational guidance included in architecture reviews when vector search is in scope. */
export const COPILOT_VECTOR_SEARCH_OPERATIONAL_GUIDANCE = `
### Crucial operational details (vector search)

**Balancing \`numCandidates\` and \`limit\`**
- \`limit\`: final documents returned to the application.
- \`numCandidates\`: nearest neighbors HNSW evaluates during graph traversal.
- Rule of thumb: set \`numCandidates\` to **10×–20×** \`limit\` (e.g. \`limit: 10\` → start \`numCandidates\` at 100–200).
- Higher \`numCandidates\` improves recall at the cost of latency and CPU.

**Pre-filtering vs post-filtering**
- To filter by metadata (category, price, tenantId, etc.), prefer **pre-filtering** with the \`filter\` option **inside** \`$vectorSearch\`.
- Fields used in \`$vectorSearch.filter\` must be declared as \`type: "filter"\` in the vector index definition.
- A \`$match\` **after** \`$vectorSearch\` is post-filtering and can shrink results **below** \`limit\`.

**Memory & performance**
- HNSW indexes perform best in RAM; large high-dimensional indexes over millions of documents need tier planning.
- **Scalar quantization** (SQ8) in the index definition can reduce RAM footprint up to ~75% with minimal accuracy impact (matches \`quantization: "scalar"\` autoEmbed indexes).
- Full-scale vector search targets **M10+**; shared tiers (M0/M2/M5) impose lower index size and query volume limits.
- **Hybrid search**: combine \`$vectorSearch\` with Atlas Search (\`$search\`) and **Reciprocal Rank Fusion (RRF)** for keyword + semantic ranking.
`.trim();

/** Sample autoEmbed \`$vectorSearch\` stage (text query — embeddings generated at query time). */
export function buildSampleAutoEmbedVectorSearchPipeline(
  record: CopilotVectorSearchIndexRecord,
  options: { limit?: number; numCandidates?: number; queryExample?: string; preFilter?: Record<string, unknown> } = {},
): string {
  const limit = options.limit ?? 10;
  const numCandidates = options.numCandidates ?? Math.max(limit * 15, 100);
  const query = options.queryExample ?? 'example product search text';
  const filterLines =
    options.preFilter && Object.keys(options.preFilter).length > 0
      ? `,\n      filter: ${JSON.stringify(options.preFilter, null, 2).replace(/\n/g, '\n      ')}`
      : '';

  return `db.${record.collection}.aggregate([
  {
    $vectorSearch: {
      index: "${record.indexName}",
      path: "${record.path}",
      query: ${JSON.stringify(query)},
      numCandidates: ${numCandidates},
      limit: ${limit}${filterLines}
    }
  },
  {
    $project: {
      _id: 1,
      ${record.path}: 1,
      score: { $meta: "vectorSearchScore" }
    }
  }
]);`;
}

/** Markdown list of indexes created in Migration Studio for the system prompt. */
export function formatVectorSearchIndexesForSystemPrompt(
  indexes: CopilotVectorSearchIndexRecord[] | undefined,
): string {
  if (!indexes?.length) {
    return '(none recorded in this studio session — list indexes with listMongoCollectionIndexes if needed)';
  }

  return indexes
    .map((entry) => {
      const sample = buildSampleAutoEmbedVectorSearchPipeline(entry);
      return [
        `- **${entry.database}.${entry.collection}** — index \`${entry.indexName}\` on \`${entry.path}\` (autoEmbed: model \`${entry.model}\`, ${entry.numDimensions} dims, ${entry.quantization} quantization, ${entry.similarity} similarity)`,
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

/** Append vector search inventory to design-report.md when indexes were created in studio. */
export function appendVectorSearchSectionToDesignReport(
  markdown: string,
  indexes: CopilotVectorSearchIndexRecord[] | undefined,
): string {
  if (!indexes?.length) return markdown;
  if (markdown.includes('## Vector search indexes (Atlas)')) return markdown;

  return [
    markdown.trimEnd(),
    '',
    '## Vector search indexes (Atlas)',
    '',
    formatVectorSearchIndexesForSystemPrompt(indexes),
    '',
    COPILOT_VECTOR_SEARCH_OPERATIONAL_GUIDANCE,
    '',
  ].join('\n');
}

/** Build a record from a successful create-index API call plus request payload. */
export function copilotVectorSearchIndexFromCreateResult(
  payload: {
    database?: string;
    collection: string;
    path: string;
    model: string;
    quantization: string;
    numDimensions: number;
    similarity: string;
  },
  result: { database?: string; indexName?: string },
): CopilotVectorSearchIndexRecord | null {
  const indexName = result.indexName?.trim();
  const database = (result.database ?? payload.database)?.trim();
  if (!indexName || !database) return null;

  return {
    database,
    collection: payload.collection,
    path: payload.path,
    indexName,
    model: payload.model,
    quantization: payload.quantization,
    numDimensions: payload.numDimensions,
    similarity: payload.similarity,
  };
}
