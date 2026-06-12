/**
 * ML-enhanced orchestration patch for the hvyMETL design / RAG generation loop.
 *
 * Flow:
 *   1. Parse SQL model + extract workload telemetry
 *   2. Bi-encoder retrieval -> top 15 patterns
 *   3. Cross-encoder reranker -> top 3 telemetry-matched patterns
 *   4. Schema generation (rule-based default or LLM hook)
 *   5. Predictive critic -> approve or regenerate (max 2 loops)
 *   6. Return plan ready for parallel ETL workers
 *
 * Integration points:
 *   - Retrieval: `src/rag/retrieval.ts` + `src/rag/promptBundle.ts`
 *   - Rule-based schema: `src/design/patternSelector.ts`
 *   - DDL/UI entry: `src/design/designFromModel.ts`, `src/design/designCommand.ts`
 */

import { loadKnowledgeBase } from '../rag/chunker.js';
import {
  createRetrievalConfigFromEnv,
  describeRetrievalStrategy,
  retrieveWithLessonsLearned,
} from '../rag/retrieval.js';
import { buildRetrievalQuery } from '../rag/promptBundle.js';
import { buildMigrationPlan } from '../design/patternSelector.js';
import type { MigrationPlan, ScoredChunk, SqlStructuralModel, WorkloadProfile } from '../types.js';
import { evaluateAllSchemaCandidates } from './critic.js';
import { logMigrationPlanDecisions, scheduleReflection } from './feedbackCollector.js';
import { HISTORICAL_LESSONS_HEADING } from './memoryEngine.js';
import { rerankPatterns } from './reranker.js';
import { toSchemaCandidates } from './schemaMapper.js';
import { buildTelemetryData } from './telemetrySerializer.js';
import type {
  MlEnhancedDesignResult,
  SchemaGenerationContext,
  SchemaGenerator,
} from './types.js';

/** Bi-encoder candidate pool size before cross-encoder reranking. */
export const BI_ENCODER_TOP_K = 15;
/** Cross-encoder shortlist size fed into schema prompts. */
export const RERANK_TOP_K = 3;
/** Maximum critic-driven regeneration loops after the first attempt. */
export const MAX_CRITIC_REGENERATION_LOOPS = 2;

export type MlEnhancedDesignOptions = {
  model: SqlStructuralModel;
  profile: WorkloadProfile;
  knowledgeDir: string;
  biEncoderTopK?: number;
  rerankTopK?: number;
  maxCriticLoops?: number;
  /** Override default rule-based generator (e.g. LLM-backed synthesis). */
  schemaGenerator?: SchemaGenerator;
  /** Atlas cluster id for post-migration reflection (defaults to env). */
  clusterId?: string;
  /** When true, schedule async reflection after logging decisions. */
  schedulePostMigrationReflection?: boolean;
};

/** Default rule-based schema generator; critic feedback is appended to the report extras. */
export async function defaultSchemaGenerator(context: SchemaGenerationContext): Promise<MigrationPlan> {
  const plan = buildMigrationPlan(context.model, context.profile);
  plan.source = context.model.source;
  return plan;
}

function buildCriticFeedbackBlock(evaluations: import('./types.js').EvaluationResult[]): string {
  const rejected = evaluations.filter((item) => item.verdict === 'REJECTED');
  if (rejected.length === 0) return '';

  return [
    '## Performance Critic Feedback (regeneration required)',
    '',
    'The predictive critic rejected the prior schema synthesis. Apply these constraints on the next pass:',
    '',
    ...rejected.map((item) => item.explanation),
    '',
    'Mitigations to apply:',
    '- Prefer reference or subset patterns over deep embeds when cache-miss risk is high.',
    '- Reduce compound indexes; align indexes to the highest-selectivity query paths only.',
    '- Apply bucket or archive patterns when RPM or growth metrics stress IOPS headroom.',
    '',
  ].join('\n');
}

function renderMlDesignExtras(
  biEncoderChunks: ScoredChunk[],
  rerankedChunks: ScoredChunk[],
  telemetryContext: string,
  retrievalStrategy: string,
  criticEvaluations: import('./types.js').EvaluationResult[],
  regenerationAttempts: number,
): string {
  const lines = [
    '## ML Engine Trace',
    '',
    `- Retrieval strategy: ${retrievalStrategy}`,
    `- Bi-encoder candidates: ${biEncoderChunks.length}`,
    `- Cross-encoder shortlist: ${rerankedChunks.length}`,
    `- Telemetry context: ${telemetryContext}`,
    `- Critic regeneration attempts: ${regenerationAttempts}`,
    '',
    '### Cross-Encoder Reranked Patterns',
    '',
  ];

  for (const chunk of rerankedChunks) {
    lines.push(`#### [${chunk.sourceFile}] ${chunk.heading} (score ${chunk.score.toFixed(3)})`, '', chunk.text, '');
  }

  lines.push('### Performance Critic Evaluations', '');
  for (const evaluation of criticEvaluations) {
    lines.push(
      `- **${evaluation.verdict}** (onnx=${evaluation.usedOnnxModel}) — cache-miss ${(evaluation.prediction.predictedCacheMissRate * 100).toFixed(1)}%, IOPS ${(evaluation.prediction.predictedIopsUtilization * 100).toFixed(1)}%, storage x${evaluation.prediction.storageFootprintMultiplier.toFixed(2)}`,
    );
    lines.push(`  ${evaluation.explanation.replace(/\n/g, '\n  ')}`);
  }

  return lines.join('\n');
}

/**
 * Run the telemetry-aware ML design pipeline.
 *
 * Drop-in replacement for the retrieval + plan section of `designFromModel`:
 *
 * ```ts
 * // Before (designFromModel.ts):
 * const retrieved = await retrieve(chunks, buildRetrievalQuery(profile), 8, retrievalConfig);
 * const plan = buildMigrationPlan(model, profile);
 *
 * // After:
 * const mlResult = await runMlEnhancedDesign({ model, profile, knowledgeDir });
 * const { plan, rerankedChunks, designReportExtras } = mlResult;
 * ```
 */
export async function runMlEnhancedDesign(options: MlEnhancedDesignOptions): Promise<MlEnhancedDesignResult> {
  const biEncoderTopK = options.biEncoderTopK ?? BI_ENCODER_TOP_K;
  const rerankTopK = options.rerankTopK ?? RERANK_TOP_K;
  const maxLoops = options.maxCriticLoops ?? MAX_CRITIC_REGENERATION_LOOPS;
  const generateSchema = options.schemaGenerator ?? defaultSchemaGenerator;

  const chunks = loadKnowledgeBase(options.knowledgeDir);
  const retrievalConfig = createRetrievalConfigFromEnv();
  const retrievalQuery = buildRetrievalQuery(options.profile);
  const telemetry = buildTelemetryData(options.profile, options.model);

  // Step 2 — bi-encoder retrieval + lessons_learned memory (parallel).
  const memoryRetrieval = await retrieveWithLessonsLearned(
    chunks,
    retrievalQuery,
    biEncoderTopK,
    retrievalConfig,
  );
  const biEncoderChunks = memoryRetrieval.patternChunks;
  const { historicalLessonsMarkdown, lessonChunks } = memoryRetrieval;

  // Step 3 — telemetry-aware cross-encoder reranker.
  const { chunks: rerankedChunks, telemetryContext } = await rerankPatterns(biEncoderChunks, telemetry, {
    topK: rerankTopK,
  });

  let criticFeedback: string | undefined;
  let plan: MigrationPlan | null = null;
  let criticEvaluations: import('./types.js').EvaluationResult[] = [];
  let regenerationAttempts = 0;

  // Steps 4–5 — schema generation with critic gate (max 2 regeneration loops).
  for (let attempt = 0; attempt <= maxLoops; attempt += 1) {
    const context: SchemaGenerationContext = {
      model: options.model,
      profile: options.profile,
      telemetry,
      retrievedChunks: biEncoderChunks,
      rerankedChunks,
      criticFeedback,
      historicalLessonsMarkdown,
      lessonChunks,
      attempt,
    };

    plan = await generateSchema(context);
    const schemaCandidates = toSchemaCandidates(plan.collections, options.model, telemetry.peakRpm);
    const criticResult = await evaluateAllSchemaCandidates(schemaCandidates, telemetry);
    criticEvaluations = criticResult.evaluations;

    if (criticResult.approved) break;

    regenerationAttempts += 1;
    criticFeedback = buildCriticFeedbackBlock(criticEvaluations);

    if (attempt === maxLoops) {
      console.warn(
        `[ml_engine/pipelinePatch] Schema still rejected after ${maxLoops} regeneration loop(s); returning last plan with critic notes.`,
      );
    }
  }

  const schemaCandidates = toSchemaCandidates(plan!.collections, options.model, telemetry.peakRpm);
  const fallbackPrediction = criticEvaluations[0]?.prediction ?? {
    predictedCacheMissRate: 0.05,
    predictedIopsUtilization: 0.4,
    storageFootprintMultiplier: 1.1,
  };
  const migrationLogIds = await logMigrationPlanDecisions(
    options.model.source,
    telemetry,
    schemaCandidates.map((schema, index) => ({
      schema,
      prediction: criticEvaluations[index]?.prediction ?? fallbackPrediction,
    })),
    { clusterId: options.clusterId },
  );

  const shouldSchedule =
    options.schedulePostMigrationReflection ??
    process.env.HVYMETL_SCHEDULE_REFLECTION?.trim() === '1';
  if (shouldSchedule) {
    for (const migrationId of migrationLogIds) {
      scheduleReflection(migrationId, { clusterId: options.clusterId });
    }
  }

  const designReportExtras = [
    renderMlDesignExtras(
      biEncoderChunks,
      rerankedChunks,
      telemetryContext,
      describeRetrievalStrategy(retrievalConfig),
      criticEvaluations,
      regenerationAttempts,
    ),
    '',
    historicalLessonsMarkdown.includes(HISTORICAL_LESSONS_HEADING)
      ? historicalLessonsMarkdown
      : '',
    '',
    `### Migration Feedback Logs`,
    '',
    ...migrationLogIds.map((id) => `- Logged decision \`${id}\` → hvymetl_migration_logs`),
  ]
    .filter(Boolean)
    .join('\n');

  return {
    plan: plan!,
    telemetry,
    biEncoderChunks,
    rerankedChunks,
    criticEvaluations,
    regenerationAttempts,
    designReportExtras,
    historicalLessonsMarkdown,
    lessonChunks,
    migrationLogIds,
  };
}

/**
 * Patch helper for `designFromModel.ts` — swap the body of `designFromModel`
 * with this call and merge `designReportExtras` into the markdown report.
 */
export async function designFromModelWithMlEngine(
  model: SqlStructuralModel,
  profile: WorkloadProfile,
  knowledgeDir: string,
  options: {
    schemaGenerator?: SchemaGenerator;
    schedulePostMigrationReflection?: boolean;
    clusterId?: string;
  } = {},
): Promise<{
  plan: MigrationPlan;
  designReport: string;
  retrievalStrategy: string;
  ml: MlEnhancedDesignResult;
}> {
  const ml = await runMlEnhancedDesign({
    model,
    profile,
    knowledgeDir,
    schemaGenerator: options.schemaGenerator,
    schedulePostMigrationReflection: options.schedulePostMigrationReflection,
    clusterId: options.clusterId,
  });
  const designReport = [
    '# Migration Design Report (ML-Enhanced)',
    '',
    `- Source: \`${ml.plan.source}\``,
    `- Profile: ${profile.label} (${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W)`,
    `- Generated: ${ml.plan.generatedAt}`,
    '',
    ml.designReportExtras,
    '',
    '## Collections',
    '',
    ...ml.plan.collections.flatMap((collection) => [
      `### ${collection.name}`,
      '',
      ...collection.patterns.map(
        (decision) => `- **${decision.pattern}** on \`${decision.target}\` — ${decision.reason}`,
      ),
      '',
    ]),
  ].join('\n');

  return {
    plan: ml.plan,
    designReport,
    retrievalStrategy: describeRetrievalStrategy(createRetrievalConfigFromEnv()),
    ml,
  };
}
