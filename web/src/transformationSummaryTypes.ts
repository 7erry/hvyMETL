/** Web mirror of server transformation summary (see src/design/explainTransformation.ts). */

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
