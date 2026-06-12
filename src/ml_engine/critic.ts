/**
 * Predictive performance critic for proposed MongoDB document schemas.
 *
 * Runs tabular inference via onnxruntime-node when a trained model is present,
 * otherwise applies a transparent heuristic aligned with Atlas constraint signals.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createModelSingleton } from './modelSingleton.js';
import type {
  EvaluationResult,
  PerformancePrediction,
  SchemaCandidate,
  TelemetryData,
} from './types.js';

/** Number of float features fed into the ONNX critic model. */
export const CRITIC_FEATURE_COUNT = 8;

/** Rejection thresholds tuned for Atlas working-set and IOPS headroom. */
export const CACHE_MISS_REJECT_THRESHOLD = 0.15;
export const IOPS_UTIL_REJECT_THRESHOLD = 0.85;

export const DEFAULT_CRITIC_MODEL_PATH = join(process.cwd(), 'models', 'performance-critic.onnx');

type CriticOnnxSession = {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
  inputNames: readonly string[];
  outputNames: readonly string[];
};

const criticSessionSingleton = createModelSingleton(async (): Promise<CriticOnnxSession> => {
  const modelPath = process.env.HVYMETL_CRITIC_MODEL_PATH?.trim() || DEFAULT_CRITIC_MODEL_PATH;
  if (!existsSync(modelPath)) {
    throw new Error(`ONNX critic model not found at ${modelPath}`);
  }

  const ort = await import('onnxruntime-node');
  return ort.InferenceSession.create(modelPath) as Promise<CriticOnnxSession>;
});

function logNormalize(value: number, pivot: number): number {
  return Math.log10(Math.max(value, 1)) / Math.log10(Math.max(pivot, 1));
}

/**
 * Flatten schema + telemetry into the critic feature vector.
 *
 * Order: nestingDepth, hasArrays, indexCount, isSharded, readWriteRatio,
 * peakRpm, dataGrowthMbPerMonth, cardinality — each normalized to ~0–1.
 */
export function buildCriticFeatureVector(schema: SchemaCandidate, telemetry: TelemetryData): Float32Array {
  return new Float32Array([
    Math.min(schema.nestingDepth / 5, 1),
    schema.hasArrays ? 1 : 0,
    Math.min(schema.indexCount / 12, 1),
    schema.isSharded ? 1 : 0,
    Math.min(telemetry.readWriteRatio / 10, 1),
    logNormalize(telemetry.peakRpm, 600_000),
    logNormalize(telemetry.dataGrowthMbPerMonth, 1_000_000),
    logNormalize(Math.max(schema.sourceRowCount, telemetry.cardinality), 10_000_000),
  ]);
}

/** Heuristic critic used when ONNX is missing or inference fails. */
export function heuristicPredict(
  schema: SchemaCandidate,
  telemetry: TelemetryData,
): PerformancePrediction {
  const depthPenalty = schema.nestingDepth >= 4 ? 0.12 : schema.nestingDepth >= 3 ? 0.06 : 0.02;
  const arrayPenalty =
    schema.hasArrays && telemetry.readPercent >= 70 ? 0.1 : schema.hasArrays ? 0.05 : 0;
  const embedReadPenalty =
    schema.hasArrays && telemetry.peakRpm >= 100_000 ? 0.08 : 0;
  const predictedCacheMissRate = Math.min(
    0.95,
    depthPenalty + arrayPenalty + embedReadPenalty + (schema.isSharded ? 0.03 : 0),
  );

  const indexPressure = schema.indexCount * 0.04;
  const rpmPressure = logNormalize(telemetry.peakRpm, 600_000) * 0.45;
  const writePressure = telemetry.writePercent >= 60 ? 0.15 : 0.05;
  const predictedIopsUtilization = Math.min(0.99, indexPressure + rpmPressure + writePressure);

  const embedStorage = schema.hasArrays ? 1.35 : 1;
  const growthStorage = 1 + logNormalize(telemetry.dataGrowthMbPerMonth, 500_000) * 0.8;
  const duplicationStorage = schema.nestingDepth >= 3 ? 1.2 : 1;
  const storageFootprintMultiplier = embedStorage * growthStorage * duplicationStorage;

  return { predictedCacheMissRate, predictedIopsUtilization, storageFootprintMultiplier };
}

function buildRejectionExplanation(
  schema: SchemaCandidate,
  telemetry: TelemetryData,
  prediction: PerformancePrediction,
): string {
  const conflicts: string[] = [];

  if (prediction.predictedCacheMissRate > CACHE_MISS_REJECT_THRESHOLD) {
    conflicts.push(
      `predicted cache-miss rate ${(prediction.predictedCacheMissRate * 100).toFixed(1)}% exceeds ${(CACHE_MISS_REJECT_THRESHOLD * 100).toFixed(0)}% — nesting depth ${schema.nestingDepth} with ${telemetry.readPercent}:${telemetry.writePercent} R:W favors reference/subset over deep embeds`,
    );
  }

  if (prediction.predictedIopsUtilization > IOPS_UTIL_REJECT_THRESHOLD) {
    conflicts.push(
      `predicted IOPS utilization ${(prediction.predictedIopsUtilization * 100).toFixed(1)}% exceeds ${(IOPS_UTIL_REJECT_THRESHOLD * 100).toFixed(0)}% — ${schema.indexCount} indexes at ${telemetry.peakRpm.toLocaleString('en-US')} RPM need consolidation or bucket partitioning`,
    );
  }

  if (conflicts.length === 0) {
    return `Collection \`${schema.collectionName}\` passed critic checks (cache-miss ${(prediction.predictedCacheMissRate * 100).toFixed(1)}%, IOPS ${(prediction.predictedIopsUtilization * 100).toFixed(1)}%).`;
  }

  return [`Collection \`${schema.collectionName}\` rejected by performance critic:`, ...conflicts.map((c) => `- ${c}`)].join('\n');
}

async function runOnnxInference(features: Float32Array): Promise<PerformancePrediction | null> {
  if (process.env.HVYMETL_DISABLE_ML_CRITIC === '1') return null;

  try {
    const session = await criticSessionSingleton.getInstance();
    const ort = await import('onnxruntime-node');
    const inputName = session.inputNames[0] ?? 'features';
    const tensor = new ort.Tensor('float32', features, [1, CRITIC_FEATURE_COUNT]);
    const outputs = await session.run({ [inputName]: tensor });

    const outputKey = session.outputNames[0] ?? Object.keys(outputs)[0];
    const outputTensor = outputs[outputKey];
    const data = outputTensor?.data;
    if (!data || data.length < 3) return null;

    return {
      predictedCacheMissRate: data[0],
      predictedIopsUtilization: data[1],
      storageFootprintMultiplier: data[2],
    };
  } catch (error) {
    console.warn(`[ml_engine/critic] ONNX inference unavailable (${String(error)}); using heuristic critic.`);
    return null;
  }
}

/**
 * Evaluate one schema candidate against workload telemetry.
 * Rejects when cache-miss or IOPS predictions exceed Atlas-safe thresholds.
 */
export async function evaluateSchemaCandidate(
  schema: SchemaCandidate,
  telemetry: TelemetryData,
): Promise<EvaluationResult> {
  const features = buildCriticFeatureVector(schema, telemetry);
  const onnxPrediction = await runOnnxInference(features);
  const prediction = onnxPrediction ?? heuristicPredict(schema, telemetry);
  const usedOnnxModel = onnxPrediction !== null;

  const cacheReject = prediction.predictedCacheMissRate > CACHE_MISS_REJECT_THRESHOLD;
  const iopsReject = prediction.predictedIopsUtilization > IOPS_UTIL_REJECT_THRESHOLD;
  const verdict = cacheReject || iopsReject ? 'REJECTED' : 'APPROVED';
  const explanation = buildRejectionExplanation(schema, telemetry, prediction);

  return { verdict, prediction, explanation, usedOnnxModel };
}

/** Evaluate every collection in a candidate set; any rejection fails the batch. */
export async function evaluateAllSchemaCandidates(
  schemas: SchemaCandidate[],
  telemetry: TelemetryData,
): Promise<{ evaluations: EvaluationResult[]; approved: boolean }> {
  const evaluations = await Promise.all(schemas.map((schema) => evaluateSchemaCandidate(schema, telemetry)));
  const approved = evaluations.every((result) => result.verdict === 'APPROVED');
  return { evaluations, approved };
}

/** Reset cached ONNX session (tests). */
export function resetCriticSingleton(): void {
  criticSessionSingleton.reset();
}
