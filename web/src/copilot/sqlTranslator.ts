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
  const whereClause = extractClause(normalized, 'where');
  const orderClause = extractClause(normalized, 'order by');
  const groupClause = extractClause(normalized, 'group by');

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
    const fields = [
      ...whereClause.matchAll(/([\w.]+)\s*(?:=|>=|<=|<>|!=|>|<)/gi),
    ]
      .map((match) => normalizeQualifiedSqlIdentifier(match[1] ?? ''))
      .filter(Boolean);
    const uniqueFields = [...new Set(fields)];
    if (uniqueFields.length) {
      indexRecommendations.push(
        `db.${collectionName}.createIndex({ ${uniqueFields.map((field) => `${field}: 1`).join(', ')} })`,
      );
    }
  }

  return {
    collectionName,
    aggregationPipeline: pipelineJson,
    mongooseScript,
    shellScript,
    indexRecommendations,
  };
}

function extractClause(sql: string, keyword: string): string | null {
  const pattern = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
  const match = pattern.exec(sql);
  if (!match) return null;
  const rest = sql.slice(match.index + match[0].length).trim();
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

function sqlComparisonToMongo(operator: string): '$gt' | '$gte' | '$lt' | '$lte' | '$ne' | '$eq' {
  switch (operator.toLowerCase()) {
    case '>':
      return '$gt';
    case '>=':
      return '$gte';
    case '<':
      return '$lt';
    case '<=':
      return '$lte';
    case '!=':
    case '<>':
      return '$ne';
    default:
      return '$eq';
  }
}

function parseSqlLiteral(raw: string): string | number | boolean | null {
  const trimmed = raw.replace(/[;,]\s*$/g, '').trim();
  if (/^'.*'$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  if (/^null$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  const numeric = Number(trimmed);
  if (trimmed.length > 0 && !Number.isNaN(numeric)) return numeric;
  return trimmed;
}

function splitWhereOnLogicalOperator(clause: string, operator: 'and' | 'or'): string[] {
  const pattern = operator === 'and' ? /\s+and\s+/i : /\s+or\s+/i;
  return clause
    .split(pattern)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseWhereHeuristic(where: string): Record<string, unknown> {
  const trimmed = where.trim().replace(/[;\s]+$/g, '');

  if (/\sand\s/i.test(trimmed)) {
    const parts = splitWhereOnLogicalOperator(trimmed, 'and');
    if (parts.length > 1) {
      return { $and: parts.map(parseWhereHeuristic) };
    }
  }

  if (/\sor\s/i.test(trimmed)) {
    const parts = splitWhereOnLogicalOperator(trimmed, 'or');
    if (parts.length > 1) {
      return { $or: parts.map(parseWhereHeuristic) };
    }
  }

  const comparison = trimmed.match(/^([\w.]+)\s*(>=|<=|<>|!=|>|<)\s*(.+)$/i);
  if (comparison) {
    const field = normalizeQualifiedSqlIdentifier(comparison[1]);
    const operator = sqlComparisonToMongo(comparison[2]);
    const value = parseSqlLiteral(comparison[3]);
    return { [field]: { [operator]: value } };
  }

  const eqString = trimmed.match(/^([\w.]+)\s*=\s*'([^']*)'$/i);
  if (eqString) {
    return { [normalizeQualifiedSqlIdentifier(eqString[1])]: eqString[2] };
  }

  const eqNumber = trimmed.match(/^([\w.]+)\s*=\s*(\d+(?:\.\d+)?)$/i);
  if (eqNumber) {
    return { [normalizeQualifiedSqlIdentifier(eqNumber[1])]: Number(eqNumber[2]) };
  }

  const isNull = trimmed.match(/^([\w.]+)\s+is\s+null$/i);
  if (isNull) {
    return { [normalizeQualifiedSqlIdentifier(isNull[1])]: null };
  }

  const isNotNull = trimmed.match(/^([\w.]+)\s+is\s+not\s+null$/i);
  if (isNotNull) {
    return { [normalizeQualifiedSqlIdentifier(isNotNull[1])]: { $ne: null } };
  }

  return { $expr: { $literal: true }, _note: `Review WHERE: ${where}` };
}
