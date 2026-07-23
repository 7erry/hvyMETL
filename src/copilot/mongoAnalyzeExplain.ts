/**
 * Normalize MongoDB explain payloads from MCP into copilot-friendly summaries.
 */

export type MongoExplainSummary = {
  method: string;
  verbosity: string;
  winningStage?: string;
  indexName?: string;
  docsExamined?: number;
  docsReturned?: number;
  executionTimeMillis?: number;
  explainResult: unknown;
};

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readExplainStats(explainResult: Record<string, unknown>): Partial<MongoExplainSummary> {
  const executionStats = explainResult.executionStats as Record<string, unknown> | undefined;
  if (executionStats) {
    return {
      winningStage: typeof executionStats.stage === 'string' ? executionStats.stage : undefined,
      indexName: typeof executionStats.indexName === 'string' ? executionStats.indexName : undefined,
      docsExamined: readNumber(executionStats.totalDocsExamined),
      docsReturned: readNumber(executionStats.nReturned),
      executionTimeMillis: readNumber(executionStats.executionTimeMillis),
    };
  }

  const queryPlanner = explainResult.queryPlanner as Record<string, unknown> | undefined;
  const winningPlan = queryPlanner?.winningPlan as Record<string, unknown> | undefined;
  if (winningPlan) {
    return {
      winningStage: typeof winningPlan.stage === 'string' ? winningPlan.stage : undefined,
      indexName: typeof winningPlan.indexName === 'string' ? winningPlan.indexName : undefined,
    };
  }

  return {};
}

/** Extract planner highlights while preserving the raw explain document for the LLM. */
export function summarizeExplainPayload(raw: unknown): MongoExplainSummary {
  if (!raw || typeof raw !== 'object') {
    return { method: 'unknown', verbosity: 'queryPlanner', explainResult: raw };
  }

  const record = raw as Record<string, unknown>;
  const method = typeof record.method === 'string' ? record.method : 'unknown';
  const verbosity = typeof record.verbosity === 'string' ? record.verbosity : 'queryPlanner';
  const explainResult = record.explainResult ?? raw;
  const stats =
    explainResult && typeof explainResult === 'object'
      ? readExplainStats(explainResult as Record<string, unknown>)
      : {};

  return {
    method,
    verbosity,
    ...stats,
    explainResult,
  };
}
