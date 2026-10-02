import type { AtlasClusterCreateRequest } from './atlasClusterTopology.js';

export type AtlasClusterValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/** Client-side checks before calling Atlas Admin API. */
export function validateAtlasClusterCreateRequest(payload: AtlasClusterCreateRequest): AtlasClusterValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload.name?.trim()) errors.push('Cluster name is required.');
  if (payload.clusterType !== 'REPLICASET') errors.push('clusterType must be REPLICASET.');

  const specs = payload.replicationSpecs;
  if (!specs?.length) {
    errors.push('replicationSpecs must include at least one entry.');
  } else {
    for (const spec of specs) {
      if (!spec.regionConfigs?.length) errors.push('Each replicationSpec needs regionConfigs.');
      const regionNames = new Set<string>();
      for (const rc of spec.regionConfigs ?? []) {
        if (!rc.regionName) errors.push('Each regionConfig needs regionName.');
        if (regionNames.has(rc.regionName)) errors.push(`Duplicate region: ${rc.regionName}`);
        regionNames.add(rc.regionName);
        if (rc.electableSpecs.nodeCount < 1) errors.push(`Region ${rc.regionName} needs at least one electable node.`);
        if (!rc.electableSpecs.instanceSize) errors.push(`Region ${rc.regionName} missing instance size.`);
      }
    }
  }

  const electableTotal = specs?.[0]?.regionConfigs.reduce((n, rc) => n + rc.electableSpecs.nodeCount, 0) ?? 0;
  if (electableTotal > 0 && electableTotal % 2 === 0 && electableTotal >= 4) {
    warnings.push('Even electable counts across regions are OK; ensure voting majority survives region loss.');
  }

  return { ok: errors.length === 0, errors, warnings };
}
