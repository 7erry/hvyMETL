import { buildAtlasHaArtifactBundle } from '../../../src/atlas/atlasHaExport.ts';
import type { HaClusterInputs } from '../../../src/atlas/atlasClusterTopology.ts';
import type { MigrationArtifacts } from '../sessionState';

export function buildAtlasHaMigrationSlice(inputs: HaClusterInputs): NonNullable<MigrationArtifacts['atlasHa']> {
  const bundle = buildAtlasHaArtifactBundle(inputs);
  return {
    provisioningGuideMd: bundle.provisioningGuideMd,
    clusterCreateJson: bundle.clusterCreateJson,
    generatedAt: bundle.generatedAt,
    inputsSnapshot: bundle.inputsSnapshot,
  };
}

export function mergeAtlasHaIntoArtifacts(
  artifacts: MigrationArtifacts,
  inputs: HaClusterInputs,
): MigrationArtifacts {
  return {
    ...artifacts,
    atlasHa: buildAtlasHaMigrationSlice(inputs),
  };
}
