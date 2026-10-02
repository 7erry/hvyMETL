/** Index size as a fraction of hot document bytes (matches Manager cost heuristics). */
export const DEFAULT_INDEX_OVERHEAD_FACTOR = 0.08;

/** Minimal tier row for RAM/storage selection. */
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
  requiredStorageGb: number;
  tiers: AtlasTierCatalogEntry[];
  productionMinTierId: string;
};

/** WiredTiger cache share of physical RAM (M30 and below vs M40+). */
export function wiredTigerCacheFraction(ramGb: number): number {
  return ramGb <= 8 ? 0.25 : 0.5;
}

/** WiredTiger cache size in GB for a tier RAM spec. */
export function wiredTigerCacheGb(ramGb: number): number {
  return ramGb * wiredTigerCacheFraction(ramGb);
}

/** Estimated index footprint on disk / in RAM (GB). */
export function estimateIndexSizeGb(hotDocumentGb: number, indexCount: number, indexOverheadFactor = DEFAULT_INDEX_OVERHEAD_FACTOR): number {
  const count = Math.max(0, indexCount);
  return Math.max(0, hotDocumentGb * count * indexOverheadFactor);
}

/** Frequently accessed document data (GB) from hot document size and workload ratio. */
export function activeWorkingSetGb(hotDocumentGb: number, ramRatio: number): number {
  return Math.max(0, hotDocumentGb * Math.max(0.05, Math.min(1, ramRatio)));
}

/** Target physical RAM: 2 × (index size + active working set). */
export function targetPhysicalRamGb(indexGb: number, activeWorkingSetSizeGb: number): number {
  return Math.max(0.5, 2 * (Math.max(0, indexGb) + Math.max(0, activeWorkingSetSizeGb)));
}

/**
 * Storage used for tier disk planning: max(hot on cluster, raw on-disk footprint) with growth over horizon.
 * Growth is applied as a single compound factor for the horizon (12 mo → yearly growth rate).
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

/** Smallest production tier meeting RAM and storage, or the largest tier in catalog. */
export function selectAtlasTierForRequirements(input: SelectAtlasTierInput): AtlasTierCatalogEntry {
  const requiredRam = Math.max(0.5, input.requiredRamGb);
  const requiredStorage = Math.max(1, input.requiredStorageGb);
  const startIndex = input.tiers.findIndex((tier) => tier.id === input.productionMinTierId);
  const candidates = input.tiers.slice(Math.max(0, startIndex));
  const match = candidates.find((tier) => tier.ramGb >= requiredRam && tier.storageGb >= requiredStorage);
  return match ?? input.tiers[input.tiers.length - 1]!;
}

/** Share of index + active working set that fits in the tier WiredTiger cache (0–100). */
export function workingSetFitPercent(
  indexGb: number,
  activeWsGb: number,
  tierRamGb: number,
): number {
  const needGb = Math.max(0.001, indexGb + activeWsGb);
  const cacheGb = wiredTigerCacheGb(tierRamGb);
  return Math.min(100, Math.round((cacheGb / needGb) * 100));
}
