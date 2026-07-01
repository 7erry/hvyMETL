/**
 * Voyage AI reranker API (rerank-2.5) via MongoDB Model API or Voyage platform.
 *
 * Used by the ML engine when MONGODB_MODEL_KEY is set — replaces the local
 * Xenova cross-encoder for telemetry-aware pattern reranking.
 *
 * @see https://docs.voyageai.com/reference/reranker-api
 */

import { readMongoDbModelKeyFromEnv, resolveModelApiBaseUrl } from './voyage.js';
import { parseApiUsage, recordRerankUsage } from '../modelUsage.js';

/** Recommended reranker when MONGODB_MODEL_KEY is configured. */
export const DEFAULT_VOYAGE_RERANK_MODEL = 'rerank-2.5';

type VoyageRerankResponseItem = {
  index: number;
  relevance_score: number;
  document?: string;
};

export type VoyageRerankScore = {
  index: number;
  relevanceScore: number;
};

export type VoyageRerankOptions = {
  topK?: number;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
};

function resolveRerankModel(): string {
  return (
    process.env.MONGODB_MODEL_RERANK_MODEL?.trim() ||
    process.env.VOYAGE_RERANK_MODEL?.trim() ||
    DEFAULT_VOYAGE_RERANK_MODEL
  );
}

/**
 * Call POST /v1/rerank with a query and document list.
 * Returns scores sorted by relevance (highest first) when top_k is set.
 */
export async function voyageRerank(
  query: string,
  documents: string[],
  options: VoyageRerankOptions = {},
): Promise<VoyageRerankScore[]> {
  if (documents.length === 0) return [];

  const apiKey = options.apiKey ?? readMongoDbModelKeyFromEnv();
  if (!apiKey) {
    throw new Error('MONGODB_MODEL_KEY is not set — cannot call Voyage reranker API.');
  }

  const baseUrl = options.baseUrl ?? resolveModelApiBaseUrl(apiKey);
  const model = options.model ?? resolveRerankModel();
  const body: Record<string, unknown> = {
    model,
    query,
    documents,
  };
  if (options.topK !== undefined) {
    body.top_k = options.topK;
  }

  const response = await fetch(`${baseUrl}/rerank`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Voyage rerank API returned ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as { data: VoyageRerankResponseItem[]; usage?: Record<string, number> };
  recordRerankUsage(parseApiUsage(payload), `${query}\n${documents.join('\n')}`);
  return payload.data.map((item) => ({
    index: item.index,
    relevanceScore: item.relevance_score,
  }));
}

/** True when a MongoDB Model / Voyage API key is available for reranking. */
export function isVoyageRerankerConfigured(): boolean {
  return readMongoDbModelKeyFromEnv() !== null;
}
