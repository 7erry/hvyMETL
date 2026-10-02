import type { AtlasClusterCreateRequest } from './atlasClusterTopology.js';

/** Minimal Terraform snippet for mongodbatlas_advanced_cluster (illustrative). */
export function buildAtlasClusterTerraformHcl(
  payload: AtlasClusterCreateRequest,
  projectIdPlaceholder = 'YOUR_ATLAS_PROJECT_ID',
): string {
  const spec = payload.replicationSpecs[0];
  const regionBlocks =
    spec?.regionConfigs
      .map((rc) => {
        const readOnly =
          rc.readOnlySpecs && rc.readOnlySpecs.nodeCount > 0
            ? `
      read_only_specs {
        instance_size = "${rc.readOnlySpecs.instanceSize}"
        node_count    = ${rc.readOnlySpecs.nodeCount}
      }`
            : '';
        return `
    region_config {
      provider_name = "${rc.providerName}"
      region_name   = "${rc.regionName}"
      priority      = ${rc.priority}
      electable_specs {
        instance_size = "${rc.electableSpecs.instanceSize}"
        node_count    = ${rc.electableSpecs.nodeCount}
      }${readOnly}
    }`;
      })
      .join('') ?? '';

  return `# Illustrative Terraform — validate against your Atlas provider version before apply.
terraform {
  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.22"
    }
  }
}

resource "mongodbatlas_advanced_cluster" "${payload.name.replace(/[^a-zA-Z0-9_]/g, '_')}" {
  project_id   = "${projectIdPlaceholder}"
  name         = "${payload.name}"
  cluster_type = "REPLICASET"

  replication_specs {
    num_shards = ${spec?.numShards ?? 1}${regionBlocks}
  }
}
`;
}
