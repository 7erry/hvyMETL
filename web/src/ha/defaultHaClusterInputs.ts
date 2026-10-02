import {
  defaultHaClusterName,
  regionCatalog,
  type AtlasCloudProvider,
  type HaClusterInputs,
  type HaElectableSize,
} from '../../../src/atlas/atlasClusterTopology.ts';

export const DEFAULT_HA_INSTANCE_SIZE = 'M10';

export const DEFAULT_HA_CLUSTER_INPUTS: HaClusterInputs = {
  provider: 'AWS',
  electableNodeCount: 3,
  primaryRegion: 'US_EAST_1',
  instanceSize: DEFAULT_HA_INSTANCE_SIZE,
  readOnlyReplicasPerRegion: 0,
  clusterName: defaultHaClusterName(3),
};

export function primaryRegionOptions(provider: AtlasCloudProvider): string[] {
  return [...regionCatalog(provider)];
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

  return {
    provider,
    electableNodeCount: electable as HaElectableSize,
    primaryRegion: primary,
    instanceSize: (partial?.instanceSize ?? recommendedTierId ?? DEFAULT_HA_INSTANCE_SIZE).toUpperCase(),
    readOnlyReplicasPerRegion: Math.max(0, Math.round(partial?.readOnlyReplicasPerRegion ?? 0)),
    clusterName: partial?.clusterName?.trim() || defaultHaClusterName(electable as HaElectableSize),
  };
}
