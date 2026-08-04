/**
 * Maps hvyMETL Studio context (Manager, workload profile, Atlas inspect) into sizing session parameters.
 */

import type { CopilotDatasetScaleContext } from './copilotDatasetScale.js';
import { mergeSessionParametersIfMissing } from './sizingAssistantSession.js';
import type {
  SizingAssistantSession,
  SizingCloudProvider,
  SizingSessionParameters,
  SizingWorkloadType,
} from './sizingAssistantTypes.js';

/** Optional Atlas inspect hints captured after pipeline import (list collections / indexes). */
export type SizingAtlasInspectHints = {
  avgDocSizeKb?: number;
  secondaryIndexCount?: number;
};

/** JSON body the Studio sends when creating or refreshing a sizing session. */
export type SizingAssistantStudioSeedPayload = {
  datasetScale?: CopilotDatasetScaleContext;
  /** Peak requests per minute from the migration workload profile. */
  peakRpm?: number;
  readPercent?: number;
  writePercent?: number;
  /** Manager projection: share of hot data that fits in tier RAM (0–100). */
  workingSetPercent?: number;
  /** Planned secondary index count from migration design (cluster total). */
  plannedIndexCount?: number;
  /** WiredTiger compression from workload profile (snappy, zstd, zlib, none). */
  compression?: string;
  atlasInspectHints?: SizingAtlasInspectHints;
  targetDatabase?: string;
  cloudProvider?: SizingCloudProvider;
  targetRegions?: string[];
  workloadType?: SizingWorkloadType;
};

export type StudioSeedApplyResult = {
  session: SizingAssistantSession;
  appliedKeys: string[];
  parameters: SizingSessionParameters;
};

const COMPRESSION_FRACTION: Record<string, number> = {
  none: 0,
  snappy: 0.35,
  zlib: 0.4,
  zstd: 0.45,
};

function positiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function opsFromPeakRpm(peakRpm: number, readPercent: number, writePercent: number): {
  readOps: number;
  writeOps: number;
} {
  const peakRps = peakRpm / 60;
  const readShare = Math.max(0, Math.min(100, readPercent)) / 100;
  const writeShare = Math.max(0, Math.min(100, writePercent)) / 100;
  const readOps = Math.max(1, Math.round(peakRps * readShare));
  const writeOps = Math.max(1, Math.round(peakRps * writeShare));
  return { readOps, writeOps };
}

/** Derives sizing engine fields from studio payload (does not mutate session). */
export function buildSizingParametersFromStudioSeed(
  seed: SizingAssistantStudioSeedPayload,
): Partial<SizingSessionParameters> {
  const patch: Partial<SizingSessionParameters> = {};
  const scale = seed.datasetScale;

  const dataGb =
    positiveNumber(scale?.totalStorageGb ?? undefined) ??
    positiveNumber(scale?.activeStorageGb ?? undefined) ??
    positiveNumber(scale?.rawDataGb ?? undefined) ??
    positiveNumber(scale?.managerRawDataGb ?? undefined);
  if (dataGb !== undefined) {
    patch.projected_total_data_size_gb = dataGb;
  }

  const peakRpm = positiveNumber(seed.peakRpm);
  const readPercent = typeof seed.readPercent === 'number' ? seed.readPercent : undefined;
  const writePercent = typeof seed.writePercent === 'number' ? seed.writePercent : undefined;
  if (peakRpm !== undefined && readPercent !== undefined && writePercent !== undefined) {
    const { readOps, writeOps } = opsFromPeakRpm(peakRpm, readPercent, writePercent);
    patch.total_raw_read_ops = readOps;
    patch.total_raw_write_ops = writeOps;
  }

  const describedKb = positiveNumber(seed.atlasInspectHints?.avgDocSizeKb);
  const planKb =
    scale?.averageDocumentBytes !== null && scale?.averageDocumentBytes !== undefined
      ? scale.averageDocumentBytes / 1024
      : undefined;
  const avgKb = describedKb ?? (planKb !== undefined && planKb > 0 ? planKb : undefined);
  if (avgKb !== undefined) {
    patch.avg_doc_size_kb = Math.max(0.25, Math.round(avgKb * 100) / 100);
  }

  const inspectIndexes = positiveNumber(seed.atlasInspectHints?.secondaryIndexCount);
  const plannedIndexes = positiveNumber(seed.plannedIndexCount);
  const indexCount = inspectIndexes ?? plannedIndexes;
  if (indexCount !== undefined) {
    patch.secondary_index_count = Math.max(1, Math.round(indexCount));
  }

  if (typeof seed.workingSetPercent === 'number' && Number.isFinite(seed.workingSetPercent)) {
    patch.active_working_set_percentage = Math.min(1, Math.max(0.05, seed.workingSetPercent / 100));
  }

  if (scale?.growthRatePercent !== null && scale?.growthRatePercent !== undefined && dataGb !== undefined) {
    const yearly = Math.max(0, scale.growthRatePercent) / 100;
    patch.estimated_data_growth_gb_per_month = Math.max(0, (dataGb * yearly) / 12);
  }

  if (seed.compression) {
    const key = seed.compression.toLowerCase();
    if (key in COMPRESSION_FRACTION) {
      patch.data_compression_percentage = COMPRESSION_FRACTION[key];
    }
  }

  if (seed.workloadType) {
    patch.workload_type = seed.workloadType;
  } else {
    patch.workload_type = 'CONSISTENT';
  }

  if (seed.cloudProvider) {
    patch.cloud_provider = seed.cloudProvider;
  }
  if (seed.targetRegions?.length) {
    patch.target_regions = seed.targetRegions;
  }

  return patch;
}

/** Merge studio-derived parameters into a session without overwriting values already set. */
export function applyStudioSeedToSession(
  session: SizingAssistantSession,
  seed: SizingAssistantStudioSeedPayload,
): StudioSeedApplyResult {
  const patch = buildSizingParametersFromStudioSeed(seed);
  const { session: merged, appliedKeys } = mergeSessionParametersIfMissing(session, patch);
  return {
    session: merged,
    appliedKeys,
    parameters: merged.parameters,
  };
}

/** Human-readable summary for the sizing assistant system prompt. */
export function formatStudioSeedContextForPrompt(seed: SizingAssistantStudioSeedPayload): string {
  const lines: string[] = [
    'The user opened Atlas Sizing from hvyMETL Studio. Pre-loaded context (also stored on the sizing session when fields were empty):',
  ];
  const scale = seed.datasetScale;
  if (scale?.rawDataGb !== null && scale?.rawDataGb !== undefined) {
    lines.push(`- Manager / schema raw data: ~${scale.rawDataGb} GB (${scale.rawDataSource})`);
  }
  if (scale?.totalStorageGb !== null && scale?.totalStorageGb !== undefined) {
    lines.push(`- Projected MongoDB storage (post design): ~${scale.totalStorageGb} GB`);
  }
  if (scale?.averageDocumentBytes !== null && scale?.averageDocumentBytes !== undefined) {
    lines.push(`- Average document size (design estimate): ~${scale.averageDocumentBytes} bytes`);
  }
  if (seed.atlasInspectHints?.avgDocSizeKb) {
    lines.push(`- Average document size (Atlas inspect): ~${seed.atlasInspectHints.avgDocSizeKb} KB`);
  }
  if (scale?.workloadLabel) {
    lines.push(`- Workload preset: ${scale.workloadLabel}`);
  }
  if (seed.peakRpm && seed.readPercent !== undefined && seed.writePercent !== undefined) {
    lines.push(
      `- Workload telemetry: peak ${seed.peakRpm} RPM, ${seed.readPercent}:${seed.writePercent} read:write`,
    );
  }
  if (scale?.recommendedTierLabel) {
    lines.push(`- Manager illustrative tier: ${scale.recommendedTierLabel}`);
  }
  if (scale?.requiresSharding) {
    lines.push('- Manager sharding guidance: sharding recommended at this scale');
  }
  if (seed.targetDatabase) {
    lines.push(`- Target Atlas database: ${seed.targetDatabase}`);
  }
  if (seed.cloudProvider) {
    lines.push(`- Cloud provider (prompt context): ${seed.cloudProvider}`);
  }
  if (seed.targetRegions?.length) {
    lines.push(`- Target region(s): ${seed.targetRegions.join(', ')}`);
  }
  lines.push(
    'Treat session parameters as authoritative. Call update_sizing_parameters only when the user changes values; use find_optimal_cluster_tier when all required fields are present. When presenting tier results, always include an **Oplog Recommendations** section using oplogRecommendation from the tool output.',
  );
  return lines.join('\n');
}
