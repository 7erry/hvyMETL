import { describe, expect, it } from 'vitest';
import {
  ATLAS_SIZING_TIER_CATALOG,
  estimateIopsUtilizationRatio,
  estimateOplogSizeGb,
  estimateWorkingSetSizeGb,
  findOptimalClusterTier,
  minimumShardCountForData,
  normalizeOperations,
  resolveSizingEngineParameters,
  suggestTierForWorkingSet,
} from './sizingEngine.js';

describe('sizingEngine', () => {
  it('normalizes write ops with secondary index multiplier', () => {
    const ops = normalizeOperations({
      total_raw_read_ops: 100,
      total_raw_write_ops: 50,
      avg_doc_size_kb: 2,
      secondary_index_count: 3,
    });
    expect(ops.normalized_read_ops).toBe(200);
    expect(ops.normalized_write_ops).toBe(50 * 2 * 4);
  });

  it('applies 50% usable capacity headroom for shard count', () => {
    const tier = ATLAS_SIZING_TIER_CATALOG.find((item) => item.tierId === 'M30')!;
    const params = resolveSizingEngineParameters({
      projected_total_data_size_gb: 400,
      data_compression_percentage: 0,
      geo_sharded_regions_required: 0,
    });
    expect(minimumShardCountForData(tier, params)).toBe(2);
  });

  it('filters CONSISTENT workloads away from INTERMITTENT-only tiers', () => {
    const results = findOptimalClusterTier({
      projected_total_data_size_gb: 50,
      total_raw_read_ops: 100,
      total_raw_write_ops: 20,
      avg_doc_size_kb: 1,
      workload_type: 'CONSISTENT',
    });
    expect(results.every((item) => item.tierId !== 'M10')).toBe(true);
  });

  it('requires multi-region-capable tiers when HA flag is set', () => {
    const without = findOptimalClusterTier({
      projected_total_data_size_gb: 80,
      total_raw_read_ops: 200,
      total_raw_write_ops: 50,
      avg_doc_size_kb: 1,
      is_multi_region_required_for_ha: false,
    });
    const withHa = findOptimalClusterTier({
      projected_total_data_size_gb: 80,
      total_raw_read_ops: 200,
      total_raw_write_ops: 50,
      avg_doc_size_kb: 1,
      is_multi_region_required_for_ha: true,
    });
    expect(without.length).toBeGreaterThan(0);
    expect(withHa.length).toBeGreaterThan(0);
    expect(withHa.every((item) => item.tierId !== 'M10')).toBe(true);
  });

  it('increases shard count for heavy write load and respects bulk ops', () => {
    const individual = findOptimalClusterTier({
      projected_total_data_size_gb: 200,
      total_raw_read_ops: 500,
      total_raw_write_ops: 8000,
      avg_doc_size_kb: 2,
      is_bulk_ops_permitted: false,
    });
    const bulk = findOptimalClusterTier({
      projected_total_data_size_gb: 200,
      total_raw_read_ops: 500,
      total_raw_write_ops: 8000,
      avg_doc_size_kb: 2,
      is_bulk_ops_permitted: true,
    });
    expect(individual[0].shardCount).toBeGreaterThanOrEqual(bulk[0].shardCount);
  });

  it('estimates working set, oplog, and IOPS pressure for architecture briefs', () => {
    const params = {
      projected_total_data_size_gb: 400,
      active_working_set_percentage: 0.2,
      total_raw_write_ops: 1500,
      avg_doc_size_kb: 2.5,
    };
    expect(estimateWorkingSetSizeGb(params)).toBeCloseTo(400 * 0.2 + 400 * 0.25, 5);
    expect(estimateOplogSizeGb(params)).toBeGreaterThan(0);
    const tier = ATLAS_SIZING_TIER_CATALOG.find((item) => item.tierId === 'M50')!;
    expect(estimateIopsUtilizationRatio(params, tier)).toBeGreaterThan(0);
    expect(suggestTierForWorkingSet(params)?.ramGb).toBeGreaterThan(estimateWorkingSetSizeGb(params));
  });

  it('ranks cheaper valid configurations first without exposing cost in public mapper', () => {
    const ranked = findOptimalClusterTier({
      projected_total_data_size_gb: 120,
      total_raw_read_ops: 1200,
      total_raw_write_ops: 400,
      avg_doc_size_kb: 1.5,
    });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].finalHourlyCost).toBeGreaterThan(0);
    if (ranked.length > 1) {
      expect(ranked[0].finalHourlyCost).toBeLessThanOrEqual(ranked[1].finalHourlyCost);
    }
  });
});
