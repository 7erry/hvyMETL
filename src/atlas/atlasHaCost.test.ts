import { describe, expect, it } from 'vitest';
import { countHaBillableNodes, estimateHaClusterMonthlyUsd } from './atlasHaCost.js';
import type { HaClusterInputs } from './atlasClusterTopology.js';

const base: HaClusterInputs = {
  provider: 'AWS',
  electableNodeCount: 5,
  primaryRegion: 'US_EAST_1',
  regionNames: ['US_EAST_1', 'US_WEST_2', 'EU_WEST_1'],
  instanceSize: 'M700',
  readOnlyReplicasPerRegion: 1,
  clusterName: 'test',
};

describe('atlasHaCost', () => {
  it('counts electable plus read-only per region', () => {
    expect(countHaBillableNodes(base)).toBe(5 + 3);
  });

  it('estimates monthly as tier price times nodes', () => {
    expect(estimateHaClusterMonthlyUsd(base, 12900)).toBe(8 * 12900);
  });
});
