/**
 * Telemetry-aware reranker for MongoDB design patterns.
 *
 * Priority:
 *   1. MONGODB_MODEL_KEY set → Voyage rerank-2.5 API (batch rerank)
 *   2. otherwise            → local Xenova/ms-marco-MiniLM-L-6-v2 cross-encoder
 *   3. on failure           → deterministic telemetry heuristic
 */

import type { ScoredChunk } from '../types.js';
import { isVoyageRerankerConfigured, voyageRerank } from '../rag/voyageReranker.js';
import { createModelSingleton } from './modelSingleton.js';
import { serializePatternDocument, serializeTelemetryContext } from './telemetrySerializer.js';
import type { PatternCandidate, RerankerOptions, TelemetryData } from './types.js';

export const DEFAULT_RERANKER_MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2';
export const DEFAULT_RERANK_THRESHOLD = 0.25;
export const DEFAULT_RERANK_TOP_K = 3;

export type RerankBackend = 'voyage' | 'xenova' | 'heuristic';

type CrossEncoderPipeline = (
  text: string,
  options?: { text_pair?: string },
) => Promise<Array<{ label: string; score: number }>>;

type TransformersModule = {
  env: { allowLocalModels: boolean; useBrowserCache: boolean };
  pipeline: (
    task: 'text-classification',
    model: string,
  ) => Promise<CrossEncoderPipeline>;
};

/** Load the local cross-encoder pipeline once per process (offline fallback). */
const crossEncoderSingleton = createModelSingleton(async (): Promise<CrossEncoderPipeline> => {
  const transformers = (await import('@xenova/transformers')) as TransformersModule;
  transformers.env.allowLocalModels = true;
  transformers.env.useBrowserCache = true;
  const modelId = process.env.HVYMETL_RERANKER_MODEL?.trim() || DEFAULT_RERANKER_MODEL;
  return transformers.pipeline('text-classification', modelId);
});

/**
 * Deterministic fallback when API / transformers fail or are disabled.
 * Boosts patterns whose headings/text align with telemetry keywords.
 */
export function heuristicRerankScore(telemetry: TelemetryData, candidate: PatternCandidate): number {
  const text = `${candidate.sourceFile} ${candidate.heading} ${candidate.text}`.toLowerCase();
  let score = Math.min(1, Math.max(0, candidate.score / Math.max(candidate.score, 1)));

  if (telemetry.readPercent >= 70 && /extended reference|computed|embed|subset/.test(text)) score += 0.35;
  if (telemetry.writePercent >= 60 && /bucket|reference|preallocation/.test(text)) score += 0.35;
  if (telemetry.peakRpm >= 100_000 && /bucket|subset|shard|single collection/.test(text)) score += 0.2;
  if (telemetry.dataGrowthMbPerMonth >= 50_000 && /bucket|archive|outlier/.test(text)) score += 0.2;
  if (telemetry.cardinality >= 1_000_000 && /bucket|archive|reference/.test(text)) score += 0.15;

  return Math.min(1, score);
}

function heuristicRerankAll(
  candidates: PatternCandidate[],
  telemetry: TelemetryData,
): ScoredChunk[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: heuristicRerankScore(telemetry, candidate),
    }))
    .sort((a, b) => b.score - a.score);
}

async function voyageRerankCandidates(
  candidates: PatternCandidate[],
  telemetryContext: string,
  topK: number,
): Promise<ScoredChunk[]> {
  const documents = candidates.map((candidate) => serializePatternDocument(candidate));
  const ranked = await voyageRerank(telemetryContext, documents, { topK: candidates.length });

  const scored = ranked.map((item) => ({
    ...candidates[item.index],
    score: item.relevanceScore,
  }));

  console.info(
    `[ml_engine/reranker] Voyage rerank-2.5 scored ${scored.length} pattern(s); top score ${scored[0]?.score.toFixed(3) ?? 'n/a'}`,
  );

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

async function xenovaRerankCandidates(
  candidates: PatternCandidate[],
  telemetry: TelemetryData,
  telemetryContext: string,
): Promise<ScoredChunk[]> {
  const pipeline = await crossEncoderSingleton.getInstance();

  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      const patternDocument = serializePatternDocument(candidate);
      try {
        const outputs = await pipeline(telemetryContext, { text_pair: patternDocument });
        const relevant = outputs.find((item) => item.label === 'LABEL_1') ?? outputs[0];
        const score = relevant?.score ?? heuristicRerankScore(telemetry, candidate);
        return { ...candidate, score } satisfies ScoredChunk;
      } catch {
        return { ...candidate, score: heuristicRerankScore(telemetry, candidate) } satisfies ScoredChunk;
      }
    }),
  );

  console.info(
    `[ml_engine/reranker] Xenova cross-encoder scored ${scored.length} pattern(s).`,
  );

  return scored.sort((a, b) => b.score - a.score);
}

export type RerankResult = {
  chunks: ScoredChunk[];
  /** @deprecated Use rerankBackend instead. */
  usedCrossEncoder: boolean;
  rerankBackend: RerankBackend;
  telemetryContext: string;
};

/**
 * Rerank bi-encoder candidates with telemetry-aware scoring.
 *
 * @param candidates - Typically the top 15 patterns from vector/BM25 retrieval.
 * @param telemetry - Normalized workload telemetry for the source table/workload.
 * @param options - Threshold, topK, and optional model override.
 */
export async function rerankPatterns(
  candidates: PatternCandidate[],
  telemetry: TelemetryData,
  options: RerankerOptions = {},
): Promise<RerankResult> {
  const threshold = options.scoreThreshold ?? DEFAULT_RERANK_THRESHOLD;
  const topK = options.topK ?? DEFAULT_RERANK_TOP_K;
  const telemetryContext = serializeTelemetryContext(telemetry);

  if (candidates.length === 0) {
    return { chunks: [], usedCrossEncoder: false, rerankBackend: 'heuristic', telemetryContext };
  }

  let scored: ScoredChunk[] = [];
  let rerankBackend: RerankBackend = 'heuristic';

  if (process.env.HVYMETL_DISABLE_ML_RERANKER !== '1') {
    if (isVoyageRerankerConfigured()) {
      try {
        scored = await voyageRerankCandidates(candidates, telemetryContext, candidates.length);
        rerankBackend = 'voyage';
      } catch (error) {
        console.warn(
          `[ml_engine/reranker] Voyage rerank-2.5 failed (${String(error)}); using heuristic reranking.`,
        );
        scored = heuristicRerankAll(candidates, telemetry);
        rerankBackend = 'heuristic';
      }
    } else {
      try {
        scored = await xenovaRerankCandidates(candidates, telemetry, telemetryContext);
        rerankBackend = 'xenova';
      } catch (error) {
        console.warn(
          `[ml_engine/reranker] Xenova cross-encoder unavailable (${String(error)}); using heuristic reranking.`,
        );
        scored = heuristicRerankAll(candidates, telemetry);
        rerankBackend = 'heuristic';
      }
    }
  } else {
    scored = heuristicRerankAll(candidates, telemetry);
  }

  const chunks = scored
    .filter((chunk) => chunk.score >= threshold)
    .slice(0, topK);

  return {
    chunks: chunks.length > 0 ? chunks : scored.slice(0, topK),
    usedCrossEncoder: rerankBackend !== 'heuristic',
    rerankBackend,
    telemetryContext,
  };
}

/** Reset the cached Xenova cross-encoder (useful in tests). */
export function resetRerankerSingleton(): void {
  crossEncoderSingleton.reset();
}
