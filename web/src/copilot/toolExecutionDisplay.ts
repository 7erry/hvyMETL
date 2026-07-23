import type { SqlTranslationOutput, ToolExecutionResult } from './types';

/** Parse SqlTranslationOutput from a tool execution payload. */
export function readSqlTranslationOutput(data: unknown): SqlTranslationOutput | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Partial<SqlTranslationOutput>;
  if (
    typeof record.aggregationPipeline !== 'string' ||
    typeof record.mongooseScript !== 'string' ||
    typeof record.shellScript !== 'string' ||
    !Array.isArray(record.indexRecommendations)
  ) {
    return null;
  }
  return {
    aggregationPipeline: record.aggregationPipeline,
    mongooseScript: record.mongooseScript,
    shellScript: record.shellScript,
    indexRecommendations: record.indexRecommendations.filter((entry): entry is string => typeof entry === 'string'),
  };
}

/** Resolve SQL translation output from a tool card, optional structured data, or session fallback. */
export function resolveSqlTranslationOutput(
  execution: Pick<ToolExecutionResult, 'tool' | 'data' | 'sqlTranslation'>,
  fallback: SqlTranslationOutput | null = null,
): SqlTranslationOutput | null {
  if (execution.tool !== 'translateSQLToMongo') return null;
  if (execution.sqlTranslation) return execution.sqlTranslation;
  const fromData = readSqlTranslationOutput(execution.data);
  if (fromData) return fromData;
  return fallback;
}

/** Count non-empty lines in generated pipeline text for summary labels. */
export function countSqlTranslationLines(output: SqlTranslationOutput): number {
  return output.aggregationPipeline.split('\n').filter((line) => line.trim().length > 0).length;
}

/** True when the tool card already renders structured output (hide delta + chat echo). */
export function toolExecutionHasStructuredOutput(execution: ToolExecutionResult): boolean {
  if (execution.tool === 'translateSQLToMongo') {
    return Boolean(resolveSqlTranslationOutput(execution));
  }
  if (execution.tool === 'listMongoCollectionIndexes') return true;
  if (execution.data !== undefined && execution.data !== null) {
    return [
      'listMongoDatabases',
      'listMongoCollections',
      'aggregateMongoCollection',
      'explainMongoOperation',
      'compareMongoCollectionToPlan',
    ].includes(execution.tool);
  }
  return false;
}

/** Compact tool payload returned to the LLM (full pipeline stays in the UI card). */
export function serializeCanvasToolResult(result: ToolExecutionResult): string {
  if (result.tool === 'translateSQLToMongo') {
    const translation = resolveSqlTranslationOutput(result);
    return JSON.stringify({
      ok: result.ok,
      tool: result.tool,
      summary: result.summary,
      pipelineLineCount: translation ? countSqlTranslationLines(translation) : 0,
      indexRecommendationCount: translation?.indexRecommendations.length ?? 0,
    });
  }
  return JSON.stringify({
    ok: result.ok,
    tool: result.tool,
    summary: result.summary,
    delta: result.delta,
  });
}
