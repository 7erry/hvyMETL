/**
 * RAG retriever with two interchangeable strategies:
 *
 * 1. Lexical (default): a BM25 relevance score computed locally. Fully
 *    deterministic and requires zero API keys, so the toolkit always works.
 * 2. Vector (optional): when an embedding provider is configured, chunks and
 *    the query are embedded and ranked by cosine similarity, which captures
 *    semantic matches that keyword scoring misses.
 */

import type { EmbeddingProvider, KnowledgeChunk, ScoredChunk } from '../types.js';

/** BM25 term-frequency saturation constant (standard default). */
const BM25_K1 = 1.2;
/** BM25 document-length normalization constant (standard default). */
const BM25_B = 0.75;

/**
 * Lowercase a text and split it into simple word tokens. Both documents and
 * queries pass through this so scoring compares like with like.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9$]+/)
    .filter((token) => token.length > 1);
}

/**
 * Score every chunk against a query using BM25 and return the top matches.
 *
 * BM25 in one sentence: a chunk scores higher when it contains rare query
 * terms many times, with diminishing returns, adjusted for chunk length.
 *
 * @param chunks - The full chunked knowledge base.
 * @param query - Natural-language description of what we need patterns for.
 * @param topK - How many of the best chunks to return.
 */
export function lexicalRetrieve(chunks: KnowledgeChunk[], query: string, topK: number): ScoredChunk[] {
  const chunkTokenLists = chunks.map((chunk) => tokenize(`${chunk.heading} ${chunk.text}`));
  const averageLength =
    chunkTokenLists.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(chunkTokenLists.length, 1);

  // Document frequency: in how many chunks does each term appear at least once?
  const documentFrequency = new Map<string, number>();
  for (const tokens of chunkTokenLists) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const totalChunks = chunks.length;
  const queryTerms = new Set(tokenize(query));

  const scored: ScoredChunk[] = chunks.map((chunk, chunkIndex) => {
    const tokens = chunkTokenLists[chunkIndex];
    // Term frequency within this single chunk.
    const termFrequency = new Map<string, number>();
    for (const token of tokens) termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const frequencyInChunk = termFrequency.get(term) ?? 0;
      if (frequencyInChunk === 0) continue;
      const chunksContainingTerm = documentFrequency.get(term) ?? 0;
      // Inverse document frequency: rare terms are worth more.
      const idf = Math.log(1 + (totalChunks - chunksContainingTerm + 0.5) / (chunksContainingTerm + 0.5));
      const lengthNormalization = 1 - BM25_B + BM25_B * (tokens.length / averageLength);
      score += idf * ((frequencyInChunk * (BM25_K1 + 1)) / (frequencyInChunk + BM25_K1 * lengthNormalization));
    }
    return { ...chunk, score };
  });

  return scored
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Cosine similarity between two equal-length vectors, from -1 to 1. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Rank chunks by embedding similarity to the query using the configured
 * provider. Embeds the whole knowledge base in one batch call (it is small)
 * plus the query, then sorts by cosine similarity.
 */
export async function vectorRetrieve(
  provider: EmbeddingProvider,
  chunks: KnowledgeChunk[],
  query: string,
  topK: number,
): Promise<ScoredChunk[]> {
  const chunkVectors = await provider.embed(chunks.map((chunk) => `${chunk.heading}\n${chunk.text}`));
  const [queryVector] = await provider.embed([query]);

  return chunks
    .map((chunk, index) => ({ ...chunk, score: cosineSimilarity(chunkVectors[index], queryVector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Retrieve the most relevant knowledge chunks for a query.
 * Uses vector retrieval when a provider is available, BM25 otherwise.
 */
export async function retrieve(
  chunks: KnowledgeChunk[],
  query: string,
  topK: number,
  provider: EmbeddingProvider | null,
): Promise<ScoredChunk[]> {
  if (provider) {
    try {
      return await vectorRetrieve(provider, chunks, query, topK);
    } catch (error) {
      console.error(`Vector retrieval failed (${String(error)}); falling back to lexical scoring.`);
    }
  }
  return lexicalRetrieve(chunks, query, topK);
}
