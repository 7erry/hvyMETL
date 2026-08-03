/**
 * MongoDB Atlas cluster sizing engine (Logic Abstract Sections 1–10).
 * Distinct from Manager View heuristics in web/src/managerCostEstimate.ts.
 */

import type {
  ClusterTierConfiguration,
  ClusterTierRecommendation,
  SizingEngineParameters,
  SizingSessionParameters,
  SizingWorkloadType,
} from './sizingAssistantTypes.js';
import { DEFAULT_SHARD_PENALTY_MULTIPLIER } from './sizingAssistantTypes.js';

/** Catalog entry properties used by shard, secondary, and cost math. */
export type AtlasSizingTierSpec = {
  tierId: string;
  displayName: string;
  ramGb: number;
  vcpu: number;
  baseIops: number;
  data_capacity_gb: number;
  write_ops_individual: number;
  write_ops_bulk: number;
  read_ops_per_secondary: number;
  workload_type: SizingWorkloadType;
  multi_region_supported: boolean;
  required_read_sla_gt_50ms: boolean;
  cost_base: number;
  cost_secondary: number;
};

/** Standard Atlas dedicated tier catalog (M30–M300) for sizing calculations. */
export const ATLAS_SIZING_TIER_CATALOG: AtlasSizingTierSpec[] = [
  {
    tierId: 'M30',
    displayName: 'M30',
    ramGb: 8,
    vcpu: 2,
    baseIops: 3000,
    data_capacity_gb: 512,
    write_ops_individual: 1200,
    write_ops_bulk: 2400,
    read_ops_per_secondary: 800,
    workload_type: 'CONSISTENT',
    multi_region_supported: true,
    required_read_sla_gt_50ms: false,
    cost_base: 0.54,
    cost_secondary: 0.18,
  },
  {
    tierId: 'M40',
    displayName: 'M40',
    ramGb: 16,
    vcpu: 4,
    baseIops: 3000,
    data_capacity_gb: 1024,
    write_ops_individual: 2400,
    write_ops_bulk: 4800,
    read_ops_per_secondary: 1600,
    workload_type: 'CONSISTENT',
    multi_region_supported: true,
    required_read_sla_gt_50ms: false,
    cost_base: 1.04,
    cost_secondary: 0.35,
  },
  {
    tierId: 'M50',
    displayName: 'M50',
    ramGb: 32,
    vcpu: 8,
    baseIops: 3500,
    data_capacity_gb: 2048,
    write_ops_individual: 4800,
    write_ops_bulk: 9600,
    read_ops_per_secondary: 3200,
    workload_type: 'CONSISTENT',
    multi_region_supported: true,
    required_read_sla_gt_50ms: false,
    cost_base: 2.0,
    cost_secondary: 0.67,
  },
  {
    tierId: 'M60',
    displayName: 'M60',
    ramGb: 64,
    vcpu: 16,
    baseIops: 4000,
    data_capacity_gb: 4096,
    write_ops_individual: 9600,
    write_ops_bulk: 19200,
    read_ops_per_secondary: 6400,
    workload_type: 'CONSISTENT',
    multi_region_supported: true,
    required_read_sla_gt_50ms: false,
    cost_base: 3.95,
    cost_secondary: 1.32,
  },
  {
    tierId: 'M80',
    displayName: 'M80',
    ramGb: 128,
    vcpu: 32,
    baseIops: 5000,
    data_capacity_gb: 8192,
    write_ops_individual: 19200,
    write_ops_bulk: 38400,
    read_ops_per_secondary: 12800,
    workload_type: 'CONSISTENT',
    multi_region_supported: true,
    required_read_sla_gt_50ms: false,
    cost_base: 7.8,
    cost_secondary: 2.6,
  },
  {
    tierId: 'M140',
    displayName: 'M140',
    ramGb: 192,
    vcpu: 48,
    baseIops: 6000,
    data_capacity_gb: 16384,
    write_ops_individual: 38400,
    write_ops_bulk: 76800,
    read_ops_per_secondary: 25600,
    workload_type: 'CONSISTENT',
    multi_region_supported: true,
    required_read_sla_gt_50ms: false,
    cost_base: 11.5,
    cost_secondary: 3.83,
  },
  {
    tierId: 'M200',
    displayName: 'M200',
    ramGb: 256,
    vcpu: 64,
    baseIops: 7000,
    data_capacity_gb: 32768,
    write_ops_individual: 76800,
    write_ops_bulk: 153600,
    read_ops_per_secondary: 51200,
    workload_type: 'CONSISTENT',
    multi_region_supported: true,
    required_read_sla_gt_50ms: false,
    cost_base: 15.2,
    cost_secondary: 5.07,
  },
  {
    tierId: 'M300',
    displayName: 'M300',
    ramGb: 384,
    vcpu: 96,
    baseIops: 8000,
    data_capacity_gb: 65536,
    write_ops_individual: 153600,
    write_ops_bulk: 307200,
    read_ops_per_secondary: 102400,
    workload_type: 'CONSISTENT',
    multi_region_supported: true,
    required_read_sla_gt_50ms: false,
    cost_base: 22.8,
    cost_secondary: 7.6,
  },
  {
    tierId: 'M10',
    displayName: 'M10 (intermittent)',
    ramGb: 2,
    vcpu: 2,
    baseIops: 1000,
    data_capacity_gb: 128,
    write_ops_individual: 400,
    write_ops_bulk: 800,
    read_ops_per_secondary: 300,
    workload_type: 'INTERMITTENT',
    multi_region_supported: false,
    required_read_sla_gt_50ms: true,
    cost_base: 0.08,
    cost_secondary: 0.03,
  },
];

const MAX_SHARD_COUNT = 1000;

export type NormalizedOps = {
  normalized_read_ops: number;
  normalized_write_ops: number;
};

/** Fill engine defaults for missing optional inputs. */
export function resolveSizingEngineParameters(
  partial: SizingEngineParameters,
): Required<
  Pick<
    SizingEngineParameters,
    | 'projected_total_data_size_gb'
    | 'total_raw_read_ops'
    | 'total_raw_write_ops'
    | 'avg_doc_size_kb'
    | 'secondary_index_count'
    | 'data_compression_percentage'
    | 'geo_sharded_regions_required'
    | 'workload_type'
    | 'read_sla_gt_50ms'
    | 'user_specified_addl_secondaries'
    | 'is_bulk_ops_permitted'
    | 'is_multi_region_required_for_ha'
    | 'shard_penalty_multiplier'
  >
> {
  return {
    projected_total_data_size_gb: partial.projected_total_data_size_gb ?? 0,
    total_raw_read_ops: partial.total_raw_read_ops ?? 0,
    total_raw_write_ops: partial.total_raw_write_ops ?? 0,
    avg_doc_size_kb: partial.avg_doc_size_kb ?? 1,
    secondary_index_count: partial.secondary_index_count ?? 0,
    data_compression_percentage: partial.data_compression_percentage ?? 0,
    geo_sharded_regions_required: partial.geo_sharded_regions_required ?? 0,
    workload_type: partial.workload_type ?? 'CONSISTENT',
    read_sla_gt_50ms: partial.read_sla_gt_50ms ?? false,
    user_specified_addl_secondaries: partial.user_specified_addl_secondaries ?? 0,
    is_bulk_ops_permitted: partial.is_bulk_ops_permitted ?? false,
    is_multi_region_required_for_ha: partial.is_multi_region_required_for_ha ?? false,
    shard_penalty_multiplier: Math.max(
      1,
      partial.shard_penalty_multiplier ?? DEFAULT_SHARD_PENALTY_MULTIPLIER,
    ),
  };
}

/** Section 3 — normalize read/write ops using document size and index count. */
export function normalizeOperations(params: SizingEngineParameters): NormalizedOps {
  const resolved = resolveSizingEngineParameters(params);
  const normalized_read_ops = resolved.total_raw_read_ops * resolved.avg_doc_size_kb;
  const indexMultiplier =
    resolved.secondary_index_count > 0 ? 1 + resolved.secondary_index_count : 1;
  const normalized_write_ops =
    resolved.total_raw_write_ops * resolved.avg_doc_size_kb * indexMultiplier;
  return { normalized_read_ops, normalized_write_ops };
}

function passesWorkloadFilter(tier: AtlasSizingTierSpec, workload: SizingWorkloadType): boolean {
  if (workload === 'CONSISTENT') return tier.workload_type === 'CONSISTENT';
  return true;
}

function passesMultiRegionFilter(tier: AtlasSizingTierSpec, required: boolean): boolean {
  if (!required) return true;
  return tier.multi_region_supported;
}

function passesReadSlaFilter(tier: AtlasSizingTierSpec, readSlaGt50ms: boolean): boolean {
  if (!tier.required_read_sla_gt_50ms) return true;
  return readSlaGt50ms;
}

/** Section 5a — minimum shard count from compressed data and geo requirement. */
export function minimumShardCountForData(
  tier: AtlasSizingTierSpec,
  params: ReturnType<typeof resolveSizingEngineParameters>,
): number {
  const compressed =
    params.projected_total_data_size_gb * (1 - params.data_compression_percentage);
  if (tier.data_capacity_gb <= 0) {
    return Math.max(1, params.geo_sharded_regions_required);
  }
  const usable = tier.data_capacity_gb / 2;
  const shardsForData = usable > 0 ? Math.ceil(compressed / usable) : 1;
  return Math.max(1, Math.max(shardsForData, params.geo_sharded_regions_required));
}

/** Section 5b — scale shards until per-shard write load fits tier limit. */
export function finalShardCount(
  tier: AtlasSizingTierSpec,
  params: ReturnType<typeof resolveSizingEngineParameters>,
  normalized_write_ops: number,
): number | null {
  let shardCount = minimumShardCountForData(tier, params);
  const writeLimit = params.is_bulk_ops_permitted ? tier.write_ops_bulk : tier.write_ops_individual;

  while (normalized_write_ops / shardCount > writeLimit) {
    shardCount += 1;
    if (shardCount > MAX_SHARD_COUNT) return null;
  }
  return shardCount;
}

/** Section 6 — per-shard normalized read ops. */
export function normalizedReadOpsPerShard(
  normalized_read_ops: number,
  shardCount: number,
): number {
  if (shardCount <= 1) return normalized_read_ops;
  return normalized_read_ops / shardCount;
}

/** Section 7 — additional secondaries beyond the default two, or null if insufficient. */
export function additionalSecondariesForTier(
  tier: AtlasSizingTierSpec,
  params: ReturnType<typeof resolveSizingEngineParameters>,
  normalized_read_ops_per_shard: number,
): number | null {
  if (params.user_specified_addl_secondaries > 0) {
    const capacity =
      tier.read_ops_per_secondary * (2 + params.user_specified_addl_secondaries);
    if (normalized_read_ops_per_shard > capacity) return null;
    return params.user_specified_addl_secondaries;
  }
  const totalNeeded = Math.ceil(normalized_read_ops_per_shard / tier.read_ops_per_secondary);
  return Math.max(0, totalNeeded - 2);
}

/** Section 8 — hourly cost per configuration (used for ranking). */
export function hourlyCostForConfiguration(
  tier: AtlasSizingTierSpec,
  shardCount: number,
  additionalSecondaries: number,
  shardPenaltyMultiplier: number,
): number {
  const costPerShard = tier.cost_base + tier.cost_secondary * additionalSecondaries;
  if (shardCount <= 1) return costPerShard;
  return costPerShard * shardPenaltyMultiplier ** shardCount;
}

/** Rank all eligible tier configurations; cheapest first. */
export function findOptimalClusterTier(
  partial: SizingEngineParameters,
  catalog: AtlasSizingTierSpec[] = ATLAS_SIZING_TIER_CATALOG,
): ClusterTierConfiguration[] {
  const params = resolveSizingEngineParameters(partial);
  const { normalized_read_ops, normalized_write_ops } = normalizeOperations(params);
  const results: ClusterTierConfiguration[] = [];

  for (const tier of catalog) {
    if (!passesWorkloadFilter(tier, params.workload_type)) continue;
    if (!passesMultiRegionFilter(tier, params.is_multi_region_required_for_ha)) continue;
    if (!passesReadSlaFilter(tier, params.read_sla_gt_50ms)) continue;

    const shardCount = finalShardCount(tier, params, normalized_write_ops);
    if (shardCount === null) continue;

    const readPerShard = normalizedReadOpsPerShard(normalized_read_ops, shardCount);
    const additionalSecondaries = additionalSecondariesForTier(tier, params, readPerShard);
    if (additionalSecondaries === null) continue;

    const finalHourlyCost = hourlyCostForConfiguration(
      tier,
      shardCount,
      additionalSecondaries,
      params.shard_penalty_multiplier,
    );

    results.push({
      tierId: tier.tierId,
      displayName: tier.displayName,
      ramGb: tier.ramGb,
      vcpu: tier.vcpu,
      baseIops: tier.baseIops,
      shardCount,
      additionalSecondaries,
      normalizedReadOpsPerShard: readPerShard,
      normalizedWriteOpsPerShard: normalized_write_ops / shardCount,
      parametersUsed: params,
      finalHourlyCost,
      rank: 0,
    });
  }

  results.sort((a, b) => a.finalHourlyCost - b.finalHourlyCost);
  return results.map((item, index) => ({ ...item, rank: index + 1 }));
}

/** Strip pricing fields for assistant-facing payloads. */
export function toPublicRecommendations(
  configurations: ClusterTierConfiguration[],
): ClusterTierRecommendation[] {
  return configurations.map(({ finalHourlyCost: _cost, ...rest }) => rest);
}

/** Infrastructure brief helper — WSS from active data % plus full index footprint (20–30% default). */
export function estimateWorkingSetSizeGb(
  params: SizingSessionParameters,
  indexOverheadRatio = 0.25,
): number {
  const dataGb = params.projected_total_data_size_gb ?? 0;
  const indexGb = dataGb * indexOverheadRatio;
  const activePct = params.active_working_set_percentage ?? 0.2;
  return dataGb * activePct + indexGb;
}

/** Pick smallest tier whose RAM exceeds WSS (for architecture briefs). */
export function suggestTierForWorkingSet(
  params: SizingSessionParameters,
  catalog: AtlasSizingTierSpec[] = ATLAS_SIZING_TIER_CATALOG,
): AtlasSizingTierSpec | null {
  const wss = estimateWorkingSetSizeGb(params);
  const consistent = catalog
    .filter((tier) => tier.workload_type === 'CONSISTENT')
    .sort((a, b) => a.ramGb - b.ramGb);
  return consistent.find((tier) => tier.ramGb > wss) ?? consistent[consistent.length - 1] ?? null;
}

/** Peak write throughput pressure vs tier IOPS (0–1+ ratio). */
export function estimateIopsUtilizationRatio(
  params: SizingEngineParameters,
  tier: AtlasSizingTierSpec,
): number {
  const resolved = resolveSizingEngineParameters(params);
  const { normalized_write_ops } = normalizeOperations(resolved);
  const shardCount = finalShardCount(tier, resolved, normalized_write_ops) ?? 1;
  const perShardWrite = normalized_write_ops / shardCount;
  const writeLimit = resolved.is_bulk_ops_permitted ? tier.write_ops_bulk : tier.write_ops_individual;
  if (writeLimit <= 0) return 0;
  return perShardWrite / writeLimit;
}

/** Oplog size estimate (GB) for 36h retention at peak write load. */
export function estimateOplogSizeGb(params: SizingEngineParameters, retentionHours = 36): number {
  const resolved = resolveSizingEngineParameters(params);
  const mbPerSec = (resolved.total_raw_write_ops * resolved.avg_doc_size_kb) / 1024;
  return (mbPerSec * 3600 * retentionHours) / 1024;
}
