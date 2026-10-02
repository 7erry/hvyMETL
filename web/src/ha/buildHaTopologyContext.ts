import { summarizeHaTopology, type HaClusterInputs } from '../../../src/atlas/atlasClusterTopology.ts';

export type CopilotHaTopologyContext = {
  provider: string;
  electableNodes: number;
  instanceSize: string;
  readOnlyPerRegion: number;
  clusterName: string;
  regions: { regionName: string; priority: number; electable: number; readOnly: number }[];
};

export function buildHaTopologyContext(inputs: HaClusterInputs): CopilotHaTopologyContext {
  const summary = summarizeHaTopology(inputs);
  return {
    provider: summary.provider,
    electableNodes: summary.electableNodes,
    instanceSize: summary.instanceSize,
    readOnlyPerRegion: summary.readOnlyPerRegion,
    clusterName: summary.clusterName,
    regions: summary.regions,
  };
}
