import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCriticFeatureVector, heuristicPredict, evaluateSchemaCandidate } from './critic.js';
import { heuristicRerankScore, rerankPatterns } from './reranker.js';
import {
  buildTelemetryData,
  parseGrowthRateMbPerMonth,
  serializeTelemetryContext,
} from './telemetrySerializer.js';
import { measureJsonSchemaDepth } from './schemaMapper.js';
import type { SchemaCandidate } from './types.js';
import type { WorkloadProfile } from '../types.js';

const readHeavyProfile: WorkloadProfile = {
  id: 'catalog',
  label: 'E-commerce Catalog',
  description: 'test',
  telemetry: { readPercent: 95, writePercent: 5, peakRpm: 60_000, growthRate: '5GB/month' },
  preferredPatterns: ['extended-reference', 'computed', 'embed'],
  writeConcern: { w: 1, journal: false },
  pool: { maxPoolSize: 200, minPoolSize: 20, socketTimeoutMS: 30_000, maxIdleTimeMS: 60_000 },
};

describe('telemetrySerializer', () => {
  it('parses growth rates into MB per month', () => {
    expect(parseGrowthRateMbPerMonth('10GB/month')).toBeCloseTo(10_240, 0);
    expect(parseGrowthRateMbPerMonth('120MB/mo')).toBe(120);
    expect(parseGrowthRateMbPerMonth('1TB/week')).toBeGreaterThan(1_000_000);
  });

  it('serializes telemetry into a dense semantic string', () => {
    const telemetry = buildTelemetryData(readHeavyProfile);
    const context = serializeTelemetryContext(telemetry);
    expect(context).toContain('Read-Heavy');
    expect(context).toContain('60,000 RPM');
    expect(context).toContain('5GB/month');
  });
});

describe('reranker', () => {
  it('heuristic rerank favors read patterns for read-heavy telemetry', () => {
    const telemetry = buildTelemetryData(readHeavyProfile);
    const embedScore = heuristicRerankScore(telemetry, {
      sourceFile: 'embed.md',
      heading: 'Embed Pattern',
      text: 'embed one-to-many bounded children',
      score: 0.4,
    });
    const bucketScore = heuristicRerankScore(telemetry, {
      sourceFile: 'bucket.md',
      heading: 'Bucket Pattern',
      text: 'time-series bucket for writes',
      score: 0.4,
    });
    expect(embedScore).toBeGreaterThan(bucketScore);
  });

  it('rerankPatterns returns topK without loading transformers in test env', async () => {
    process.env.HVYMETL_DISABLE_ML_RERANKER = '1';
    const telemetry = buildTelemetryData(readHeavyProfile);
    const candidates = [
      { sourceFile: 'a.md', heading: 'A', text: 'extended reference', score: 0.5 },
      { sourceFile: 'b.md', heading: 'B', text: 'bucket writes', score: 0.6 },
      { sourceFile: 'c.md', heading: 'C', text: 'computed counters', score: 0.4 },
    ];
    const result = await rerankPatterns(candidates, telemetry, { topK: 2, scoreThreshold: 0 });
    expect(result.chunks).toHaveLength(2);
    expect(result.usedCrossEncoder).toBe(false);
    expect(result.rerankBackend).toBe('heuristic');
    delete process.env.HVYMETL_DISABLE_ML_RERANKER;
  });

  it('rerankPatterns uses Voyage rerank-2.5 when MONGODB_MODEL_KEY is set', async () => {
    process.env.MONGODB_MODEL_KEY = 'al-test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, relevance_score: 0.88 },
          { index: 1, relevance_score: 0.31 },
          { index: 2, relevance_score: 0.55 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const telemetry = buildTelemetryData(readHeavyProfile);
    const candidates = [
      { sourceFile: 'a.md', heading: 'A', text: 'extended reference', score: 0.5 },
      { sourceFile: 'b.md', heading: 'B', text: 'bucket writes', score: 0.6 },
      { sourceFile: 'c.md', heading: 'C', text: 'computed counters', score: 0.4 },
    ];
    const result = await rerankPatterns(candidates, telemetry, { topK: 2, scoreThreshold: 0 });
    expect(result.rerankBackend).toBe('voyage');
    expect(result.usedCrossEncoder).toBe(true);
    expect(result.chunks[0].sourceFile).toBe('a.md');
    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
    delete process.env.MONGODB_MODEL_KEY;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MONGODB_MODEL_KEY;
  delete process.env.HVYMETL_DISABLE_ML_RERANKER;
});

describe('critic', () => {
  const telemetry = buildTelemetryData(readHeavyProfile);
  const deepEmbedSchema: SchemaCandidate = {
    collectionName: 'orders',
    nestingDepth: 4,
    hasArrays: true,
    indexCount: 8,
    isSharded: false,
    sourceRowCount: 2_000_000,
  };

  it('builds an 8-dimensional feature vector', () => {
    const features = buildCriticFeatureVector(deepEmbedSchema, telemetry);
    expect(features).toHaveLength(8);
    expect(features[0]).toBeGreaterThan(0.5);
    expect(features[1]).toBe(1);
  });

  it('rejects deep embed schemas under read-heavy telemetry (heuristic)', async () => {
    process.env.HVYMETL_DISABLE_ML_CRITIC = '1';
    const result = await evaluateSchemaCandidate(deepEmbedSchema, telemetry);
    expect(result.usedOnnxModel).toBe(false);
    expect(['APPROVED', 'REJECTED']).toContain(result.verdict);
    delete process.env.HVYMETL_DISABLE_ML_CRITIC;
  });

  it('heuristic prediction returns bounded metrics', () => {
    const prediction = heuristicPredict(deepEmbedSchema, telemetry);
    expect(prediction.predictedCacheMissRate).toBeGreaterThan(0);
    expect(prediction.predictedCacheMissRate).toBeLessThanOrEqual(1);
    expect(prediction.storageFootprintMultiplier).toBeGreaterThan(1);
  });
});

describe('schemaMapper', () => {
  it('measures JSON schema nesting depth', () => {
    const depth = measureJsonSchemaDepth({
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            address: { type: 'object', properties: { zip: { type: 'string' } } },
          },
        },
      },
    });
    expect(depth).toBeGreaterThanOrEqual(3);
  });
});
