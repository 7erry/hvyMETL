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

export type RelationshipModel = {
  parentTable: string;
  childTable: string;
  fkColumn: string;
  avgChildrenPerParent: number;
  maxChildrenPerParent: number;
  isBounded: boolean;
  cardinalitySource?: 'csv' | 'database' | 'developer';
  forceEmbed?: boolean;
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
  relationships: RelationshipModel[];
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

/** After · MongoDB diagram export — migration plan layout for sharing. */
export type MongoDiagramExport = {
  version: 1;
  phase: 'after';
  name: string;
  dialect: string;
  profileId: string;
  plan: import('./migrationPlanTypes').MigrationPlan;
  collectionPositions: Record<string, { x: number; y: number }>;
  designMeta?: {
    sqlTableCount: number;
    collectionCount: number;
    foldedTableCount: number;
    foldedTables: string[];
    csvEnriched: boolean;
    hasRowStats: boolean;
  };
  designReportMarkdown?: string;
  retrievalStrategy?: string;
  ddl?: string;
  model?: SqlStructuralModel;
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
