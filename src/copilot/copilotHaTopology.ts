/** High-availability cluster topology from Migration Studio HA Agent (Atlas Admin API templates). */

export type CopilotHaTopologyContext = {
  provider: string;
  electableNodes: number;
  instanceSize: string;
  readOnlyPerRegion: number;
  clusterName: string;
  regions: { regionName: string; priority: number; electable: number; readOnly: number }[];
};

export function formatHaTopologySection(haTopology: CopilotHaTopologyContext | undefined): string {
  if (!haTopology) {
    return '(HA Agent not configured — default 3-node layout available in Developer sidebar)';
  }

  const regionLines = haTopology.regions
    .map(
      (r) =>
        `- ${r.regionName} (priority ${r.priority}): ${r.electable} electable, ${r.readOnly} read-only`,
    )
    .join('\n');

  return [
    `Cluster name: ${haTopology.clusterName}`,
    `Provider: ${haTopology.provider}`,
    `Electable nodes: ${haTopology.electableNodes}`,
    `Instance size: ${haTopology.instanceSize}`,
    `Read-only replicas per electable region: ${haTopology.readOnlyPerRegion}`,
    'Region layout:',
    regionLines,
    'Use this layout in §8 replica set & backup and §9 deployment when citing planned Atlas multi-region HA (Admin API replicationSpecs).',
  ].join('\n');
}
