/**
 * Normalizes LLM tool arguments into canonical sizing session parameters.
 */

import type { SizingSessionParameters } from './sizingAssistantTypes.js';
import { REQUIRED_SIZING_ENGINE_FIELDS } from './sizingAssistantTypes.js';

const CANONICAL_NUMERIC_FIELDS = [
  'projected_total_data_size_gb',
  'total_raw_read_ops',
  'total_raw_write_ops',
  'avg_doc_size_kb',
  'secondary_index_count',
  'data_compression_percentage',
  'geo_sharded_regions_required',
  'user_specified_addl_secondaries',
  'estimated_data_growth_gb_per_month',
  'active_working_set_percentage',
  'rto_seconds',
  'rpo_seconds',
  'shard_penalty_multiplier',
] as const satisfies ReadonlyArray<keyof SizingSessionParameters>;

/** Maps common LLM / user-facing aliases to engine field names. */
const PARAMETER_ALIASES: Record<string, keyof SizingSessionParameters> = {
  projected_total_data_size_gb: 'projected_total_data_size_gb',
  cluster_data_size_gb: 'projected_total_data_size_gb',
  data_size_gb: 'projected_total_data_size_gb',
  total_data_size_gb: 'projected_total_data_size_gb',
  projected_data_size_gb: 'projected_total_data_size_gb',
  storage_gb: 'projected_total_data_size_gb',
  total_raw_read_ops: 'total_raw_read_ops',
  peak_read_ops: 'total_raw_read_ops',
  peak_reads: 'total_raw_read_ops',
  peak_read_qps: 'total_raw_read_ops',
  read_qps: 'total_raw_read_ops',
  reads_per_second: 'total_raw_read_ops',
  read_ops_per_second: 'total_raw_read_ops',
  qps: 'total_raw_read_ops',
  total_raw_write_ops: 'total_raw_write_ops',
  peak_write_ops: 'total_raw_write_ops',
  peak_writes: 'total_raw_write_ops',
  peak_write_tps: 'total_raw_write_ops',
  write_tps: 'total_raw_write_ops',
  writes_per_second: 'total_raw_write_ops',
  write_ops_per_second: 'total_raw_write_ops',
  tps: 'total_raw_write_ops',
  avg_doc_size_kb: 'avg_doc_size_kb',
  average_document_size_kb: 'avg_doc_size_kb',
  avg_document_size_kb: 'avg_doc_size_kb',
  document_size_kb: 'avg_doc_size_kb',
  average_doc_size_kb: 'avg_doc_size_kb',
};

function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return undefined;
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Flatten one level of nesting (`parameters`, `sizing_parameters`, etc.). */
function flattenToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...args };
  for (const nestKey of ['parameters', 'sizing_parameters', 'cluster_parameters', 'inputs']) {
    const nested = args[nestKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(flat, nested as Record<string, unknown>);
    }
  }
  return flat;
}

function normalizeFieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Parse `update_sizing_parameters` tool args into canonical session fields.
 */
export function parseSizingParameterUpdate(args: Record<string, unknown>): Partial<SizingSessionParameters> {
  const flat = flattenToolArgs(args);
  const patch: Partial<SizingSessionParameters> = {};

  for (const [rawKey, rawValue] of Object.entries(flat)) {
    const normalizedKey = normalizeFieldKey(rawKey);
    const canonical =
      PARAMETER_ALIASES[normalizedKey] ??
      (CANONICAL_NUMERIC_FIELDS.includes(normalizedKey as (typeof CANONICAL_NUMERIC_FIELDS)[number])
        ? (normalizedKey as keyof SizingSessionParameters)
        : undefined);

    if (!canonical) continue;

    const numeric = coerceFiniteNumber(rawValue);
    if (numeric !== undefined) {
      (patch as Record<string, number>)[canonical as string] = numeric;
    }
  }

  if (flat.workload_type === 'CONSISTENT' || flat.workload_type === 'INTERMITTENT') {
    patch.workload_type = flat.workload_type;
  }
  for (const key of ['read_sla_gt_50ms', 'is_bulk_ops_permitted', 'is_multi_region_required_for_ha'] as const) {
    if (typeof flat[key] === 'boolean') patch[key] = flat[key];
  }
  if (typeof flat.target_availability_sla === 'string') {
    patch.target_availability_sla = flat.target_availability_sla.trim();
  }

  return patch;
}

/** Count how many required engine fields are present on the patch or session params. */
export function countPresentRequiredFields(params: Partial<SizingSessionParameters>): number {
  return REQUIRED_SIZING_ENGINE_FIELDS.filter((field) => {
    const value = params[field];
    return typeof value === 'number' && value > 0;
  }).length;
}
