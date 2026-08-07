import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AtlasApiMetricsConnector,
  averageLatestMeasurementPoints,
  bootstrapAtlasMetricsConnector,
  configureAtlasLogsRuntime,
  deriveCacheMissRateFromCacheBytes,
  deriveIopsUtilization,
  fetchAtlasActualPerformance,
  parsePeriodMs,
  readAtlasMetricsConfig,
  selectProcessForCluster,
  shouldUseAtlasApiMetricsConnector,
} from './atlasApiMetrics.js';
import { setAtlasMetricsConnector, StubAtlasMetricsConnector } from './feedbackCollector.js';
import type { MigrationLogDocument } from './feedbackTypes.js';

const TEST_GROUP = '69aaf1b29abbbbe753fea212';

const TEST_ENV = {
  ATLAS_CLIENT_ID: 'mdb_sa_id_test',
  ATLAS_CLIENT_SECRET: 'mdb_sa_sk_test',
  ATLAS_GROUP_ID: TEST_GROUP,
  HVYMETL_ATLAS_CLUSTER_ID: 'Cluster0',
  HVYMETL_ATLAS_TIER_IOPS_CAP: '3000',
};

function mockAtlasMetricsFetch(): void {
  configureAtlasLogsRuntime({
    clearTokenCache: true,
    fetchFn: vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'token-test', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/processes?')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'cluster0-shard-00-00.abc12.mongodb.net:27017',
                hostname: 'cluster0-shard-00-00.abc12.mongodb.net',
                typeName: 'REPLICA_PRIMARY',
                replicaSetName: 'Cluster0-shard-0',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/measurements')) {
        return new Response(
          JSON.stringify({
            measurements: [
              {
                name: 'CACHE_BYTES_USED',
                dataPoints: [{ value: 1_500_000_000 }, { value: 1_600_000_000 }],
              },
              {
                name: 'CACHE_MAX_BYTES',
                dataPoints: [{ value: 2_000_000_000 }, { value: 2_000_000_000 }],
              },
              {
                name: 'DISK_PARTITION_IOPS_TOTAL_READ',
                dataPoints: [{ value: 900 }, { value: 1100 }],
              },
              {
                name: 'DISK_PARTITION_IOPS_TOTAL_WRITE',
                dataPoints: [{ value: 400 }, { value: 500 }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/slowQueryLogs')) {
        return new Response(JSON.stringify({ totalCount: 142, results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  });
}

const sampleLog: MigrationLogDocument = {
  migrationId: 'orders-abc',
  tableId: 'orders',
  clusterId: 'Cluster0',
  loggedAt: new Date().toISOString(),
  sourceTelemetry: {
    readWriteRatio: 10,
    peakRpm: 50_000,
    dataGrowthMbPerMonth: 1024,
    cardinality: 100_000,
    growthRateLabel: '1GB/month',
    readPercent: 90,
    writePercent: 10,
  },
  chosenSchema: {
    collectionName: 'orders',
    nestingDepth: 2,
    hasArrays: false,
    indexCount: 2,
    isSharded: false,
    sourceRowCount: 10_000,
  },
  predictedMetrics: {
    predictedCacheMissRate: 0.06,
    predictedIopsUtilization: 0.4,
    storageFootprintMultiplier: 1.1,
  },
  patternsApplied: ['embed'],
  status: 'pending_reflection',
  atlasCorrelation: {
    projectId: TEST_GROUP,
    targetDatabase: 'finops',
    targetCollection: 'orders',
  },
};

describe('atlasApiMetrics helpers', () => {
  it('derives cache miss rate from cache bytes', () => {
    expect(deriveCacheMissRateFromCacheBytes(1_500_000_000, 2_000_000_000)).toBeGreaterThan(0.1);
    expect(deriveCacheMissRateFromCacheBytes(1_900_000_000, 2_000_000_000)).toBeLessThan(0.25);
  });

  it('derives IOPS utilization against tier cap', () => {
    expect(deriveIopsUtilization(1200, 600, 3000)).toBeCloseTo(0.6, 1);
  });

  it('averages latest measurement points', () => {
    expect(
      averageLatestMeasurementPoints({
        dataPoints: [{ value: 10 }, { value: 20 }, { value: 30 }],
      }),
    ).toBe(20);
  });

  it('selects a process for cluster name', () => {
    const picked = selectProcessForCluster(
      [{ hostname: 'cluster0-shard-00-00.abc12.mongodb.net', replicaSetName: 'Cluster0-shard-0' }],
      'Cluster0',
    );
    expect(picked?.hostname).toContain('cluster0-shard');
  });

  it('parses ISO duration PT1H', () => {
    expect(parsePeriodMs('PT1H')).toBe(3_600_000);
    expect(parsePeriodMs('PT15M')).toBe(900_000);
  });

  it('reads metrics config when cluster id is set', () => {
    const config = readAtlasMetricsConfig(TEST_ENV);
    expect(config?.clusterName).toBe('Cluster0');
    expect(config?.tierIopsCap).toBe(3000);
  });

  it('skips live connector when stub mode is set', () => {
    expect(shouldUseAtlasApiMetricsConnector({ ...TEST_ENV, HVYMETL_ATLAS_STUB_MODE: 'degraded' })).toBe(false);
  });
});

describe('AtlasApiMetricsConnector', () => {
  beforeEach(() => {
    mockAtlasMetricsFetch();
    setAtlasMetricsConnector(new StubAtlasMetricsConnector());
  });

  afterEach(() => {
    configureAtlasLogsRuntime({ clearTokenCache: true });
    setAtlasMetricsConnector(new StubAtlasMetricsConnector());
  });

  it('maps Atlas API responses to atlas-api performance metrics', async () => {
    const config = readAtlasMetricsConfig(TEST_ENV)!;
    const connector = new AtlasApiMetricsConnector(config);
    const metrics = await connector.fetch('Cluster0', sampleLog.migrationId, sampleLog);
    expect(metrics.source).toBe('atlas-api');
    expect(metrics.slowQueryCount).toBe(142);
    expect(metrics.actualIopsUtilization).toBeGreaterThanOrEqual(0.4);
    expect(metrics.processId).toContain(':27017');
    expect(metrics.targetDatabase).toBe('finops');
  });

  it('bootstrap registers live connector when configured', async () => {
    bootstrapAtlasMetricsConnector(TEST_ENV);
    const config = readAtlasMetricsConfig(TEST_ENV)!;
    const metrics = await fetchAtlasActualPerformance(config, sampleLog);
    expect(metrics.source).toBe('atlas-api');
  });
});
