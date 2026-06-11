/**
 * RAG retriever strategies:
 *
 * 1. Lexical (default): BM25 relevance scoring — deterministic, no API keys.
 * 2. Hybrid (optional): BM25 + Voyage 4 embeddings merged with Reciprocal Rank
 *    Fusion when VOYAGE_API_KEY is set. Captures both exact keyword tokens and
 *    deep conceptual context.
 * 3. Vector (optional): OpenAI-compatible embeddings ranked by cosine similarity
 *    when only OPENAI_API_KEY is set (Voyage takes precedence for hybrid).
 */

import type { EmbeddingProvider, KnowledgeChunk, ScoredChunk } from '../types.js';
import type { VoyageEmbeddingProvider } from './voyage.js';

/** BM25 term-frequency saturation constant (standard default). */
const BM25_K1 = 1.2;
/** BM25 document-length normalization constant (standard default). */
const BM25_B = 0.75;
/** RRF constant k; 60 is the widely used default from the original RRF paper. */
export const DEFAULT_RRF_K = 60;
/** How many candidates each retrieval leg contributes before fusion. */
const HYBRID_CANDIDATE_MULTIPLIER = 3;

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

/** Stable identity for a knowledge chunk across ranked lists. */
export function chunkKey(chunk: KnowledgeChunk): string {
  return `${chunk.sourceFile}\0${chunk.heading}`;
}

/**
 * Score every chunk against a query using BM25 and return the top matches.
 *
 * BM25 in one sentence: a chunk scores higher when it contains rare query
 * terms many times, with diminishing returns, adjusted for chunk length.
 */
export function lexicalRetrieve(chunks: KnowledgeChunk[], query: string, topK: number): ScoredChunk[] {
  const chunkTokenLists = chunks.map((chunk) => tokenize(`${chunk.heading} ${chunk.text}`));
  const averageLength =
    chunkTokenLists.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(chunkTokenLists.length, 1);

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
    const termFrequency = new Map<string, number>();
    for (const token of tokens) termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const frequencyInChunk = termFrequency.get(term) ?? 0;
      if (frequencyInChunk === 0) continue;
      const chunksContainingTerm = documentFrequency.get(term) ?? 0;
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
 * Merge multiple ranked lists with Reciprocal Rank Fusion (RRF).
 *
 * score(chunk) = Σ 1 / (k + rank_i)  across every list where the chunk appears.
 * Rank is 1-based. Chunks that rank well in both BM25 and semantic search rise
 * to the top without needing score normalization across incompatible scales.
 */
export function reciprocalRankFusion(rankedLists: ScoredChunk[][], k = DEFAULT_RRF_K): ScoredChunk[] {
  const fused = new Map<string, { chunk: KnowledgeChunk; score: number }>();

  for (const list of rankedLists) {
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      const key = chunkKey(item);
      const contribution = 1 / (k + index + 1);
      const existing = fused.get(key);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(key, { chunk: item, score: contribution });
      }
    }
  }

  return [...fused.values()]
    .map(({ chunk, score }) => ({ ...chunk, score }))
    .sort((a, b) => b.score - a.score);
}

/** Rank chunks by OpenAI-compatible embedding cosine similarity to the query. */
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
 * Hybrid retrieval: BM25 for keyword precision + Voyage 4 for semantic depth,
 * fused with RRF. Requires VOYAGE_API_KEY.
 */
export async function hybridRetrieve(
  voyageProvider: VoyageEmbeddingProvider,
  chunks: KnowledgeChunk[],
  query: string,
  topK: number,
): Promise<ScoredChunk[]> {
  const candidateCount = Math.min(chunks.length, Math.max(topK * HYBRID_CANDIDATE_MULTIPLIER, topK));

  const lexicalRanked = lexicalRetrieve(chunks, query, candidateCount);

  const chunkTexts = chunks.map((chunk) => `${chunk.heading}\n${chunk.text}`);
  const [docVectors, queryVector] = await Promise.all([
    voyageProvider.embedDocuments(chunkTexts),
    voyageProvider.embedQuery(query),
  ]);

  const semanticRanked = chunks
    .map((chunk, index) => ({ ...chunk, score: cosineSimilarity(docVectors[index], queryVector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, candidateCount);

  return reciprocalRankFusion([lexicalRanked, semanticRanked]).slice(0, topK);
}
