/** Index size as a fraction of hot document bytes (matches Manager cost heuristics). */
export const DEFAULT_INDEX_OVERHEAD_FACTOR = 0.08;

/** Cap total index footprint vs document data for tier math (avoids N×8% per index blow-up). */
export const MAX_AGGREGATE_INDEX_FRACTION = 0.35;

/** Atlas dedicated tier row for production sizing (M30–M300 decision matrix). */
export type AtlasProductionTierSpec = {
  id: string;
  ramGb: number;
  vcpu: number;
  maxConnections: number;
  /** Standard / extended storage ceiling (GB). */
  extendedStorageMaxGb: number;
  /** Max disk:RAM ratio (60 for M10–M40, 120 for M50+). */
  diskToRamRatioMax: number;
};

/** @deprecated Use AtlasProductionTierSpec — kept for callers passing minimal rows. */
export type AtlasTierCatalogEntry = {
  id: string;
  ramGb: number;
  storageGb: number;
};

export type PlanningStorageInput = {
  rawDataGb: number;
  activeStorageGb: number;
  growthRatePercent: number;
  /** On-disk multiplier for raw data (BSON + index footprint), e.g. 1.25 × (1 + n × 0.08). */
  rawOnDiskMultiplier: number;
  /** Planning horizon in months (default 12). */
  horizonMonths?: number;
};

export type SelectAtlasTierInput = {
  requiredRamGb: number;
  planningStorageGb: number;
  indexGb: number;
  hotFootprintGb: number;
  tiers?: AtlasProductionTierSpec[];
  productionMinTierId?: string;
};

/** Dedicated Atlas tiers (M10–M700) aligned with Atlas standard storage / connection limits. */
export const ATLAS_PRODUCTION_TIER_MATRIX: AtlasProductionTierSpec[] = [
  { id: 'M10', ramGb: 2, vcpu: 2, maxConnections: 1500, extendedStorageMaxGb: 128, diskToRamRatioMax: 60 },
  { id: 'M20', ramGb: 4, vcpu: 2, maxConnections: 3000, extendedStorageMaxGb: 256, diskToRamRatioMax: 60 },
  { id: 'M30', ramGb: 8, vcpu: 2, maxConnections: 3000, extendedStorageMaxGb: 512, diskToRamRatioMax: 60 },
  { id: 'M40', ramGb: 16, vcpu: 4, maxConnections: 6000, extendedStorageMaxGb: 1024, diskToRamRatioMax: 60 },
  { id: 'M50', ramGb: 32, vcpu: 8, maxConnections: 16000, extendedStorageMaxGb: 2048, diskToRamRatioMax: 120 },
  { id: 'M60', ramGb: 64, vcpu: 16, maxConnections: 32000, extendedStorageMaxGb: 4096, diskToRamRatioMax: 120 },
  { id: 'M80', ramGb: 128, vcpu: 32, maxConnections: 96000, extendedStorageMaxGb: 4096, diskToRamRatioMax: 120 },
  { id: 'M140', ramGb: 192, vcpu: 48, maxConnections: 96000, extendedStorageMaxGb: 4096, diskToRamRatioMax: 120 },
  { id: 'M200', ramGb: 256, vcpu: 64, maxConnections: 128000, extendedStorageMaxGb: 4096, diskToRamRatioMax: 120 },
  { id: 'M300', ramGb: 384, vcpu: 96, maxConnections: 128000, extendedStorageMaxGb: 4096, diskToRamRatioMax: 120 },
  { id: 'M400', ramGb: 488, vcpu: 96, maxConnections: 128000, extendedStorageMaxGb: 4096, diskToRamRatioMax: 120 },
  { id: 'M600', ramGb: 640, vcpu: 96, maxConnections: 128000, extendedStorageMaxGb: 4096, diskToRamRatioMax: 120 },
  { id: 'M700', ramGb: 768, vcpu: 96, maxConnections: 128000, extendedStorageMaxGb: 49152, diskToRamRatioMax: 120 },
];

/** Atlas tier reference (UI / docs) — storage scale labels match Atlas product chart. */
export const ATLAS_TIER_REFERENCE_ROWS: ReadonlyArray<{
  tierLabel: string;
  vcpuLabel: string;
  ramGb: number;
  storageScaleLabel: string;
  maxConnections: number;
  maxConnectionsLabel: string;
}> = [
  { tierLabel: 'M10', vcpuLabel: '2 vCPU', ramGb: 2, storageScaleLabel: '10 GB – 128 GB', maxConnections: 1500, maxConnectionsLabel: '1,500' },
  { tierLabel: 'M20', vcpuLabel: '2 vCPU', ramGb: 4, storageScaleLabel: '20 GB – 256 GB', maxConnections: 3000, maxConnectionsLabel: '3,000' },
  { tierLabel: 'M30', vcpuLabel: '2 vCPU', ramGb: 8, storageScaleLabel: '40 GB – 512 GB', maxConnections: 3000, maxConnectionsLabel: '3,000' },
  { tierLabel: 'M40', vcpuLabel: '4 vCPU', ramGb: 16, storageScaleLabel: '80 GB – 1 TB', maxConnections: 6000, maxConnectionsLabel: '6,000' },
  { tierLabel: 'M50', vcpuLabel: '8 vCPU', ramGb: 32, storageScaleLabel: '160 GB – 2 TB', maxConnections: 16000, maxConnectionsLabel: '16,000' },
  { tierLabel: 'M60', vcpuLabel: '16 vCPU', ramGb: 64, storageScaleLabel: '320 GB – 4 TB', maxConnections: 32000, maxConnectionsLabel: '32,000' },
  { tierLabel: 'M80', vcpuLabel: '32 vCPU', ramGb: 128, storageScaleLabel: 'Up to 4 TB', maxConnections: 96000, maxConnectionsLabel: '96,000' },
  { tierLabel: 'M140', vcpuLabel: '48 vCPU', ramGb: 192, storageScaleLabel: 'Up to 4 TB', maxConnections: 96000, maxConnectionsLabel: '96,000' },
  { tierLabel: 'M200', vcpuLabel: '64 vCPU', ramGb: 256, storageScaleLabel: 'Up to 4 TB', maxConnections: 128000, maxConnectionsLabel: '128,000' },
  { tierLabel: 'M300', vcpuLabel: '96 vCPU', ramGb: 384, storageScaleLabel: 'Up to 4 TB', maxConnections: 128000, maxConnectionsLabel: '128,000' },
  {
    tierLabel: 'M400 / M600',
    vcpuLabel: 'Up to 96+ vCPU',
    ramGb: 768,
    storageScaleLabel: 'Up to 4 TB (per node)',
    maxConnections: 128000,
    maxConnectionsLabel: '128,000+',
  },
];

/** WiredTiger cache share of physical RAM (M10–M30: 25%; M40+: ~50%). */
export function wiredTigerCacheFraction(ramGb: number): number {
  return ramGb <= 8 ? 0.25 : 0.5;
}

/** WiredTiger cache size in GB for a tier RAM spec. */
export function wiredTigerCacheGb(ramGb: number): number {
  return ramGb * wiredTigerCacheFraction(ramGb);
}

/** Aggregate index footprint in GB (total indexes vs document volume, not indexCount × full corpus). */
export function estimateIndexSizeGb(
  onDiskDocumentGb: number,
  indexCount: number,
  indexOverheadFactor = DEFAULT_INDEX_OVERHEAD_FACTOR,
): number {
  const count = Math.max(0, indexCount);
  if (count === 0 || onDiskDocumentGb <= 0) return 0;
  const aggregateFraction = Math.min(
    MAX_AGGREGATE_INDEX_FRACTION,
    (count * indexOverheadFactor) / (1 + count * indexOverheadFactor),
  );
  return onDiskDocumentGb * aggregateFraction;
}

/** Hot data in RAM (10–25% of raw data GB), capped so multi-TB datasets stay tier-realistic. */
export function activeWorkingSetGb(rawDataGb: number, ramRatio: number): number {
  const ratio = Math.max(0.05, Math.min(1, ramRatio));
  const uncapped = Math.max(0, rawDataGb) * ratio;
  const scaleCap = Math.min(512, 48 + Math.max(0, rawDataGb) * 0.015);
  return Math.min(uncapped, scaleCap);
}

/** Smallest tier RAM (GB) whose WiredTiger cache holds index + hot working set. */
export function tierRamForCacheFit(indexGb: number, hotFootprintGb: number): number {
  const needInCacheGb = Math.max(0.25, indexGb + hotFootprintGb);
  const tiers = ATLAS_PRODUCTION_TIER_MATRIX;
  for (const tier of tiers) {
    if (wiredTigerCacheGb(tier.ramGb) >= needInCacheGb) return tier.ramGb;
  }
  return tiers[tiers.length - 1]!.ramGb;
}

/**
 * Physical RAM target for display (2× index + hot). Tier pick uses {@link tierRamForCacheFit} + storage.
 * Very large datasets: cap runaway index math on the 2× target only.
 */
export function tierRamRequirementGb(indexGb: number, hotFootprintGb: number, rawDataGb: number): number {
  const need = targetPhysicalRamGb(indexGb, hotFootprintGb);
  const raw = Math.max(0, rawDataGb);
  if (raw >= 6144) return Math.min(need, 768);
  if (raw >= 2560) return Math.min(need, 512);
  return need;
}

/** Single replica-set planning disk used for tier ladder (Atlas ~4 TB/node before sharding). */
export const SINGLE_REPLICA_SET_PLANNING_DISK_CAP_GB = 4096;

function productionTierRank(tierId: string): number {
  return ATLAS_PRODUCTION_TIER_MATRIX.findIndex((tier) => tier.id === tierId);
}

/** Pick tier from planning storage first, then raise only if cache/RAM requires a higher class. */
export function selectAtlasTierForDatasetScale(input: {
  planningStorageGb: number;
  indexGb: number;
  hotFootprintGb: number;
  tiers?: AtlasProductionTierSpec[];
  productionMinTierId?: string;
}): AtlasProductionTierSpec {
  const tiers = input.tiers ?? ATLAS_PRODUCTION_TIER_MATRIX;
  const productionMinTierId = input.productionMinTierId ?? 'M10';
  const planningGb = Math.max(1, input.planningStorageGb);
  /** Hot working set only for tier bumps — full index+hot stays on the 2× Target RAM line. */
  const cacheRamGb = tierRamForCacheFit(0, input.hotFootprintGb);
  const startIndex = Math.max(0, tiers.findIndex((tier) => tier.id === productionMinTierId));
  const candidates = tiers.slice(startIndex);

  if (planningGb > SINGLE_REPLICA_SET_PLANNING_DISK_CAP_GB) {
    const m300Index = candidates.findIndex((tier) => tier.id === 'M300');
    const largeDataCandidates = m300Index >= 0 ? candidates.slice(m300Index) : candidates;
    let picked =
      largeDataCandidates.find((tier) => tierMeetsAtlasGuardrails(tier, cacheRamGb, SINGLE_REPLICA_SET_PLANNING_DISK_CAP_GB)) ??
      largeDataCandidates[largeDataCandidates.length - 1]!;
    while (picked.ramGb < cacheRamGb) {
      const rank = productionTierRank(picked.id);
      const next = candidates.find((tier) => productionTierRank(tier.id) === rank + 1);
      if (!next) break;
      picked = next;
    }
    return picked;
  }

  const picked =
    candidates.find((tier) => tierMeetsAtlasGuardrails(tier, cacheRamGb, planningGb)) ??
    candidates[candidates.length - 1]!;

  return picked;
}

/** @deprecated Use tierRamRequirementGb — kept for tests referencing legacy name. */
export function tierRamCeilingHeuristic(rawDataGb: number): number {
  return tierRamRequirementGb(0, activeWorkingSetGb(rawDataGb, 0.2), rawDataGb);
}

/** Target physical RAM: 2 × (index size + hot data footprint). */
export function targetPhysicalRamGb(indexGb: number, hotFootprintGb: number): number {
  return Math.max(0.5, 2 * (Math.max(0, indexGb) + Math.max(0, hotFootprintGb)));
}

/**
 * Storage used for tier disk planning: max(hot on cluster, raw on-disk footprint) with growth over horizon.
 */
export function planningStorageGb(input: PlanningStorageInput): number {
  const horizonMonths = input.horizonMonths ?? 12;
  const rawOnDiskGb = Math.max(0, input.rawDataGb) * Math.max(1, input.rawOnDiskMultiplier);
  const activeGb = Math.max(0, input.activeStorageGb);
  // When index-heavy active storage dwarfs raw documents, plan from raw on-disk footprint.
  const baseGb =
    activeGb > rawOnDiskGb * 1.5 && rawOnDiskGb > 0 ? rawOnDiskGb : Math.max(activeGb, rawOnDiskGb);
  const yearlyGrowth = Math.max(0, input.growthRatePercent) / 100;
  const horizonYears = horizonMonths / 12;
  const growthFactor = 1 + yearlyGrowth * horizonYears;
  return Math.max(1, baseGb * growthFactor);
}

/** Max disk Atlas allows on a tier given extended storage cap and disk:RAM ratio guardrail. */
export function maxAllocatableDiskGb(tier: AtlasProductionTierSpec): number {
  return Math.min(tier.extendedStorageMaxGb, tier.ramGb * tier.diskToRamRatioMax);
}

/** Baseline IOPS heuristic for AWS/GCP standard storage (illustrative). */
export function estimateBaselineIops(planningStorageGb: number): number {
  const storage = Math.max(0, planningStorageGb);
  if (storage < 1000) return 3000;
  return Math.min(80_000, Math.round(3000 + (storage - 1000) * 3));
}

/** Whether a tier satisfies target physical RAM and disk guardrails (RAM already includes 2× index + hot). */
export function tierMeetsAtlasGuardrails(
  tier: AtlasProductionTierSpec,
  requiredRamGb: number,
  planningStorageGb: number,
): boolean {
  if (tier.ramGb < requiredRamGb) return false;
  if (planningStorageGb > maxAllocatableDiskGb(tier)) return false;
  return true;
}

/** Smallest production tier meeting Atlas guardrails, or the largest tier in the list. */
export function selectAtlasTierForRequirements(input: SelectAtlasTierInput): AtlasProductionTierSpec {
  const tiers = input.tiers ?? ATLAS_PRODUCTION_TIER_MATRIX;
  const productionMinTierId = input.productionMinTierId ?? 'M10';
  const requiredRam = Math.max(0.5, input.requiredRamGb);
  const planningStorage = Math.max(1, input.planningStorageGb);
  const startIndex = tiers.findIndex((tier) => tier.id === productionMinTierId);
  const candidates = tiers.slice(Math.max(0, startIndex));
  const match = candidates.find((tier) => tierMeetsAtlasGuardrails(tier, requiredRam, planningStorage));
  return match ?? candidates[candidates.length - 1] ?? tiers[tiers.length - 1]!;
}

/** Share of index + hot footprint that fits in the tier WiredTiger cache (0–100). */
export function workingSetFitPercent(indexGb: number, hotFootprintGb: number, tierRamGb: number): number {
  const needGb = Math.max(0.001, indexGb + hotFootprintGb);
  const cacheGb = wiredTigerCacheGb(tierRamGb);
  return Math.min(100, Math.round((cacheGb / needGb) * 100));
}
