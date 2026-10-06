import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { evaluateAllSchemaCandidates, resetCriticSingleton } from './critic.js';
import type { SchemaCandidate, TelemetryData } from './types.js';

const telemetry: TelemetryData = {
  readPercent: 80,
  writePercent: 20,
  readWriteRatio: 4,
  peakRpm: 10_000,
  dataGrowthMbPerMonth: 5_000,
  cardinality: 100_000,
};

const schema: SchemaCandidate = {
  collectionName: 'orders',
  nestingDepth: 2,
  hasArrays: false,
  indexCount: 2,
  isSharded: false,
  sourceRowCount: 10_000,
};

describe('critic ONNX fast path', () => {
  it('does not throw when the ONNX model file is missing', async () => {
    resetCriticSingleton();
    vi.stubEnv('HVYMETL_CRITIC_MODEL_PATH', '/tmp/hvymetl-missing-critic.onnx');
    expect(existsSync('/tmp/hvymetl-missing-critic.onnx')).toBe(false);

    const { evaluations, approved } = await evaluateAllSchemaCandidates([schema], telemetry);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]?.verdict).toMatch(/APPROVED|REJECTED/);
    expect(typeof approved).toBe('boolean');

    vi.unstubAllEnvs();
    resetCriticSingleton();
  });
});
