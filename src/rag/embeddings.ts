/**
 * Pluggable embedding providers.
 *
 * The toolkit never REQUIRES embeddings: when no API key is configured the
 * retriever uses lexical BM25 only. When VOYAGE_API_KEY is set, see voyage.ts
 * for hybrid BM25 + Voyage 4 retrieval. When only OPENAI_API_KEY is set, this
 * module supplies an OpenAI-compatible vector provider.
 */

import type { EmbeddingProvider } from '../types.js';

/** Default model used when EMBEDDING_MODEL is not set. */
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
/** Default API base when OPENAI_BASE_URL is not set. */
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** Shape of one item in the OpenAI embeddings response payload. */
type EmbeddingResponseItem = { index: number; embedding: number[] };

/**
 * Build an embedding provider from environment variables, or return null
 * when no key is configured (the caller then uses lexical retrieval).
 */
export function createEmbeddingProviderFromEnv(): EmbeddingProvider | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  return {
    name: 'openai',
    async embed(texts: string[]): Promise<number[][]> {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!response.ok) {
        throw new Error(`Embedding API returned ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as { data: EmbeddingResponseItem[] };
      // The API may return items out of order; sort by index to be safe.
      return payload.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    },
  };
}
