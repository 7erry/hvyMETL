/**
 * Dual-space RAG retrieval: design patterns + lessons_learned memory in parallel.
 */

import { retrieve, type RetrievalConfig } from '../rag/retrieval.js';
import type { KnowledgeChunk, ScoredChunk } from '../types.js';
import { DEFAULT_LESSONS_TOP_K, renderHistoricalLessonsSection, retrieveLessonsLearned } from './memoryEngine.js';
import type { MigrationStore } from './migrationStore.js';
import type { ScoredLesson } from './feedbackTypes.js';
import { getMigrationStore } from './migrationStore.js';

export type RetrievalWithMemoryResult = {
  patternChunks: ScoredChunk[];
  lessonChunks: ScoredLesson[];
  historicalLessonsMarkdown: string;
};

/**
 * Retrieve design patterns and lessons_learned memory simultaneously.
 * Pattern retrieval uses the existing bi-encoder/hybrid stack; lessons use
 * the dedicated `lessons_learned` namespace in the migration memory store.
 */
export async function retrieveWithLessonsLearned(
  chunks: KnowledgeChunk[],
  query: string,
  topK: number,
  config: RetrievalConfig,
  options: {
    lessonsTopK?: number;
    store?: MigrationStore;
  } = {},
): Promise<RetrievalWithMemoryResult> {
  const store = options.store ?? getMigrationStore();
  const lessonsTopK = options.lessonsTopK ?? DEFAULT_LESSONS_TOP_K;

  const [patternChunks, lessonChunks] = await Promise.all([
    retrieve(chunks, query, topK, config),
    retrieveLessonsLearned(query, lessonsTopK, { store }),
  ]);

  const historicalLessonsMarkdown = renderHistoricalLessonsSection(lessonChunks);

  if (lessonChunks.length > 0) {
    console.info(
      `[ml_engine/memoryRetrieval] Injected ${lessonChunks.length} historical lesson(s) into RAG context for query: ${query.slice(0, 80)}…`,
    );
  }

  return { patternChunks, lessonChunks, historicalLessonsMarkdown };
}
