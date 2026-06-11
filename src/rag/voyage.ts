/**
 * Voyage AI embedding provider (voyage-4 series).
 *
 * When VOYAGE_API_KEY is set, the retriever runs hybrid search: BM25 for exact
 * keyword matches plus Voyage 4 embeddings for conceptual similarity, merged
 * with Reciprocal Rank Fusion in retriever.ts.
 *
 * API reference: https://docs.voyageai.com/reference/embeddings-api
 */

import type { EmbeddingProvider } from '../types.js';

/** Default Voyage embedding model when VOYAGE_EMBEDDING_MODEL is unset. */
const DEFAULT_VOYAGE_MODEL = 'voyage-4';
/** Default REST base URL (Voyage platform keys). */
const DEFAULT_VOYAGE_BASE_URL = 'https://api.voyageai.com/v1';

/** Voyage input_type values tune vectors for retrieval vs indexing. */
export type VoyageInputType = 'query' | 'document';

/** One item in the Voyage embeddings response payload. */
type VoyageEmbeddingItem = { index: number; embedding: number[] };

/**
 * Voyage provider with separate query/document embedding paths, as recommended
 * by Voyage for retrieval workloads.
 */
export type VoyageEmbeddingProvider = EmbeddingProvider & {
  /** Embed knowledge-base chunks (input_type: document). */
  embedDocuments: (texts: string[]) => Promise<number[][]>;
  /** Embed the retrieval query (input_type: query). */
  embedQuery: (text: string) => Promise<number[]>;
};

/**
 * Call the Voyage /embeddings endpoint for a batch of texts.
 *
 * @param baseUrl - API root including /v1
 * @param apiKey - VOYAGE_API_KEY
 * @param model - e.g. voyage-4
 * @param texts - One or more strings to embed
 * @param inputType - "query" for the search query, "document" for corpus chunks
 */
async function voyageEmbed(
  baseUrl: string,
  apiKey: string,
  model: string,
  texts: string[],
  inputType: VoyageInputType,
): Promise<number[][]> {
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts.length === 1 ? texts[0] : texts,
      input_type: inputType,
    }),
  });
  if (!response.ok) {
    throw new Error(`Voyage embedding API returned ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { data: VoyageEmbeddingItem[] };
  return payload.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

/**
 * Build a Voyage embedding provider from environment variables, or return null
 * when VOYAGE_API_KEY is not set (the retriever then stays on BM25-only).
 */
export function createVoyageProviderFromEnv(): VoyageEmbeddingProvider | null {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.VOYAGE_BASE_URL ?? DEFAULT_VOYAGE_BASE_URL;
  const model = process.env.VOYAGE_EMBEDDING_MODEL ?? DEFAULT_VOYAGE_MODEL;

  return {
    name: model,
    embedDocuments: (texts) => voyageEmbed(baseUrl, apiKey, model, texts, 'document'),
    embedQuery: async (text) => {
      const [vector] = await voyageEmbed(baseUrl, apiKey, model, [text], 'query');
      return vector;
    },
    // Default embed path indexes documents (knowledge-base chunks).
    embed: (texts) => voyageEmbed(baseUrl, apiKey, model, texts, 'document'),
  };
}
