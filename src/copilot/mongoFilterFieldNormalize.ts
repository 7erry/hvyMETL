/**
 * Maps guessed MongoDB filter field names to live collection schema paths
 * (e.g. currentBalance / "current balance" → current_balance).
 */

const LOGICAL_FILTER_OPERATORS = new Set(['$and', '$or', '$nor']);

/** Normalizes a field token for fuzzy comparison (case, spaces, hyphens). */
export function fieldNameMatchKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Converts camelCase / PascalCase identifiers to snake_case. */
export function camelToSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

/** Resolves a candidate field name against known schema paths; returns null when no match. */
export function resolveFieldName(candidate: string, knownFields: string[]): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  const topLevelKnown = [...new Set(knownFields.map((field) => field.split('.')[0]!).filter(Boolean))];
  if (topLevelKnown.includes(trimmed)) return trimmed;

  const candidateKeys = new Set<string>([
    fieldNameMatchKey(trimmed),
    fieldNameMatchKey(camelToSnake(trimmed)),
    fieldNameMatchKey(trimmed.replace(/\s+/g, '')),
  ]);

  for (const field of topLevelKnown) {
    const keys = new Set<string>([
      fieldNameMatchKey(field),
      fieldNameMatchKey(camelToSnake(field)),
      fieldNameMatchKey(field.replace(/_/g, '')),
    ]);
    for (const candidateKey of candidateKeys) {
      if (keys.has(candidateKey)) return field;
    }
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function remapFilterObject(
  filter: Record<string, unknown>,
  knownFields: string[],
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filter)) {
    if (LOGICAL_FILTER_OPERATORS.has(key) && Array.isArray(value)) {
      normalized[key] = value.map((entry) =>
        isPlainObject(entry) ? remapFilterObject(entry, knownFields) : entry,
      );
      continue;
    }

    if (key.startsWith('$')) {
      normalized[key] = value;
      continue;
    }

    const resolvedKey = resolveFieldName(key, knownFields) ?? key;
    normalized[resolvedKey] = isPlainObject(value) ? remapFilterObject(value, knownFields) : value;
  }

  return normalized;
}

/** Rewrites filter keys to match inferred collection schema field names. */
export function normalizeMongoFilter(
  filter: Record<string, unknown>,
  knownFields: string[],
): Record<string, unknown> {
  if (knownFields.length === 0) return filter;
  return remapFilterObject(filter, knownFields);
}

/** Rewrites $match stage filters inside an aggregation pipeline. */
export function normalizeAggregationPipelineFilters(
  pipeline: Record<string, unknown>[],
  knownFields: string[],
): Record<string, unknown>[] {
  if (knownFields.length === 0) return pipeline;

  return pipeline.map((stage) => {
    if (!('$match' in stage)) return stage;
    const matchValue = stage.$match;
    if (!isPlainObject(matchValue)) return stage;
    return { $match: normalizeMongoFilter(matchValue, knownFields) };
  });
}
