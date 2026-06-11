export type ColumnModel = {
  name: string;
  sqlType: string;
  bsonType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
};

export type ForeignKeyModel = {
  column: string;
  referencesTable: string;
  referencesColumn: string;
};

export type TableModel = {
  name: string;
  columns: ColumnModel[];
  primaryKey: string[];
  foreignKeys: ForeignKeyModel[];
  rowCount: number;
};

export type SqlStructuralModel = {
  source: string;
  tables: TableModel[];
  relationships: unknown[];
};

export type DiagramExport = {
  version: 1;
  name: string;
  dialect: string;
  ddl: string;
  model: SqlStructuralModel;
  positions: Record<string, { x: number; y: number }>;
  exportedAt: string;
};

export type Profile = {
  id: string;
  label: string;
  description: string;
};

export type Dialect = {
  id: string;
  label: string;
  live: boolean;
};
