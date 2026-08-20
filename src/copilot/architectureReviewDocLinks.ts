/**
 * Canonical MongoDB documentation URLs for Architecture Review hyperlinks.
 * Prefer these exact links when the review mentions a topic (markdown `[label](url)`).
 */

export const MONGODB_DOC_LINKS = {
  dataModelingIntro: 'https://www.mongodb.com/docs/manual/data-modeling/',
  designPatterns: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/',
  embeddedDocuments: 'https://www.mongodb.com/docs/manual/data-modeling/embedding/',
  referencing: 'https://www.mongodb.com/docs/manual/data-modeling/referencing/',
  schemaValidation: 'https://www.mongodb.com/docs/manual/core/schema-validation/',
  buildingWithPatterns: 'https://www.mongodb.com/company/blog/building-with-patterns-a-summary',
  bsonDocumentLimit: 'https://www.mongodb.com/docs/manual/reference/limits/#mongodb-limit-BSON-Document-Size',
  esrRule: 'https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-rule/',
  indexes: 'https://www.mongodb.com/docs/manual/indexes/',
  multikeyIndexes: 'https://www.mongodb.com/docs/manual/core/index-multikey/',
  explainResults: 'https://www.mongodb.com/docs/manual/reference/explain-results/',
  queryPlans: 'https://www.mongodb.com/docs/manual/core/query-plans/',
  wiredTiger: 'https://www.mongodb.com/docs/manual/core/wiredtiger/',
  shardingShardKey: 'https://www.mongodb.com/docs/manual/core/sharding-shard-key/',
  replication: 'https://www.mongodb.com/docs/manual/replication/',
  writeConcern: 'https://www.mongodb.com/docs/manual/reference/write-concern/',
  readPreference: 'https://www.mongodb.com/docs/manual/core/read-preference/',
  oplog: 'https://www.mongodb.com/docs/manual/core/replica-set-oplog/',
  securityChecklist: 'https://www.mongodb.com/docs/manual/administration/security-checklist/',
  productionNotes: 'https://www.mongodb.com/docs/manual/administration/production-notes/',
  atlasSearch: 'https://www.mongodb.com/docs/search/',
  atlasVectorSearch: 'https://www.mongodb.com/docs/vector-search/',
  atlasAutoEmbed: 'https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/',
  hybridSearchOverview: 'https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/',
  hybridSearchTutorial: 'https://www.mongodb.com/docs/vector-search/hybrid-search/vector-search-with-full-text-search/',
  rankFusion: 'https://www.mongodb.com/docs/manual/reference/operator/aggregation/rankFusion/',
  vectorSearchStage: 'https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/',
  searchStage: 'https://www.mongodb.com/docs/search/query/aggregation-stages/search/',
  subsetPattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/subset-pattern/',
  bucketPattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/bucket-pattern/',
  outlierPattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/outlier-pattern/',
  attributePattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/group-data/attribute-pattern/',
  polymorphicPattern:
    'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/polymorphic-data/polymorphic-schema-pattern/',
  inheritancePattern:
    'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/polymorphic-data/inheritance-schema-pattern/',
  dataVersioning: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/data-versioning/',
  archivePattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/archive/',
  singleCollectionPattern: 'https://www.mongodb.com/docs/manual/data-modeling/design-patterns/single-collection/',
  extendedReferencePattern: 'https://www.mongodb.com/docs/manual/data-modeling/handle-duplicate-data/',
  designAntipatterns: 'https://www.mongodb.com/docs/manual/data-modeling/design-antipatterns/',
  embedOneToOne:
    'https://www.mongodb.com/docs/manual/tutorial/model-embedded-one-to-one-relationships-between-documents/',
  embedOneToMany:
    'https://www.mongodb.com/docs/manual/tutorial/model-embedded-one-to-many-relationships-between-documents/',
  embedManyToMany:
    'https://www.mongodb.com/docs/manual/tutorial/model-embedded-many-to-many-relationships-between-documents/',
  treeStructures: 'https://www.mongodb.com/docs/manual/applications/data-models-tree-structures/',
  timeSeries: 'https://www.mongodb.com/docs/manual/core/timeseries-collections/',
  atlasWellArchitected: 'https://www.mongodb.com/docs/atlas/architecture/current/',
  atlasArchitectureReliability: 'https://www.mongodb.com/docs/atlas/architecture/current/reliability/',
  atlasArchitectureSecurity: 'https://www.mongodb.com/docs/atlas/architecture/current/security/',
  csfle: 'https://www.mongodb.com/docs/manual/core/csfle/',
  queryableEncryption: 'https://www.mongodb.com/docs/manual/core/queryable-encryption/',
} as const;

/** Markdown link helper for prompt templates. */
export function mongodbDocLink(label: string, key: keyof typeof MONGODB_DOC_LINKS): string {
  return `[${label}](${MONGODB_DOC_LINKS[key]})`;
}

/** Compact URL registry for the system prompt (avoids duplicating long markdown links in a table). */
function architectureReviewDocLinkRegistry(): string {
  return Object.entries(MONGODB_DOC_LINKS)
    .map(([key, url]) => `- \`${key}\` → ${url}`)
    .join('\n');
}

export const ARCHITECTURE_REVIEW_DOC_LINKING_RULES = `
**MongoDB documentation hyperlinks (required in every Architecture Review)**

When you mention a MongoDB or Atlas concept, link the **first occurrence** in each collapsible section using markdown \`[label](url)\`. Use only these canonical URLs (do not invent or shorten):

${architectureReviewDocLinkRegistry()}

Topic hints: data modeling → \`dataModelingIntro\`, \`designPatterns\`; embed vs reference → \`embeddedDocuments\`, \`referencing\`; §6 search → \`atlasSearch\`, \`atlasVectorSearch\`, \`rankFusion\`; §3 patterns → \`subsetPattern\`, \`bucketPattern\`, \`outlierPattern\`, \`attributePattern\`, \`polymorphicPattern\`, \`inheritancePattern\`, \`dataVersioning\`, \`archivePattern\`, \`extendedReferencePattern\`, \`singleCollectionPattern\`, \`timeSeries\`, \`designAntipatterns\`; §9 deployment → \`atlasWellArchitected\`, \`atlasArchitectureReliability\`, \`atlasArchitectureSecurity\`, \`csfle\`, \`queryableEncryption\`.
`.trim();
