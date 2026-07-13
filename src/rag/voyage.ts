/**
 * Voyage AI embedding provider (voyage-4 series) via the MongoDB Model API.
 *
 * When MONGODB_MODEL_KEY is set in .env, the retriever runs hybrid search: BM25
 * for exact keyword matches plus Voyage 4 embeddings for conceptual similarity,
 * merged with Reciprocal Rank Fusion in retriever.ts.
 *
 * API reference:
 * - https://www.mongodb.com/docs/voyageai/api-and-clients/
 * - https://docs.voyageai.com/reference/embeddings-api
 */

import type { EmbeddingProvider } from '../types.js';
import { parseApiUsage, recordEmbeddingUsage } from '../modelUsage.js';
import { readScopedEnv } from '../runtime/scopedEnv.js';

/** Default embedding model when MONGODB_MODEL_EMBEDDING_MODEL is unset. */
const DEFAULT_MODEL = 'voyage-4';
/** MongoDB Atlas Model API keys (al-…) use this endpoint. */
const DEFAULT_ATLAS_MODEL_BASE_URL = 'https://ai.mongodb.com/v1';
/** Voyage platform keys (pa-…) use this endpoint. */
const DEFAULT_VOYAGE_PLATFORM_BASE_URL = 'https://api.voyageai.com/v1';

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

/** Read the MongoDB Model Key from environment (supports legacy VOYAGE_API_KEY). */
export function readMongoDbModelKeyFromEnv(): string | null {
  const key = readScopedEnv('MONGODB_MODEL_KEY') ?? readScopedEnv('VOYAGE_API_KEY');
  if (!key || key.trim() === '') return null;
  return key.trim().replace(/^["']|["']$/g, '');
}

/**
 * Pick the embeddings API base URL from env and key format.
 * Atlas Model keys (al-…) default to ai.mongodb.com; Voyage platform keys to voyageai.com.
 */
export function resolveModelApiBaseUrl(apiKey: string): string {
  if (process.env.MONGODB_MODEL_BASE_URL) return process.env.MONGODB_MODEL_BASE_URL;
  if (process.env.VOYAGE_BASE_URL) return process.env.VOYAGE_BASE_URL;
  if (apiKey.startsWith('al-')) return DEFAULT_ATLAS_MODEL_BASE_URL;
  return DEFAULT_VOYAGE_PLATFORM_BASE_URL;
}

/**
 * Call the Voyage /embeddings endpoint for a batch of texts.
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
    throw new Error(`Model embedding API returned ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { data: VoyageEmbeddingItem[]; usage?: Record<string, number> };
  recordEmbeddingUsage(parseApiUsage(payload), texts.join(''));
  return payload.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

/**
 * Build a Voyage embedding provider from environment variables, or return null
 * when MONGODB_MODEL_KEY is not set (the retriever then stays on BM25-only).
 */
export function createVoyageProviderFromEnv(): VoyageEmbeddingProvider | null {
  const apiKey = readMongoDbModelKeyFromEnv();
  if (!apiKey) return null;

  const baseUrl = resolveModelApiBaseUrl(apiKey);
  const model =
    process.env.MONGODB_MODEL_EMBEDDING_MODEL ??
    process.env.VOYAGE_EMBEDDING_MODEL ??
    DEFAULT_MODEL;

  return {
    name: model,
    embedDocuments: (texts) => voyageEmbed(baseUrl, apiKey, model, texts, 'document'),
    embedQuery: async (text) => {
      const [vector] = await voyageEmbed(baseUrl, apiKey, model, [text], 'query');
      return vector;
    },
    embed: (texts) => voyageEmbed(baseUrl, apiKey, model, texts, 'document'),
  };
}
