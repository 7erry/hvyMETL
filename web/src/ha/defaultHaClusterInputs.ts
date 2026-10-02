import {
  defaultHaClusterName,
  electableSplit,
  regionCatalog,
  resolveHaRegions,
  type AtlasCloudProvider,
  type HaClusterInputs,
  type HaElectableSize,
} from '../../../src/atlas/atlasClusterTopology.ts';

export const DEFAULT_HA_INSTANCE_SIZE = 'M10';

export const DEFAULT_HA_CLUSTER_INPUTS: HaClusterInputs = {
  provider: 'AWS',
  electableNodeCount: 3,
  primaryRegion: 'US_EAST_1',
  regionNames: ['US_EAST_1', 'US_WEST_2'],
  instanceSize: DEFAULT_HA_INSTANCE_SIZE,
  instanceSizeLocked: false,
  readOnlyReplicasPerRegion: 0,
  clusterName: defaultHaClusterName(3),
};

export function primaryRegionOptions(provider: AtlasCloudProvider): string[] {
  return [...regionCatalog(provider)];
}

export function defaultRegionNamesForLayout(
  provider: AtlasCloudProvider,
  primaryRegion: string,
  electableNodeCount: HaElectableSize,
): string[] {
  return resolveHaRegions(provider, primaryRegion, electableSplit(electableNodeCount).length);
}

export function normalizeRegionNames(
  provider: AtlasCloudProvider,
  primaryRegion: string,
  electableNodeCount: HaElectableSize,
  regionNames: string[] | undefined,
): string[] {
  const defaults = defaultRegionNamesForLayout(provider, primaryRegion, electableNodeCount);
  if (!regionNames?.length) return defaults;
  const catalog = regionCatalog(provider);
  const splitLen = electableSplit(electableNodeCount).length;
  if (regionNames.length !== splitLen) return defaults;

  const used = new Set<string>();
  return regionNames.map((raw, index) => {
    const name = raw.trim().toUpperCase();
    if (catalog.includes(name) && !used.has(name)) {
      used.add(name);
      return name;
    }
    const fallback = defaults[index] ?? defaults[0] ?? primaryRegion;
    used.add(fallback);
    return fallback;
  });
}

function resolveInstanceSize(
  partial: Partial<HaClusterInputs> | undefined,
  recommendedTierId?: string,
): { instanceSize: string; instanceSizeLocked: boolean } {
  const recommended = recommendedTierId?.trim().toUpperCase();
  const locked = partial?.instanceSizeLocked === true;
  const fromPartial = partial?.instanceSize?.trim().toUpperCase();

  if (locked && fromPartial) {
    return { instanceSize: fromPartial, instanceSizeLocked: true };
  }

  if (recommended) {
    if (!fromPartial || fromPartial === DEFAULT_HA_INSTANCE_SIZE) {
      return { instanceSize: recommended, instanceSizeLocked: false };
    }
  }

  return {
    instanceSize: fromPartial ?? recommended ?? DEFAULT_HA_INSTANCE_SIZE,
    instanceSizeLocked: locked,
  };
}

export function haClusterInputsWithDefaults(
  partial: Partial<HaClusterInputs> | undefined,
  recommendedTierId?: string,
): HaClusterInputs {
  const electable = partial?.electableNodeCount ?? DEFAULT_HA_CLUSTER_INPUTS.electableNodeCount;
  const provider = partial?.provider ?? DEFAULT_HA_CLUSTER_INPUTS.provider;
  const catalog = regionCatalog(provider);
  const primary =
    partial?.primaryRegion && catalog.includes(partial.primaryRegion)
      ? partial.primaryRegion
      : catalog[0] ?? DEFAULT_HA_CLUSTER_INPUTS.primaryRegion;

  const { instanceSize, instanceSizeLocked } = resolveInstanceSize(partial, recommendedTierId);

  const regionNames = normalizeRegionNames(
    provider,
    primary,
    electable as HaElectableSize,
    partial?.regionNames,
  );

  return {
    provider,
    electableNodeCount: electable as HaElectableSize,
    primaryRegion: regionNames[0] ?? primary,
    regionNames,
    instanceSize,
    instanceSizeLocked,
    readOnlyReplicasPerRegion: Math.max(0, Math.round(partial?.readOnlyReplicasPerRegion ?? 0)),
    clusterName: partial?.clusterName?.trim() || defaultHaClusterName(electable as HaElectableSize),
  };
}

export function patchHaRegionAtIndex(inputs: HaClusterInputs, index: number, regionName: string): HaClusterInputs {
  const split = electableSplit(inputs.electableNodeCount);
  const regionNames = normalizeRegionNames(
    inputs.provider,
    inputs.primaryRegion,
    inputs.electableNodeCount,
    inputs.regionNames ?? defaultRegionNamesForLayout(inputs.provider, inputs.primaryRegion, inputs.electableNodeCount),
  );
  const next = [...regionNames];
  next[index] = regionName.trim().toUpperCase();
  const normalized = normalizeRegionNames(inputs.provider, next[0] ?? inputs.primaryRegion, inputs.electableNodeCount, next);
  return {
    ...inputs,
    primaryRegion: normalized[0] ?? inputs.primaryRegion,
    regionNames: normalized,
  };
}

export function patchHaElectableCount(inputs: HaClusterInputs, electableNodeCount: HaElectableSize): HaClusterInputs {
  return haClusterInputsWithDefaults({
    ...inputs,
    electableNodeCount,
    regionNames: defaultRegionNamesForLayout(inputs.provider, inputs.primaryRegion, electableNodeCount),
  });
}

export function patchHaProvider(inputs: HaClusterInputs, provider: AtlasCloudProvider): HaClusterInputs {
  const catalog = regionCatalog(provider);
  const primary = catalog.includes(inputs.primaryRegion) ? inputs.primaryRegion : catalog[0] ?? inputs.primaryRegion;
  return haClusterInputsWithDefaults({
    ...inputs,
    provider,
    primaryRegion: primary,
    regionNames: defaultRegionNamesForLayout(provider, primary, inputs.electableNodeCount),
  });
}
