/**
 * The rule-based pattern selector: the heart of the design engine.
 *
 * Given the SQL structural model (what the data looks like) and the workload
 * profile (how the data is accessed), this module deterministically decides
 * which MongoDB design pattern applies to every table and relationship, then
 * emits a complete MigrationPlan: collections, $jsonSchema validators,
 * indexes, deterministic _id rules, and a justification for every choice
 * citing the knowledge-base document it is grounded in.
 *
 * The decision table (telemetry x structure -> pattern):
 *
 *   EAV-shaped child table                      -> Attribute
 *   Timestamped firehose child + write-heavy    -> Bucket
 *   Junction table (two FKs, no payload)        -> embedded id array
 *   Meta / *meta extension tables               -> nested object or Attribute (Rule 1)
 *   Strict line-item children (orders_items)    -> embed by default (checklist)
 *   Bounded 1:N child                           -> embed (read-heavy no longer required)
 *   Unknown-cardinality dependent child         -> embed when workload is not write-heavy
 *     (excludes multi-parent and time-series children without volume stats)
 *   Unbounded 1:N child + embed-leaning         -> Subset (+ overflow ref)
 *   Unbounded 1:N child + write-heavy           -> reference
 *   Heavily skewed child counts                 -> Outlier flag
 *   FK to a small lookup table + read-heavy     -> Extended Reference
 *   Referenced/subsetted children + read focus  -> Computed counters
 *   Self-referencing FK                         -> Tree
 *   Type column + sparse variant columns        -> Polymorphic
 *   Junction-linked peer entities + high RPM    -> Single Collection
 *   Dated tables + read-heavy historical growth -> Archive (+ mirror collection)
 *   Every collection                            -> Schema Versioning stamp
 */

import type {
  ArchivePlan,
  BucketPlan,
  CollectionPlan,
  ColumnModel,
  ComputedFieldPlan,
  EmbeddedArrayPlan,
  ExtendedReferencePlan,
  IndexSpec,
  MigrationPlan,
  PatternDecision,
  RelationshipModel,
  SingleCollectionPlan,
  SqlStructuralModel,
  TableModel,
  WorkloadProfile,
} from '../types.js';
import { singularize, toCamelCase, toPascalCase } from '../utilities/naming.js';
import {
  EMBED_LEANING_PERCENT,
  LINE_ITEMS_EMBED_MAX,
  READ_HEAVY_PERCENT,
  SUBSET_LIMIT,
  WRITE_HEAVY_PERCENT,
} from './embedThresholds.js';

/** Developer-provided max cardinality at or below this value can force embedding. */
const DEVELOPER_OVERRIDE_EMBED_MAX_CHILDREN = 5000;
/** Tables at or below this row count can be duplicated as lookups. */
const LOOKUP_TABLE_MAX_ROWS = 5000;
/** Child tables with at least this many rows are "firehose" candidates. */
const FIREHOSE_MIN_ROWS = 10000;
/** Max lookup columns duplicated by the Extended Reference pattern. */
const EXTENDED_REFERENCE_MAX_COLUMNS = 3;
/** A max/avg child ratio above this (with enough children) flags an outlier. */
const OUTLIER_SKEW_RATIO = 10;
/** Minimum max-children before outlier skew is worth flagging. */
const OUTLIER_MIN_CHILDREN = 50;
/** Bucket window size for time-series data, in minutes. */
const BUCKET_WINDOW_MINUTES = 60;
/** Tables at or above this row count with a date column may use Archive. */
const ARCHIVE_MIN_ROWS = 5000;
/** Default cold-data retention before archive sweep (matches MongoDB doc example). */
const ARCHIVE_AFTER_DAYS_DEFAULT = 365 * 5;
/** Atlas Online Archive should keep a recent active window on the primary cluster. */
const ARCHIVE_ACTIVE_DATA_MINIMUM_DAYS = 90;

/** Peak RPM at which Single Collection is considered without an explicit preference. */
const SINGLE_COLLECTION_MIN_RPM = 100_000;

/* -------------------------------------------------------------------------- */
/* Structural classification helpers                                          */
/* -------------------------------------------------------------------------- */

/** Columns that are "payload" (not the PK and not a foreign key). */
function payloadColumns(table: TableModel): ColumnModel[] {
  const fkColumns = new Set(table.foreignKeys.map((fk) => fk.column));
  return table.columns.filter((column) => !column.isPrimaryKey && !fkColumns.has(column.name));
}

/**
 * Detect entity-attribute-value tables: exactly two payload columns where
 * one looks like a key and the other like a value. These become the
 * Attribute pattern's k/v array.
 */
export function isEavTable(table: TableModel): boolean {
  const payload = payloadColumns(table).filter((column) => column.bsonType !== 'date');
  if (payload.length !== 2) return false;
  const hasKeyish = payload.some((column) => /(_key|_k$|^key$|name$)/i.test(column.name));
  const hasValueish = payload.some((column) => /(_value|_v$|^value$)/i.test(column.name));
  return hasKeyish && hasValueish;
}

/**
 * Detect junction tables for many-to-many links: two foreign keys and no
 * meaningful payload (at most one timestamp). These fold into the parent as
 * an array of referenced ids.
 */
export function isJunctionTable(table: TableModel): boolean {
  if (table.foreignKeys.length !== 2) return false;
  const payload = payloadColumns(table);
  return payload.every((column) => column.bsonType === 'date');
}

/**
 * Detect SQL meta/extension tables (e.g. usermeta, postmeta) that hang off a
 * single parent and should not become standalone collections.
 */
export function isMetaTable(table: TableModel): boolean {
  if (!/meta(?:data)?$/i.test(table.name)) return false;
  return table.foreignKeys.length >= 1 && table.foreignKeys.length <= 2;
}

/**
 * Detect strict dependent line-item children (orders -> order_items) that the
 * migration checklist defaults to embedding inside the parent document.
 */
export function isLineItemsChild(parentTable: string, childTable: TableModel): boolean {
  const child = childTable.name.toLowerCase();
  const parent = parentTable.toLowerCase();
  const singular = singularize(parent);
  if (child === `${parent}_items` || child === `${singular}_items`) return true;
  if (/_items$/i.test(child) && childTable.foreignKeys.length === 1) return true;
  if (/_lines$/i.test(child) && childTable.foreignKeys.length === 1) return true;
  if (/_details$/i.test(child) && childTable.foreignKeys.length === 1) return true;
  if (/_entries$/i.test(child) && childTable.foreignKeys.length === 1) return true;
  return false;
}

/** Whether a line-item child should embed by default (bounded or unknown small cardinality). */
export function shouldDefaultEmbedLineItems(
  relationship: RelationshipModel,
  childTable: TableModel,
  parentTable: string,
): boolean {
  if (!isLineItemsChild(parentTable, childTable)) return false;
  if (relationship.isBounded) return true;
  if (relationship.maxChildrenPerParent === 0) return true;
  return relationship.maxChildrenPerParent <= LINE_ITEMS_EMBED_MAX;
}

/** CamelCase field name for folding a meta table into its parent document. */
function metaTableFieldName(table: TableModel): string {
  const stripped = table.name.replace(/_?(meta|metadata)$/i, '');
  if (!stripped || stripped === table.name) return 'metadata';
  return toCamelCase(`${stripped}Meta`);
}

/**
 * Detect small lookup tables (brands, firmware versions): few rows, no
 * foreign keys of their own, and referenced by at least one other table.
 * Their hot columns are candidates for Extended Reference duplication.
 */
export function isLookupTable(table: TableModel, model: SqlStructuralModel): boolean {
  if (table.rowCount === 0 || table.rowCount > LOOKUP_TABLE_MAX_ROWS) return false;
  if (table.foreignKeys.length > 0) return false;
  return model.relationships.some((relationship) => relationship.parentTable === table.name);
}

/** Find the first date/timestamp column of a table, if any. */
export function findDateColumn(table: TableModel): ColumnModel | undefined {
  return table.columns.find((column) => column.bsonType === 'date');
}

/**
 * Detect polymorphic tables: a discriminator column (something_type) plus at
 * least two nullable variant columns that only apply to some rows.
 */
export function isPolymorphicTable(table: TableModel): boolean {
  const discriminator = table.columns.find((column) => /(^|_)type$/i.test(column.name));
  if (!discriminator) return false;
  const nullableVariants = payloadColumns(table).filter(
    (column) => column.nullable && column.name !== discriminator.name,
  );
  return nullableVariants.length >= 2;
}

/** Does a relationship's child-count distribution look heavily skewed? */
export function isOutlierSkewed(relationship: RelationshipModel): boolean {
  const safeAverage = Math.max(relationship.avgChildrenPerParent, 1);
  return (
    relationship.maxChildrenPerParent >= OUTLIER_MIN_CHILDREN &&
    relationship.maxChildrenPerParent / safeAverage >= OUTLIER_SKEW_RATIO
  );
}

/**
 * Is the child table a time-series "firehose" worth bucketing? Requires a
 * timestamp column and a large (or fast-growing) row count.
 */
export function isFirehoseTable(table: TableModel): boolean {
  return table.rowCount >= FIREHOSE_MIN_ROWS && findDateColumn(table) !== undefined;
}

/** Tables with dated history on read-heavy workloads qualify for Archive (not ledger). */
export function isArchiveCandidate(
  table: TableModel,
  profile: WorkloadProfile,
  bucketedTables: Set<string>,
): boolean {
  if (bucketedTables.has(table.name)) return false;
  if (profile.id === 'ledger') return false;
  if (!findDateColumn(table)) return false;
  if (table.rowCount < ARCHIVE_MIN_ROWS) return false;
  if (!profile.preferredPatterns.includes('archive')) return false;
  return profile.telemetry.readPercent >= READ_HEAVY_PERCENT;
}

/** Retention window in days before documents move to the archive collection. */
export function archiveRetentionDays(profile: WorkloadProfile): number {
  if (profile.id === 'cms') return 365 * 3;
  return ARCHIVE_AFTER_DAYS_DEFAULT;
}

/** Retention window in years, rounded for manager-facing Archive controls. */
export function archiveRetentionYears(profile: WorkloadProfile): number {
  return Math.max(1, Math.round(archiveRetentionDays(profile) / 365));
}

/** Archive partitions start with the date field, followed by common query filters. */
export function archivePartitionFields(table: TableModel, dateColumn: ColumnModel): string[] {
  const partitions = [toCamelCase(dateColumn.name)];
  for (const column of table.columns) {
    const field = toCamelCase(column.name);
    if (field === partitions[0]) continue;
    if (/(^tenantId$|^accountId$|^customerId$|^userId$|region|status|type$)/i.test(field)) {
      partitions.push(field);
    }
    if (partitions.length >= 3) break;
  }
  return partitions;
}

/** Optional non-age filter hint for Online Archive rules. */
function archiveCustomFilterDescription(table: TableModel): string | undefined {
  const statusColumn = table.columns.find((column) => /(^|_)status$/i.test(column.name));
  if (!statusColumn) return undefined;
  return `If only terminal records should leave the hot cluster, add a custom archive filter on ${toCamelCase(statusColumn.name)} (for example completed/closed).`;
}

/** Whether the profile favors merging junction-linked entities into one collection. */
export function shouldUseSingleCollection(profile: WorkloadProfile): boolean {
  return (
    profile.preferredPatterns.includes('single-collection') ||
    profile.telemetry.peakRpm >= SINGLE_COLLECTION_MIN_RPM
  );
}

/** Find unordered entity-table pairs linked by a junction table. */
export function findSingleCollectionPairs(model: SqlStructuralModel): [string, string][] {
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const table of model.tables) {
    if (!isJunctionTable(table) || table.foreignKeys.length !== 2) continue;
    const left = table.foreignKeys[0].referencesTable;
    const right = table.foreignKeys[1].referencesTable;
    if (left === right) continue;
    const key = [left, right].sort().join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([left, right].sort() as [string, string]);
  }
  return pairs;
}

function findJunctionBetween(model: SqlStructuralModel, tableA: string, tableB: string): TableModel | undefined {
  return model.tables.find(
    (candidate) =>
      isJunctionTable(candidate) &&
      candidate.foreignKeys.some((fk) => fk.referencesTable === tableA) &&
      candidate.foreignKeys.some((fk) => fk.referencesTable === tableB),
  );
}

/** Plan one shared collection for a junction-linked entity pair. */
function planSingleCollectionHub(
  tableA: string,
  tableB: string,
  junction: TableModel | undefined,
  model: SqlStructuralModel,
  profile: WorkloadProfile,
): CollectionPlan {
  const entityA = model.tables.find((table) => table.name === tableA)!;
  const entityB = model.tables.find((table) => table.name === tableB)!;
  const hubName = `${toCamelCase(tableA)}_${toCamelCase(tableB)}`;
  const ratioLabel = `${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W at ${profile.telemetry.peakRpm.toLocaleString('en-US')} RPM`;

  const properties: Record<string, unknown> = {
    ...buildBaseProperties(entityA),
    ...buildBaseProperties(entityB),
    docType: {
      bsonType: 'string',
      description: 'Entity discriminator (Single Collection pattern).',
    },
    links: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        properties: {
          target: { bsonType: 'string' },
          docType: { bsonType: 'string' },
        },
      },
      description: 'Bidirectional references for single-query graph reads.',
    },
  };

  const singleCollection: SingleCollectionPlan = {
    docTypeField: 'docType',
    linksField: 'links',
    entityTables: [tableA, tableB],
    junctionTable: junction?.name,
  };

  return {
    name: hubName,
    sourceTable: tableA,
    mergedTables: [tableA, tableB, ...(junction ? [junction.name] : [])],
    idDerivation: {
      sourceColumns: entityA.primaryKey.length > 0 ? entityA.primaryKey : [entityA.columns[0].name],
      strategy: entityA.primaryKey.length === 1 ? 'direct' : 'composite',
    },
    patterns: [
      {
        pattern: 'single-collection',
        target: hubName,
        reason: `${tableA} and ${tableB} are linked${junction ? ` via junction ${junction.name}` : ''}; storing both entity shapes in ${hubName} with docType + links[] avoids duplicating payloads across collections under ${ratioLabel}.`,
        knowledgeSource: 'single-collection.md',
      },
      {
        pattern: 'schema-versioning',
        target: hubName,
        reason: 'Every document is stamped with schemaVersion: 1 so future shape changes can migrate lazily.',
        knowledgeSource: 'schema-versioning.md',
      },
    ],
    jsonSchema: { bsonType: 'object', required: ['_id', 'schemaVersion', 'docType'], properties },
    indexes: [
      {
        keys: { 'links.target': 1, 'links.docType': 1 },
        options: { name: `idx_${hubName}_links_target_docType` },
        reason: 'Single-query graph reads filter on links.target and links.docType.',
      },
      {
        keys: { docType: 1 },
        options: { name: `idx_${hubName}_docType` },
        reason: 'Filter documents by entity kind within the shared collection.',
      },
    ],
    embeddedArrays: [],
    extendedReferences: [],
    computedFields: [],
    singleCollection,
  };
}

/** Append a mirror archive collection for one hot collection. */
function planArchiveMirror(hot: CollectionPlan): CollectionPlan {
  const archive = hot.archive!;
  const archiveName = archive.archiveCollection;
  return {
    ...hot,
    name: archiveName,
    archive: undefined,
    patterns: [
      {
        pattern: 'archive',
        target: archiveName,
        reason: `Cold-storage mirror of ${hot.name}; documents older than ${archive.archiveAfterDays} days move here with the same embedded shape and archive partitions ${archive.partitionFields.join(' + ')}.`,
        knowledgeSource: 'archive.md',
      },
      ...hot.patterns.filter((decision) => decision.pattern === 'schema-versioning'),
    ],
    indexes: [
      ...hot.indexes,
      {
        keys: { [toCamelCase(archive.timeColumn)]: 1 },
        options: { name: `idx_${archiveName}_${toCamelCase(archive.timeColumn)}` },
        reason: 'Archive sweeps and time-range queries filter on document age.',
      },
    ],
  };
}

/** Pick the lookup columns worth duplicating for Extended Reference. */
export function pickLookupColumns(lookupTable: TableModel): string[] {
  // Prefer human-facing string columns: names, titles, tiers, statuses.
  const stringColumns = payloadColumns(lookupTable).filter((column) => column.bsonType === 'string');
  const prioritized = [
    ...stringColumns.filter((column) => /(name|title|tier|status|model|version|kind)/i.test(column.name)),
    ...stringColumns.filter((column) => !/(name|title|tier|status|model|version|kind)/i.test(column.name)),
  ];
  return prioritized.slice(0, EXTENDED_REFERENCE_MAX_COLUMNS).map((column) => column.name);
}

/* -------------------------------------------------------------------------- */
/* JSON Schema construction                                                   */
/* -------------------------------------------------------------------------- */

/** Build the $jsonSchema property map for a table's own (camelCased) columns. */
function buildBaseProperties(table: TableModel): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    _id: { bsonType: 'string', description: 'Deterministic id derived from the SQL primary key.' },
    schemaVersion: { bsonType: 'int', description: 'Document shape version for lazy migrations.' },
  };
  for (const column of table.columns) {
    if (column.isPrimaryKey && table.primaryKey.length === 1) continue; // becomes _id
    const types = column.nullable ? [column.bsonType, 'null'] : column.bsonType;
    properties[toCamelCase(column.name)] = {
      bsonType: types,
      description: `From SQL column ${table.name}.${column.name} (${column.sqlType}).`,
    };
  }
  return properties;
}

/* -------------------------------------------------------------------------- */
/* The main planner                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Decide how every relationship where `table` is the PARENT gets handled,
 * and accumulate the resulting plan pieces onto the collection.
 */
function planChildRelationships(
  table: TableModel,
  model: SqlStructuralModel,
  profile: WorkloadProfile,
  tablesByName: Map<string, TableModel>,
  absorbedTables: Set<string>,
): {
  embeddedArrays: EmbeddedArrayPlan[];
  computedFields: ComputedFieldPlan[];
  patterns: PatternDecision[];
  properties: Record<string, unknown>;
} {
  const isReadHeavy = profile.telemetry.readPercent >= READ_HEAVY_PERCENT;
  const isEmbedLeaning = profile.telemetry.readPercent >= EMBED_LEANING_PERCENT;
  const isWriteHeavy = profile.telemetry.writePercent >= WRITE_HEAVY_PERCENT;
  const ratioLabel = `${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W at ${profile.telemetry.peakRpm.toLocaleString('en-US')} RPM`;

  const embeddedArrays: EmbeddedArrayPlan[] = [];
  const computedFields: ComputedFieldPlan[] = [];
  const patterns: PatternDecision[] = [];
  const properties: Record<string, unknown> = {};

  /** Add a Computed-pattern counter for one child relationship. */
  function addComputedCounter(childTable: TableModel, relationship: RelationshipModel, reason: string): void {
    const counterField = `total${toPascalCase(childTable.name)}`;
    if (computedFields.some((field) => field.field === counterField)) return;
    computedFields.push({
      field: counterField,
      description: `Running count of ${childTable.name} rows for this ${singularize(table.name)}.`,
      initialExpression: `COUNT(*) FROM ${childTable.name} WHERE ${relationship.fkColumn} = ${table.name}.${table.primaryKey[0] ?? 'id'}`,
    });
    properties[counterField] = { bsonType: 'long', description: 'Computed pattern counter maintained with $inc.' };
    patterns.push({
      pattern: 'computed',
      target: `${table.name}.${counterField}`,
      reason,
      knowledgeSource: 'computed.md',
    });
  }

  const childRelationships = model.relationships.filter(
    (relationship) => relationship.parentTable === table.name && relationship.childTable !== table.name,
  );

  for (const relationship of childRelationships) {
    const childTable = tablesByName.get(relationship.childTable);
    if (!childTable) continue;

    // Rule 1: EAV children always become the Attribute pattern's k/v array.
    if (isEavTable(childTable)) {
      embeddedArrays.push({
        field: 'attributes',
        sourceTable: childTable.name,
        joinColumn: relationship.fkColumn,
      });
      properties.attributes = {
        bsonType: 'array',
        items: { bsonType: 'object', properties: { k: { bsonType: 'string' }, v: {} } },
        description: `Attribute pattern array from EAV table ${childTable.name}.`,
      };
      patterns.push({
        pattern: 'attribute',
        target: `${table.name}.attributes`,
        reason: `${childTable.name} is an entity-attribute-value table; folding it into a k/v array lets one compound index serve every characteristic query (migration-principles Rule 1).`,
        knowledgeSource: isMetaTable(childTable) ? 'migration-principles.md' : 'attribute.md',
      });
      absorbedTables.add(childTable.name);
      continue;
    }

    // Meta/extension tables (usermeta, postmeta) collapse into the parent.
    if (isMetaTable(childTable)) {
      const field = metaTableFieldName(childTable);
      embeddedArrays.push({
        field,
        sourceTable: childTable.name,
        joinColumn: relationship.fkColumn,
      });
      properties[field] = {
        bsonType: 'array',
        items: { bsonType: 'object' },
        description: `Meta rows from ${childTable.name} folded into parent ${table.name}.`,
      };
      patterns.push({
        pattern: 'embed',
        target: `${table.name}.${field}`,
        reason: `${childTable.name} is a meta/extension table; collapse into ${table.name} instead of a 1-to-1 collection (migration-principles checklist).`,
        knowledgeSource: 'migration-principles.md',
      });
      absorbedTables.add(childTable.name);
      continue;
    }

    // Rule 2: junction tables fold into an array of referenced ids.
    if (isJunctionTable(childTable)) {
      const otherFk = childTable.foreignKeys.find((fk) => fk.referencesTable !== table.name);
      if (otherFk) {
        const field = `${toCamelCase(singularize(otherFk.referencesTable))}Ids`;
        embeddedArrays.push({ field, sourceTable: childTable.name, joinColumn: relationship.fkColumn });
        properties[field] = {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: `Many-to-many ids folded from junction table ${childTable.name}.`,
        };
        patterns.push({
          pattern: 'embed',
          target: `${table.name}.${field}`,
          reason: `${childTable.name} is a pure junction table; an embedded id array removes a join with no payload loss.`,
          knowledgeSource: 'embed-vs-reference.md',
        });
        absorbedTables.add(childTable.name);
      }
      continue;
    }

    const skewed = isOutlierSkewed(relationship);

    if (relationship.forceEmbed === true) {
      const field = toCamelCase(childTable.name);
      embeddedArrays.push({ field, sourceTable: childTable.name, joinColumn: relationship.fkColumn });
      properties[field] = {
        bsonType: 'array',
        items: { bsonType: 'object' },
        description: `Embedded ${childTable.name} because the developer explicitly forced this linked relationship.`,
      };
      patterns.push({
        pattern: 'embed',
        target: `${table.name}.${field}`,
        reason: `Developer forced ${childTable.name} to embed into ${table.name} through FK ${relationship.fkColumn}; this override intentionally bypasses the default workload/cardinality heuristic for linked tables.`,
        knowledgeSource: 'embed-vs-reference.md',
      });
      absorbedTables.add(childTable.name);
      continue;
    }

    if (relationship.forceEmbed === false) {
      patterns.push({
        pattern: 'reference',
        target: `${table.name} -> ${childTable.name}`,
        reason: `Developer disabled force-embed for ${childTable.name}; it stays a separate collection instead of folding into ${table.name}.`,
        knowledgeSource: 'embed-vs-reference.md',
      });
      if (isReadHeavy) {
        addComputedCounter(
          childTable,
          relationship,
          `Reads dominate (${ratioLabel}); storing the ${childTable.name} count avoids an aggregation on every read.`,
        );
      }
      continue;
    }

    // Rule 3: timestamped firehose children on bucket-friendly workloads
    // become their own bucketed collection (handled when the child table is
    // planned); the parent just gets a computed counter.
    const childIsBucketed = isFirehoseTable(childTable) && (isWriteHeavy || profile.preferredPatterns.includes('bucket'));
    if (childIsBucketed) {
      addComputedCounter(
        childTable,
        relationship,
        `${childTable.name} is bucketed separately; the parent keeps a pre-computed counter so dashboards never scan raw measurements (${ratioLabel}).`,
      );
      continue;
    }

    const developerForcedBoundedEmbed =
      relationship.cardinalitySource === 'developer' &&
      relationship.maxChildrenPerParent > 0 &&
      relationship.maxChildrenPerParent <= DEVELOPER_OVERRIDE_EMBED_MAX_CHILDREN;

    if (developerForcedBoundedEmbed && !skewed) {
      const field = toCamelCase(childTable.name);
      embeddedArrays.push({ field, sourceTable: childTable.name, joinColumn: relationship.fkColumn });
      properties[field] = {
        bsonType: 'array',
        items: { bsonType: 'object' },
        description: `Embedded ${childTable.name} from developer-provided max cardinality ${relationship.maxChildrenPerParent}.`,
      };
      patterns.push({
        pattern: 'embed',
        target: `${table.name}.${field}`,
        reason: `Developer supplied max ${relationship.maxChildrenPerParent} ${childTable.name} row(s) per ${table.name}; treating the relationship as bounded and embedding without CSV cardinality stats.`,
        knowledgeSource: 'embed-vs-reference.md',
      });
      absorbedTables.add(childTable.name);
      continue;
    }

    // Guard: never embed a "hub" child (a table other tables hang off of,
    // like products under brands). Embedding it would duplicate an entire
    // entity graph into a lookup parent; the right shape is a reference,
    // with the denormalization happening on the child via Extended Reference.
    const childHasDependents = model.relationships.some(
      (candidate) => candidate.parentTable === childTable.name && candidate.childTable !== childTable.name,
    );
    if (childHasDependents) {
      patterns.push({
        pattern: 'reference',
        target: `${table.name} -> ${childTable.name}`,
        reason: `${childTable.name} is an entity in its own right (other tables reference it); it stays its own collection and denormalizes ${table.name} fields via Extended Reference instead.`,
        knowledgeSource: 'embed-vs-reference.md',
      });
      if (isReadHeavy) {
        addComputedCounter(
          childTable,
          relationship,
          `Reads dominate (${ratioLabel}); storing the ${childTable.name} count avoids an aggregation on every read.`,
        );
      }
      continue;
    }

    // Guard: a child with several required parents (affinities pointing at
    // both profiles and items) embeds under ONE primary parent only — its
    // first foreign key. Other parents keep a counter instead, so the same
    // rows are never duplicated into two collections.
    const nonSelfForeignKeys = childTable.foreignKeys.filter((fk) => fk.referencesTable !== childTable.name);
    const primaryParent = nonSelfForeignKeys[0]?.referencesTable;
    if (nonSelfForeignKeys.length > 1 && primaryParent !== table.name) {
      patterns.push({
        pattern: 'reference',
        target: `${table.name} -> ${childTable.name}`,
        reason: `${childTable.name} belongs to multiple parents; it embeds under its primary parent (${primaryParent}) and is referenced from ${table.name} to avoid duplicating rows across collections.`,
        knowledgeSource: 'embed-vs-reference.md',
      });
      if (isReadHeavy) {
        addComputedCounter(
          childTable,
          relationship,
          `Reads dominate (${ratioLabel}); storing the ${childTable.name} count avoids an aggregation on every read.`,
        );
      }
      continue;
    }

    // Checklist: strict line-item children (orders -> order_items) embed by default.
    if (
      shouldDefaultEmbedLineItems(relationship, childTable, table.name) &&
      !childHasDependents &&
      !skewed &&
      !isWriteHeavy
    ) {
      const field = toCamelCase(childTable.name);
      embeddedArrays.push({ field, sourceTable: childTable.name, joinColumn: relationship.fkColumn });
      properties[field] = {
        bsonType: 'array',
        items: { bsonType: 'object' },
        description: `Embedded line items from ${childTable.name} (strict dependent child).`,
      };
      const boundHint =
        relationship.maxChildrenPerParent > 0
          ? `max ${relationship.maxChildrenPerParent} per parent`
          : 'assumed bounded line-item cardinality';
      patterns.push({
        pattern: 'embed',
        target: `${table.name}.${field}`,
        reason: `${childTable.name} is a strict dependent line-item child of ${table.name} (${boundHint}); embed as an array for atomic single-document reads (migration-principles checklist, ${ratioLabel}).`,
        knowledgeSource: 'migration-principles.md',
      });
      absorbedTables.add(childTable.name);
      continue;
    }

    const unknownCardinality =
      relationship.maxChildrenPerParent === 0 &&
      relationship.avgChildrenPerParent === 0 &&
      relationship.cardinalitySource !== 'developer';

    const timeSeriesWithoutStats =
      findDateColumn(childTable) !== undefined &&
      unknownCardinality &&
      !relationship.forceEmbed;

    // DDL-only or missing stats: embed small single-parent dependents when the workload is not write-heavy.
    // Multi-parent and time-series children stay separate unless the developer forces embed or supplies max cardinality.
    if (
      unknownCardinality &&
      !childHasDependents &&
      !isWriteHeavy &&
      !isFirehoseTable(childTable) &&
      !timeSeriesWithoutStats &&
      nonSelfForeignKeys.length <= 1 &&
      !skewed
    ) {
      const field = toCamelCase(childTable.name);
      embeddedArrays.push({ field, sourceTable: childTable.name, joinColumn: relationship.fkColumn });
      properties[field] = {
        bsonType: 'array',
        items: { bsonType: 'object' },
        description: `Embedded ${childTable.name} by default (no cardinality stats; assumed small dependent child).`,
      };
      patterns.push({
        pattern: 'embed',
        target: `${table.name}.${field}`,
        reason: `No CSV/SQLite cardinality stats for ${childTable.name}; embedding into ${table.name} because the workload is not write-heavy (${ratioLabel}) and the child looks like a dependent detail table.`,
        knowledgeSource: 'embed-vs-reference.md',
      });
      absorbedTables.add(childTable.name);
      continue;
    }

    // Rule 4: bounded children embed fully (read-heavy no longer required).
    if (relationship.isBounded && !skewed) {
      const field = toCamelCase(childTable.name);
      embeddedArrays.push({ field, sourceTable: childTable.name, joinColumn: relationship.fkColumn });
      properties[field] = {
        bsonType: 'array',
        items: { bsonType: 'object' },
        description: `Fully embedded ${childTable.name} (bounded: max ${relationship.maxChildrenPerParent} per parent).`,
      };
      patterns.push({
        pattern: 'embed',
        target: `${table.name}.${field}`,
        reason: `Max ${relationship.maxChildrenPerParent} children per parent is safely bounded, and the ${ratioLabel} workload wants O(1) single-document reads.`,
        knowledgeSource: 'embed-vs-reference.md',
      });
      absorbedTables.add(childTable.name);
      continue;
    }

    // Rule 5: unbounded (or skewed) children on read-leaning workloads get the
    // Subset pattern: newest N embedded, full set referenced.
    // Time-series children without volume stats reference outright — subset/full embed need measured fan-out.
    if ((isEmbedLeaning || !isWriteHeavy) && !timeSeriesWithoutStats) {
      const field = `recent${toPascalCase(childTable.name)}`;
      embeddedArrays.push({
        field,
        sourceTable: childTable.name,
        joinColumn: relationship.fkColumn,
        subsetLimit: SUBSET_LIMIT,
        overflowCollection: toCamelCase(childTable.name),
      });
      properties[field] = {
        bsonType: 'array',
        maxItems: SUBSET_LIMIT,
        items: { bsonType: 'object' },
        description: `Subset pattern: the ${SUBSET_LIMIT} newest ${childTable.name}; full set lives in its own collection.`,
      };
      patterns.push({
        pattern: 'subset',
        target: `${table.name}.${field}`,
        reason: `${childTable.name} can reach ${relationship.maxChildrenPerParent} rows per parent (avg ${relationship.avgChildrenPerParent}); capping the embedded array at ${SUBSET_LIMIT} bounds document size strictly below 16MB while keeping the hot read single-document (${ratioLabel}).`,
        knowledgeSource: 'subset.md',
      });
      if (skewed) {
        patterns.push({
          pattern: 'outlier',
          target: `${table.name}.${field}`,
          reason: `Child counts are heavily skewed (max ${relationship.maxChildrenPerParent} vs avg ${relationship.avgChildrenPerParent}); the typical document stays small and only outliers pay the overflow-query cost.`,
          knowledgeSource: 'outlier.md',
        });
      }
    } else {
      // Rule 6: write-heavy workloads reference unbounded children outright.
      patterns.push({
        pattern: 'reference',
        target: `${table.name} -> ${childTable.name}`,
        reason: `Embedding ${childTable.name} (max ${relationship.maxChildrenPerParent}/parent) would make every write rewrite a growing document; references keep writes small under ${ratioLabel}.`,
        knowledgeSource: 'embed-vs-reference.md',
      });
    }

    // Read-leaning workloads also get a computed counter for referenced sets.
    if (isEmbedLeaning) {
      addComputedCounter(
        childTable,
        relationship,
        `Reads dominate (${ratioLabel}); storing the ${childTable.name} count avoids an aggregation on every read.`,
      );
    }
  }

  return { embeddedArrays, computedFields, patterns, properties };
}

/**
 * Decide how FKs FROM this table to lookup tables are handled: read-heavy
 * workloads duplicate hot lookup columns (Extended Reference); everything
 * keeps the plain reference id as well.
 */
function planLookupReferences(
  table: TableModel,
  model: SqlStructuralModel,
  profile: WorkloadProfile,
  tablesByName: Map<string, TableModel>,
): { extendedReferences: ExtendedReferencePlan[]; patterns: PatternDecision[]; properties: Record<string, unknown> } {
  const isReadLeaning = profile.telemetry.readPercent >= READ_HEAVY_PERCENT;
  const extendedReferences: ExtendedReferencePlan[] = [];
  const patterns: PatternDecision[] = [];
  const properties: Record<string, unknown> = {};

  for (const fk of table.foreignKeys) {
    if (fk.referencesTable === table.name) continue; // self-reference: Tree, handled elsewhere
    const lookupTable = tablesByName.get(fk.referencesTable);
    if (!lookupTable) continue;
    if (!isReadLeaning || !isLookupTable(lookupTable, model)) continue;

    const lookupColumns = pickLookupColumns(lookupTable);
    if (lookupColumns.length === 0) continue;

    const field = toCamelCase(singularize(lookupTable.name));
    extendedReferences.push({ field, sourceTable: lookupTable.name, viaColumn: fk.column, lookupColumns });
    properties[field] = {
      bsonType: 'object',
      properties: Object.fromEntries(lookupColumns.map((column) => [toCamelCase(column), { bsonType: 'string' }])),
      description: `Extended Reference: hot fields duplicated from ${lookupTable.name}.`,
    };
    patterns.push({
      pattern: 'extended-reference',
      target: `${table.name}.${field}`,
      reason: `${profile.telemetry.readPercent}% of operations are reads; duplicating ${lookupColumns.join(', ')} from ${lookupTable.name} removes a $lookup from the hot path. The id (${toCamelCase(fk.column)}) is kept for fan-out updates.`,
      knowledgeSource: 'extended-reference.md',
    });
  }

  return { extendedReferences, patterns, properties };
}

/** Build the bucketed-collection plan for one firehose child table. */
function planBucketCollection(
  table: TableModel,
  profile: WorkloadProfile,
): CollectionPlan {
  const dateColumn = findDateColumn(table);
  const groupByFk = table.foreignKeys[0];
  const groupByColumn = groupByFk ? groupByFk.column : table.primaryKey[0];
  const bucket: BucketPlan = {
    groupByColumn,
    timeColumn: dateColumn ? dateColumn.name : 'created_at',
    windowMinutes: BUCKET_WINDOW_MINUTES,
    measurementsField: 'measurements',
  };
  const collectionName = toCamelCase(table.name);
  const ratioLabel = `${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W at ${profile.telemetry.peakRpm.toLocaleString('en-US')} RPM`;

  return {
    name: collectionName,
    sourceTable: table.name,
    mergedTables: [table.name],
    idDerivation: { sourceColumns: [groupByColumn, 'windowStart'], strategy: 'bucket' },
    patterns: [
      {
        pattern: 'bucket',
        target: collectionName,
        reason: `${table.name} holds ${table.rowCount.toLocaleString('en-US')} timestamped rows under a ${ratioLabel} workload; ${BUCKET_WINDOW_MINUTES}-minute buckets per ${groupByColumn} cut index entries by orders of magnitude and keep write latency flat.`,
        knowledgeSource: 'bucket.md',
      },
      {
        pattern: 'computed',
        target: `${collectionName}.count/sum/min/max`,
        reason: 'Per-bucket aggregates are maintained with $inc/$min/$max so dashboards read summaries without scanning measurements.',
        knowledgeSource: 'computed.md',
      },
      {
        pattern: 'schema-versioning',
        target: collectionName,
        reason: 'Every document is stamped with schemaVersion: 1 so future shape changes can migrate lazily.',
        knowledgeSource: 'schema-versioning.md',
      },
    ],
    jsonSchema: {
      bsonType: 'object',
      required: ['_id', toCamelCase(groupByColumn), 'windowStart', 'count'],
      properties: {
        _id: { bsonType: 'string', description: `"${toCamelCase(groupByColumn)}|windowStart" bucket key.` },
        schemaVersion: { bsonType: 'int' },
        [toCamelCase(groupByColumn)]: { bsonType: 'string' },
        windowStart: { bsonType: 'date' },
        windowMinutes: { bsonType: 'int' },
        count: { bsonType: 'long', description: 'Computed: number of measurements in the bucket.' },
        measurements: {
          bsonType: 'array',
          items: { bsonType: 'object' },
          description: 'Raw measurements inside this window.',
        },
      },
    },
    indexes: [
      {
        keys: { [toCamelCase(groupByColumn)]: 1, windowStart: -1 },
        options: { name: `idx_${collectionName}_${toCamelCase(groupByColumn)}_windowStart` },
        reason: 'Range scans per source over time are the dominant read.',
      },
    ],
    embeddedArrays: [],
    extendedReferences: [],
    computedFields: [],
    bucket,
  };
}

/**
 * Build the full migration plan for a structural model under a profile.
 * This function is pure and deterministic: same inputs, same plan.
 */
export function buildMigrationPlan(model: SqlStructuralModel, profile: WorkloadProfile): MigrationPlan {
  const tablesByName = new Map(model.tables.map((table) => [table.name, table]));
  const isWriteHeavy = profile.telemetry.writePercent >= WRITE_HEAVY_PERCENT;

  // Pass 1: find tables that disappear into other collections (EAV, junction,
  // fully embedded children) and tables that become bucketed collections.
  const absorbedTables = new Set<string>();
  const bucketedTables = new Set<string>(
    model.tables
      .filter((table) => isFirehoseTable(table) && (isWriteHeavy || profile.preferredPatterns.includes('bucket')))
      .map((table) => table.name),
  );

  const collections: CollectionPlan[] = [];
  const singleCollectionAbsorbed = new Set<string>();

  // Pass 1.5: junction-linked entity pairs -> Single Collection hub.
  if (shouldUseSingleCollection(profile)) {
    for (const [tableA, tableB] of findSingleCollectionPairs(model)) {
      if (singleCollectionAbsorbed.has(tableA) || singleCollectionAbsorbed.has(tableB)) continue;
      const junction = findJunctionBetween(model, tableA, tableB);
      collections.push(planSingleCollectionHub(tableA, tableB, junction, model, profile));
      singleCollectionAbsorbed.add(tableA);
      singleCollectionAbsorbed.add(tableB);
      if (junction) singleCollectionAbsorbed.add(junction.name);
    }
  }

  // Pass 2: plan every collection. Children may be absorbed as we go, so we
  // plan parents in dependency order (tables with no FKs first).
  const orderedTables = [...model.tables].sort((a, b) => a.foreignKeys.length - b.foreignKeys.length);

  for (const table of orderedTables) {
    if (singleCollectionAbsorbed.has(table.name)) continue;
    if (bucketedTables.has(table.name)) {
      collections.push(planBucketCollection(table, profile));
      continue;
    }
    if (isEavTable(table) || isJunctionTable(table)) {
      // These only exist folded into their parents; skip planning them here.
      // (If no parent absorbs them, the fallback pass below resurrects them.)
      continue;
    }

    const childPlan = planChildRelationships(table, model, profile, tablesByName, absorbedTables);
    const lookupPlan = planLookupReferences(table, model, profile, tablesByName);

    const patterns: PatternDecision[] = [...childPlan.patterns, ...lookupPlan.patterns];

    // Self-referencing FK -> Tree pattern.
    if (table.foreignKeys.some((fk) => fk.referencesTable === table.name)) {
      patterns.push({
        pattern: 'tree',
        target: table.name,
        reason: `${table.name} references itself; keep parentId and index it so subtree and breadcrumb queries avoid recursive joins.`,
        knowledgeSource: 'tree.md',
      });
    }

    // Type discriminator + sparse variants -> Polymorphic pattern.
    if (isPolymorphicTable(table)) {
      patterns.push({
        pattern: 'polymorphic',
        target: table.name,
        reason: `${table.name} stores multiple shapes behind a type column; variants coexist in one collection and sparse NULL columns simply disappear from documents.`,
        knowledgeSource: 'polymorphic.md',
      });
    }

    // Every collection is stamped for lazy future migrations.
    patterns.push({
      pattern: 'schema-versioning',
      target: table.name,
      reason: 'Every document is stamped with schemaVersion: 1 so future shape changes can migrate lazily with zero downtime.',
      knowledgeSource: 'schema-versioning.md',
    });

    const collectionName = toCamelCase(table.name);
    const properties: Record<string, unknown> = {
      ...buildBaseProperties(table),
      ...childPlan.properties,
      ...lookupPlan.properties,
    };

    // Indexes: kept FK reference columns, plus the attribute pattern's k/v.
    const indexes: IndexSpec[] = [];
    for (const fk of table.foreignKeys) {
      const field = toCamelCase(fk.column);
      indexes.push({
        keys: { [field]: 1 },
        options: { name: `idx_${collectionName}_${field}` },
        reason: `Lookups by ${field} replace the SQL join on ${fk.referencesTable}.`,
      });
    }
    if (childPlan.embeddedArrays.some((array) => array.field === 'attributes')) {
      indexes.push({
        keys: { 'attributes.k': 1, 'attributes.v': 1 },
        options: { name: `idx_${collectionName}_attributes_kv` },
        reason: 'One compound index serves queries on any attribute (Attribute pattern).',
      });
    }

    const primaryKeyColumns = table.primaryKey.length > 0 ? table.primaryKey : [table.columns[0].name];

    let archive: ArchivePlan | undefined;
    if (isArchiveCandidate(table, profile, bucketedTables)) {
      const dateColumn = findDateColumn(table)!;
      const ratioLabel = `${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W at ${profile.telemetry.peakRpm.toLocaleString('en-US')} RPM`;
      const retentionYears = archiveRetentionYears(profile);
      archive = {
        timeColumn: dateColumn.name,
        retentionYears,
        archiveAfterDays: archiveRetentionDays(profile),
        activeDataMinimumDays: ARCHIVE_ACTIVE_DATA_MINIMUM_DAYS,
        partitionFields: archivePartitionFields(table, dateColumn),
        customFilterDescription: archiveCustomFilterDescription(table),
        archiveCollection: `${collectionName}_archive`,
      };
      patterns.push({
        pattern: 'archive',
        target: collectionName,
        reason: `${table.name} holds ${table.rowCount.toLocaleString('en-US')} dated rows under ${ratioLabel}; retain ${retentionYears} year${retentionYears === 1 ? '' : 's'} hot on Atlas, then route older documents to ${archive.archiveCollection}. Partition archived data by ${archive.partitionFields.join(' + ')} so federated archive queries avoid full scans.`,
        knowledgeSource: 'archive.md',
      });
      indexes.push({
        keys: { [toCamelCase(dateColumn.name)]: -1 },
        options: { name: `idx_${collectionName}_${toCamelCase(dateColumn.name)}` },
        reason: 'Active reads and archive sweeps filter on a top-level document age field.',
      });
    }

    collections.push({
      name: collectionName,
      sourceTable: table.name,
      mergedTables: [
        table.name,
        ...childPlan.embeddedArrays.map((array) => array.sourceTable),
        ...lookupPlan.extendedReferences.map((reference) => reference.sourceTable),
      ],
      idDerivation: {
        sourceColumns: primaryKeyColumns,
        strategy: primaryKeyColumns.length === 1 ? 'direct' : 'composite',
      },
      patterns,
      jsonSchema: { bsonType: 'object', required: ['_id', 'schemaVersion'], properties },
      indexes,
      embeddedArrays: childPlan.embeddedArrays,
      extendedReferences: lookupPlan.extendedReferences,
      computedFields: childPlan.computedFields,
      archive,
    });
  }

  // Pass 3: overflow collections. A subsetted child keeps its own full
  // collection; make sure one exists for every overflowCollection mentioned.
  const plannedNames = new Set(collections.map((collection) => collection.name));
  for (const collection of collections) {
    for (const array of collection.embeddedArrays) {
      if (!array.overflowCollection || plannedNames.has(array.overflowCollection)) continue;
      const childTable = tablesByName.get(array.sourceTable);
      if (!childTable) continue;
      const childKey = childTable.primaryKey.length > 0 ? childTable.primaryKey : [childTable.columns[0].name];
      collections.push({
        name: array.overflowCollection,
        sourceTable: childTable.name,
        mergedTables: [childTable.name],
        idDerivation: { sourceColumns: childKey, strategy: childKey.length === 1 ? 'direct' : 'composite' },
        patterns: [
          {
            pattern: 'reference',
            target: array.overflowCollection,
            reason: `Full ${childTable.name} history backing the subset embedded on ${collection.name}.`,
            knowledgeSource: 'subset.md',
          },
        ],
        jsonSchema: { bsonType: 'object', required: ['_id'], properties: buildBaseProperties(childTable) },
        indexes: [
          {
            keys: { [toCamelCase(array.joinColumn)]: 1 },
            options: { name: `idx_${array.overflowCollection}_${toCamelCase(array.joinColumn)}` },
            reason: 'Overflow reads fetch all children for one parent.',
          },
        ],
        embeddedArrays: [],
        extendedReferences: [],
        computedFields: [],
      });
      plannedNames.add(array.overflowCollection);
    }
  }

  // Pass 3.5: archive mirror collections for hot collections with an archive plan.
  for (const collection of [...collections]) {
    if (!collection.archive || plannedNames.has(collection.archive.archiveCollection)) continue;
    const mirror = planArchiveMirror(collection);
    collections.push(mirror);
    plannedNames.add(mirror.name);
  }

  // Pass 4: drop standalone collections for tables that were fully absorbed
  // into a parent (full embeds), EXCEPT overflow collections backing a
  // Subset array — those must keep the complete child history.
  const overflowNames = new Set(
    collections.flatMap((collection) =>
      collection.embeddedArrays
        .map((array) => array.overflowCollection)
        .filter((name): name is string => name !== undefined),
    ),
  );
  const finalCollections = collections.filter(
    (collection) => !absorbedTables.has(collection.sourceTable) || overflowNames.has(collection.name),
  );

  return {
    source: model.source,
    profileId: profile.id,
    telemetry: profile.telemetry,
    writeConcern: profile.writeConcern,
    readPreference: profile.readPreference,
    compression: profile.compression,
    pool: profile.pool,
    generatedAt: new Date().toISOString(),
    collections: finalCollections,
  };
}
