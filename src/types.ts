/**
 * Central type definitions for hvyMETL.
 *
 * Every module in the toolkit imports its shared shapes from this file so
 * there is exactly one source of truth for what a "profile", "table model",
 * or "migration plan" looks like.
 */

/* -------------------------------------------------------------------------- */
/* Workload profiles                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Identifiers for the built-in workload presets. "custom" means the user
 * supplied their own telemetry numbers on the command line.
 */
export type WorkloadProfileId =
  | 'catalog'
  | 'cms'
  | 'iot'
  | 'mobile'
  | 'personalization'
  | 'realtime-analytics'
  | 'single-view'
  | 'ledger'
  | 'custom';

/**
 * MongoDB write-concern settings chosen for a workload.
 * - `w: 1` acknowledges after the primary writes (fast, for non-critical data).
 * - `w: "majority"` waits for replication (safe, for financial/critical data).
 * - `journal: true` additionally waits for the on-disk journal.
 */
export type WriteConcernSetting = {
  w: number | 'majority';
  journal: boolean;
};

/**
 * MongoDB driver connection-pool settings tuned per workload so the
 * application can sustain its peak traffic without dropping connections.
 */
export type PoolSettings = {
  /** Maximum number of sockets the driver may keep open at once. */
  maxPoolSize: number;
  /** Minimum number of sockets kept warm to avoid connection ramp-up lag. */
  minPoolSize: number;
  /** Milliseconds a socket may sit on a single send/receive before timing out. */
  socketTimeoutMS: number;
  /** Milliseconds an idle pooled connection may live before being closed. */
  maxIdleTimeMS: number;
};

/**
 * The operational telemetry the design engine reasons about. These numbers
 * drive which MongoDB design patterns get selected.
 */
export type WorkloadTelemetry = {
  /** Percentage of operations that are reads, 0-100. */
  readPercent: number;
  /** Percentage of operations that are writes, 0-100. */
  writePercent: number;
  /** Peak traffic in requests per minute. */
  peakRpm: number;
  /** Human-readable data growth rate, e.g. "10GB/month". */
  growthRate: string;
};

/**
 * A complete workload profile: telemetry numbers plus the MongoDB tuning
 * (write concern, pooling) and the design patterns this workload favors.
 */
export type WorkloadProfile = {
  id: WorkloadProfileId;
  /** Display name shown in CLI menus, e.g. "E-commerce Catalog". */
  label: string;
  /** One-sentence description of the workload's behavior. */
  description: string;
  telemetry: WorkloadTelemetry;
  /** Patterns this workload prefers, in priority order. */
  preferredPatterns: PatternId[];
  writeConcern: WriteConcernSetting;
  pool: PoolSettings;
};

/* -------------------------------------------------------------------------- */
/* Design patterns                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The MongoDB schema design patterns the toolkit knows about. Each one has a
 * matching markdown document in the knowledge/ folder used for RAG retrieval.
 */
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
  | 'schema-versioning'
  | 'tree'
  | 'preallocation'
  | 'archive'
  | 'single-collection';

/* -------------------------------------------------------------------------- */
/* SQL structural model (output of introspection)                             */
/* -------------------------------------------------------------------------- */

/** One column of a SQL table, plus the BSON type it maps to in MongoDB. */
export type ColumnModel = {
  /** Column name exactly as it appears in the SQL schema. */
  name: string;
  /** Raw SQL type, e.g. "VARCHAR(255)" or "INTEGER". */
  sqlType: string;
  /** Closest BSON type: "string", "int", "double", "bool", "date", etc. */
  bsonType: string;
  /** True when the column allows NULL values. */
  nullable: boolean;
  /** True when the column is part of the table's primary key. */
  isPrimaryKey: boolean;
};

/** A foreign-key edge from one table's column to another table's column. */
export type ForeignKeyModel = {
  /** The column on this table holding the reference. */
  column: string;
  /** The table being referenced. */
  referencesTable: string;
  /** The column on the referenced table (usually its primary key). */
  referencesColumn: string;
};

/** Everything we know about one SQL table after introspection. */
export type TableModel = {
  name: string;
  columns: ColumnModel[];
  /** Ordered list of primary-key column names. */
  primaryKey: string[];
  foreignKeys: ForeignKeyModel[];
  /** Total number of rows currently in the table. */
  rowCount: number;
};

/**
 * A parent-to-child relationship discovered from a foreign key, enriched with
 * cardinality statistics so the pattern selector can decide embed vs reference.
 */
export type RelationshipModel = {
  parentTable: string;
  childTable: string;
  /** The foreign-key column on the child table pointing at the parent. */
  fkColumn: string;
  /** Average number of child rows per parent row. */
  avgChildrenPerParent: number;
  /** The largest number of child rows any single parent has. */
  maxChildrenPerParent: number;
  /**
   * True when the array of children is naturally bounded (small max), which
   * makes embedding safe. False means the array could grow without limit.
   */
  isBounded: boolean;
};

/** The full structural picture of a SQL source database. */
export type SqlStructuralModel = {
  /** Path or connection identifier of the source database. */
  source: string;
  tables: TableModel[];
  relationships: RelationshipModel[];
};

/* -------------------------------------------------------------------------- */
/* Migration plan (output of the design engine)                               */
/* -------------------------------------------------------------------------- */

/** One pattern choice made by the design engine, with its justification. */
export type PatternDecision = {
  pattern: PatternId;
  /** What the pattern applies to, e.g. "orders.items" or "sensor_readings". */
  target: string;
  /** Plain-English explanation tied back to the workload telemetry. */
  reason: string;
  /** Knowledge-base document the decision is grounded in, e.g. "bucket.md". */
  knowledgeSource: string;
};

/** A MongoDB index specification: key map plus creation options. */
export type IndexSpec = {
  /** Field-to-direction map, e.g. { "deviceId": 1, "windowStart": -1 }. */
  keys: Record<string, 1 | -1>;
  /** Optional index name and uniqueness flag. */
  options: { name: string; unique?: boolean };
  /** Why this index exists, tied to an access pattern. */
  reason: string;
};

/**
 * Instructions for deriving a deterministic `_id` from SQL primary keys so
 * parallel import workers can upsert the same row idempotently.
 */
export type IdDerivation = {
  /** SQL columns the _id is built from, in order. */
  sourceColumns: string[];
  /**
   * - "direct": single PK column used as-is.
   * - "composite": multiple PK values joined with "|".
   * - "bucket": grouping key + time-window start joined with "|".
   */
  strategy: 'direct' | 'composite' | 'bucket';
};

/**
 * An array of child documents embedded inside the parent collection,
 * optionally capped by the Subset pattern.
 */
export type EmbeddedArrayPlan = {
  /** Field name on the parent document, e.g. "reviews". */
  field: string;
  /** SQL table the child rows come from. */
  sourceTable: string;
  /** Foreign-key column on the child table that links to the parent. */
  joinColumn: string;
  /**
   * When set, only this many child documents are embedded (Subset pattern);
   * the full set lives in its own overflow collection.
   */
  subsetLimit?: number;
  /** Name of the overflow collection holding the full child set, if any. */
  overflowCollection?: string;
};

/** A lookup field duplicated into the document (Extended Reference pattern). */
export type ExtendedReferencePlan = {
  /** Nested field prefix on the document, e.g. "brand". */
  field: string;
  /** SQL lookup table the duplicated values come from. */
  sourceTable: string;
  /** Foreign-key column on the base table used for the join. */
  viaColumn: string;
  /** The handful of frequently-read lookup columns worth duplicating. */
  lookupColumns: string[];
};

/** A pre-aggregated counter or total maintained with $inc (Computed pattern). */
export type ComputedFieldPlan = {
  /** Field name on the document, e.g. "totalOrders". */
  field: string;
  /** What the field summarizes, e.g. "count of rows in orders". */
  description: string;
  /** Value the ETL initializes the field to (recomputed during extraction). */
  initialExpression: string;
};

/** Time-series bucketing configuration (Bucket pattern). */
export type BucketPlan = {
  /** Column that groups measurements, e.g. "device_id". */
  groupByColumn: string;
  /** Timestamp column the windows are computed from. */
  timeColumn: string;
  /** Size of each bucket window in minutes. */
  windowMinutes: number;
  /** Array field on the bucket document holding the raw measurements. */
  measurementsField: string;
};

/** Cold-storage routing for the Archive pattern (MongoDB Manual). */
export type ArchivePlan = {
  /** Timestamp column used to decide when a document is eligible to move. */
  timeColumn: string;
  /** Move documents older than this many days to the archive collection. */
  archiveAfterDays: number;
  /** Target collection name for archived documents (same schema, embedded shape). */
  archiveCollection: string;
};

/**
 * Single Collection pattern: multiple entity types share one collection with
 * docType discriminators and a links[] graph (MongoDB Manual).
 */
export type SingleCollectionPlan = {
  /** Discriminator field on every document, e.g. docType. */
  docTypeField: string;
  /** Array field holding { target, docType } references for single-query reads. */
  linksField: string;
  /** SQL tables whose rows become documents in this shared collection. */
  entityTables: string[];
  /** Junction table linking the entities, if one exists. */
  junctionTable?: string;
};

/** The complete plan for one target MongoDB collection. */
export type CollectionPlan = {
  /** Target MongoDB collection name. */
  name: string;
  /** The primary SQL table this collection is built from. */
  sourceTable: string;
  /** All SQL tables folded into this collection (embeds + lookups). */
  mergedTables: string[];
  idDerivation: IdDerivation;
  patterns: PatternDecision[];
  /** MongoDB $jsonSchema validator describing the document shape. */
  jsonSchema: Record<string, unknown>;
  indexes: IndexSpec[];
  embeddedArrays: EmbeddedArrayPlan[];
  extendedReferences: ExtendedReferencePlan[];
  computedFields: ComputedFieldPlan[];
  /** Present only when the Bucket pattern was applied to this collection. */
  bucket?: BucketPlan;
  /** Present when hot data stays active and cold data routes to a mirror collection. */
  archive?: ArchivePlan;
  /** Present when multiple SQL entity tables share one MongoDB collection. */
  singleCollection?: SingleCollectionPlan;
};

/** The top-level artifact the design engine writes to migration-plan.json. */
export type MigrationPlan = {
  /** Path of the SQL source the plan was derived from. */
  source: string;
  profileId: WorkloadProfileId;
  telemetry: WorkloadTelemetry;
  writeConcern: WriteConcernSetting;
  pool: PoolSettings;
  /** ISO timestamp of when the plan was generated. */
  generatedAt: string;
  collections: CollectionPlan[];
};

/* -------------------------------------------------------------------------- */
/* RAG retrieval                                                              */
/* -------------------------------------------------------------------------- */

/** One chunk of a knowledge-base document, ready for scoring or embedding. */
export type KnowledgeChunk = {
  /** File the chunk came from, e.g. "bucket.md". */
  sourceFile: string;
  /** Heading path inside the document, e.g. "Bucket Pattern > When to use". */
  heading: string;
  /** The chunk's markdown text. */
  text: string;
};

/** A chunk plus its relevance score for a given query. */
export type ScoredChunk = KnowledgeChunk & {
  /** Higher means more relevant to the query. */
  score: number;
};

/**
 * Pluggable embedding provider. Implementations turn text into vectors;
 * when no API key is configured the toolkit skips embeddings entirely and
 * relies on lexical scoring instead.
 */
export type EmbeddingProvider = {
  /** Short name for logs, e.g. "openai". */
  name: string;
  /** Embed a batch of texts and return one vector per input text. */
  embed: (texts: string[]) => Promise<number[][]>;
};
