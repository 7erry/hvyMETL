/**
 * Atlas cloud provider normalization for the sizing assistant.
 */

export type SizingCloudProvider = 'AWS' | 'GCP' | 'AZURE';

const PROVIDER_ALIASES: Array<{ pattern: RegExp; provider: SizingCloudProvider }> = [
  { pattern: /^(aws|amazon(?:\s+web\s+services)?)$/i, provider: 'AWS' },
  { pattern: /^(gcp|google(?:\s+cloud)?)$/i, provider: 'GCP' },
  { pattern: /^(azure|microsoft\s+azure)$/i, provider: 'AZURE' },
];

/** Maps user or LLM text to a supported Atlas cloud provider. */
export function normalizeSizingCloudProvider(value: string): SizingCloudProvider | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  for (const entry of PROVIDER_ALIASES) {
    if (entry.pattern.test(trimmed)) return entry.provider;
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'AWS' || upper === 'GCP' || upper === 'AZURE') return upper;
  return undefined;
}

/** Example primary region when the user names a provider but not a region. */
export function defaultRegionForSizingProvider(provider: SizingCloudProvider): string {
  switch (provider) {
    case 'GCP':
      return 'us-central1';
    case 'AZURE':
      return 'East US';
    default:
      return 'us-east-1';
  }
}

/** Provider-specific block storage guidance for architecture narratives. */
export function storageGuidanceForSizingProvider(provider: SizingCloudProvider): string {
  switch (provider) {
    case 'GCP':
      return 'Google Persistent Disk (balanced or SSD) — size for projected IOPS and throughput at peak write load.';
    case 'AZURE':
      return 'Azure Premium SSD or Ultra Disk — match IOPS/throughput to normalized write pressure and working set churn.';
    default:
      return 'AWS GP3 by default; consider Provisioned IOPS (io2) when sustained IOPS exceeds GP3 limits.';
  }
}

/** Resolves provider and regions from session fields with AWS us-east-1 fallback. */
export function resolveSizingDeploymentContext(input: {
  cloud_provider?: string;
  target_regions?: string[];
}): {
  cloudProvider: SizingCloudProvider;
  targetRegions: string[];
  storageGuidance: string;
} {
  const cloudProvider: SizingCloudProvider =
    (input.cloud_provider && normalizeSizingCloudProvider(input.cloud_provider)) || 'AWS';
  const targetRegions =
    input.target_regions?.map((region) => region.trim()).filter(Boolean) ?? [];
  const regions =
    targetRegions.length > 0 ? targetRegions : [defaultRegionForSizingProvider(cloudProvider)];
  return {
    cloudProvider,
    targetRegions: regions,
    storageGuidance: storageGuidanceForSizingProvider(cloudProvider),
  };
}
