/**
 * Shared types for the hvyMETL ML engine: telemetry-aware reranking and
 * predictive schema criticism before ETL handoff.
 */

import type { CollectionPlan, KnowledgeChunk, ScoredChunk, SqlStructuralModel, WorkloadProfile } from '../types.js';
import type { ScoredLesson } from './feedbackTypes.js';

/** Normalized workload telemetry used by reranker and critic feature tensors. */
export type TelemetryData = {
  /** Read operations as a fraction of total traffic, 0–1. */
  readWriteRatio: number;
  /** Peak requests per minute at the source database. */
  peakRpm: number;
  /** Estimated data growth in megabytes per month. */
  dataGrowthMbPerMonth: number;
  /** Largest table row count or relationship fan-out used as cardinality proxy. */
  cardinality: number;
  /** Original human-readable growth label, e.g. "10GB/month". */
  growthRateLabel: string;
  /** Read percentage 0–100 for display strings. */
  readPercent: number;
  /** Write percentage 0–100 for display strings. */
  writePercent: number;
};

/** Document layout properties the performance critic evaluates. */
export type SchemaCandidate = {
  /** Target MongoDB collection name. */
  collectionName: string;
  /** Maximum nesting depth in the proposed JSON Schema tree. */
  nestingDepth: number;
  /** True when the schema embeds one or more unbounded or bounded arrays. */
  hasArrays: boolean;
  /** Number of indexes declared for this collection. */
  indexCount: number;
  /** True when the plan expects a sharded cluster topology. */
  isSharded: boolean;
  /** Source SQL table row count backing this collection. */
  sourceRowCount: number;
  /** Optional full collection plan for explanation strings. */
  plan?: CollectionPlan;
};

/** Single ONNX / heuristic prediction from the performance critic. */
export type PerformancePrediction = {
  predictedCacheMissRate: number;
  predictedIopsUtilization: number;
  storageFootprintMultiplier: number;
};

/** Verdict returned after critic inference. */
export type EvaluationVerdict = 'APPROVED' | 'REJECTED';

export type EvaluationResult = {
  verdict: EvaluationVerdict;
  prediction: PerformancePrediction;
  /** Plain-English rationale, especially when REJECTED. */
  explanation: string;
  /** Whether inference used the ONNX model or the heuristic fallback. */
  usedOnnxModel: boolean;
};

/** Options for the cross-encoder reranker. */
export type RerankerOptions = {
  /** Minimum relevance score (0–1) to keep a pattern. Default 0.25. */
  scoreThreshold?: number;
  /** Hugging Face model id for the cross-encoder. */
  modelId?: string;
  /** Max patterns to return after reranking. Default 3. */
  topK?: number;
};

/** Context passed into schema generation (rule-based or LLM). */
export type SchemaGenerationContext = {
  model: SqlStructuralModel;
  profile: WorkloadProfile;
  telemetry: TelemetryData;
  /** Bi-encoder retrieval results (typically top 15). */
  retrievedChunks: ScoredChunk[];
  /** Cross-encoder reranked patterns (typically top 3). */
  rerankedChunks: ScoredChunk[];
  /** Notes from a rejected critic pass, appended on regeneration loops. */
  criticFeedback?: string;
  /** Historical lessons from past migrations (lessons_learned namespace). */
  historicalLessonsMarkdown?: string;
  lessonChunks?: ScoredLesson[];
  /** Zero-based regeneration attempt (0 = first pass). */
  attempt: number;
};

export type SchemaGenerator = (context: SchemaGenerationContext) => Promise<import('../types.js').MigrationPlan>;

/** Result of the ML-enhanced design orchestration. */
export type MlEnhancedDesignResult = {
  plan: import('../types.js').MigrationPlan;
  telemetry: TelemetryData;
  biEncoderChunks: ScoredChunk[];
  rerankedChunks: ScoredChunk[];
  criticEvaluations: EvaluationResult[];
  regenerationAttempts: number;
  designReportExtras: string;
  historicalLessonsMarkdown: string;
  lessonChunks: ScoredLesson[];
  migrationLogIds: string[];
};

/** Candidate pattern document paired with retrieval metadata. */
export type PatternCandidate = ScoredChunk | (KnowledgeChunk & { score: number });
