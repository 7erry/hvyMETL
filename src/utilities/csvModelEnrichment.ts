/**
 * Enrich a DDL-only structural model with row counts and relationship cardinality
 * measured from CSV exports (mirrors sqlite adapter introspection for the UI pipeline).
 */

import { readFileSync } from 'node:fs';
import type { RelationshipModel, SqlStructuralModel, TableModel } from '../types.js';
import { csvBaseName, listCsvFiles } from './csvSource.js';
import { parseCsv } from './csv.js';

/** Max children per parent still considered "bounded" for embed decisions (matches sqlite adapter). */
export const BOUNDED_CHILDREN_THRESHOLD = 100;

/** Parse one CSV file into header-keyed row records. */
function readCsvRecords(filePath: string): Record<string, string>[] {
  const rows = parseCsv(readFileSync(filePath, 'utf8'));
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
}

/** Find CSV export files whose basename matches a SQL table name. */
export function findCsvFilesForTable(allCsvFiles: string[], tableName: string): string[] {
  const key = tableName.toLowerCase();
  return allCsvFiles.filter((file) => csvBaseName(file) === key);
}

/** Load and merge all CSV rows exported for one table (supports chunked exports). */
export function loadTableCsvRows(csvRoot: string, tableName: string): Record<string, string>[] {
  const files = findCsvFilesForTable(listCsvFiles(csvRoot), tableName);
  return files.flatMap((file) => readCsvRecords(file));
}

/** Count data rows in a table's CSV export(s), excluding the header row. */
export function countTableCsvRows(csvRoot: string, tableName: string): number {
  return loadTableCsvRows(csvRoot, tableName).length;
}

/**
 * Measure avg/max children per parent from a child table CSV grouped by its FK column.
 * Returns zeros when the child CSV is missing or empty.
 */
export function measureRelationshipFromCsv(
  childRows: Record<string, string>[],
  fkColumn: string,
): Pick<RelationshipModel, 'avgChildrenPerParent' | 'maxChildrenPerParent' | 'isBounded'> {
  if (childRows.length === 0) {
    return { avgChildrenPerParent: 0, maxChildrenPerParent: 0, isBounded: false };
  }

  const countsByParent = new Map<string, number>();
  for (const row of childRows) {
    const parentKey = row[fkColumn];
    if (parentKey === undefined || parentKey === '') continue;
    countsByParent.set(parentKey, (countsByParent.get(parentKey) ?? 0) + 1);
  }

  if (countsByParent.size === 0) {
    return { avgChildrenPerParent: 0, maxChildrenPerParent: 0, isBounded: false };
  }

  const counts = [...countsByParent.values()];
  const maxChildrenPerParent = Math.max(...counts);
  const avgChildrenPerParent = Math.round((counts.reduce((sum, count) => sum + count, 0) / counts.length) * 100) / 100;

  return {
    avgChildrenPerParent,
    maxChildrenPerParent,
    isBounded: maxChildrenPerParent > 0 && maxChildrenPerParent <= BOUNDED_CHILDREN_THRESHOLD,
  };
}

function enrichTableRowCount(table: TableModel, csvRoot: string): TableModel {
  const rowCount = countTableCsvRows(csvRoot, table.name);
  return rowCount === table.rowCount ? table : { ...table, rowCount };
}

function enrichRelationship(
  relationship: RelationshipModel,
  csvRoot: string,
  childTable: TableModel | undefined,
): RelationshipModel {
  if (!childTable) return relationship;

  const childRows = loadTableCsvRows(csvRoot, childTable.name);
  const stats = measureRelationshipFromCsv(childRows, relationship.fkColumn);
  return { ...relationship, ...stats };
}

/**
 * Return a copy of the model with table row counts and relationship cardinality
 * derived from CSV files under csvRoot.
 */
export function enrichModelFromCsv(model: SqlStructuralModel, csvRoot: string): SqlStructuralModel {
  const tablesByName = new Map(model.tables.map((table) => [table.name, table]));
  const tables = model.tables.map((table) => enrichTableRowCount(table, csvRoot));
  const relationships = model.relationships.map((relationship) =>
    enrichRelationship(relationship, csvRoot, tablesByName.get(relationship.childTable)),
  );
  return { ...model, tables, relationships };
}
