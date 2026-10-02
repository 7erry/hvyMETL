/** Index size as a fraction of hot document bytes (matches Manager cost heuristics). */
export const DEFAULT_INDEX_OVERHEAD_FACTOR = 0.08;

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

/** Dedicated Atlas tiers (M10–M700) for sizing guardrails and recommendations. */
export const ATLAS_PRODUCTION_TIER_MATRIX: AtlasProductionTierSpec[] = [
  { id: 'M10', ramGb: 2, vcpu: 2, maxConnections: 1500, extendedStorageMaxGb: 128, diskToRamRatioMax: 60 },
  { id: 'M20', ramGb: 4, vcpu: 2, maxConnections: 3000, extendedStorageMaxGb: 256, diskToRamRatioMax: 60 },
  { id: 'M30', ramGb: 8, vcpu: 2, maxConnections: 3000, extendedStorageMaxGb: 512, diskToRamRatioMax: 60 },
  { id: 'M40', ramGb: 16, vcpu: 4, maxConnections: 6000, extendedStorageMaxGb: 4096, diskToRamRatioMax: 60 },
  { id: 'M50', ramGb: 32, vcpu: 8, maxConnections: 16000, extendedStorageMaxGb: 8192, diskToRamRatioMax: 120 },
  { id: 'M60', ramGb: 64, vcpu: 16, maxConnections: 32000, extendedStorageMaxGb: 8192, diskToRamRatioMax: 120 },
  { id: 'M80', ramGb: 128, vcpu: 32, maxConnections: 96000, extendedStorageMaxGb: 14336, diskToRamRatioMax: 120 },
  { id: 'M140', ramGb: 192, vcpu: 48, maxConnections: 96000, extendedStorageMaxGb: 14336, diskToRamRatioMax: 120 },
  { id: 'M200', ramGb: 256, vcpu: 64, maxConnections: 128000, extendedStorageMaxGb: 14336, diskToRamRatioMax: 120 },
  { id: 'M300', ramGb: 384, vcpu: 96, maxConnections: 128000, extendedStorageMaxGb: 14336, diskToRamRatioMax: 120 },
  { id: 'M400', ramGb: 488, vcpu: 96, maxConnections: 128000, extendedStorageMaxGb: 32768, diskToRamRatioMax: 120 },
  { id: 'M700', ramGb: 768, vcpu: 96, maxConnections: 128000, extendedStorageMaxGb: 49152, diskToRamRatioMax: 120 },
];

/** WiredTiger cache share of physical RAM (M10–M30: 25%; M40+: ~50%). */
export function wiredTigerCacheFraction(ramGb: number): number {
  return ramGb <= 8 ? 0.25 : 0.5;
}

/** WiredTiger cache size in GB for a tier RAM spec. */
export function wiredTigerCacheGb(ramGb: number): number {
  return ramGb * wiredTigerCacheFraction(ramGb);
}

/** Estimated index footprint in GB from on-disk document data volume. */
export function estimateIndexSizeGb(
  onDiskDocumentGb: number,
  indexCount: number,
  indexOverheadFactor = DEFAULT_INDEX_OVERHEAD_FACTOR,
): number {
  const count = Math.max(0, indexCount);
  return Math.max(0, onDiskDocumentGb * count * indexOverheadFactor);
}

/** Hot data footprint in GB (typically 10–25% of document data) from workload ratio. */
export function activeWorkingSetGb(onDiskDocumentGb: number, ramRatio: number): number {
  return Math.max(0, onDiskDocumentGb * Math.max(0.05, Math.min(1, ramRatio)));
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
  const baseGb = Math.max(Math.max(0, input.activeStorageGb), rawOnDiskGb);
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

/** Whether a tier satisfies RAM, disk ratio, extended storage, and WiredTiger cache for working set. */
export function tierMeetsAtlasGuardrails(
  tier: AtlasProductionTierSpec,
  requiredRamGb: number,
  planningStorageGb: number,
  indexGb: number,
  hotFootprintGb: number,
): boolean {
  if (tier.ramGb < requiredRamGb) return false;
  if (planningStorageGb > maxAllocatableDiskGb(tier)) return false;
  const workingSetGb = indexGb + hotFootprintGb;
  if (wiredTigerCacheGb(tier.ramGb) < workingSetGb) return false;
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
  const match = candidates.find((tier) =>
    tierMeetsAtlasGuardrails(
      tier,
      requiredRam,
      planningStorage,
      input.indexGb,
      input.hotFootprintGb,
    ),
  );
  return match ?? candidates[candidates.length - 1] ?? tiers[tiers.length - 1]!;
}

/** Share of index + hot footprint that fits in the tier WiredTiger cache (0–100). */
export function workingSetFitPercent(indexGb: number, hotFootprintGb: number, tierRamGb: number): number {
  const needGb = Math.max(0.001, indexGb + hotFootprintGb);
  const cacheGb = wiredTigerCacheGb(tierRamGb);
  return Math.min(100, Math.round((cacheGb / needGb) * 100));
}
