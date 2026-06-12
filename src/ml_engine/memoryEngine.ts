/**
 * Lessons-learned memory: embed migration failures, upsert to vector store,
 * and inject historical lessons into RAG retrieval + LLM prompts.
 */

import { randomUUID } from 'node:crypto';
import { createRetrievalConfigFromEnv } from '../rag/retrieval.js';
import { lexicalRetrieve } from '../rag/retriever.js';
import { cosineSimilarity, vectorRetrieve } from '../rag/retriever.js';
import type { EmbeddingProvider, KnowledgeChunk } from '../types.js';
import {
  LESSONS_LEARNED_NAMESPACE,
  type AtlasActualPerformance,
  type LessonLearnedDocument,
  type LessonSeverity,
  type MigrationLogDocument,
  type ScoredLesson,
} from './feedbackTypes.js';
import { getMigrationStore, type MigrationStore } from './migrationStore.js';
import { serializeTelemetryContext } from './telemetrySerializer.js';

export const HISTORICAL_LESSONS_HEADING =
  '### HISTORICAL LESSONS LEARNED FROM PAST MIGRATIONS (DO NOT REPEAT THESE MISTAKES)';

/** Default number of lessons to retrieve alongside design patterns. */
export const DEFAULT_LESSONS_TOP_K = 5;

function resolveEmbeddingProvider(): EmbeddingProvider | null {
  const config = createRetrievalConfigFromEnv();
  return config.voyageProvider ?? config.openaiProvider;
}

function tableLabel(log: MigrationLogDocument): string {
  const schema = log.chosenSchema;
  if ('collectionName' in schema) return schema.collectionName;
  if ('name' in schema) return schema.name;
  return log.tableId;
}

function primaryPattern(log: MigrationLogDocument): string {
  if (log.patternsApplied.length === 0) return 'Unknown Pattern';
  return log.patternsApplied
    .map((pattern) => pattern.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()))
    .join(' + ');
}

function classifySeverity(actual: AtlasActualPerformance, breachReasons: string[]): LessonSeverity {
  if (
    actual.actualCacheMissRate > 0.2 ||
    actual.slowQueryCount > 200 ||
    breachReasons.some((reason) => reason.includes('IOPS'))
  ) {
    return 'critical';
  }
  if (breachReasons.length > 0) return 'warning';
  return 'success';
}

/**
 * Format a dense semantic lesson string for embedding and RAG retrieval.
 */
export function formatLessonLearnedText(
  log: MigrationLogDocument,
  actual: AtlasActualPerformance,
  breachReasons: string[],
): string {
  const table = tableLabel(log);
  const pattern = primaryPattern(log);
  const telemetryContext = serializeTelemetryContext(log.sourceTelemetry);
  const severity = classifySeverity(actual, breachReasons);

  const prefix =
    severity === 'critical'
      ? `CRITICAL FAILURE: Table '${table}' migrated using ${pattern}`
      : `PERFORMANCE WARNING: Table '${table}' migrated using ${pattern}`;

  return [
    prefix,
    `resulted in ${(actual.actualCacheMissRate * 100).toFixed(1)}% cache miss rate`,
    `and ${actual.slowQueryCount} slow queries`,
    `under workload ${telemetryContext}.`,
    `Predicted cache-miss ${(log.predictedMetrics.predictedCacheMissRate * 100).toFixed(1)}% vs actual ${(actual.actualCacheMissRate * 100).toFixed(1)}%.`,
    `Root causes: ${breachReasons.join('; ')}.`,
    `Recommendation: avoid ${pattern} for ${log.sourceTelemetry.writePercent >= 60 ? 'write-heavy' : 'read-heavy'} telemetry at ${log.sourceTelemetry.peakRpm} RPM; prefer reference, bucket, or subset patterns instead.`,
  ].join(' ');
}

async function embedLessonText(text: string): Promise<number[] | undefined> {
  const provider = resolveEmbeddingProvider();
  if (!provider) return undefined;
  try {
    const [vector] = await provider.embed([text]);
    return vector;
  } catch (error) {
    console.warn(`[ml_engine/memoryEngine] Embedding failed (${String(error)}); storing lesson without vector.`);
    return undefined;
  }
}

/** Persist a lesson-learned document to the vector store. */
export async function upsertLessonLearned(input: {
  migrationLog: MigrationLogDocument;
  actualMetrics: AtlasActualPerformance;
  breachReasons: string[];
  store?: MigrationStore;
}): Promise<LessonLearnedDocument> {
  const store = input.store ?? getMigrationStore();
  const text = formatLessonLearnedText(input.migrationLog, input.actualMetrics, input.breachReasons);
  const embedding = await embedLessonText(text);
  const lessonId = input.migrationLog.lessonLearnedId ?? `lesson-${randomUUID()}`;

  const lesson: LessonLearnedDocument = {
    lessonId,
    migrationId: input.migrationLog.migrationId,
    tableId: input.migrationLog.tableId,
    namespace: LESSONS_LEARNED_NAMESPACE,
    severity: classifySeverity(input.actualMetrics, input.breachReasons),
    text,
    embedding,
    patternsInvolved: input.migrationLog.patternsApplied,
    telemetrySnapshot: input.migrationLog.sourceTelemetry,
    predictedMetrics: input.migrationLog.predictedMetrics,
    actualMetrics: input.actualMetrics,
    createdAt: new Date().toISOString(),
  };

  await store.upsertLesson(lesson);
  console.info(
    `[ml_engine/memoryEngine] Upserted lesson lessonId=${lessonId} namespace=${LESSONS_LEARNED_NAMESPACE} severity=${lesson.severity}`,
  );
  return lesson;
}

function lessonToScored(lesson: LessonLearnedDocument, score: number): ScoredLesson {
  return {
    lessonId: lesson.lessonId,
    migrationId: lesson.migrationId,
    tableId: lesson.tableId,
    severity: lesson.severity,
    text: lesson.text,
    score,
    namespace: LESSONS_LEARNED_NAMESPACE,
  };
}

function lessonsToKnowledgeChunks(lessons: LessonLearnedDocument[]): KnowledgeChunk[] {
  return lessons.map((lesson) => ({
    sourceFile: `lessons_learned/${lesson.lessonId}`,
    heading: `${lesson.severity.toUpperCase()} — ${lesson.tableId}`,
    text: lesson.text,
  }));
}

/**
 * Query the `lessons_learned` vector space for migrations similar to the current workload.
 */
export async function retrieveLessonsLearned(
  query: string,
  topK = DEFAULT_LESSONS_TOP_K,
  options: { store?: MigrationStore } = {},
): Promise<ScoredLesson[]> {
  const store = options.store ?? getMigrationStore();
  const lessons = await store.listLessons(LESSONS_LEARNED_NAMESPACE);
  if (lessons.length === 0) {
    console.info('[ml_engine/memoryEngine] No lessons_learned documents found — memory retrieval skipped.');
    return [];
  }

  const chunks = lessonsToKnowledgeChunks(lessons);
  const lessonById = new Map(lessons.map((lesson) => [lesson.lessonId, lesson]));
  const provider = resolveEmbeddingProvider();

  if (provider && lessons.some((lesson) => lesson.embedding?.length)) {
    const lessonsWithVectors = lessons.filter((lesson) => lesson.embedding?.length);
    try {
      const [queryVector] = await provider.embed([query]);
      const scored = lessonsWithVectors
        .map((lesson) => lessonToScored(lesson, cosineSimilarity(lesson.embedding!, queryVector)))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      console.info(
        `[ml_engine/memoryEngine] Vector memory hit — pulled ${scored.length} lesson(s): ${scored.map((item) => item.lessonId).join(', ')}`,
      );
      return scored;
    } catch {
      console.warn('[ml_engine/memoryEngine] Vector lesson retrieval failed; falling back to embed-on-read.');
    }
  }

  if (provider) {
    try {
      const vectorScored = await vectorRetrieve(provider, chunks, query, topK);
      console.info(
        `[ml_engine/memoryEngine] Embedded lesson retrieval — pulled ${vectorScored.length} lesson(s) for query.`,
      );
      return vectorScored.map((chunk) => {
        const lessonId = chunk.sourceFile.split('/').pop() ?? '';
        const lesson = lessonById.get(lessonId);
        return lesson
          ? lessonToScored(lesson, chunk.score)
          : {
              lessonId,
              migrationId: 'unknown',
              tableId: 'unknown',
              severity: 'warning' as LessonSeverity,
              text: chunk.text,
              score: chunk.score,
              namespace: LESSONS_LEARNED_NAMESPACE,
            };
      });
    } catch {
      // fall through to lexical
    }
  }

  const lexicalScored = lexicalRetrieve(chunks, query, topK);
  if (lexicalScored.length > 0) {
    console.info(
      `[ml_engine/memoryEngine] Lexical memory hit — pulled ${lexicalScored.length} lesson(s) protecting current run.`,
    );
  }
  return lexicalScored.map((chunk) => {
    const lessonId = chunk.sourceFile.split('/').pop() ?? '';
    const lesson = lessonById.get(lessonId);
    return lesson
      ? lessonToScored(lesson, chunk.score)
      : {
          lessonId,
          migrationId: 'unknown',
          tableId: 'unknown',
          severity: 'warning' as LessonSeverity,
          text: chunk.text,
          score: chunk.score,
          namespace: LESSONS_LEARNED_NAMESPACE,
        };
  });
}

/** Render lessons as the strict markdown section required by the LLM prompt. */
export function renderHistoricalLessonsSection(lessons: ScoredLesson[]): string {
  if (lessons.length === 0) {
    return `${HISTORICAL_LESSONS_HEADING}\n\n_No historical migration failures matched this workload yet._`;
  }

  const lines = [
    HISTORICAL_LESSONS_HEADING,
    '',
    'The following lessons were retrieved from past migrations with similar telemetry. Treat them as hard constraints:',
    '',
  ];

  for (const lesson of lessons) {
    lines.push(
      `- **[${lesson.severity.toUpperCase()}]** (relevance ${lesson.score.toFixed(3)}, table \`${lesson.tableId}\`, migration \`${lesson.migrationId}\`)`,
      `  ${lesson.text}`,
      '',
    );
  }

  return lines.join('\n');
}
