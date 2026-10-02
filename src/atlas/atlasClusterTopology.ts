/**
 * Builds MongoDB Atlas Admin API cluster create payloads for multi-region HA topologies.
 */

export type AtlasCloudProvider = 'AWS' | 'GCP' | 'AZURE';

export type HaElectableSize = 3 | 5 | 7;

export type HaClusterInputs = {
  provider: AtlasCloudProvider;
  electableNodeCount: HaElectableSize;
  /** Highest-priority region (Atlas regionName enum). */
  primaryRegion: string;
  instanceSize: string;
  readOnlyReplicasPerRegion: number;
  clusterName: string;
};

export type AtlasElectableSpecs = {
  nodeCount: number;
  instanceSize: string;
};

export type AtlasReadOnlySpecs = {
  nodeCount: number;
  instanceSize: string;
};

export type AtlasRegionConfig = {
  providerName: AtlasCloudProvider;
  regionName: string;
  priority: number;
  electableSpecs: AtlasElectableSpecs;
  readOnlySpecs?: AtlasReadOnlySpecs;
};

export type AtlasReplicationSpec = {
  numShards: number;
  regionConfigs: AtlasRegionConfig[];
};

export type AtlasClusterCreateRequest = {
  name: string;
  clusterType: 'REPLICASET';
  providerSettings: {
    providerName: AtlasCloudProvider;
    instanceSizeName: string;
  };
  replicationSpecs: AtlasReplicationSpec[];
};

const AWS_REGIONS = ['US_EAST_1', 'US_WEST_2', 'EU_WEST_1', 'EU_CENTRAL_1', 'AP_SOUTHEAST_1'] as const;
const GCP_REGIONS = ['US_EAST_4', 'US_CENTRAL1', 'US_WEST_2', 'EU_WEST_1', 'EU_WEST_3'] as const;
const AZURE_REGIONS = ['US_EAST_2', 'US_WEST_2', 'EU_WEST_1', 'EU_WEST_3', 'AP_SOUTHEAST_1'] as const;

/** Ordered Atlas region names for automatic secondary region selection. */
export function regionCatalog(provider: AtlasCloudProvider): readonly string[] {
  switch (provider) {
    case 'AWS':
      return AWS_REGIONS;
    case 'GCP':
      return GCP_REGIONS;
    case 'AZURE':
      return AZURE_REGIONS;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** Electable node counts per region for 3-, 5-, and 7-node layouts. */
export function electableSplit(nodeCount: HaElectableSize): number[] {
  switch (nodeCount) {
    case 3:
      return [2, 1];
    case 5:
      return [2, 2, 1];
    case 7:
      return [3, 2, 2];
    default: {
      const _exhaustive: never = nodeCount;
      return _exhaustive;
    }
  }
}

/** Picks distinct regions: primary first, then catalog fallbacks. */
export function resolveHaRegions(provider: AtlasCloudProvider, primaryRegion: string, regionCount: number): string[] {
  const catalog = regionCatalog(provider);
  const normalizedPrimary = primaryRegion.trim().toUpperCase();
  const ordered = [
    normalizedPrimary,
    ...catalog.filter((r) => r !== normalizedPrimary),
  ];
  return ordered.slice(0, regionCount);
}

/** Atlas cluster names: letters, numbers, hyphens; max 64 chars. */
export function sanitizeAtlasClusterName(raw: string, fallback = 'MultiRegionCluster'): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function defaultHaClusterName(electableNodeCount: HaElectableSize): string {
  return `MultiRegionCluster-${electableNodeCount}Node`;
}

/** Builds regionConfigs with descending election priority (7 = preferred primary region). */
export function buildRegionConfigs(inputs: HaClusterInputs): AtlasRegionConfig[] {
  const split = electableSplit(inputs.electableNodeCount);
  const regions = resolveHaRegions(inputs.provider, inputs.primaryRegion, split.length);
  const instanceSize = inputs.instanceSize.trim().toUpperCase();

  return split.map((electableCount, index) => {
    const config: AtlasRegionConfig = {
      providerName: inputs.provider,
      regionName: regions[index] ?? regions[0] ?? inputs.primaryRegion,
      priority: 7 - index,
      electableSpecs: {
        nodeCount: electableCount,
        instanceSize,
      },
    };

    if (inputs.readOnlyReplicasPerRegion > 0) {
      config.readOnlySpecs = {
        nodeCount: inputs.readOnlyReplicasPerRegion,
        instanceSize,
      };
    }

    return config;
  });
}

/** Full POST /api/atlas/v2/groups/{groupId}/clusters request body. */
export function buildAtlasClusterCreateRequest(inputs: HaClusterInputs): AtlasClusterCreateRequest {
  const name = sanitizeAtlasClusterName(inputs.clusterName, defaultHaClusterName(inputs.electableNodeCount));
  const instanceSize = inputs.instanceSize.trim().toUpperCase();

  return {
    name,
    clusterType: 'REPLICASET',
    providerSettings: {
      providerName: inputs.provider,
      instanceSizeName: instanceSize,
    },
    replicationSpecs: [
      {
        numShards: 1,
        regionConfigs: buildRegionConfigs(inputs),
      },
    ],
  };
}

export type HaTopologySummary = {
  provider: AtlasCloudProvider;
  electableNodes: HaElectableSize;
  instanceSize: string;
  readOnlyPerRegion: number;
  clusterName: string;
  regions: { regionName: string; priority: number; electable: number; readOnly: number }[];
};

export function summarizeHaTopology(inputs: HaClusterInputs): HaTopologySummary {
  const payload = buildAtlasClusterCreateRequest(inputs);
  const regionConfigs = payload.replicationSpecs[0]?.regionConfigs ?? [];

  return {
    provider: inputs.provider,
    electableNodes: inputs.electableNodeCount,
    instanceSize: inputs.instanceSize.trim().toUpperCase(),
    readOnlyPerRegion: inputs.readOnlyReplicasPerRegion,
    clusterName: payload.name,
    regions: regionConfigs.map((rc) => ({
      regionName: rc.regionName,
      priority: rc.priority,
      electable: rc.electableSpecs.nodeCount,
      readOnly: rc.readOnlySpecs?.nodeCount ?? 0,
    })),
  };
}
