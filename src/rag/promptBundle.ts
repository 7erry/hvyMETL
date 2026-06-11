/**
 * Prompt bundle assembly.
 *
 * The `hvymetl prompt` command produces the three "hardened production
 * prompts" from the RAG migration blueprint, with every placeholder filled
 * in from real inputs:
 *   - Retrieved RAG context  -> the top-scoring knowledge-base chunks
 *   - Legacy SQL DDL         -> dumped from the actual source database
 *   - Workload telemetry     -> the selected profile's numbers
 *
 * The output is plain markdown, ready to paste into Cursor or send to any
 * LLM API.
 */

import type { ScoredChunk, WorkloadProfile } from '../types.js';

/** Everything needed to render the three prompts. */
export type PromptBundleInput = {
  /** The workload profile selected at runtime. */
  profile: WorkloadProfile;
  /** The legacy SQL DDL dumped from the source database. */
  ddl: string;
  /** Knowledge chunks retrieved for this workload, highest score first. */
  retrievedChunks: ScoredChunk[];
};

/** A named prompt file: the file name it should be written to plus its text. */
export type PromptFile = {
  fileName: string;
  content: string;
};

/** Render the retrieved chunks as a cited RAG context block. */
function renderRagContext(chunks: ScoredChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `### [${chunk.sourceFile}] ${chunk.heading} (relevance ${chunk.score.toFixed(3)})\n\n${chunk.text}`,
    )
    .join('\n\n');
}

/** Render the telemetry numbers as a compact, reusable block. */
function renderTelemetry(profile: WorkloadProfile): string {
  const { telemetry } = profile;
  return [
    `- Workload Type: ${profile.label}`,
    `- Read:Write Ratio: ${telemetry.readPercent}:${telemetry.writePercent}`,
    `- Peak Throughput: ${telemetry.peakRpm.toLocaleString('en-US')} RPM`,
    `- Data Growth Rate: ${telemetry.growthRate}`,
    `- Write Concern: w: ${JSON.stringify(profile.writeConcern.w)}, journal: ${profile.writeConcern.journal}`,
  ].join('\n');
}

/** Build all three production prompts for the given inputs. */
export function buildPromptBundle(input: PromptBundleInput): PromptFile[] {
  const ragContext = renderRagContext(input.retrievedChunks);
  const telemetry = renderTelemetry(input.profile);

  const schemaArchitectPrompt = `# Prompt 1: The RAG-Driven Schema Design Architect

Role: You are an Enterprise Data Architect and MongoDB RAG Engine. You synthesize structural metadata with live system telemetry to output optimized document models.

## Retrieved RAG Context

${ragContext}

## Legacy SQL DDL

\`\`\`sql
${input.ddl.trim()}
\`\`\`

## Workload Telemetry

${telemetry}

## Task

Analyze the SQL DDL through the lens of the Workload Telemetry and the retrieved MongoDB Design Patterns above. Synthesize a production-ready, pattern-driven MongoDB schema.

Mandatory Synthesis Rules:
1. Telemetry-Driven Pattern Selection: if the workload is heavy-read, aggressively apply the Extended Reference and Computed patterns to pre-duplicate lookup data and aggregate values, optimizing for O(1) single-document reads. If the workload is heavy-write, avoid large embedded arrays; apply the Bucket pattern or reference strategies to keep writes fast. If RPM is high, ensure document boundaries protect against lock contention.
2. Avoid the Monolith: no embedded array may grow infinitely under the stated RPM and growth metrics. Apply the Subset pattern to bound arrays strictly if they risk the 16MB limit.
3. Ground every decision in the retrieved context: cite the pattern document that justifies each choice.

Output: the final MongoDB layout in clean JSON Schema format, including single/compound index specs, and an architectural justification mapping each pattern choice directly to the Read:Write ratio and RPM constraints above.
`;

  const etlGeneratorPrompt = `# Prompt 2: Parallel Pattern-Aware ETL Script Generator

Role: You are a Principal Data Engineer specializing in high-concurrency, pattern-grounded ETL pipelines.

## Context

Our pattern-driven MongoDB schema is established from this telemetry:

${telemetry}

We are using csvToAtlas to merge partitioned CSV files concurrently into unified collections.

## Retrieved RAG Context

${ragContext}

## Task

Write a highly resilient, multi-threaded extraction and migration script that structures SQL data into pattern-compliant CSV shapes.

CRITICAL ARCHITECTURAL CONSTRAINTS:
1. Pattern Formatting Layer: shape the CSV data to match the patterns above. For Extended Reference, the SQL extraction query must pre-join and select lookup fields inline so the CSV contains the duplicated metadata. For Computed patterns, initialize counter fields in the base document payload.
2. Massive Parallelism via Non-Overlapping Range Splits: compute numeric or date-based primary-key ranges to split source tables into distinct chunks. Spawn up to MAX_PARALLEL_WORKERS = 8 concurrent workers.
3. Concurrency-Safe Merging: when parallel csvToAtlas tasks merge rows into the same collection, use deterministic _id values derived from the SQL primary keys to perform atomic upserts, preventing race conditions or duplicate documents.
4. Memory Optimization: stream database rows to disk chunk-by-chunk to enforce a strict O(1) RAM utilization limit.
5. Safe Ingestion Gate: implement a DRY_RUN=true flag that limits extraction to exactly 3 parallel chunks of 1,000 records each, printing structural validation logs before running at production scale.
`;

  const repositoryPrompt = `# Prompt 3: Concurrency-Safe Repository Layer (Pattern & Telemetry Aware)

Role: You are a Senior Backend Engineer and MongoDB Thread-Safety Expert.

## Workload Telemetry

${telemetry}

## Retrieved RAG Context

${ragContext}

## Task

Rewrite the legacy SQL data repository into a MongoDB repository using the native driver.

Requirements:
1. Telemetry Optimization: given the operational volume above, configure connection pooling (maxPoolSize: ${input.profile.pool.maxPoolSize}, minPoolSize: ${input.profile.pool.minPoolSize}, socketTimeoutMS: ${input.profile.pool.socketTimeoutMS}) to sustain peak traffic without dropping connections.
2. Atomic Pattern Maintenance: write all updates with atomic MongoDB modifiers ($inc for Computed pattern counters, $push with $slice and $position for Subset pattern arrays). Application-side read-modify-write loops are strictly forbidden.
3. Write Concern Tuning: apply the workload's write concern (w: ${JSON.stringify(input.profile.writeConcern.w)}, journal: ${input.profile.writeConcern.journal}).
`;

  return [
    { fileName: '1-schema-design-architect.md', content: schemaArchitectPrompt },
    { fileName: '2-parallel-etl-generator.md', content: etlGeneratorPrompt },
    { fileName: '3-repository-layer.md', content: repositoryPrompt },
  ];
}

/**
 * Build the retrieval query used to pull pattern chunks for a workload.
 * Combines the profile's telemetry language with its preferred patterns so
 * both lexical and vector retrieval find the right documents.
 */
export function buildRetrievalQuery(profile: WorkloadProfile): string {
  const direction = profile.telemetry.writePercent >= 60 ? 'heavy-write' : 'heavy-read';
  return [
    profile.label,
    direction,
    `${profile.telemetry.readPercent}:${profile.telemetry.writePercent} read write ratio`,
    `${profile.telemetry.peakRpm} requests per minute`,
    profile.telemetry.growthRate,
    'schema design pattern selection embed reference index 16MB limit',
    profile.preferredPatterns.join(' '),
  ].join(' ');
}
