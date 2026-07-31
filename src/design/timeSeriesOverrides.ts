import type { TimeSeriesGranularity, TimeSeriesOverride, TimeSeriesOverrides } from '../types.js';

const GRANULARITIES = new Set<TimeSeriesGranularity>(['seconds', 'minutes', 'hours']);

/** True when the developer supplied a usable timeField for this table. */
export function isActiveTimeSeriesOverride(override: TimeSeriesOverride | undefined): override is TimeSeriesOverride {
  return Boolean(override?.timeField?.trim());
}

/** Normalize overrides map: trim fields, drop empty entries. */
export function normalizeTimeSeriesOverrides(
  overrides: TimeSeriesOverrides | undefined,
): TimeSeriesOverrides {
  if (!overrides) return {};
  const normalized: TimeSeriesOverrides = {};
  for (const [tableName, raw] of Object.entries(overrides)) {
    const timeField = String(raw?.timeField ?? '').trim();
    if (!timeField) continue;
    const metaField = String(raw?.metaField ?? '').trim();
    const granularity = GRANULARITIES.has(raw?.granularity as TimeSeriesGranularity)
      ? (raw.granularity as TimeSeriesGranularity)
      : 'seconds';
    normalized[tableName] = {
      timeField,
      ...(metaField ? { metaField } : {}),
      granularity,
    };
  }
  return normalized;
}
