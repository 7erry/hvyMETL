import type { SqlTranslationOutput } from './types';

/** Parses aggregation pipeline JSON from a SQL translation output string. */
export function parseTranslationPipeline(raw: string): Record<string, unknown>[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Aggregation pipeline is empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Aggregation pipeline is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Aggregation pipeline must be a JSON array of stages.');
  }

  return parsed.filter((stage): stage is Record<string, unknown> => stage !== null && typeof stage === 'object');
}

/** Infers a collection name from generated shell script text. */
export function inferCollectionNameFromShell(shellScript: string): string {
  const match = shellScript.match(/^db\.([A-Za-z_][\w]*)\.aggregate/m);
  return match?.[1] ?? 'collection';
}

/** Builds aggregateMongoCollection inspect args from a SQL translation output. */
export function buildAggregateInspectArgs(output: SqlTranslationOutput): {
  collection: string;
  pipeline: Record<string, unknown>[];
} {
  const collection = output.collectionName || inferCollectionNameFromShell(output.shellScript);
  const pipeline = parseTranslationPipeline(output.aggregationPipeline);
  if (!pipeline.some((stage) => '$limit' in stage)) {
    pipeline.push({ $limit: 25 });
  }
  return { collection, pipeline };
}
