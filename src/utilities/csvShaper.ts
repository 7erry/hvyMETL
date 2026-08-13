/**
 * Shape flat CSV exports into pattern-compliant import files for the UI pipeline.
 *
 * Column conventions match the SQLite ETL shaper and csvToAtlas:
 *   - "brand.name"   -> nested object on import
 *   - "reviews[]"    -> JSON array cell parsed on import
 *   - plain headers  -> scalar fields
 */

import { writeFileSync } from 'node:fs';
import type { CollectionPlan, EmbeddedArrayPlan, SqlStructuralModel, TableModel } from '../types.js';
import { findDateColumn, isEavTable, isJunctionTable, reverseJoinFkColumns } from '../design/patternSelector.js';
import { toCamelCase } from './naming.js';
import { loadTableCsvRows } from './csvModelEnrichment.js';
import { formatCsvRow } from './csv.js';
import { deriveId } from './ids.js';

const MAX_EMBED_DEPTH = 12;

function requireTable(model: SqlStructuralModel, name: string): TableModel {
  const table = model.tables.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`Migration plan references unknown table "${name}".`);
  return table;
}

/** True when the collection needs joins or JSON array columns beyond a flat parent CSV. */
export function collectionNeedsShapedCsv(collection: CollectionPlan): boolean {
  return (
    collection.embeddedArrays.length > 0 ||
    collection.extendedReferences.length > 0 ||
    collection.computedFields.length > 0 ||
    Boolean(collection.bucket)
  );
}

function findEavColumns(child: TableModel): { keyColumn: string; valueColumn: string } {
  const keyColumn = child.columns.find((column) => /(_key|_k$|^key$|name$)/i.test(column.name) && !column.isPrimaryKey);
  const valueColumn = child.columns.find((column) => /(_value|_v$|^value$)/i.test(column.name) && !column.isPrimaryKey);
  if (!keyColumn || !valueColumn) {
    throw new Error(`Table ${child.name} was classified EAV but key/value columns were not found.`);
  }
  return { keyColumn: keyColumn.name, valueColumn: valueColumn.name };
}

/** Group child CSV rows by the foreign-key column pointing at the parent. */
function normalizeJoinKey(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (/^-?\d+\.0+$/.test(trimmed)) return trimmed.replace(/\.0+$/, '');
  return trimmed;
}

function sortChildRows(child: TableModel, rows: Record<string, string>[]): Record<string, string>[] {
  const dateColumn = findDateColumn(child);
  const orderColumn = dateColumn?.name ?? child.primaryKey[0] ?? child.columns[0]?.name;
  if (!orderColumn) return rows;
  return [...rows].sort((left, right) => String(right[orderColumn]).localeCompare(String(left[orderColumn])));
}

/** Lazily load and index child CSV rows keyed by parent join column. */
class ChildRowIndexCache {
  private readonly indexes = new Map<string, Map<string, Record<string, string>[]>>();

  constructor(private readonly csvRoot: string) {}

  get(sourceTable: string, joinColumn: string): Map<string, Record<string, string>[]> {
    const cacheKey = `${sourceTable}::${joinColumn}`;
    const cached = this.indexes.get(cacheKey);
    if (cached) return cached;

    const childRows = loadTableCsvRows(this.csvRoot, sourceTable);
    const indexed = indexChildRows(childRows, joinColumn);
    this.indexes.set(cacheKey, indexed);
    return indexed;
  }
}

function indexChildRows(childRows: Record<string, string>[], joinColumn: string): Map<string, Record<string, string>[]> {
  const byParent = new Map<string, Record<string, string>[]>();
  for (const row of childRows) {
    const parentKey = normalizeJoinKey(row[joinColumn]);
    if (parentKey === '') continue;
    const bucket = byParent.get(parentKey) ?? [];
    bucket.push(row);
    byParent.set(parentKey, bucket);
  }
  return byParent;
}

function buildEmbeddedObject(
  child: TableModel,
  row: Record<string, string>,
  joinColumn: string,
  embedPlansByTable: Map<string, EmbeddedArrayPlan[]>,
  model: SqlStructuralModel,
  rowIndexCache: ChildRowIndexCache,
  depth: number,
  parentRowsByPk: Map<string, Map<string, Record<string, string>>>,
): Record<string, unknown> {
  const nestedPlans = embedPlansByTable.get(child.name) ?? [];
  const reverseJoinColumns = new Set(
    nestedPlans.filter((plan) => plan.reverseJoin).map((plan) => plan.joinColumn),
  );
  const object: Record<string, unknown> = {};
  for (const column of child.columns) {
    if (column.name === joinColumn) continue;
    if (reverseJoinColumns.has(column.name)) continue;
    object[toCamelCase(column.name)] = row[column.name] ?? '';
  }

  if (depth >= MAX_EMBED_DEPTH) return object;

  for (const nestedPlan of nestedPlans) {
    if (nestedPlan.reverseJoin) {
      const parentTable = requireTable(model, nestedPlan.sourceTable);
      const fkValue = normalizeJoinKey(row[nestedPlan.joinColumn]);
      const embeddedParentRow = parentRowsByPk.get(nestedPlan.sourceTable)?.get(fkValue);
      object[nestedPlan.field] = buildEmbeddedParentDocument(parentTable, embeddedParentRow);
      continue;
    }
    const nestedChild = requireTable(model, nestedPlan.sourceTable);
    const nestedIndex = rowIndexCache.get(nestedPlan.sourceTable, nestedPlan.joinColumn);
    object[nestedPlan.field] = buildEmbeddedArrayItems(
      nestedPlan,
      nestedChild,
      child,
      row,
      nestedIndex,
      embedPlansByTable,
      model,
      rowIndexCache,
      depth + 1,
      parentRowsByPk,
    );
  }

  return object;
}

function indexRowsByColumn(rows: Record<string, string>[], column: string): Map<string, Record<string, string>> {
  const byKey = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const key = normalizeJoinKey(row[column]);
    if (key === '') continue;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return byKey;
}

function buildEmbeddedParentDocument(
  parent: TableModel,
  parentRow: Record<string, string> | undefined,
): Record<string, unknown> {
  if (!parentRow) return {};
  const object: Record<string, unknown> = {};
  for (const column of parent.columns) {
    object[toCamelCase(column.name)] = parentRow[column.name] ?? '';
  }
  return object;
}

function buildEmbeddedArrayItems(
  arrayPlan: EmbeddedArrayPlan,
  child: TableModel,
  parentTable: TableModel,
  parentRow: Record<string, string>,
  childIndex: Map<string, Record<string, string>[]>,
  embedPlansByTable: Map<string, EmbeddedArrayPlan[]>,
  model: SqlStructuralModel,
  rowIndexCache: ChildRowIndexCache,
  depth: number,
  parentRowsByPk: Map<string, Map<string, Record<string, string>>>,
): unknown[] {
  if (arrayPlan.reverseJoin) {
    return [];
  }

  const parentPk = parentTable.primaryKey[0] ?? parentTable.columns[0]?.name;
  const parentKey = normalizeJoinKey(parentPk ? parentRow[parentPk] : '');
  let children = childIndex.get(parentKey) ?? [];

  if (isEavTable(child)) {
    const { keyColumn, valueColumn } = findEavColumns(child);
    return children.map((row) => ({ k: row[keyColumn] ?? '', v: row[valueColumn] ?? '' }));
  }

  if (isJunctionTable(child)) {
    const otherFk = child.foreignKeys.find((fk) => fk.referencesTable !== parentTable.name) ?? child.foreignKeys[1];
    return children.map((row) => (otherFk ? row[otherFk.column] ?? '' : ''));
  }

  children = sortChildRows(child, children);
  if (arrayPlan.subsetLimit) {
    children = children.slice(0, arrayPlan.subsetLimit);
  }

  return children.map((row) =>
    buildEmbeddedObject(
      child,
      row,
      arrayPlan.joinColumn,
      embedPlansByTable,
      model,
      rowIndexCache,
      depth,
      parentRowsByPk,
    ),
  );
}

function buildEmbeddedArrayValue(
  arrayPlan: EmbeddedArrayPlan,
  child: TableModel,
  parentTable: TableModel,
  parentRow: Record<string, string>,
  childIndex: Map<string, Record<string, string>[]>,
  embedPlansByTable: Map<string, EmbeddedArrayPlan[]>,
  model: SqlStructuralModel,
  rowIndexCache: ChildRowIndexCache,
  parentRowsByPk?: Map<string, Record<string, string>>,
): string {
  if (arrayPlan.reverseJoin) {
    const fkValue = normalizeJoinKey(parentRow[arrayPlan.joinColumn]);
    const embeddedParentRow = parentRowsByPk?.get(fkValue);
    return JSON.stringify(buildEmbeddedParentDocument(child, embeddedParentRow));
  }

  const items = buildEmbeddedArrayItems(
    arrayPlan,
    child,
    parentTable,
    parentRow,
    childIndex,
    embedPlansByTable,
    model,
    rowIndexCache,
    0,
    parentRowsByPk ?? new Map(),
  );
  return JSON.stringify(items);
}

function parseComputedCountExpression(expression: string): { childTable: string; fkColumn: string } | null {
  const match = /^COUNT\(\*\) FROM (\S+) WHERE (\S+) =/.exec(expression);
  if (!match) return null;
  return { childTable: match[1], fkColumn: match[2] };
}

/**
 * Write one shaped CSV for a collection plan. Returns the output path, or null when
 * the parent table CSV is missing.
 */
export function shapeCollectionCsv(
  collection: CollectionPlan,
  model: SqlStructuralModel,
  csvRoot: string,
  outputPath: string,
  embedPlansByTable: Map<string, EmbeddedArrayPlan[]> = new Map(),
): string | null {
  const parentTable = requireTable(model, collection.sourceTable);
  const parentRows = loadTableCsvRows(csvRoot, parentTable.name);
  if (parentRows.length === 0) return null;

  const rowIndexCache = new ChildRowIndexCache(csvRoot);

  const singlePk =
    collection.idDerivation.strategy === 'direct' ? collection.idDerivation.sourceColumns[0] : null;

  const reverseJoinColumns = reverseJoinFkColumns(collection);

  const scalarColumns: string[] = [];
  for (const column of parentTable.columns) {
    const outputName = toCamelCase(column.name);
    if (column.name === singlePk) continue;
    if (reverseJoinColumns.has(column.name)) continue;
    scalarColumns.push(outputName);
  }

  const extendedHeaders: string[] = [];
  const lookupIndexes = collection.extendedReferences
    .filter((reference) => !reverseJoinColumns.has(reference.viaColumn))
    .map((reference) => {
    const lookupTable = requireTable(model, reference.sourceTable);
    const lookupKey = lookupTable.primaryKey[0] ?? lookupTable.columns[0]?.name ?? 'id';
    const lookupRows = loadTableCsvRows(csvRoot, lookupTable.name);
    const byKey = new Map(lookupRows.map((row) => [normalizeJoinKey(row[lookupKey]), row]));
    for (const lookupColumn of reference.lookupColumns) {
      extendedHeaders.push(`${reference.field}.${toCamelCase(lookupColumn)}`);
    }
    return { reference, lookupKey, byKey };
  });

  const computedHeaders = collection.computedFields.map((field) => field.field);
  const childIndexes = new Map<string, Map<string, Record<string, string>[]>>();
  const parentRowsByPk = new Map<string, Map<string, Record<string, string>>>();
  const ensureReverseJoinIndex = (arrayPlan: EmbeddedArrayPlan): void => {
    if (!arrayPlan.reverseJoin || parentRowsByPk.has(arrayPlan.sourceTable)) return;
    const embeddedParent = requireTable(model, arrayPlan.sourceTable);
    const parentPk = embeddedParent.primaryKey[0] ?? embeddedParent.columns[0]?.name ?? 'id';
    const rows = loadTableCsvRows(csvRoot, arrayPlan.sourceTable);
    parentRowsByPk.set(arrayPlan.sourceTable, indexRowsByColumn(rows, parentPk));
  };
  for (const plans of embedPlansByTable.values()) {
    for (const arrayPlan of plans) ensureReverseJoinIndex(arrayPlan);
  }
  for (const arrayPlan of collection.embeddedArrays) {
    if (arrayPlan.reverseJoin) {
      ensureReverseJoinIndex(arrayPlan);
      continue;
    }
    if (!childIndexes.has(arrayPlan.sourceTable)) {
      childIndexes.set(arrayPlan.sourceTable, rowIndexCache.get(arrayPlan.sourceTable, arrayPlan.joinColumn));
    }
  }

  const computedChildIndexes = new Map<string, Map<string, Record<string, string>[]>>();
  for (const computed of collection.computedFields) {
    const parsed = parseComputedCountExpression(computed.initialExpression);
    if (!parsed || computedChildIndexes.has(parsed.childTable)) continue;
    computedChildIndexes.set(parsed.childTable, rowIndexCache.get(parsed.childTable, parsed.fkColumn));
  }

  const arrayHeaders = collection.embeddedArrays.map((array) =>
    array.embedAsDocument ? array.field : `${array.field}[]`,
  );
  const headers = ['_id', ...scalarColumns, ...extendedHeaders, ...computedHeaders, ...arrayHeaders, 'schemaVersion'];

  const lines: string[] = [formatCsvRow(headers)];

  for (const parentRow of parentRows) {
    const values: unknown[] = [deriveId(collection.idDerivation, parentRow)];

    for (const column of parentTable.columns) {
      if (column.name === singlePk) continue;
      if (reverseJoinColumns.has(column.name)) continue;
      values.push(parentRow[column.name] ?? '');
    }

    for (const lookup of lookupIndexes) {
      const viaValue = normalizeJoinKey(parentRow[lookup.reference.viaColumn]);
      const lookupRow = lookup.byKey.get(viaValue);
      for (const lookupColumn of lookup.reference.lookupColumns) {
        values.push(lookupRow?.[lookupColumn] ?? '');
      }
    }

    const parentPk = parentTable.primaryKey[0] ?? parentTable.columns[0]?.name;
    const parentKey = normalizeJoinKey(parentPk ? parentRow[parentPk] : '');

    for (const computed of collection.computedFields) {
      const parsed = parseComputedCountExpression(computed.initialExpression);
      if (!parsed) {
        values.push('');
        continue;
      }
      const index = computedChildIndexes.get(parsed.childTable);
      values.push(String((index?.get(parentKey) ?? []).length));
    }

    for (const arrayPlan of collection.embeddedArrays) {
      const embeddedSource = requireTable(model, arrayPlan.sourceTable);
      const childIndex = childIndexes.get(arrayPlan.sourceTable) ?? new Map();
      values.push(
        buildEmbeddedArrayValue(
          arrayPlan,
          embeddedSource,
          parentTable,
          parentRow,
          childIndex,
          embedPlansByTable,
          model,
          rowIndexCache,
          parentRowsByPk.get(arrayPlan.sourceTable),
        ),
      );
    }

    values.push(1);
    lines.push(formatCsvRow(values));
  }

  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  return outputPath;
}
