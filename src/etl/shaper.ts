/**
 * The pattern formatting layer: turns a CollectionPlan into one shaped SQL
 * SELECT whose output columns are already pattern-compliant CSV columns.
 *
 * The column-header conventions match the csvToAtlas modeling rules exactly:
 *   - "brand.name"   (dotted)   -> nested object on import
 *   - "reviews[]"    (brackets) -> the cell holds a JSON array, parsed on import
 *   - plain headers              -> scalar fields with automatic type coercion
 *
 * So the heavy lifting happens INSIDE the SQL engine (pre-joins for Extended
 * Reference, correlated COUNTs for Computed, json_group_array for embedded
 * and Subset arrays, GROUP BY windows for Bucket), and the worker simply
 * streams rows out to disk.
 */

import type { CollectionPlan, SqlStructuralModel, TableModel } from '../types.js';
import { toCamelCase, singularize } from '../utilities/naming.js';
import { findDateColumn, isEavTable, isJunctionTable } from '../design/patternSelector.js';

/** Everything a worker needs to extract one collection's rows. */
export type ShapedQuery = {
  /** The full SELECT with two positional placeholders: range start and end. */
  sql: string;
  /** Output column names in SELECT order (the CSV header row). */
  columns: string[];
  /**
   * Which output columns combine (joined with "|") to form the deterministic
   * _id. The worker prepends an _id cell to every row from these.
   */
  idFields: string[];
  /** The column the WHERE range filter applies to, for logging. */
  splitColumn: string;
  /** True when ranges are epoch-second time ranges (bucket collections). */
  splitsOnTime: boolean;
};

/** Quote a SQL identifier defensively. */
function quote(identifier: string): string {
  return `"${identifier}"`;
}

/** Look up a table model by name or fail loudly (plan/model mismatch). */
function requireTable(model: SqlStructuralModel, name: string): TableModel {
  const table = model.tables.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`Migration plan references unknown table "${name}".`);
  return table;
}

/**
 * Build a json_object(...) expression covering a child table's columns
 * (camelCased keys), excluding the join FK column that linked it to the
 * parent — that value is implied by the parent document itself.
 */
function buildJsonObjectExpression(child: TableModel, alias: string, excludeColumn: string): string {
  const pairs = child.columns
    .filter((column) => column.name !== excludeColumn)
    .map((column) => `'${toCamelCase(column.name)}', ${alias}.${quote(column.name)}`);
  return `json_object(${pairs.join(', ')})`;
}

/** Identify the key and value columns of an EAV table. */
function findEavColumns(child: TableModel): { keyColumn: string; valueColumn: string } {
  const keyColumn = child.columns.find((column) => /(_key|_k$|^key$|name$)/i.test(column.name) && !column.isPrimaryKey);
  const valueColumn = child.columns.find((column) => /(_value|_v$|^value$)/i.test(column.name) && !column.isPrimaryKey);
  if (!keyColumn || !valueColumn) throw new Error(`Table ${child.name} was classified EAV but key/value columns were not found.`);
  return { keyColumn: keyColumn.name, valueColumn: valueColumn.name };
}

/** Build the shaped query for a Bucket-pattern collection. */
function buildBucketQuery(collection: CollectionPlan, model: SqlStructuralModel): ShapedQuery {
  const bucket = collection.bucket;
  if (!bucket) throw new Error(`Collection ${collection.name} has bucket strategy but no bucket plan.`);
  const table = requireTable(model, collection.sourceTable);
  const groupByField = toCamelCase(bucket.groupByColumn);

  // Measurements keep every column except the grouping key (implied by the
  // bucket) — including the timestamp, which each measurement needs.
  const measurementPairs = table.columns
    .filter((column) => column.name !== bucket.groupByColumn)
    .map((column) => `'${toCamelCase(column.name)}', base.${quote(column.name)}`);

  // Window start: epoch seconds floored to the window, rendered as ISO-8601.
  const windowSeconds = bucket.windowMinutes * 60;
  const epochExpression = `CAST(strftime('%s', base.${quote(bucket.timeColumn)}) AS INTEGER)`;
  const windowStartExpression = `strftime('%Y-%m-%dT%H:%M:%SZ', (${epochExpression} / ${windowSeconds}) * ${windowSeconds}, 'unixepoch')`;

  const columns = [groupByField, 'windowStart', 'windowMinutes', 'count', 'measurements[]', 'schemaVersion'];
  const sql = [
    'SELECT',
    `  CAST(base.${quote(bucket.groupByColumn)} AS TEXT) AS ${quote(groupByField)},`,
    `  ${windowStartExpression} AS ${quote('windowStart')},`,
    `  ${bucket.windowMinutes} AS ${quote('windowMinutes')},`,
    `  COUNT(*) AS ${quote('count')},`,
    `  json_group_array(json_object(${measurementPairs.join(', ')})) AS ${quote('measurements[]')},`,
    `  1 AS ${quote('schemaVersion')}`,
    `FROM ${quote(table.name)} base`,
    `WHERE ${epochExpression} >= ? AND ${epochExpression} < ?`,
    'GROUP BY 1, 2',
  ].join('\n');

  return {
    sql,
    columns,
    idFields: [groupByField, 'windowStart'],
    splitColumn: bucket.timeColumn,
    splitsOnTime: true,
  };
}

/** Build the shaped query for a regular (non-bucket) collection. */
function buildDocumentQuery(collection: CollectionPlan, model: SqlStructuralModel): ShapedQuery {
  const table = requireTable(model, collection.sourceTable);
  const selectParts: string[] = [];
  const columns: string[] = [];
  const joins: string[] = [];

  // 1. Base columns, camelCased. A single-column PK is consumed by _id and
  //    not repeated; composite PK parts stay as regular fields.
  const singlePk = collection.idDerivation.strategy === 'direct' ? collection.idDerivation.sourceColumns[0] : null;
  for (const column of table.columns) {
    const outputName = toCamelCase(column.name);
    if (column.name === singlePk) continue;
    selectParts.push(`base.${quote(column.name)} AS ${quote(outputName)}`);
    columns.push(outputName);
  }

  // Hidden id parts: PK columns selected under stable aliases the worker
  // uses to derive _id (then drops from the CSV when not regular columns).
  const idFields: string[] = [];
  collection.idDerivation.sourceColumns.forEach((pkColumn, index) => {
    const alias = `__idPart${index}`;
    selectParts.push(`CAST(base.${quote(pkColumn)} AS TEXT) AS ${quote(alias)}`);
    idFields.push(alias);
  });

  // 2. Extended Reference: pre-join lookup tables and select hot columns
  //    inline under dotted aliases so the CSV is born denormalized.
  collection.extendedReferences.forEach((reference, index) => {
    const lookupTable = requireTable(model, reference.sourceTable);
    const lookupKey = lookupTable.primaryKey[0] ?? 'id';
    const alias = `lk${index}`;
    joins.push(`LEFT JOIN ${quote(reference.sourceTable)} ${alias} ON ${alias}.${quote(lookupKey)} = base.${quote(reference.viaColumn)}`);
    for (const lookupColumn of reference.lookupColumns) {
      const outputName = `${reference.field}.${toCamelCase(lookupColumn)}`;
      selectParts.push(`${alias}.${quote(lookupColumn)} AS ${quote(outputName)}`);
      columns.push(outputName);
    }
  });

  // 3. Computed pattern: initialize counters from the real SQL aggregates so
  //    documents arrive correct and the app only applies $inc deltas later.
  for (const computed of collection.computedFields) {
    const match = /^COUNT\(\*\) FROM (\S+) WHERE (\S+) = \S+\.id$/.exec(computed.initialExpression);
    if (!match) continue;
    const [, childTableName, fkColumn] = match;
    const pkColumn = table.primaryKey[0] ?? 'id';
    selectParts.push(
      `(SELECT COUNT(*) FROM ${quote(childTableName)} c WHERE c.${quote(fkColumn)} = base.${quote(pkColumn)}) AS ${quote(computed.field)}`,
    );
    columns.push(computed.field);
  }

  // 4. Embedded arrays: full embeds, Subset-limited embeds, junction id
  //    arrays, and Attribute k/v arrays — all rendered as JSON array cells
  //    under a "field[]" header.
  const basePk = table.primaryKey[0] ?? 'id';
  for (const arrayPlan of collection.embeddedArrays) {
    const child = requireTable(model, arrayPlan.sourceTable);
    const header = `${arrayPlan.field}[]`;

    let expression: string;
    if (isEavTable(child)) {
      const { keyColumn, valueColumn } = findEavColumns(child);
      expression = `(SELECT json_group_array(json_object('k', c.${quote(keyColumn)}, 'v', c.${quote(valueColumn)})) FROM ${quote(child.name)} c WHERE c.${quote(arrayPlan.joinColumn)} = base.${quote(basePk)})`;
    } else if (isJunctionTable(child)) {
      const otherFk = child.foreignKeys.find((fk) => fk.referencesTable !== table.name) ?? child.foreignKeys[1];
      expression = `(SELECT json_group_array(CAST(c.${quote(otherFk.column)} AS TEXT)) FROM ${quote(child.name)} c WHERE c.${quote(arrayPlan.joinColumn)} = base.${quote(basePk)})`;
    } else if (arrayPlan.subsetLimit) {
      // Subset pattern: newest N children only, ordered by timestamp when
      // one exists, otherwise by descending primary key.
      const childDate = findDateColumn(child);
      const childPk = child.primaryKey[0] ?? 'id';
      const orderColumn = childDate ? childDate.name : childPk;
      expression = `(SELECT json_group_array(${buildJsonObjectExpression(child, 'sub', arrayPlan.joinColumn)}) FROM (SELECT * FROM ${quote(child.name)} c WHERE c.${quote(arrayPlan.joinColumn)} = base.${quote(basePk)} ORDER BY c.${quote(orderColumn)} DESC LIMIT ${arrayPlan.subsetLimit}) sub)`;
    } else {
      expression = `(SELECT json_group_array(${buildJsonObjectExpression(child, 'c', arrayPlan.joinColumn)}) FROM ${quote(child.name)} c WHERE c.${quote(arrayPlan.joinColumn)} = base.${quote(basePk)})`;
    }

    selectParts.push(`${expression} AS ${quote(header)}`);
    columns.push(header);
  }

  // 5. Schema Versioning stamp on every document.
  selectParts.push(`1 AS ${quote('schemaVersion')}`);
  columns.push('schemaVersion');

  const splitColumn = basePk;
  const sql = [
    'SELECT',
    `  ${selectParts.join(',\n  ')}`,
    `FROM ${quote(table.name)} base`,
    joins.join('\n'),
    `WHERE base.${quote(splitColumn)} >= ? AND base.${quote(splitColumn)} < ?`,
  ]
    .filter((part) => part.length > 0)
    .join('\n');

  return { sql, columns, idFields, splitColumn, splitsOnTime: false };
}

/** Build the shaped extraction query for any collection in the plan. */
export function buildShapedQuery(collection: CollectionPlan, model: SqlStructuralModel): ShapedQuery {
  return collection.bucket ? buildBucketQuery(collection, model) : buildDocumentQuery(collection, model);
}

/** Optional docType literal injected for Single Collection entity exports. */
function withDocTypeColumn(query: ShapedQuery, docType: string): ShapedQuery {
  return {
    ...query,
    columns: ['docType', ...query.columns],
    sql: query.sql.replace(/^SELECT/i, `SELECT\n  '${docType}' AS "docType",`),
  };
}

/**
 * Build one or more shaped queries for a collection. Single Collection hubs
 * emit one query per entity table with a docType discriminator column.
 */
export function buildShapedQueriesForCollection(
  collection: CollectionPlan,
  model: SqlStructuralModel,
): ShapedQuery[] {
  if (collection.singleCollection) {
    return collection.singleCollection.entityTables.map((entityTable) => {
      const entityPlan: CollectionPlan = {
        ...collection,
        sourceTable: entityTable,
        embeddedArrays: [],
        extendedReferences: [],
        computedFields: [],
        singleCollection: undefined,
      };
      const docType = toCamelCase(singularize(entityTable));
      return withDocTypeColumn(buildDocumentQuery(entityPlan, model), docType);
    });
  }
  return [buildShapedQuery(collection, model)];
}
