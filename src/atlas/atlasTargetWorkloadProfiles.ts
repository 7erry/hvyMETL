/** User-selected Atlas target workload profile (decision matrix). */
export type TargetWorkloadProfileId =
  | 'auto'
  | 'm0'
  | 'flex'
  | 'm10'
  | 'm20'
  | 'm30'
  | 'm40'
  | 'm50'
  | 'm60'
  | 'm80'
  | 'm140'
  | 'm200'
  | 'm300'
  | 'm400'
  | 'm600'
  | 'm700';

export type TargetWorkloadProfileOption = {
  id: TargetWorkloadProfileId;
  /** Atlas tier this profile aligns with; null for auto. */
  tierId: string | null;
  label: string;
  summary: string;
  /** When set, recommended tier will not exceed this tier (M0 / Flex caps). */
  capTierId?: string;
};

/** Atlas decision-matrix target workload profiles. */
export const TARGET_WORKLOAD_PROFILES: TargetWorkloadProfileOption[] = [
  {
    id: 'auto',
    tierId: null,
    label: 'Auto (from dataset scale)',
    summary: 'Recommend tier from raw data size, growth, and Atlas guardrails.',
  },
  {
    id: 'm0',
    tierId: 'M10',
    capTierId: 'M10',
    label: 'M0 (Free)',
    summary: 'Prototypes, sandboxes, proof-of-concept (capped at M10-class sizing).',
  },
  {
    id: 'flex',
    tierId: 'M10',
    capTierId: 'M20',
    label: 'Flex',
    summary: 'Small, low-traffic or highly spiky serverless apps (capped at M20-class sizing).',
  },
  {
    id: 'm10',
    tierId: 'M10',
    label: 'M10',
    summary: 'Small production, dev/test, staging.',
  },
  {
    id: 'm20',
    tierId: 'M20',
    label: 'M20',
    summary: 'Low-traffic web services and microservices.',
  },
  {
    id: 'm30',
    tierId: 'M30',
    label: 'M30',
    summary: 'Baseline entry production with predictable throughput.',
  },
  {
    id: 'm40',
    tierId: 'M40',
    label: 'M40',
    summary: 'Standard production and medium analytical queries.',
  },
  {
    id: 'm50',
    tierId: 'M50',
    label: 'M50',
    summary: 'Medium enterprise apps and high-concurrency APIs.',
  },
  {
    id: 'm60',
    tierId: 'M60',
    label: 'M60',
    summary: 'High-concurrency enterprise workloads.',
  },
  {
    id: 'm80',
    tierId: 'M80',
    label: 'M80',
    summary: 'Heavy transactional and real-time analytics.',
  },
  {
    id: 'm140',
    tierId: 'M140',
    label: 'M140',
    summary: 'High-memory active working sets.',
  },
  {
    id: 'm200',
    tierId: 'M200',
    label: 'M200',
    summary: 'Very large memory-bound, high QPS enterprise.',
  },
  {
    id: 'm300',
    tierId: 'M300',
    label: 'M300',
    summary: 'Ultra-high throughput and massive in-memory working sets.',
  },
  {
    id: 'm400',
    tierId: 'M400',
    label: 'M400',
    summary: 'Beyond M300 — largest standard dedicated classes before sharding.',
  },
  {
    id: 'm600',
    tierId: 'M600',
    label: 'M600',
    summary: 'High-memory dedicated tier for extreme working sets (M400/M600 class).',
  },
  {
    id: 'm700',
    tierId: 'M700',
    label: 'M700',
    summary: 'Maximum dedicated tier for extreme single replica-set scale.',
  },
];

const TIER_RANK: string[] = [
  'M10',
  'M20',
  'M30',
  'M40',
  'M50',
  'M60',
  'M80',
  'M140',
  'M200',
  'M300',
  'M400',
  'M600',
  'M700',
];

function tierRank(tierId: string): number {
  const index = TIER_RANK.indexOf(tierId);
  return index >= 0 ? index : 0;
}

/** Apply profile floor/cap to a computed Atlas tier id. */
export function applyTargetWorkloadProfile(computedTierId: string, profileId: TargetWorkloadProfileId): string {
  if (profileId === 'auto') return computedTierId;
  const profile = TARGET_WORKLOAD_PROFILES.find((entry) => entry.id === profileId);
  if (!profile?.tierId) return computedTierId;

  let resolved = computedTierId;
  const computedRank = tierRank(computedTierId);
  const floorRank = tierRank(profile.tierId);
  if (computedRank < floorRank) {
    resolved = profile.tierId;
  }

  if (profile.capTierId) {
    const capRank = tierRank(profile.capTierId);
    if (tierRank(resolved) > capRank) {
      resolved = profile.capTierId;
    }
  }

  return resolved;
}

/**
 * Illustrative raw-data GB anchors for slider markers (M10 → M700).
 * Values are scenario hints, not Atlas quotes.
 */
/** Decision-matrix workload copy for a dedicated tier id (M10–M700). */
export function decisionMatrixSummaryForTier(tierId: string): string {
  const normalized = tierId.trim().toUpperCase();
  const profile = TARGET_WORKLOAD_PROFILES.find(
    (entry) => entry.tierId === normalized && entry.id !== 'auto' && entry.id !== 'm0' && entry.id !== 'flex',
  );
  return profile?.summary ?? 'Sized from dataset scale, growth, and Atlas RAM/storage guardrails.';
}

export const DATASET_TIER_SLIDER_ANCHORS_GB: ReadonlyArray<{ tierId: string; rawDataGb: number }> = [
  { tierId: 'M10', rawDataGb: 1 },
  { tierId: 'M20', rawDataGb: 12 },
  { tierId: 'M30', rawDataGb: 40 },
  { tierId: 'M40', rawDataGb: 120 },
  { tierId: 'M50', rawDataGb: 350 },
  { tierId: 'M60', rawDataGb: 900 },
  { tierId: 'M80', rawDataGb: 1800 },
  { tierId: 'M140', rawDataGb: 3200 },
  { tierId: 'M200', rawDataGb: 5500 },
  { tierId: 'M300', rawDataGb: 9000 },
  { tierId: 'M400', rawDataGb: 14000 },
  { tierId: 'M600', rawDataGb: 22000 },
  { tierId: 'M700', rawDataGb: 35000 },
];
