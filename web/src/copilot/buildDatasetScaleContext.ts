import type { CopilotDatasetScaleContext } from '../../../src/copilot/copilotDatasetScale.ts';
import { normalizeCopilotShardingHints } from '../../../src/copilot/copilotDatasetScale.ts';
import type { MigrationPlan } from '../migrationPlanTypes';
import { computeManagerCostProjection, type ManagerCostInputs } from '../managerCostEstimate';
import type { SqlStructuralModel } from '../types';

/** Builds copilot dataset scale context from Manager inputs and the current schema/plan. */
export function buildDatasetScaleContext(
  model: SqlStructuralModel | null,
  plan: MigrationPlan | null,
  inputs: ManagerCostInputs,
): CopilotDatasetScaleContext {
  const hasManagerOverride = Number.isFinite(inputs.estimatedDataGb) && inputs.estimatedDataGb > 0;
  const projection = computeManagerCostProjection(model, plan, inputs);

  let rawDataSource: CopilotDatasetScaleContext['rawDataSource'];
  if (hasManagerOverride) {
    rawDataSource = 'manager-override';
  } else if (projection.hasSchema && projection.rawDataGb > 0) {
    rawDataSource = 'schema-estimate';
  } else {
    rawDataSource = 'unavailable';
  }

  const rawDataGb = projection.rawDataGb > 0 ? projection.rawDataGb : null;

  return {
    rawDataSource,
    managerRawDataGb: hasManagerOverride ? inputs.estimatedDataGb : null,
    rawDataGb,
    totalStorageGb: rawDataGb !== null ? projection.totalStorageGb : null,
    activeStorageGb: rawDataGb !== null ? projection.activeStorageGb : null,
    archiveStorageGb: rawDataGb !== null ? projection.archiveStorageGb : null,
    estimatedTotalRows: rawDataGb !== null ? projection.estimatedTotalRows : null,
    averageDocumentBytes: rawDataGb !== null ? projection.averageDocumentBytes : null,
    workloadLabel: projection.workloadLabel,
    growthRatePercent: inputs.growthRatePercent,
    recommendedTierLabel: rawDataGb !== null ? projection.recommendedTier.label : null,
    requiresSharding: projection.requiresSharding,
    shardingRecommendations: normalizeCopilotShardingHints(projection.shardingRecommendations),
  };
}
