import { toCamelCase } from '../../../src/utilities/naming.js';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';
import type { SqlTranslationOutput } from './types';

type TranslateContext = {
  sqlQuery: string;
  model: SqlStructuralModel | null;
  plan: MigrationPlan | null;
};

type SqlAliasBinding = {
  table: string;
  collection: string;
  /** Mongo document path prefix for this alias after lookups (empty string = root). */
  pathPrefix: string;
};

type ParsedJoin = {
  joinType: 'inner' | 'left';
  table: string;
  alias: string;
  left: { alias: string; column: string };
  right: { alias: string; column: string };
};

type ParsedSqlQuery = {
  primaryTable: string;
  primaryAlias: string;
  collectionName: string;
  aliasMap: Map<string, SqlAliasBinding>;
  joins: ParsedJoin[];
  selectClause: string | null;
  whereClause: string | null;
  orderClause: string | null;
  groupClause: string | null;
};

/** Heuristic SQL → MongoDB translation using current folding rules from the migration plan. */
export function translateSQLToMongo(context: TranslateContext): SqlTranslationOutput {
  const parsed = parseSqlQuery(context.sqlQuery, context.plan);
  const pipeline: Record<string, unknown>[] = [{ $match: { _archived: { $ne: true } } }];

  const primaryWhere = filterWhereForAliases(parsed.whereClause, parsed.aliasMap, [parsed.primaryAlias]);
  if (primaryWhere) {
    pipeline.push({
      $match: parseWhereHeuristic(primaryWhere, parsed.aliasMap, context.model),
    });
  }

  for (const join of parsed.joins) {
    pipeline.push(...buildJoinStages(join, parsed.aliasMap, parsed.primaryTable, context.model, context.plan));
  }

  const joinedAliases = [...parsed.aliasMap.keys()].filter((alias) => alias !== parsed.primaryAlias);
  const joinedWhere = filterWhereForAliases(parsed.whereClause, parsed.aliasMap, joinedAliases);
  if (joinedWhere) {
    pipeline.push({
      $match: parseWhereHeuristic(joinedWhere, parsed.aliasMap, context.model),
    });
  }

  if (parsed.groupClause) {
    pipeline.push({
      $group: {
        _id: `$${resolveMongoPath(parsed.groupClause.split(',')[0]?.trim() ?? '_id', parsed.aliasMap, context.model)}`,
        count: { $sum: 1 },
      },
    });
  }

  const project = parseSelectProject(parsed.selectClause, parsed.aliasMap, context.model);
  if (project) {
    pipeline.push({ $project: project });
  }

  if (parsed.orderClause) {
    const sortSpec = parseOrderByClause(parsed.orderClause, parsed.aliasMap, context.model);
    if (Object.keys(sortSpec).length > 0) {
      pipeline.push({ $sort: sortSpec });
    }
  }

  const pipelineJson = JSON.stringify(pipeline, null, 2);
  const { collectionName } = parsed;
  const mongooseScript = `const results = await ${collectionName}.aggregate(${pipelineJson.replace(/\n/g, '\n  ')}).toArray();`;
  const shellScript = `db.${collectionName}.aggregate(${pipelineJson});`;

  const indexRecommendations = buildIndexRecommendations(parsed.whereClause, parsed.aliasMap, context.model, collectionName);

  return {
    collectionName,
    aggregationPipeline: pipelineJson,
    mongooseScript,
    shellScript,
    indexRecommendations,
  };
}

function parseSqlQuery(sqlQuery: string, plan: MigrationPlan | null): ParsedSqlQuery {
  const normalized = sqlQuery.trim();
  const from = parseFromClause(normalized);
  const joins = parseJoinClauses(normalized);
  const aliasMap = new Map<string, SqlAliasBinding>();

  const collectionName = resolveCollection(from.table, plan);
  aliasMap.set(from.alias, { table: from.table, collection: collectionName, pathPrefix: '' });

  for (const join of joins) {
    aliasMap.set(join.alias, {
      table: join.table,
      collection: resolveCollection(join.table, plan),
      pathPrefix: resolveCollection(join.table, plan),
    });
  }

  return {
    primaryTable: from.table,
    primaryAlias: from.alias,
    collectionName,
    aliasMap,
    joins,
    selectClause: extractClause(normalized, 'select'),
    whereClause: extractClause(normalized, 'where'),
    orderClause: extractClause(normalized, 'order by'),
    groupClause: extractClause(normalized, 'group by'),
  };
}

function parseFromClause(sql: string): { table: string; alias: string } {
  const match = sql.match(/\bfrom\s+([`"[\]\w.]+)(?:\s+(?:as\s+)?([`"[\]\w.]+))?/i);
  const table = match?.[1]?.replace(/[`"[\]]/g, '') ?? 'collection';
  const alias = match?.[2]?.replace(/[`"[\]]/g, '') ?? table;
  return { table, alias };
}

function parseJoinClauses(sql: string): ParsedJoin[] {
  const joins: ParsedJoin[] = [];
  const pattern =
    /\b((?:left|right|inner)\s+)?join\s+([`"[\]\w.]+)(?:\s+(?:as\s+)?([`"[\]\w.]+))?\s+on\s+([\w.]+)\s*=\s*([\w.]+)/gi;

  for (const match of sql.matchAll(pattern)) {
    const modifier = (match[1] ?? '').trim().toLowerCase();
    const table = match[2].replace(/[`"[\]]/g, '');
    const alias = (match[3] ?? table).replace(/[`"[\]]/g, '');
    const left = parseQualifiedColumn(match[4]);
    const right = parseQualifiedColumn(match[5]);
    if (!left || !right) continue;

    joins.push({
      joinType: modifier.startsWith('left') ? 'left' : 'inner',
      table,
      alias,
      left,
      right,
    });
  }

  return joins;
}

function parseQualifiedColumn(value: string): { alias: string; column: string } | null {
  const trimmed = value.replace(/[`"[\]]/g, '').trim();
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex === -1) return null;
  return {
    alias: trimmed.slice(0, dotIndex),
    column: trimmed.slice(dotIndex + 1),
  };
}

function resolveCollection(table: string, plan: MigrationPlan | null): string {
  const fromPlan = plan?.collections.find((collection) => collection.sourceTable === table)?.name;
  if (fromPlan) return fromPlan;
  return toCamelCase(table);
}

function buildJoinStages(
  join: ParsedJoin,
  aliasMap: Map<string, SqlAliasBinding>,
  primaryTable: string,
  model: SqlStructuralModel | null,
  plan: MigrationPlan | null,
): Record<string, unknown>[] {
  const joinCollection = resolveCollection(join.table, plan);
  const asField = joinCollection;
  const embedded = plan?.collections
    .find((collection) => collection.sourceTable === primaryTable)
    ?.embeddedArrays?.some((array) => array.sourceTable === join.table);

  const joinSide = join.left.alias === join.alias ? join.left : join.right.alias === join.alias ? join.right : null;
  const otherSide = join.left.alias === join.alias ? join.right : join.right.alias === join.alias ? join.left : null;
  if (!joinSide || !otherSide) return [];

  const lookup = (() => {
    if (embedded) {
      return { $unwind: { path: `$${asField}`, preserveNullAndEmptyArrays: join.joinType === 'left' } };
    }

    if (isFkColumn(join.table, joinSide.column, model)) {
      const localPath = resolveMongoPath(`${otherSide.alias}.${otherSide.column}`, aliasMap, model);
      return {
        $lookup: {
          from: joinCollection,
          localField: localPath,
          foreignField: toMongoColumn(join.table, joinSide.column, model),
          as: asField,
        },
      };
    }

    if (isPkColumn(join.table, joinSide.column, model)) {
      const localPath = resolveMongoPath(`${otherSide.alias}.${otherSide.column}`, aliasMap, model);
      return {
        $lookup: {
          from: joinCollection,
          localField: localPath,
          foreignField: '_id',
          as: asField,
        },
      };
    }

    const localPath = resolveMongoPath(`${otherSide.alias}.${otherSide.column}`, aliasMap, model);
    const foreignPath = resolveMongoPath(`${joinSide.alias}.${joinSide.column}`, aliasMap, model);
    return {
      $lookup: {
        from: joinCollection,
        localField: localPath,
        foreignField: foreignPath.startsWith(asField + '.') ? foreignPath.slice(asField.length + 1) : toMongoColumn(join.table, joinSide.column, model),
        as: asField,
      },
    };
  })();

  return [
    lookup,
    { $unwind: { path: `$${asField}`, preserveNullAndEmptyArrays: join.joinType === 'left' } },
  ];
}

function filterWhereForAliases(
  whereClause: string | null,
  aliasMap: Map<string, SqlAliasBinding>,
  allowedAliases: string[],
): string | null {
  if (!whereClause) return null;
  const allowed = new Set(allowedAliases);
  const parts = splitWhereOnLogicalOperator(whereClause, 'and');
  const kept = parts.filter((part) => {
    const refs = [...part.matchAll(/([\w.]+)\s*(?:=|>=|<=|<>|!=|>|<|\bin\b|\bis\b)/gi)].map((match) => match[1] ?? '');
    return refs.some((ref) => {
      const alias = ref.includes('.') ? ref.split('.')[0] : null;
      return alias ? allowed.has(alias) : allowed.has([...aliasMap.keys()][0] ?? '');
    });
  });
  return kept.length > 0 ? kept.join(' AND ') : null;
}

function parseSelectProject(
  selectClause: string | null,
  aliasMap: Map<string, SqlAliasBinding>,
  model: SqlStructuralModel | null,
): Record<string, unknown> | null {
  if (!selectClause || /^\*/i.test(selectClause.trim())) return null;

  const project: Record<string, unknown> = {};
  for (const rawItem of splitSelectItems(selectClause)) {
    const item = rawItem.trim();
    if (!item) continue;

    const aliasMatch = item.match(/^(.*)\s+as\s+([\w.]+)$/i);
    const expression = (aliasMatch?.[1] ?? item).trim();
    const outputName = toCamelCase((aliasMatch?.[2] ?? normalizeQualifiedSqlIdentifier(expression)).replace(/[`"[\]]/g, ''));

    if (/^([\w.]+)\s*\|\|\s*'([^']*)'\s*\|\|\s*([\w.]+)$/i.test(expression)) {
      const concatMatch = expression.match(/^([\w.]+)\s*\|\|\s*'([^']*)'\s*\|\|\s*([\w.]+)$/i);
      if (concatMatch) {
        project[outputName] = {
          $concat: [
            `$${resolveMongoPath(concatMatch[1], aliasMap, model)}`,
            concatMatch[2],
            `$${resolveMongoPath(concatMatch[3], aliasMap, model)}`,
          ],
        };
        continue;
      }
    }

    if (/^[\w.]+$/.test(expression)) {
      project[outputName] = `$${resolveMongoPath(expression, aliasMap, model)}`;
    }
  }

  return Object.keys(project).length > 0 ? project : null;
}

function splitSelectItems(selectClause: string): string[] {
  const items: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;

  for (const char of selectClause) {
    if (char === "'") inString = !inString;
    if (!inString && char === '(') depth += 1;
    if (!inString && char === ')') depth -= 1;
    if (char === ',' && !inString && depth === 0) {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function buildIndexRecommendations(
  whereClause: string | null,
  aliasMap: Map<string, SqlAliasBinding>,
  model: SqlStructuralModel | null,
  collectionName: string,
): string[] {
  if (!whereClause) return [];

  const fields = [
    ...whereClause.matchAll(/([\w.]+)\s*(?:=|>=|<=|<>|!=|>|<|\bin\b)/gi),
  ]
    .map((match) => resolveMongoPath(match[1] ?? '', aliasMap, model))
    .filter(Boolean);
  const uniqueFields = [...new Set(fields)];
  if (!uniqueFields.length) return [];

  return [
    `db.${collectionName}.createIndex({ ${uniqueFields.map((field) => `${field}: 1`).join(', ')} })`,
  ];
}

function extractClause(sql: string, keyword: string): string | null {
  if (keyword === 'select') {
    const match = sql.match(/^\s*select\s+([\s\S]+?)\s+from\s+/i);
    return match?.[1]?.trim() ?? null;
  }

  const pattern = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
  const match = pattern.exec(sql);
  if (!match) return null;
  const rest = sql.slice(match.index + match[0].length).trim();
  const stop = rest.search(/\b(group by|order by|limit|offset)\b/i);
  const clause = (stop === -1 ? rest : rest.slice(0, stop)).trim();
  return clause.replace(/[;\s]+$/g, '').trim() || null;
}

function parseOrderByClause(
  orderClause: string,
  aliasMap: Map<string, SqlAliasBinding>,
  model: SqlStructuralModel | null,
): Record<string, 1 | -1> {
  const sort: Record<string, 1 | -1> = {};

  for (const part of orderClause.split(',')) {
    const trimmed = part.trim().replace(/[;\s]+$/g, '');
    if (!trimmed) continue;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const field = resolveMongoPath(tokens[0], aliasMap, model);
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

function resolveMongoPath(
  qualified: string,
  aliasMap: Map<string, SqlAliasBinding>,
  model: SqlStructuralModel | null,
): string {
  const parsed = parseQualifiedColumn(qualified.replace(/[`"[\]]/g, ''));
  if (!parsed) {
    return toMongoColumn('', qualified, model);
  }

  const binding = aliasMap.get(parsed.alias);
  const field = toMongoColumn(binding?.table ?? parsed.alias, parsed.column, model);
  if (!binding?.pathPrefix) return field;
  return `${binding.pathPrefix}.${field}`;
}

function toMongoColumn(table: string, column: string, model: SqlStructuralModel | null): string {
  if (isPkColumn(table, column, model)) return '_id';
  return toCamelCase(column);
}

function isFkColumn(table: string, column: string, model: SqlStructuralModel | null): boolean {
  return model?.relationships.some((rel) => rel.childTable === table && rel.fkColumn === column) ?? false;
}

function isPkColumn(table: string, column: string, model: SqlStructuralModel | null): boolean {
  if (column === 'id') return true;
  const tableModel = model?.tables.find((entry) => entry.name === table);
  return tableModel?.primaryKey.includes(column) ?? false;
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

function parseSqlListValues(raw: string): Array<string | number | boolean | null> {
  const values: Array<string | number | boolean | null> = [];
  let current = '';
  let inString = false;

  for (const char of raw.trim()) {
    if (char === "'") {
      inString = !inString;
      current += char;
      continue;
    }
    if (char === ',' && !inString) {
      values.push(parseSqlLiteral(current));
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) values.push(parseSqlLiteral(current));
  return values;
}

function splitWhereOnLogicalOperator(clause: string, operator: 'and' | 'or'): string[] {
  const pattern = operator === 'and' ? /\s+and\s+/i : /\s+or\s+/i;
  return clause
    .split(pattern)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseWhereHeuristic(
  where: string,
  aliasMap: Map<string, SqlAliasBinding>,
  model: SqlStructuralModel | null,
): Record<string, unknown> {
  const trimmed = where.trim().replace(/[;\s]+$/g, '');

  if (/\sand\s/i.test(trimmed)) {
    const parts = splitWhereOnLogicalOperator(trimmed, 'and');
    if (parts.length > 1) {
      return { $and: parts.map((part) => parseWhereHeuristic(part, aliasMap, model)) };
    }
  }

  if (/\sor\s/i.test(trimmed)) {
    const parts = splitWhereOnLogicalOperator(trimmed, 'or');
    if (parts.length > 1) {
      return { $or: parts.map((part) => parseWhereHeuristic(part, aliasMap, model)) };
    }
  }

  const inMatch = trimmed.match(/^([\w.]+)\s+in\s*\((.+)\)$/i);
  if (inMatch) {
    const field = resolveMongoPath(inMatch[1], aliasMap, model);
    return { [field]: { $in: parseSqlListValues(inMatch[2]) } };
  }

  const notInMatch = trimmed.match(/^([\w.]+)\s+not\s+in\s*\((.+)\)$/i);
  if (notInMatch) {
    const field = resolveMongoPath(notInMatch[1], aliasMap, model);
    return { [field]: { $nin: parseSqlListValues(notInMatch[2]) } };
  }

  const comparison = trimmed.match(/^([\w.]+)\s*(>=|<=|<>|!=|>|<)\s*(.+)$/i);
  if (comparison) {
    const field = resolveMongoPath(comparison[1], aliasMap, model);
    const operator = sqlComparisonToMongo(comparison[2]);
    const value = parseSqlLiteral(comparison[3]);
    return { [field]: { [operator]: value } };
  }

  const eqString = trimmed.match(/^([\w.]+)\s*=\s*'([^']*)'$/i);
  if (eqString) {
    return { [resolveMongoPath(eqString[1], aliasMap, model)]: eqString[2] };
  }

  const eqNumber = trimmed.match(/^([\w.]+)\s*=\s*(\d+(?:\.\d+)?)$/i);
  if (eqNumber) {
    return { [resolveMongoPath(eqNumber[1], aliasMap, model)]: Number(eqNumber[2]) };
  }

  const isNull = trimmed.match(/^([\w.]+)\s+is\s+null$/i);
  if (isNull) {
    return { [resolveMongoPath(isNull[1], aliasMap, model)]: null };
  }

  const isNotNull = trimmed.match(/^([\w.]+)\s+is\s+not\s+null$/i);
  if (isNotNull) {
    return { [resolveMongoPath(isNotNull[1], aliasMap, model)]: { $ne: null } };
  }

  return { $expr: { $literal: true }, _note: `Review WHERE: ${where}` };
}
