/**
 * Retrieval configuration and strategy selection for the RAG layer.
 *
 * Priority (first match wins):
 *   1. MONGODB_MODEL_KEY  → hybrid BM25 + Voyage 4, merged with RRF
 *   2. OPENAI_API_KEY  → vector-only cosine similarity (legacy path)
 *   3. neither         → lexical BM25 only (default, no network)
 */

import { createEmbeddingProviderFromEnv } from './embeddings.js';
import { hybridRetrieve, lexicalRetrieve, vectorRetrieve } from './retriever.js';
import { createVoyageProviderFromEnv, type VoyageEmbeddingProvider } from './voyage.js';
import type { EmbeddingProvider, KnowledgeChunk, ScoredChunk } from '../types.js';

/** Providers available at runtime, loaded once from environment variables. */
export type RetrievalConfig = {
  openaiProvider: EmbeddingProvider | null;
  voyageProvider: VoyageEmbeddingProvider | null;
};

/** Load all configured embedding providers from .env. */
export function createRetrievalConfigFromEnv(): RetrievalConfig {
  return {
    openaiProvider: createEmbeddingProviderFromEnv(),
    voyageProvider: createVoyageProviderFromEnv(),
  };
}

/** Human-readable strategy label for CLI and design-report logs. */
export function describeRetrievalStrategy(config: RetrievalConfig): string {
  if (config.voyageProvider) {
    return `hybrid BM25 + ${config.voyageProvider.name} (Reciprocal Rank Fusion)`;
  }
  if (config.openaiProvider) {
    return `vector (${config.openaiProvider.name})`;
  }
  return 'lexical BM25 (no API key configured)';
}

/**
 * Retrieve the most relevant knowledge chunks for a query.
 *
 * @param chunks - Full chunked knowledge base
 * @param query - Workload-derived natural language query
 * @param topK - Number of chunks to return
 * @param config - Providers resolved from environment
 */
export async function retrieve(
  chunks: KnowledgeChunk[],
  query: string,
  topK: number,
  config: RetrievalConfig,
): Promise<ScoredChunk[]> {
  if (config.voyageProvider) {
    try {
      return await hybridRetrieve(config.voyageProvider, chunks, query, topK);
    } catch (error) {
      console.error(`Hybrid retrieval failed (${String(error)}); falling back to lexical BM25.`);
      return lexicalRetrieve(chunks, query, topK);
    }
  }

  if (config.openaiProvider) {
    try {
      return await vectorRetrieve(config.openaiProvider, chunks, query, topK);
    } catch (error) {
      console.error(`Vector retrieval failed (${String(error)}); falling back to lexical BM25.`);
    }
  }

  return lexicalRetrieve(chunks, query, topK);
}
