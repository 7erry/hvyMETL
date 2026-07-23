import type { MigrationPlan } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';
import type { SqlTranslationOutput } from './types';

type TranslateContext = {
  sqlQuery: string;
  model: SqlStructuralModel | null;
  plan: MigrationPlan | null;
};

/** Heuristic SQL → MongoDB translation using current folding rules from the migration plan. */
export function translateSQLToMongo(context: TranslateContext): SqlTranslationOutput {
  const { sqlQuery, model, plan } = context;
  const normalized = sqlQuery.trim();
  const lower = normalized.toLowerCase();

  const fromMatch = lower.match(/\bfrom\s+([`"[\]\w.]+)/i);
  const primaryTable = fromMatch?.[1]?.replace(/[`"[\]]/g, '') ?? 'collection';
  const collectionName =
    plan?.collections.find((c) => c.sourceTable === primaryTable)?.name ??
    primaryTable.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

  const hasJoin = /\bjoin\b/i.test(lower);
  const whereClause = extractClause(lower, 'where');
  const orderClause = extractClause(lower, 'order by');
  const groupClause = extractClause(lower, 'group by');

  const pipeline: Record<string, unknown>[] = [{ $match: { _archived: { $ne: true } } }];

  if (whereClause) {
    pipeline.push({ $match: parseWhereHeuristic(whereClause) });
  }

  if (hasJoin && model) {
    const joinMatch = lower.match(/\bjoin\s+([`"[\]\w.]+)\s+on\s+(.+?)(?:\s+where|\s+group|\s+order|$)/i);
    if (joinMatch) {
      const joinTable = joinMatch[1].replace(/[`"[\]]/g, '');
      const joinCollection =
        plan?.collections.find((c) => c.sourceTable === joinTable)?.name ?? joinTable;
      const embedded = plan?.collections
        .find((c) => c.sourceTable === primaryTable)
        ?.embeddedArrays?.some((e) => e.sourceTable === joinTable);
      if (embedded) {
        pipeline.push({ $unwind: `$${joinCollection.charAt(0).toLowerCase()}${joinCollection.slice(1)}` });
      } else {
        pipeline.push({
          $lookup: {
            from: joinCollection,
            localField: `${joinTable}Id`,
            foreignField: '_id',
            as: joinCollection,
          },
        });
        pipeline.push({ $unwind: { path: `$${joinCollection}`, preserveNullAndEmptyArrays: true } });
      }
    }
  }

  if (groupClause) {
    pipeline.push({
      $group: {
        _id: `$${groupClause.split(',')[0]?.trim() ?? '_id'}`,
        count: { $sum: 1 },
      },
    });
  }

  if (orderClause) {
    const sortSpec = parseOrderByClause(orderClause);
    if (Object.keys(sortSpec).length > 0) {
      pipeline.push({ $sort: sortSpec });
    }
  }

  const pipelineJson = JSON.stringify(pipeline, null, 2);
  const mongooseScript = `const results = await ${collectionName}.aggregate(${pipelineJson.replace(/\n/g, '\n  ')}).toArray();`;
  const shellScript = `db.${collectionName}.aggregate(${pipelineJson});`;

  const indexRecommendations: string[] = [];
  if (whereClause) {
    const fields = [...whereClause.matchAll(/(\w+)\s*=/g)].map((m) => m[1]).filter(Boolean);
    if (fields.length) {
      indexRecommendations.push(`db.${collectionName}.createIndex({ ${fields.map((f) => `${f}: 1`).join(', ')} })`);
    }
  }

  return {
    aggregationPipeline: pipelineJson,
    mongooseScript,
    shellScript,
    indexRecommendations,
  };
}

function extractClause(sql: string, keyword: string): string | null {
  const idx = sql.indexOf(keyword);
  if (idx === -1) return null;
  const rest = sql.slice(idx + keyword.length).trim();
  const stop = rest.search(/\b(group by|order by|limit|offset)\b/i);
  const clause = (stop === -1 ? rest : rest.slice(0, stop)).trim();
  return clause.replace(/[;\s]+$/g, '').trim() || null;
}

/** Parses ORDER BY into MongoDB sort directions (1 ascending, -1 descending). */
function parseOrderByClause(orderClause: string): Record<string, 1 | -1> {
  const sort: Record<string, 1 | -1> = {};

  for (const part of orderClause.split(',')) {
    const trimmed = part.trim().replace(/[;\s]+$/g, '');
    if (!trimmed) continue;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const field = normalizeQualifiedSqlIdentifier(tokens[0]);
    let direction: 1 | -1 = 1;

    if (tokens.length > 1) {
      const dirToken = tokens[tokens.length - 1].replace(/[,;]/g, '').toLowerCase();
      if (dirToken === 'desc' || dirToken === 'descending') {
        direction = -1;
      } else if (dirToken === 'asc' || dirToken === 'ascending') {
        direction = 1;
      }
    }

    sort[field] = direction;
  }

  return sort;
}

/** Strips quotes and table aliases from SQL identifiers (e.g. o.order_date → order_date). */
function normalizeQualifiedSqlIdentifier(identifier: string): string {
  const unquoted = identifier.replace(/[`"[\]]/g, '');
  const dotIndex = unquoted.lastIndexOf('.');
  return dotIndex === -1 ? unquoted : unquoted.slice(dotIndex + 1);
}

function parseWhereHeuristic(where: string): Record<string, unknown> {
  const eq = where.match(/([\w.]+)\s*=\s*'([^']+)'/);
  if (eq) return { [normalizeQualifiedSqlIdentifier(eq[1])]: eq[2] };
  const num = where.match(/([\w.]+)\s*=\s*(\d+)/);
  if (num) return { [normalizeQualifiedSqlIdentifier(num[1])]: Number(num[2]) };
  return { $expr: { $literal: true }, _note: `Review WHERE: ${where}` };
}
