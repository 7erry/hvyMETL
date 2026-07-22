/** Web mirror of server transformation summary (see src/design/explainTransformation.ts). */

/** Keep in sync with the DDL-only insight in src/design/explainTransformation.ts */
export const DDL_ONLY_IMPORT_INSIGHT = {
  title: 'DDL-only import — no row counts or cardinality',
  body:
    'Pasted DDL sets every table to rowCount 0 and every FK to avg/max children 0 (unbounded). Full embed, bucket, and archive patterns need CSV exports or a SQLite .db upload so the engine can measure volume and children-per-parent.',
} as const;

export const DDL_ONLY_IMPORT_INSIGHT_ID = 'transformation-insight-ddl-only';

/** Scroll target for cross-link from Transformation Summary → Embed Overrides. */
export const EMBED_OVERRIDES_PANEL_ID = 'embed-overrides-panel';

export type TransformationInsightSeverity = 'info' | 'warn' | 'success';

export type TransformationInsight = {
  severity: TransformationInsightSeverity;
  title: string;
  body: string;
};

export type CollectionTransformationNote = {
  name: string;
  sourceTable: string;
  patterns: string[];
  embeddedFieldCount: number;
  embeddedFields: string[];
  mergedTables: string[];
  notes: string[];
};

export type TransformationSummary = {
  headline: string;
  profileId: string;
  profileLabel: string;
  readWriteRatio: string;
  sqlTableCount: number;
  collectionCount: number;
  foldedTableCount: number;
  foldedTables: string[];
  hasRowStats: boolean;
  csvEnriched: boolean;
  readHeavyEligible: boolean;
  writeHeavy: boolean;
  subsetCollectionCount: number;
  overflowCollectionCount: number;
  insights: TransformationInsight[];
  collections: CollectionTransformationNote[];
  markdown: string;
};

export type PipelineExecutionListItem = {
  executionId: string;
  startedAt: string;
  completedAt: string;
  ok: boolean;
  profileId: string;
  dialect?: string;
  schemaDialect: string;
  source: string;
  targetDb: string;
  retrievalStrategy: string;
  imports: { collection: string; ok: boolean; insertedCount?: number; error?: string }[];
  errors: string[];
  outDir: string;
};

export type PipelineExecutionsResponse = {
  memoryDb: string;
  collection: string;
  count: number;
  executions: PipelineExecutionListItem[];
};

export type PipelineExecutionDetail = PipelineExecutionListItem & {
  migrationPlan: import('./migrationPlanTypes').MigrationPlan;
  designReport: string;
  csvImportManifest: unknown;
  migrationLogIds: string[];
  reflectionScheduled: boolean;
  csvSourcePath: string;
  outDir: string;
};
