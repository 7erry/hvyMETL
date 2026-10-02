import { describe, expect, it } from 'vitest';
import {
  buildAtlasClusterCreateRequest,
  buildRegionConfigs,
  electableSplit,
  sanitizeAtlasClusterName,
  summarizeHaTopology,
  type HaClusterInputs,
} from './atlasClusterTopology.js';

const base3Aws: HaClusterInputs = {
  provider: 'AWS',
  electableNodeCount: 3,
  primaryRegion: 'US_EAST_1',
  instanceSize: 'M10',
  readOnlyReplicasPerRegion: 0,
  clusterName: 'MultiRegionCluster-3Node',
};

describe('electableSplit', () => {
  it('maps 3, 5, and 7 node layouts', () => {
    expect(electableSplit(3)).toEqual([2, 1]);
    expect(electableSplit(5)).toEqual([2, 2, 1]);
    expect(electableSplit(7)).toEqual([3, 2, 2]);
  });
});

describe('buildAtlasClusterCreateRequest', () => {
  it('matches 3-node AWS example shape', () => {
    const payload = buildAtlasClusterCreateRequest(base3Aws);
    expect(payload).toMatchObject({
      name: 'MultiRegionCluster-3Node',
      clusterType: 'REPLICASET',
      providerSettings: { providerName: 'AWS', instanceSizeName: 'M10' },
    });
    const regions = payload.replicationSpecs[0]?.regionConfigs ?? [];
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({
      providerName: 'AWS',
      regionName: 'US_EAST_1',
      priority: 7,
      electableSpecs: { nodeCount: 2, instanceSize: 'M10' },
    });
    expect(regions[1]).toMatchObject({
      providerName: 'AWS',
      regionName: 'US_WEST_2',
      priority: 6,
      electableSpecs: { nodeCount: 1, instanceSize: 'M10' },
    });
  });

  it('matches 5-node AWS multi-region layout', () => {
    const payload = buildAtlasClusterCreateRequest({
      ...base3Aws,
      electableNodeCount: 5,
      instanceSize: 'M20',
      clusterName: 'MultiRegionCluster-5Node',
    });
    const regions = payload.replicationSpecs[0]?.regionConfigs ?? [];
    expect(regions.map((r) => r.electableSpecs.nodeCount)).toEqual([2, 2, 1]);
    expect(regions.map((r) => r.regionName)).toEqual(['US_EAST_1', 'US_WEST_2', 'EU_WEST_1']);
    expect(regions.map((r) => r.priority)).toEqual([7, 6, 5]);
  });

  it('uses single-provider 7-node 3+2+2 split', () => {
    const payload = buildAtlasClusterCreateRequest({
      ...base3Aws,
      electableNodeCount: 7,
      instanceSize: 'M30',
      clusterName: 'MultiRegionCluster-7Node',
    });
    const regions = payload.replicationSpecs[0]?.regionConfigs ?? [];
    expect(regions.every((r) => r.providerName === 'AWS')).toBe(true);
    expect(regions.map((r) => r.electableSpecs.nodeCount)).toEqual([3, 2, 2]);
  });

  it('adds readOnlySpecs on every electable region', () => {
    const configs = buildRegionConfigs({
      ...base3Aws,
      electableNodeCount: 5,
      readOnlyReplicasPerRegion: 2,
    });
    expect(configs).toHaveLength(3);
    for (const rc of configs) {
      expect(rc.readOnlySpecs).toEqual({ nodeCount: 2, instanceSize: 'M10' });
    }
  });

  it('honors explicit regionNames for 5-node layout', () => {
    const payload = buildAtlasClusterCreateRequest({
      ...base3Aws,
      electableNodeCount: 5,
      regionNames: ['US_EAST_1', 'US_WEST_2', 'EU_WEST_1'],
    });
    expect(payload.replicationSpecs[0]?.regionConfigs.map((r) => r.regionName)).toEqual([
      'US_EAST_1',
      'US_WEST_2',
      'EU_WEST_1',
    ]);
  });

  it('uses AZURE provider name for Azure', () => {
    const payload = buildAtlasClusterCreateRequest({
      ...base3Aws,
      provider: 'AZURE',
      primaryRegion: 'US_EAST_2',
    });
    expect(payload.providerSettings.providerName).toBe('AZURE');
    expect(payload.replicationSpecs[0]?.regionConfigs[0]?.regionName).toBe('US_EAST_2');
  });
});

describe('sanitizeAtlasClusterName', () => {
  it('strips invalid characters', () => {
    expect(sanitizeAtlasClusterName('my cluster!!!')).toBe('my-cluster');
  });
});

describe('summarizeHaTopology', () => {
  it('includes read-only counts in summary', () => {
    const summary = summarizeHaTopology({
      ...base3Aws,
      readOnlyReplicasPerRegion: 1,
    });
    expect(summary.regions.every((r) => r.readOnly === 1)).toBe(true);
  });
});
