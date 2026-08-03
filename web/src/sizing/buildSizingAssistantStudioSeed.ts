import type { SizingAssistantStudioSeedPayload } from '../../../src/copilot/sizingAssistantStudioSeed.ts';
import type { MigrationPlan } from '../migrationPlanTypes';
import { buildDatasetScaleContext } from '../copilot/buildDatasetScaleContext';
import { computeManagerCostProjection, type ManagerCostInputs } from '../managerCostEstimate';
import type { SqlStructuralModel } from '../types';

export type SizingAtlasHints = {
  avgDocSizeKb?: number;
  secondaryIndexCount?: number;
};

export type WorkloadTelemetrySeed = {
  peakRpm: number;
  readPercent: number;
  writePercent: number;
  compression: string;
};

/** Builds the studioSeed payload sent to POST /api/sizing-assistant/session. */
export function buildSizingAssistantStudioSeed(input: {
  model: SqlStructuralModel | null;
  plan: MigrationPlan | null;
  managerCostInputs: ManagerCostInputs;
  telemetry: WorkloadTelemetrySeed | null;
  targetDatabase?: string;
  atlasHints?: SizingAtlasHints;
}): SizingAssistantStudioSeedPayload | null {
  const datasetScale = buildDatasetScaleContext(input.model, input.plan, input.managerCostInputs);
  const projection =
    input.model || input.plan
      ? computeManagerCostProjection(input.model, input.plan, input.managerCostInputs)
      : null;

  const hasScale =
    datasetScale.rawDataGb !== null ||
    input.telemetry !== null ||
    (input.atlasHints?.avgDocSizeKb ?? 0) > 0;

  if (!hasScale) return null;

  return {
    datasetScale,
    peakRpm: input.telemetry?.peakRpm,
    readPercent: input.telemetry?.readPercent,
    writePercent: input.telemetry?.writePercent,
    compression: input.telemetry?.compression,
    workingSetPercent: projection?.workingSetPercent,
    plannedIndexCount: projection?.indexCount,
    atlasInspectHints: input.atlasHints,
    targetDatabase: input.targetDatabase?.trim() || undefined,
    workloadType: 'CONSISTENT',
  };
}
