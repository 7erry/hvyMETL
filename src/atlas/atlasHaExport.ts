import {
  buildAtlasClusterCreateRequest,
  type AtlasClusterCreateRequest,
  type HaClusterInputs,
} from './atlasClusterTopology.js';

export const ATLAS_CLUSTER_CREATE_ACCEPT = 'application/vnd.atlas.2023-01-01+json';
export const ATLAS_CLUSTER_CREATE_ENDPOINT =
  'POST https://cloud.mongodb.com/api/atlas/v2/groups/{GROUP-ID}/clusters';

export type AtlasHaArtifactBundle = {
  provisioningGuideMd: string;
  clusterCreateJson: string;
  clusterName: string;
  generatedAt: string;
  inputsSnapshot: HaClusterInputs;
};

function formatRegionTable(payload: AtlasClusterCreateRequest): string {
  const rows = payload.replicationSpecs[0]?.regionConfigs ?? [];
  const lines = [
    '| Region | Priority | Electable | Read-only |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const rc of rows) {
    lines.push(
      `| ${rc.regionName} | ${rc.priority} | ${rc.electableSpecs.nodeCount} | ${rc.readOnlySpecs?.nodeCount ?? 0} |`,
    );
  }
  return lines.join('\n');
}

/** Markdown guide for provisioning the cluster via Atlas Admin API. */
export function buildAtlasHaProvisioningGuide(
  inputs: HaClusterInputs,
  payload: AtlasClusterCreateRequest,
): string {
  const jsonBlock = JSON.stringify(payload, null, 2);
  const curlBody = JSON.stringify(payload);

  return `# MongoDB Atlas multi-region cluster provisioning

Estimates and templates only — not a quote, SLA, or operational runbook. Validate tier, regions, and pricing in the Atlas UI before creating resources.

## Prerequisites and API setup

**Endpoint:** \`${ATLAS_CLUSTER_CREATE_ENDPOINT}\`

**Headers:**

- \`Content-Type: application/json\`
- \`Accept: ${ATLAS_CLUSTER_CREATE_ACCEPT}\`

**Authentication:** Digest authentication with an Atlas API key pair, or an HTTP Bearer token.

Replace \`{GROUP-ID}\` with your Atlas project ID.

## Topology summary (${inputs.electableNodeCount} electable nodes · ${inputs.provider})

${formatRegionTable(payload)}

### Key fields

- **priority:** Primary eligibility — higher values (e.g. 7) prefer that region for primary elections.
- **electableSpecs.nodeCount:** Voting nodes in the region that can become primary.
- **readOnlySpecs:** Dedicated read-only nodes (non-voting); added per region when configured.

## Request body (\`atlas-cluster-create.json\`)

\`\`\`json
${jsonBlock}
\`\`\`

## Example curl

\`\`\`bash
curl --request POST \\
  --url "https://cloud.mongodb.com/api/atlas/v2/groups/{GROUP-ID}/clusters" \\
  --header "Content-Type: application/json" \\
  --header "Accept: ${ATLAS_CLUSTER_CREATE_ACCEPT}" \\
  --user "<ATLAS_PUBLIC_KEY>:<ATLAS_PRIVATE_KEY>" \\
  --data '${curlBody.replace(/'/g, "'\\''")}'
\`\`\`

Cluster name in this export: **${payload.name}**
`;
}

export function buildAtlasHaArtifactBundle(inputs: HaClusterInputs): AtlasHaArtifactBundle {
  const payload = buildAtlasClusterCreateRequest(inputs);

  return {
    provisioningGuideMd: buildAtlasHaProvisioningGuide(inputs, payload),
    clusterCreateJson: JSON.stringify(payload, null, 2),
    clusterName: payload.name,
    generatedAt: new Date().toISOString(),
    inputsSnapshot: { ...inputs },
  };
}
