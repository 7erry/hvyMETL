import { sqlTypeToBsonType } from '../../../src/utilities/sqlTypeToBsonType.js';
import type { ColumnModel, SqlStructuralModel, TableModel } from '../types';

export const SCHEMA_CREATOR_SQL_TYPES = [
  'INT',
  'BIGINT',
  'VARCHAR(255)',
  'TEXT',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
  'DECIMAL(18,2)',
  'DOUBLE',
  'UUID',
] as const;

export type SchemaCreatorSqlType = (typeof SCHEMA_CREATOR_SQL_TYPES)[number];

export function emptyCreatorModel(): SqlStructuralModel {
  return { source: 'schema-creator', tables: [], relationships: [] };
}

export function cloneCreatorModel(model: SqlStructuralModel): SqlStructuralModel {
  return structuredClone(model);
}

export function makeColumn(name: string, sqlType: string = 'VARCHAR(255)', isPrimaryKey = false): ColumnModel {
  return {
    name,
    sqlType,
    bsonType: sqlTypeToBsonType(sqlType),
    nullable: !isPrimaryKey,
    isPrimaryKey,
  };
}

export function makeTable(name: string): TableModel {
  return {
    name,
    columns: [makeColumn('id', 'INT', true)],
    primaryKey: ['id'],
    foreignKeys: [],
    rowCount: 0,
  };
}

export function uniqueTableName(existing: string[], base = 'table'): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`.toLowerCase())) i += 1;
  return `${base}_${i}`;
}

export function uniqueColumnName(existing: string[], base = 'column'): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`.toLowerCase())) i += 1;
  return `${base}_${i}`;
}

export function syncPrimaryKey(table: TableModel): TableModel {
  const primaryKey = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  return { ...table, primaryKey };
}

export function rebuildRelationships(tables: TableModel[]): SqlStructuralModel['relationships'] {
  return tables.flatMap((child) =>
    child.foreignKeys.map((fk) => ({
      parentTable: fk.referencesTable,
      childTable: child.name,
      fkColumn: fk.column,
      avgChildrenPerParent: 0,
      maxChildrenPerParent: 0,
      isBounded: false,
    })),
  );
}

export function finalizeCreatorModel(tables: TableModel[]): SqlStructuralModel {
  const synced = tables.map(syncPrimaryKey);
  return {
    source: 'schema-creator',
    tables: synced,
    relationships: rebuildRelationships(synced),
  };
}

export function updateColumnSqlType(column: ColumnModel, sqlType: string): ColumnModel {
  return { ...column, sqlType, bsonType: sqlTypeToBsonType(sqlType) };
}
