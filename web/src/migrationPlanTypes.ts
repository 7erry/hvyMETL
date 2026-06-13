/** Web-side mirror of server migration plan types (see src/types.ts). */

export type PatternId =
  | 'embed'
  | 'reference'
  | 'bucket'
  | 'outlier'
  | 'extended-reference'
  | 'computed'
  | 'subset'
  | 'attribute'
  | 'polymorphic'
  | 'tree'
  | 'schema-versioning'
  | 'pre-allocation'
  | 'single-collection'
  | 'archive';

export type PatternDecision = {
  pattern: PatternId;
  target: string;
  reason: string;
  knowledgeSource: string;
};

export type IndexSpec = {
  keys: Record<string, 1 | -1>;
  options: { name: string; unique?: boolean };
  reason: string;
};

export type IdDerivation = {
  sourceColumns: string[];
  strategy: 'direct' | 'composite' | 'bucket';
};

export type EmbeddedArrayPlan = {
  field: string;
  sourceTable: string;
  joinColumn: string;
  subsetLimit?: number;
  overflowCollection?: string;
};

export type ExtendedReferencePlan = {
  field: string;
  sourceTable: string;
  viaColumn: string;
  lookupColumns: string[];
};

export type ComputedFieldPlan = {
  field: string;
  description: string;
  initialExpression: string;
};

export type BucketPlan = {
  groupByColumn: string;
  timeColumn: string;
  windowMinutes: number;
  measurementsField: string;
};

export type ArchivePlan = {
  timeColumn: string;
  archiveAfterDays: number;
  archiveCollection: string;
};

export type CollectionPlan = {
  name: string;
  sourceTable: string;
  mergedTables: string[];
  idDerivation: IdDerivation;
  patterns: PatternDecision[];
  jsonSchema: Record<string, unknown>;
  indexes: IndexSpec[];
  embeddedArrays: EmbeddedArrayPlan[];
  extendedReferences: ExtendedReferencePlan[];
  computedFields: ComputedFieldPlan[];
  bucket?: BucketPlan;
  archive?: ArchivePlan;
};

export type MigrationPlan = {
  source: string;
  profileId: string;
  generatedAt: string;
  collections: CollectionPlan[];
};
