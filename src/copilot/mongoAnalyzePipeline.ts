/**
 * Validation and normalization for read-only aggregation pipelines sent to MCP.
 */

const BLOCKED_AGGREGATION_STAGES = new Set([
  '$out',
  '$merge',
  '$unset',
  '$replaceWith',
  '$replaceRoot',
]);

export const MAX_AGGREGATION_STAGES = 20;
export const MAX_AGGREGATION_RESULTS = 50;

/** Returns true when the pipeline already ends with a $limit stage. */
export function pipelineHasLimitStage(pipeline: unknown[]): boolean {
  const last = pipeline[pipeline.length - 1];
  return Boolean(last && typeof last === 'object' && last !== null && '$limit' in (last as Record<string, unknown>));
}

/** Reject write-capable stages and cap result size for copilot analyze tools. */
export function normalizeAggregationPipeline(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Aggregation pipeline must be a non-empty array of stages.');
  }
  if (raw.length > MAX_AGGREGATION_STAGES) {
    throw new Error(`Aggregation pipeline exceeds the ${MAX_AGGREGATION_STAGES}-stage limit.`);
  }

  const pipeline = raw.map((stage, index) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      throw new Error(`Aggregation stage ${index + 1} must be an object.`);
    }
    const keys = Object.keys(stage as Record<string, unknown>);
    if (keys.length !== 1) {
      throw new Error(`Aggregation stage ${index + 1} must contain exactly one operator.`);
    }
    const operator = keys[0]!;
    if (BLOCKED_AGGREGATION_STAGES.has(operator)) {
      throw new Error(`Aggregation stage "${operator}" is not allowed in read-only analyze mode.`);
    }
    return stage as Record<string, unknown>;
  });

  if (!pipelineHasLimitStage(pipeline)) {
    pipeline.push({ $limit: MAX_AGGREGATION_RESULTS });
  }

  return pipeline;
}
