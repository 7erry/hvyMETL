/**
 * Shape flat CSV exports into pattern-compliant import files for the UI pipeline.
 *
 * Column conventions match the SQLite ETL shaper and csvToAtlas:
 *   - "brand.name"   -> nested object on import
 *   - "reviews[]"    -> JSON array cell parsed on import
 *   - plain headers  -> scalar fields
 */

import { writeFileSync } from 'node:fs';
import type { CollectionPlan, SqlStructuralModel, TableModel } from '../types.js';
import { findDateColumn, isEavTable, isJunctionTable } from '../design/patternSelector.js';
import { toCamelCase, singularize } from './naming.js';
import { loadTableCsvRows } from './csvModelEnrichment.js';
import { formatCsvRow } from './csv.js';
import { deriveId } from './ids.js';

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

/** Build one child object for embedding, camelCasing keys and omitting the join FK. */
function childRowToEmbeddedObject(child: TableModel, row: Record<string, string>, joinColumn: string): Record<string, string> {
  const object: Record<string, string> = {};
  for (const column of child.columns) {
    if (column.name === joinColumn) continue;
    object[toCamelCase(column.name)] = row[column.name] ?? '';
  }
  return object;
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
function indexChildRows(childRows: Record<string, string>[], joinColumn: string): Map<string, Record<string, string>[]> {
  const byParent = new Map<string, Record<string, string>[]>();
  for (const row of childRows) {
    const parentKey = row[joinColumn];
    if (parentKey === undefined || parentKey === '') continue;
    const bucket = byParent.get(parentKey) ?? [];
    bucket.push(row);
    byParent.set(parentKey, bucket);
  }
  return byParent;
}

function sortChildRows(child: TableModel, rows: Record<string, string>[]): Record<string, string>[] {
  const dateColumn = findDateColumn(child);
  const orderColumn = dateColumn?.name ?? child.primaryKey[0] ?? child.columns[0]?.name;
  if (!orderColumn) return rows;
  return [...rows].sort((left, right) => String(right[orderColumn]).localeCompare(String(left[orderColumn])));
}

function buildEmbeddedArrayValue(
  arrayPlan: CollectionPlan['embeddedArrays'][number],
  child: TableModel,
  parentTable: TableModel,
  parentRow: Record<string, string>,
  childIndex: Map<string, Record<string, string>[]>,
): string {
  const parentPk = parentTable.primaryKey[0] ?? parentTable.columns[0]?.name;
  const parentKey = parentPk ? parentRow[parentPk] : '';
  let children = childIndex.get(parentKey) ?? [];

  if (isEavTable(child)) {
    const { keyColumn, valueColumn } = findEavColumns(child);
    const items = children.map((row) => ({ k: row[keyColumn] ?? '', v: row[valueColumn] ?? '' }));
    return JSON.stringify(items);
  }

  if (isJunctionTable(child)) {
    const otherFk = child.foreignKeys.find((fk) => fk.referencesTable !== parentTable.name) ?? child.foreignKeys[1];
    const ids = children.map((row) => (otherFk ? row[otherFk.column] ?? '' : ''));
    return JSON.stringify(ids);
  }

  children = sortChildRows(child, children);
  if (arrayPlan.subsetLimit) {
    children = children.slice(0, arrayPlan.subsetLimit);
  }

  const items = children.map((row) => childRowToEmbeddedObject(child, row, arrayPlan.joinColumn));
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
): string | null {
  const parentTable = requireTable(model, collection.sourceTable);
  const parentRows = loadTableCsvRows(csvRoot, parentTable.name);
  if (parentRows.length === 0) return null;

  const singlePk =
    collection.idDerivation.strategy === 'direct' ? collection.idDerivation.sourceColumns[0] : null;

  const scalarColumns: string[] = [];
  for (const column of parentTable.columns) {
    const outputName = toCamelCase(column.name);
    if (column.name === singlePk) continue;
    scalarColumns.push(outputName);
  }

  const extendedHeaders: string[] = [];
  const lookupIndexes = collection.extendedReferences.map((reference) => {
    const lookupTable = requireTable(model, reference.sourceTable);
    const lookupKey = lookupTable.primaryKey[0] ?? lookupTable.columns[0]?.name ?? 'id';
    const lookupRows = loadTableCsvRows(csvRoot, lookupTable.name);
    const byKey = new Map(lookupRows.map((row) => [row[lookupKey] ?? '', row]));
    for (const lookupColumn of reference.lookupColumns) {
      extendedHeaders.push(`${reference.field}.${toCamelCase(lookupColumn)}`);
    }
    return { reference, lookupKey, byKey };
  });

  const computedHeaders = collection.computedFields.map((field) => field.field);
  const childIndexes = new Map<string, Map<string, Record<string, string>[]>>();
  for (const arrayPlan of collection.embeddedArrays) {
    if (!childIndexes.has(arrayPlan.sourceTable)) {
      const childRows = loadTableCsvRows(csvRoot, arrayPlan.sourceTable);
      childIndexes.set(arrayPlan.sourceTable, indexChildRows(childRows, arrayPlan.joinColumn));
    }
  }

  const computedChildIndexes = new Map<string, Map<string, Record<string, string>[]>>();
  for (const computed of collection.computedFields) {
    const parsed = parseComputedCountExpression(computed.initialExpression);
    if (!parsed || computedChildIndexes.has(parsed.childTable)) continue;
    const childRows = loadTableCsvRows(csvRoot, parsed.childTable);
    computedChildIndexes.set(parsed.childTable, indexChildRows(childRows, parsed.fkColumn));
  }

  const arrayHeaders = collection.embeddedArrays.map((array) => `${array.field}[]`);
  const headers = ['_id', ...scalarColumns, ...extendedHeaders, ...computedHeaders, ...arrayHeaders, 'schemaVersion'];

  const lines: string[] = [formatCsvRow(headers)];

  for (const parentRow of parentRows) {
    const values: unknown[] = [deriveId(collection.idDerivation, parentRow)];

    for (const column of parentTable.columns) {
      if (column.name === singlePk) continue;
      values.push(parentRow[column.name] ?? '');
    }

    for (const lookup of lookupIndexes) {
      const viaValue = parentRow[lookup.reference.viaColumn] ?? '';
      const lookupRow = lookup.byKey.get(viaValue);
      for (const lookupColumn of lookup.reference.lookupColumns) {
        values.push(lookupRow?.[lookupColumn] ?? '');
      }
    }

    const parentPk = parentTable.primaryKey[0] ?? parentTable.columns[0]?.name;
    const parentKey = parentPk ? parentRow[parentPk] : '';

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
      const child = requireTable(model, arrayPlan.sourceTable);
      const childIndex = childIndexes.get(arrayPlan.sourceTable)!;
      values.push(buildEmbeddedArrayValue(arrayPlan, child, parentTable, parentRow, childIndex));
    }

    values.push(1);
    lines.push(formatCsvRow(values));
  }

  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  return outputPath;
}
