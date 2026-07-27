/** Normalized aggregation inspect payload for copilot UI and API responses. */
export type NormalizedAggregatePayload = {
  documents: unknown[];
  count: number;
  appliedLimits: string[];
};

/** Normalizes MCP aggregate tool output (structured content, arrays, or legacy shapes). */
export function normalizeAggregateInspectPayload(raw: unknown): NormalizedAggregatePayload {
  if (Array.isArray(raw)) {
    return { documents: raw, count: raw.length, appliedLimits: [] };
  }

  if (!raw || typeof raw !== 'object') {
    return { documents: [], count: 0, appliedLimits: [] };
  }

  const record = raw as Record<string, unknown>;
  let documents: unknown[] = [];

  if (Array.isArray(record.documents)) {
    documents = record.documents;
  } else if (typeof record.documents === 'string') {
    try {
      const parsed = JSON.parse(record.documents) as unknown;
      if (Array.isArray(parsed)) documents = parsed;
    } catch {
      // Ignore invalid JSON strings.
    }
  } else if (Array.isArray(record.results)) {
    documents = record.results;
  } else if (record.result && typeof record.result === 'object') {
    return normalizeAggregateInspectPayload(record.result);
  }

  const count =
    typeof record.count === 'number'
      ? record.count
      : record.count === 'indeterminate'
        ? documents.length
        : documents.length;

  const appliedLimits = Array.isArray(record.appliedLimits)
    ? record.appliedLimits.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return { documents, count, appliedLimits };
}

/** True when MCP reported matches but omitted document previews (usually byte limits). */
export function isAggregatePreviewTruncated(payload: NormalizedAggregatePayload): boolean {
  return payload.count > 0 && payload.documents.length === 0;
}
